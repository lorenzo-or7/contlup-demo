/* Orquestrador híbrido da Lupi (sem DOM).
   Ordem de decisão para cada mensagem:
   1. proteção de dados (remove CPF, cartão etc. antes de guardar ou enviar);
   2. comandos (voltar, cancelar, falar com a Priscila, oi, obrigado...);
   3. fluxo guiado ativo (resposta da etapa) ou mudança de assunto;
   4. intenções locais fortes (fluxo ou resposta aprovada da base);
   5. IA (se disponível) para perguntas abertas;
   6. modo básico honesto quando a IA não está disponível. */

import { FlowEngine } from './flow-engine.js';
import { buildIndex, detect } from './intents.js';
import { redact, detectSensitive, SENSITIVE_LABELS } from './shared/privacy.js';
import { truncate } from './shared/text.js';
import { buildHandoffSummary, buildWhatsAppLink, reviewSummary, sanitizeSummary } from './whatsapp.js';

export const TEXT = {
  greeting: 'Oi! 💜 Eu sou a Lupi, assistente virtual da ContLup. Posso te ajudar a entender melhor nossos serviços ou tirar algumas dúvidas sobre contabilidade. Por onde começamos?',
  disclaimer: 'Sou uma assistente automática e posso errar. Perguntas abertas podem ser processadas por um provedor de inteligência artificial, então não compartilhe CPF, senhas ou documentos por aqui.',
  greetingAgain: 'Oi de novo! 💜 Em que posso te ajudar?',
  thanks: 'Imagina! Fico feliz em ajudar. 💜 Se surgir outra dúvida, é só chamar.',
  bye: 'Até mais! Quando quiser, é só abrir o chat de novo. 💜',
  menu: 'Posso te ajudar com estes assuntos, ou você pode escrever a sua pergunta:',
  cancelled: 'Tudo bem, deixei esse assunto de lado. Em que mais posso ajudar?',
  nothingToCancel: 'Não tem nenhum passo em andamento agora. Em que posso ajudar?',
  resume: (title) => `Voltando para **${title}**:`,
  ambiguous: 'Só para eu não te responder errado: você quer saber sobre qual destes assuntos?',
  weakGuess: (title) => `Acho que você quer saber sobre **${title}**. É isso?`,
  basicMode: 'No momento estou no modo básico: consigo te ajudar com os nossos serviços, com as perguntas mais comuns e com os atendimentos guiados, mas ainda não respondo perguntas abertas. Se quiser, preparo uma mensagem para você falar com a Priscila. 💜',
  temporary: 'Estou com uma dificuldade temporária para responder perguntas abertas, mas ainda posso te ajudar com nossos serviços ou te encaminhar para a equipe da ContLup. 💜',
  rateLimited: 'Recebi muitas mensagens em pouco tempo. Me dá alguns instantes e tente de novo? Enquanto isso, os assuntos abaixo continuam funcionando.',
  invalid: 'Não consegui entender essa mensagem. Pode escrever de outro jeito, com até 500 caracteres?',
  sensitive: (list) => `Por segurança, removi ${list} da sua mensagem. Por aqui você não precisa compartilhar dados pessoais. 💜`,
  onlySensitive: 'Por segurança, eu não guardo nem envio esse tipo de dado. Me conta a sua dúvida sem informações pessoais?',
  handoffIntro: 'Preparei um resumo curto para você enviar à Priscila pelo WhatsApp. Revise, edite se quiser e confirme para abrir o WhatsApp. Nada é enviado sem a sua confirmação.',
};

export const MENU = [
  { label: 'Conhecer os serviços', action: { kind: 'startFlow', id: 'servicos' } },
  { label: 'Abrir uma empresa', action: { kind: 'startFlow', id: 'abrir_empresa' } },
  { label: 'Trocar de contador', action: { kind: 'startFlow', id: 'troca_contador' } },
  { label: 'Sou MEI', action: { kind: 'startFlow', id: 'mei' } },
  { label: 'Solicitar proposta', action: { kind: 'startFlow', id: 'proposta' } },
];

