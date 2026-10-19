/* Motor de fluxos guiados da Lupi.
   Determinístico e sem IA: lê data/lupi-flows.json e devolve "saídas" que a interface desenha.
   Uma saída tem: messages [{text, expression}], chips [{label, action}], placeholder, done, summary, handoff. */

import { normalize, tokens, phraseScore, truncate } from './shared/text.js';
import { redact } from './shared/privacy.js';

export const MAX_FREE_ANSWER = 140;

export class FlowEngine {
  /**
   * @param {{flows: object[]}} doc  conteúdo de lupi-flows.json
   * @param {(id: string) => ({answer: string} | null)} kbLookup  devolve só entradas aprovadas
   */
  constructor(doc, kbLookup = () => null) {
    this.flows = new Map((doc?.flows || []).map(f => [f.id, f]));
    this.kb = kbLookup;
    this.state = null;      // {flowId, stepId, answers, history}
    this.lastCompleted = null;
  }

  get active() { return this.state; }
  has(flowId) { return this.flows.has(flowId); }
  flow(flowId) { return this.flows.get(flowId); }
  get list() { return [...this.flows.values()]; }

  start(flowId, { withIntro = true } = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error(`Fluxo desconhecido: ${flowId}`);
    this.state = { flowId, stepId: flow.start, answers: {}, labels: {}, history: [] };
    const out = emptyOutput();
    if (withIntro) {
      const ref = flow.introRef && this.kb(flow.introRef);
      if (ref) out.messages.push({ text: ref.answer, expression: 'explaining' });
      if (flow.intro) out.messages.push({ text: flow.intro, expression: 'welcome' });
    }
    return merge(out, this.#enter(flow.start));
  }

  /** Escolha de uma opção do passo atual (pelo índice). */
  choose(index) {
    const step = this.#step();
    if (!step || step.type !== 'choice') return null;
    const opt = step.options[index];
    if (!opt) return null;
    return this.#apply(step, opt.value ?? '', opt.label, opt.next);
  }

  /**
   * Resposta digitada. Primeiro tenta casar com uma opção; se o passo aceita texto livre, usa o texto.
   * Devolve null quando o texto não serve como resposta (a conversa decide o que fazer).
   */
  answerText(text) {
    const step = this.#step();
    if (!step || step.type !== 'choice') return null;
    const idx = matchOption(step.options, text);
    if (idx >= 0) return this.choose(idx);
    if (!step.allowText) return null;
    const clean = truncate(redact(text).replace(/\s+/g, ' ').trim(), MAX_FREE_ANSWER);
    if (!clean) return null;
    const value = (step.textPrefix || '') + clean;
    return this.#apply(step, value, clean, step.textNext);
  }

  back() {
    if (!this.state) return null;
    const prev = this.state.history.pop();
    if (!prev) return { ...emptyOutput(), messages: [{ text: 'Esse já é o primeiro passo. 😉', expression: 'idle' }], ...this.#chipsFor(this.#step()) };
    const step = this.flow(this.state.flowId).steps[prev];
    if (step?.field) { delete this.state.answers[step.field]; delete this.state.labels[step.field]; }
    this.state.stepId = prev;
    return this.#enter(prev, { revisit: true });
  }

  cancel() {
    const was = this.state;
    this.state = null;
    return { ...emptyOutput(), cancelled: !!was };
  }

  /** Estado serializável (para o sessionStorage). */
  snapshot() { return this.state ? structuredClone(this.state) : null; }
  restore(state) {
    if (!state || !this.flows.has(state.flowId)) { this.state = null; return false; }
    const flow = this.flows.get(state.flowId);
    if (!flow.steps[state.stepId]) { this.state = null; return false; }
    this.state = { answers: {}, labels: {}, history: [], ...structuredClone(state) };
    return true;
  }

  /** Repete a pergunta atual (usado ao retomar um fluxo pausado). */
  repeat() {
    if (!this.state) return null;
    return this.#enter(this.state.stepId, { revisit: true });
  }

  buildSummary(flowId, answers) {
    const flow = this.flows.get(flowId);
    if (!flow) return '';
    const endStep = Object.values(flow.steps).find(s => s.type === 'end');
    return renderSummary(endStep?.summary || [], answers);
  }

  // ---- internos ----
  #step() {
    if (!this.state) return null;
    return this.flow(this.state.flowId).steps[this.state.stepId] || null;
  }

  #apply(step, value, label, next) {
    if (step.field) { this.state.answers[step.field] = value; this.state.labels[step.field] = label; }
    this.state.history.push(this.state.stepId);
    return this.#enter(next);
  }

