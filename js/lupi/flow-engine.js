/* Motor de fluxos guiados da Lupi.
   Determinístico e sem IA: lê data/lupi-flows.json e devolve "saídas" que a interface desenha.
   Uma saída tem: messages [{text, expression}], chips [{label, action}], placeholder, done, summary, handoff.
   Tipos de passo: choice (opções; allowText aceita resposta livre), info (conteúdo da base pelo kbRef),
   recommend (indicação por regras sobre os códigos das respostas) e end (conclusão e resumo para o WhatsApp). */

import { normalize, tokens, phraseScore, truncate, wordsMatch } from './shared/text.js';
import { redact } from './shared/privacy.js';

export const MAX_FREE_ANSWER = 140;

export class FlowEngine {
  /**
   * @param {{flows: object[]}} doc  conteúdo de lupi-flows.json
   * @param {(id: string) => ({answer: string} | null)} kbLookup  devolve só entradas aprovadas
   */
  constructor(doc, kbLookup = () => null, planLookup = () => null) {
    this.flows = new Map((doc?.flows || []).map(f => [f.id, f]));
    this.kb = kbLookup;
    this.plan = planLookup;
    this.state = null;      // {flowId, stepId, answers, history}
    this.lastCompleted = null;
  }

  get active() { return this.state; }
  has(flowId) { return this.flows.has(flowId); }
  flow(flowId) { return this.flows.get(flowId); }
  get list() { return [...this.flows.values()]; }

  start(flowId, { withIntro = true, skipRef = false } = {}) {
    const flow = this.flows.get(flowId);
    if (!flow) throw new Error(`Fluxo desconhecido: ${flowId}`);
    this.state = { flowId, stepId: flow.start, answers: {}, labels: {}, codes: {}, recommended: [], history: [] };
    const out = emptyOutput();
    if (withIntro) {
      const ref = !skipRef && flow.introRef && this.kb(flow.introRef);
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
    return this.#apply(step, opt.value ?? '', opt.label, opt.next, opt.code);
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
    if (step?.field) { delete this.state.answers[step.field]; delete this.state.labels[step.field]; delete this.state.codes[step.field]; }
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
    this.state = { answers: {}, labels: {}, codes: {}, recommended: [], history: [], ...structuredClone(state) };
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

  #apply(step, value, label, next, code) {
    if (step.field) { this.state.answers[step.field] = value; this.state.labels[step.field] = label; if (code) this.state.codes[step.field] = code; }
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

    if (step.type === 'recommend') {
      const rule = (step.rules || []).find(r => Object.entries(r.when || {}).every(([k, v]) => (Array.isArray(v) ? v : [v]).includes(this.state.codes[k]))) || step.fallback || { plans: [] };
      const plans = (rule.plans || []).map(id => this.plan(id)).filter(Boolean);
      this.state.recommended = plans.map(p => p.id);
      const names = plans.map(p => p.name);
      if (step.field) this.state.answers[step.field] = names.length === 1 ? `o plano ${names[0]}` : names.length ? `os planos ${joinPt(names)}` : (rule.value || '');
      const lines = plans.map(p => `- **${p.name}**: ${p.tagline.toLowerCase()}. ${p.audienceText}`).join('\n');
      const text = [rule.text || (plans.length === 1 && step.textOne) || step.text, lines, step.note].filter(Boolean).join('\n\n');
      const out = emptyOutput();
      out.messages.push({ text, expression: plans.length ? 'explaining' : 'thinking', visual: 'organize' });
      return merge(out, this.#enter(step.next, { revisit }));
    }

    if (step.type === 'end') {
      const answers = { ...this.state.answers };
      const summary = renderSummary(step.summary || [], answers);
      this.lastCompleted = { flowId: flow.id, answers, summary, title: flow.title, recommended: [...(this.state.recommended || [])] };
      const planChips = this.lastCompleted.recommended.map(id => this.plan(id)).filter(Boolean)
        .map(p => ({ label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } }));
      this.state = null;
      const chips = [...planChips, ...(step.endOptions || [
        { label: 'Preparar mensagem para o WhatsApp', action: 'handoff' },
        { label: 'Fazer outra pergunta', action: 'menu' },
      ]).map(o => ({ label: o.label, action: endAction(o, flow.id) }))];
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
  if (o.action === 'categories') return { kind: 'categories' };
  if (o.action === 'menu') return { kind: 'menu' };
  if (o.startFlow) return { kind: 'startFlow', id: o.startFlow };
  if (o.restart) return { kind: 'startFlow', id: flowId, noIntro: true };
  return { kind: 'menu' };
}

function joinPt(list) {
  return list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' e ' + list.at(-1);
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
  const ct = tt.filter(w => !OPTION_STOP.has(w));
  let best = -1, bestScore = 0, tie = false, subset = 0;
  options.forEach((o, i) => {
    const label = normalize(o.label);
    const lt = label.split(' ').filter(w => !OPTION_STOP.has(w));
    let s = 0;
    if (label === n) s = 3;
    else if (tt.length <= label.split(' ').length + 2) s = phraseScore(tt, label) * 2;
    // resposta curta com palavras do rótulo ("tenho empresa", "regularizar"), sem trocar sim por não
    if (s < 1.6 && ct.length && ct.length <= lt.length && lt.includes('nao') === ct.includes('nao')
      && ct.every(w => lt.some(l => wordsMatch(w, l)))) { s = 1.6 + 0.4 * (ct.length / lt.length); subset++; }
    if (s > bestScore) { bestScore = s; best = i; tie = false; } else if (s && s === bestScore) tie = true;
  });
  // a resposta curta serve para mais de uma opção ("tenho", "não"): melhor perguntar de novo
  if (subset > 1 && bestScore < 2) return -1;
  return bestScore >= 1.6 && !tie ? best : -1;
}

const OPTION_STOP = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'ou', 'um', 'uma', 'que', 'para', 'pra', 'com', 'meu', 'minha', 'eu', 'quero', 'mais', 'me', 'na', 'no', 'em']);

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