const HANDOFF_CHIP = { label: 'Falar com a Priscila', action: { kind: 'handoff' }, secondary: true };

export class Conversation {
  /**
   * @param {object} o
   * @param {object} o.knowledge  conteúdo de lupi-knowledge.json
   * @param {object} o.flows      conteúdo de lupi-flows.json
   * @param {object} o.ai         cliente de ai-client.js
   * @param {object} [o.store]    createSessionStore()
   * @param {number} [o.maxInput]
   * @param {number} [o.historyTurns]
   */
  constructor({ knowledge, flows, ai, store = null, maxInput = 500, historyTurns = 8, whatsapp } = {}) {
    this.entries = (knowledge?.entries || []);
    this.approved = new Map(this.entries.filter(e => e.status === 'approved').map(e => [e.id, e]));
    this.engine = new FlowEngine(flows, id => this.approved.get(id) || null);
    this.index = buildIndex(this.entries, flows?.flows || []);
    this.ai = ai;
    this.store = store;
    this.maxInput = maxInput;
    this.historyTurns = historyTurns;
    this.whatsapp = whatsapp;
    this.listeners = new Set();
    this.reset({ silent: true });
  }

  // ---------- estado / eventos ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit(type, extra = {}) { for (const fn of this.listeners) fn({ type, ...extra }); }

  get view() {
    return { messages: this.messages, chips: this.chips, placeholder: this.placeholder, expression: this.expression, busy: this.busy };
  }

  reset({ silent = false } = {}) {
    this.messages = [];
    this.chips = [];
    this.placeholder = '';
    this.expression = 'welcome';
    this.busy = false;
    this.suspended = null;
    this.lastCompleted = null;
    this.lastTopic = '';
    this.lastQuestion = '';
    this.seq = 0;
    this.engine.cancel();
    this.engine.lastCompleted = null;
    if (!silent) { this.store?.clear(); this.#emit('reset'); }
  }

  /** Restaura a sessão salva ou começa com a saudação. Devolve true se restaurou. */
  init() {
    const saved = this.store?.load();
    if (saved && saved.messages.length) {
      this.messages = saved.messages;
      this.seq = saved.messages.reduce((m, x) => Math.max(m, Number(String(x.id).slice(1)) || 0), 0);
      this.engine.restore(saved.flow);
      this.suspended = saved.suspended || null;
      this.lastCompleted = saved.lastCompleted || null;
      this.chips = saved.chips?.length ? saved.chips : MENU;
      this.expression = 'idle';
      this.#emit('restore');
      return true;
    }
    this.#greet();
    return false;
  }

  restart() {
    this.reset();
    this.#greet();
  }

  #greet() {
    this.#bot(TEXT.greeting, 'welcome');
    this.#push({ role: 'notice', text: TEXT.disclaimer });
    this.#setChips(MENU);
    this.#commit();
  }

  // ---------- entrada do visitante ----------
  async send(raw) {
    if (this.busy) return;
    let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (text.length > this.maxInput) text = text.slice(0, this.maxInput);

    const sensitive = detectSensitive(text);
    const clean = redact(text);
    this.#push({ role: 'user', text: clean });
    if (sensitive.length) {
      const list = joinPt(sensitive.map(s => SENSITIVE_LABELS[s] || s));
      const stripped = clean.replace(/\[dado removido\]/g, '').replace(/[\s.,;:!?-]+/g, ' ').trim();
      if (stripped.split(' ').filter(Boolean).length < 2) {
        this.#push({ role: 'notice', text: TEXT.onlySensitive });
        this.#commit();
        return;
      }
      this.#push({ role: 'notice', text: TEXT.sensitive(list) });
    }
    this.lastQuestion = clean;
    await this.#route(clean);
    this.#commit();
  }