  #enter(stepId, { revisit = false } = {}) {
    const flow = this.flow(this.state.flowId);
    const step = flow.steps[stepId];
    if (!step) throw new Error(`Passo inexistente: ${flow.id}.${stepId}`);
    this.state.stepId = stepId;

    if (step.type === 'info') {
      const ref = step.kbRef && this.kb(step.kbRef);
      const text = ref ? ref.answer : step.fallbackText;
      const out = emptyOutput();
      if (text) out.messages.push({ text, expression: 'explaining' });
      // info não é um passo "parado": registra no histórico só o passo anterior a ele
      return merge(out, this.#enter(step.next, { revisit }));
    }

    if (step.type === 'end') {
      const answers = { ...this.state.answers };
      const summary = renderSummary(step.summary || [], answers);
      this.lastCompleted = { flowId: flow.id, answers, summary, title: flow.title };
      this.state = null;
      const chips = (step.endOptions || [
        { label: 'Preparar resumo para a Priscila', action: 'handoff' },
        { label: 'Fazer outra pergunta', action: 'menu' },
      ]).map(o => ({ label: o.label, action: endAction(o, flow.id) }));
      return {
        ...emptyOutput(),
        messages: [{ text: step.message, expression: step.expression || 'success' }],
        chips, done: true, flowId: flow.id, summary, handoff: !!step.autoHandoff,
      };
    }

    // choice
    return {
      ...emptyOutput(),
      messages: [{ text: step.prompt, expression: revisit ? 'idle' : 'explaining' }],
      ...this.#chipsFor(step),
    };
  }

  #chipsFor(step) {
    if (!step || step.type !== 'choice') return { chips: [] };
    const chips = step.options.map((o, i) => ({ label: o.label, action: { kind: 'option', index: i } }));
    if (this.state.history.length) chips.push({ label: 'Voltar', action: { kind: 'back' }, secondary: true });
    chips.push({ label: 'Cancelar', action: { kind: 'cancel' }, secondary: true });
    return { chips, placeholder: step.allowText ? (step.textHint || '') : '' };
  }
}

function endAction(o, flowId) {
  if (o.action === 'handoff') return { kind: 'handoff' };
  if (o.action === 'menu') return { kind: 'menu' };
  if (o.startFlow) return { kind: 'startFlow', id: o.startFlow };
  if (o.restart) return { kind: 'startFlow', id: flowId, noIntro: true };
  return { kind: 'menu' };
}

function emptyOutput() {
  return { messages: [], chips: [], placeholder: '', done: false, summary: '', handoff: false };
}

function merge(a, b) {
  return { ...b, messages: [...a.messages, ...b.messages] };
}

/** Índice da opção que corresponde ao texto, ou -1. Aceita número ("2"), rótulo exato ou rótulo com erro de digitação. */
export function matchOption(options, text) {
  const n = normalize(text);
  if (!n) return -1;
  if (/^\d$/.test(n)) {
    const i = Number(n) - 1;
    return i >= 0 && i < options.length ? i : -1;
  }
  const tt = tokens(text);
  let best = -1, bestScore = 0;
  options.forEach((o, i) => {
    const label = normalize(o.label);
    let s = 0;
    if (label === n) s = 3;
    else if (tt.length <= label.split(' ').length + 2) s = phraseScore(tt, label) * 2;
    if (s > bestScore) { bestScore = s; best = i; }
  });
  return bestScore >= 1.6 ? best : -1;
}

/** Monta o resumo: {campo} obrigatório (a frase cai se vazio), {?campo} opcional. */
export function renderSummary(templates, answers) {
  const parts = [];
  for (const tpl of templates) {
    let missing = false;
    const line = tpl.replace(/\{(\??)([a-z_]+)\}/gi, (_, opt, key) => {
      const v = String(answers[key] ?? '').trim();
      if (!v && !opt) missing = true;
      return v;
    });
    if (missing) continue;
    parts.push(capitalize(line.replace(/\s+([.,!?])/g, '$1').replace(/\s{2,}/g, ' ').replace(/\.\.$/, '.').trim()));
  }
  return parts.join(' ');
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