  /** Ação de um chip/botão. */
  async act(action, label = '') {
    if (this.busy || !action) return;
    switch (action.kind) {
      case 'option': {
        const step = this.engine.active;
        if (!step) break;
        const flow = this.engine.flow(step.flowId);
        const opt = flow.steps[step.stepId]?.options?.[action.index];
        if (!opt) break;
        this.#push({ role: 'user', text: opt.label });
        this.#renderFlow(this.engine.choose(action.index));
        break;
      }
      case 'back': this.#push({ role: 'user', text: 'Voltar' }); this.#renderFlow(this.engine.back()); break;
      case 'cancel': this.#push({ role: 'user', text: 'Cancelar' }); this.#cancelFlow(); break;
      case 'startFlow': this.#push({ role: 'user', text: label || this.engine.flow(action.id)?.title || '' }); this.#startFlow(action.id, { withIntro: !action.noIntro }); break;
      case 'kb': this.#push({ role: 'user', text: label || this.approved.get(action.id)?.title || '' }); this.#answerKb(action.id); break;
      case 'resume': this.#push({ role: 'user', text: label || 'Continuar' }); this.#resume(); break;
      case 'menu': this.#push({ role: 'user', text: label || 'Ver opções' }); this.#menu(); break;
      case 'handoff': this.#push({ role: 'user', text: label || 'Falar com a Priscila' }); this.#handoff(); break;
      case 'ask': this.lastQuestion = action.text; this.#push({ role: 'user', text: action.text }); await this.#route(action.text); break;
      case 'retry': await this.#askAI({ retry: true }); break;
      default: return;
    }
    this.#commit();
  }

  // ---------- roteamento ----------
  async #route(text) {
    const det = detect(this.index, text);
    const best = det.best;
    const cmd = best && best.kind === 'command' && best.strong ? best.id : null;
    const active = this.engine.active;

    if (cmd === 'handoff') return this.#handoff();

    if (active) {
      if (cmd === 'back') return this.#renderFlow(this.engine.back());
      if (cmd === 'cancel') return this.#cancelFlow();
      if (cmd === 'menu') { this.#suspend(); return this.#menu(); }
      // mudança clara de assunto: outro fluxo ou resposta pronta, e o texto não é uma das opções
      const switching = best && best.strong && (best.kind === 'flow' || best.kind === 'kb') && best.group !== active.flowId && !this.#isOptionText(text);
      if (!switching) {
        const out = this.engine.answerText(text);
        if (out) return this.#renderFlow(out);
      }
      // não serve como resposta da etapa: pausa o fluxo e trata como assunto novo
      this.#suspend();
    }

    if (cmd === 'greeting') { this.#bot(this.messages.some(m => m.role === 'user' && m !== this.messages.at(-1)) ? TEXT.greetingAgain : TEXT.greeting, 'welcome'); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'thanks') { this.#bot(TEXT.thanks, 'success'); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'bye') { this.#bot(TEXT.bye, 'success'); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'menu') return this.#menu();
    if (cmd === 'resume') return this.#resume();
    if (cmd === 'back' || cmd === 'cancel') { this.#bot(TEXT.nothingToCancel, 'idle'); return this.#setChips(this.#withResume(MENU)); }

    if (det.ambiguous) {
      const opts = det.candidates.filter(c => c.strong && c.kind !== 'command').slice(0, 3);
      this.#bot(TEXT.ambiguous, 'thinking');
      return this.#setChips([...opts.map(c => this.#chipFor(c)), HANDOFF_CHIP]);
    }

    if (best && best.strong && best.kind === 'flow') return this.#startFlow(best.id);
    if (best && best.strong && best.kind === 'kb') return this.#answerKb(best.id);

    if (this.ai?.available) return this.#askAI();

    // sem IA: tenta um palpite fraco antes de admitir o limite
    if (best && (best.kind === 'kb' || best.kind === 'flow')) {
      const chip = this.#chipFor(best);
      this.#bot(TEXT.weakGuess(chip.label), 'thinking');
      return this.#setChips(this.#withResume([chip, { label: 'Ver opções', action: { kind: 'menu' } }, HANDOFF_CHIP]));
    }
    return this.#fallback(this.ai?.offReason || 'not_configured');
  }

  #isOptionText(text) {
    const st = this.engine.active;
    if (!st) return false;
    const step = this.engine.flow(st.flowId).steps[st.stepId];
    if (!step?.options) return false;
    const n = String(text).toLowerCase();
    return step.options.some(o => n.includes(o.label.toLowerCase()));
  }

  #chipFor(c) {
    if (c.kind === 'flow') return { label: this.engine.flow(c.id).title, action: { kind: 'startFlow', id: c.id } };
    return { label: this.approved.get(c.id)?.title || c.id, action: { kind: 'kb', id: c.id } };
  }

  // ---------- respostas locais ----------
  #answerKb(id) {
    const e = this.approved.get(id);
    if (!e) return this.#fallback('not_found');
    this.#bot(e.answer, e.expression || 'explaining');
    const related = (e.related || []).map(r => this.approved.get(r)).filter(Boolean).slice(0, 3)
      .map(r => ({ label: r.title, action: { kind: 'kb', id: r.id } }));
    const extra = e.flow && this.engine.has(e.flow) ? [{ label: this.engine.flow(e.flow).title, action: { kind: 'startFlow', id: e.flow } }] : [];
    this.#setChips(this.#withResume([...extra, ...related, HANDOFF_CHIP]));
  }

  #menu() {
    this.#bot(TEXT.menu, 'idle');
    this.#setChips(this.#withResume(MENU));
  }

  // ---------- fluxos ----------
  #startFlow(id, opts) {
    if (!this.engine.has(id)) return this.#fallback('not_found');
    if (this.engine.active) this.#suspend();
    if (this.suspended?.flowId === id) this.suspended = null;
    this.#renderFlow(this.engine.start(id, opts));
  }

  #renderFlow(out) {
    if (!out) return;
    for (const m of out.messages) this.#bot(m.text, m.expression);
    this.placeholder = out.placeholder || '';
    if (out.done) {
      this.lastCompleted = this.engine.lastCompleted;
      this.#setChips(this.#withResume(out.chips));
      if (out.handoff) this.#handoff();
    } else {
      this.#setChips(out.chips);
    }
  }

  #cancelFlow() {
    const res = this.engine.cancel();
    this.placeholder = '';
    this.#bot(res.cancelled ? TEXT.cancelled : TEXT.nothingToCancel, 'idle');
    this.#setChips(this.#withResume(MENU));
  }

  #suspend() {
    const snap = this.engine.snapshot();
    if (snap) { this.suspended = snap; this.engine.cancel(); this.placeholder = ''; }
  }

  #resume() {
    if (!this.suspended) return this.#menu();
    const snap = this.suspended;
    this.suspended = null;
    if (!this.engine.restore(snap)) return this.#menu();
    this.#bot(TEXT.resume(this.engine.flow(snap.flowId).title), 'idle');
    this.#renderFlow(this.engine.repeat());
  }

  #withResume(chips) {
    if (!this.suspended) return chips;
    const title = this.engine.flow(this.suspended.flowId)?.title;
    if (!title) return chips;
    return [{ label: `Continuar: ${title}`, action: { kind: 'resume' } }, ...chips.filter(c => c.action.kind !== 'resume')];
  }

  // ---------- IA ----------
  #aiHistory() {
    const turns = [];
    for (const m of this.messages) {
      if (m.role === 'user') turns.push({ role: 'user', content: truncate(redact(m.text), 600) });
      else if (m.role === 'bot' && m.kind !== 'handoff') turns.push({ role: 'assistant', content: truncate(m.text, 1200) });
    }
    // começa sempre por uma mensagem do visitante e termina na última dele
    const slice = turns.slice(-this.historyTurns * 2);
    while (slice.length && slice[0].role !== 'user') slice.shift();
    while (slice.length && slice.at(-1).role !== 'user') slice.pop();
    return slice;
  }

  async #askAI({ retry = false } = {}) {
    const messages = this.#aiHistory();
    if (!messages.length) return this.#fallback('invalid_request');
    this.busy = true; this.expression = 'thinking';
    this.#emit('busy', { busy: true });
    let res;
    try {
      res = await this.ai.ask({ messages, context: { flow: this.suspended?.flowId || null, completedFlow: this.lastCompleted?.flowId || null } });
    } catch {
      res = { ok: false, reason: 'unavailable' };
    }
    this.busy = false;
    this.#emit('busy', { busy: false });
    if (!res.ok) return this.#fallback(res.reason, { canRetry: !retry });
    this.lastTopic = res.topic || '';
    this.#bot(res.reply, res.needsHuman ? 'thinking' : 'explaining', { source: 'ai', guarded: res.guarded || undefined });
    const chips = res.suggestions.map(s => ({ label: s, action: { kind: 'ask', text: s } }));
    this.#setChips(this.#withResume(res.needsHuman ? [{ label: 'Preparar resumo para a Priscila', action: { kind: 'handoff' } }, ...chips] : [...chips, HANDOFF_CHIP]));
  }

  #fallback(reason, { canRetry = false } = {}) {
    let text = TEXT.temporary;
    if (reason === 'not_configured' || reason === 'disabled') text = TEXT.basicMode;
    else if (reason === 'rate_limited') text = TEXT.rateLimited;
    else if (reason === 'invalid_request') text = TEXT.invalid;
    this.#bot(text, 'idle', { fallback: reason });
    const transient = ['timeout', 'network', 'unavailable', 'invalid_response', 'rate_limited'].includes(reason);
    const chips = [...MENU.slice(0, 2), HANDOFF_CHIP];
    if (transient && canRetry) chips.unshift({ label: 'Tentar de novo', action: { kind: 'retry' } });
    this.#setChips(this.#withResume(chips));
  }

  // ---------- WhatsApp ----------
  #handoff() {
    const summary = buildHandoffSummary({
      flowSummary: this.lastCompleted?.summary || '',
      topic: this.lastTopic,
      lastQuestion: this.lastCompleted ? '' : this.#lastFreeQuestion(),
    });
    this.#bot(TEXT.handoffIntro, 'success');
    this.#push({ role: 'bot', kind: 'handoff', text: summary, state: 'draft' });
    this.#setChips(this.#withResume([{ label: 'Ver opções', action: { kind: 'menu' } }]));
  }

  #lastFreeQuestion() {
    const generic = /^(falar com|conversar com|chamar|quero falar|atendente|whatsapp|cancelar|voltar|ver opcoes)/i;
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role !== 'user') continue;
      if (generic.test(m.text) || m.text.length < 12 || MENU.some(c => c.label === m.text)) continue;
      return m.text;
    }
    return '';
  }

  /** Visitante confirmou o resumo: devolve o link oficial (a interface abre). */
  confirmHandoff(messageId, editedText, { force = false } = {}) {
    const msg = this.messages.find(m => m.id === messageId && m.kind === 'handoff');
    const text = String(editedText ?? msg?.text ?? '').trim();
    const review = reviewSummary(text);
    if (review.empty) return { ok: false, error: 'empty' };
    if (review.tooLong) return { ok: false, error: 'too_long' };
    if (review.sensitive.length && !force) return { ok: false, error: 'sensitive', sensitive: review.sensitive };
    const final = force ? text : sanitizeSummary(text);
    if (msg) { msg.text = final; msg.state = 'opened'; }
    this.lastCompleted = null;
    this.#commit();
    return { ok: true, link: buildWhatsAppLink(final, this.whatsapp) };
  }

  cancelHandoff(messageId) {
    const msg = this.messages.find(m => m.id === messageId && m.kind === 'handoff');
    if (msg) { msg.state = 'cancelled'; this.#commit(); }
  }

  // ---------- utilitários ----------
  #bot(text, expression = 'explaining', extra = {}) {
    this.expression = expression;
    this.#push({ role: 'bot', text, expression, ...extra });
  }
  #push(m) {
    const msg = { id: 'm' + (++this.seq), ...m };
    this.messages.push(msg);
    this.#emit('message', { message: msg });
    return msg;
  }
  #setChips(chips) { this.chips = chips; }
  #commit() {
    this.store?.save({ messages: this.messages, flow: this.engine.snapshot(), suspended: this.suspended, lastCompleted: this.lastCompleted, chips: this.chips });
    this.#emit('change');
  }
}

function joinPt(list) {
  if (list.length <= 1) return list[0] || '';
  return list.slice(0, -1).join(', ') + ' e ' + list.at(-1);
}
