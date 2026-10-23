/* Orquestrador da Lupi (sem DOM, sem IA).
   Ordem de decisão para cada mensagem:
   1. proteção de dados (remove CPF, cartão etc. antes de guardar);
   2. comandos (voltar, cancelar, reiniciar, falar com a ContLup, oi, obrigado...);
   3. fluxo guiado ativo (resposta da etapa) ou mudança de assunto (o fluxo fica pausado);
   4. perguntas sobre planos e de acompanhamento, usando o contexto ("e quanto custa?", "esse plano inclui folha?");
   5. intenções do repertório (com desambiguação quando há dúvida);
   6. resposta honesta quando não há orientação no repertório (sugestões + contato), sem repetir a mesma frase.
   O cliente de IA é opcional e só é usado se um backend for configurado (hoje não é). */

import { FlowEngine, matchOption } from './flow-engine.js';
import { buildIndex, detect } from './nlu.js';
import { createPlans, mentionedPlans, mentionedSegment, SEGMENT_LABEL } from './plans.js';
import { createContext, rememberIntent, rememberPlan, questionType, refersToCurrent, refersToOther, isFollowUp, followUpTargets } from './context.js';
import { redact, detectSensitive, SENSITIVE_LABELS } from './shared/privacy.js';
import { truncate, normalize } from './shared/text.js';
import { buildHandoffSummary, buildWhatsAppLink, reviewSummary, sanitizeSummary } from './whatsapp.js';

export const TEXT = {
  greeting: 'Oi! 💜 Eu sou a Lupi, assistente virtual da ContLup. Posso te ajudar a encontrar um plano, conhecer os serviços ou tirar dúvidas sobre MEI, empresas e rotinas contábeis. Por onde começamos?',
  disclaimer: 'Sou uma assistente automática: respondo com conteúdos preparados pela ContLup e posso não ter a resposta para o seu caso. Não compartilhe CPF, senhas ou documentos por aqui.',
  disclaimerAI: 'Sou uma assistente automática e posso errar. Perguntas abertas podem ser processadas por um provedor de inteligência artificial, então não compartilhe CPF, senhas ou documentos por aqui.',
  greetingAgain: 'Oi de novo! 💜 Em que posso te ajudar?',
  thanks: 'Imagina! Fico feliz em ajudar. 💜 Se surgir outra dúvida, é só chamar.',
  bye: 'Até mais! Quando quiser, é só abrir o chat de novo. 💜',
  menu: 'Posso te ajudar com estes assuntos, ou você pode escrever a sua pergunta:',
  categories: 'Escolha um assunto e eu mostro as dúvidas mais comuns:',
  category: (label) => `Dúvidas sobre **${label}**. Toque em uma delas ou escreva a sua:`,
  cancelled: 'Tudo bem, deixei esse assunto de lado. Em que mais posso ajudar?',
  nothingToCancel: 'Não tem nenhum passo em andamento agora. Em que posso ajudar?',
  resume: (title) => `Voltando para **${title}**:`,
  ambiguous: 'Só para eu não te responder errado: você quer saber sobre qual destes assuntos?',
  unknown: [
    'Não encontrei uma orientação específica sobre isso no meu repertório.',
    'Essa eu ainda não sei responder por aqui, e prefiro não inventar.',
    'Essa também está fora do que eu sei responder.',
  ],
  unknownWithSuggestions: 'Talvez um destes assuntos ajude:',
  unknownNoSuggestions: 'Posso te mostrar os assuntos que conheço ou te colocar em contato com a equipe da ContLup.',
  unknownEscalate: 'Para não te deixar sem orientação, o melhor caminho é falar com a equipe da ContLup pelo WhatsApp comercial.',
  needContext: 'Para eu responder certo, me diga sobre o que você está perguntando:',
  whichPlan: 'Sobre qual plano você quer saber?',
  whichOther: (name) => `Comparar o **${name}** com qual plano?`,
  caveat: 'Explicação geral: regras, valores e prazos podem mudar. Para o seu caso, confirme com a ContLup.',
  basicMode: 'Essa eu ainda não sei responder por aqui. 🤔 Mas posso te ajudar com os assuntos abaixo ou preparar uma mensagem para você falar com a ContLup. 💜',
  temporary: 'Estou com uma dificuldade temporária para responder perguntas abertas, mas ainda posso te ajudar com nossos serviços ou te encaminhar para a equipe da ContLup. 💜',
  rateLimited: 'Recebi muitas mensagens em pouco tempo. Me dá alguns instantes e tente de novo? Enquanto isso, os assuntos abaixo continuam funcionando.',
  invalid: 'Não consegui entender essa mensagem. Pode escrever de outro jeito, com até 500 caracteres?',
  sensitive: (list) => `Por segurança, removi ${list} da sua mensagem. Por aqui você não precisa compartilhar dados pessoais. 💜`,
  onlySensitive: 'Por segurança, eu não guardo nem envio esse tipo de dado. Me conta a sua dúvida sem informações pessoais?',
  handoffIntro: 'Preparei uma mensagem curta para você enviar ao WhatsApp comercial da ContLup. Revise, edite se quiser e confirme para abrir o WhatsApp. Nada é enviado sem a sua confirmação.',
  restarted: 'Conversa reiniciada.',
  held: 'Esse assunto ainda está em revisão pela equipe da ContLup, então prefiro não responder por aqui por enquanto. A equipe pode te orientar pelo WhatsApp comercial.',
  followUpWhich: 'Para eu não presumir: sobre qual destes você está perguntando?',
  confirmOne: 'Só para confirmar, é sobre isto que você quer saber?',
  partlyHeld: 'Parte desse assunto ainda está em revisão pela equipe.',
};

export const MENU = [
  { label: 'Encontrar um plano', action: { kind: 'startFlow', id: 'encontrar_plano' } },
  { label: 'Conhecer os planos', action: { kind: 'startFlow', id: 'planos' } },
  { label: 'Conhecer os serviços', action: { kind: 'startFlow', id: 'servicos' } },
  { label: 'Primeiro atendimento', action: { kind: 'startFlow', id: 'primeiro_atendimento' } },
  { label: 'Dúvidas gerais', action: { kind: 'categories' } },
];

const HANDOFF_CHIP = { label: 'Falar com a ContLup', action: { kind: 'handoff' }, secondary: true };
const MENU_CHIP = { label: 'Ver menu', action: { kind: 'menu' }, secondary: true };

export class Conversation {
  /**
   * @param {object} o
   * @param {object} o.knowledge  conteúdo de lupi-knowledge.json (v3: intents, plans, synonyms, categories)
   * @param {object} o.flows      conteúdo de lupi-flows.json
   * @param {object} [o.ai]       cliente de IA opcional (desligado no site)
   * @param {object} [o.store]    createSessionStore()
   */
  constructor({ knowledge, flows, ai = null, store = null, maxInput = 500, historyTurns = 8, whatsapp } = {}) {
    this.knowledge = knowledge || {};
    this.index = buildIndex({ intents: this.knowledge.intents || [], flows: flows?.flows || [], synonyms: this.knowledge.synonyms || [] });
    this.intents = this.index.intents; // só aprovadas
    this.plans = createPlans(this.knowledge);
    // regras de acompanhamento, já normalizadas como as mensagens (com sinônimos)
    this.followUps = {
      groups: this.knowledge.contextGroups || {},
      rules: (this.knowledge.followUps || []).map(r => ({ ...r, match: r.match.map(m => this.index.norm(m)).filter(Boolean) })),
    };
    this.categories = (this.knowledge.categories || []).filter(c => [...this.intents.values()].some(e => e.category === c.id));
    this.engine = new FlowEngine(flows, id => this.intents.get(id) || null, id => this.plans.get(id) || null);
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

  reset({ silent = false } = {}) {
    this.messages = [];
    this.chips = [];
    this.placeholder = '';
    this.expression = 'welcome';
    this.busy = false;
    this.suspended = null;
    this.lastCompleted = null;
    this.ctx = createContext();
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
      this.ctx = createContext(saved.ctx);
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
    this.#push({ role: 'notice', text: this.ai?.configured ? TEXT.disclaimerAI : TEXT.disclaimer });
    this.#setChips(MENU);
    this.#commit();
  }

  // ---------- entrada do visitante ----------
  async send(raw) {
    if (this.busy) return;
    let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (text.length > this.maxInput) text = text.slice(0, this.maxInput);
    // "1", "2"... fora de um fluxo escolhe a sugestão correspondente (no fluxo, o motor já entende números)
    const pick = /^\d$/.test(text) && !this.engine.active ? this.chips[Number(text) - 1] : null;
    if (pick) return this.act(pick.action, pick.label);

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
        this.#renderFlow(this.engine.choose(action.index), { answered: true });
        break;
      }
      case 'back': this.#push({ role: 'user', text: 'Voltar' }); this.#renderFlow(this.engine.back()); break;
      case 'cancel': this.#push({ role: 'user', text: 'Cancelar' }); this.#cancelFlow(); break;
      case 'startFlow': this.#push({ role: 'user', text: label || this.engine.flow(action.id)?.title || '' }); this.#startFlow(action.id, { withIntro: !action.noIntro }); break;
      case 'kb': this.#push({ role: 'user', text: label || this.intents.get(action.id)?.title || '' }); this.#answerIntent(action.id); break;
      case 'resume': this.#push({ role: 'user', text: label || 'Continuar' }); this.#resume(); break;
      case 'menu': this.#push({ role: 'user', text: label || 'Ver menu' }); this.#menu(); break;
      case 'categories': this.#push({ role: 'user', text: label || 'Dúvidas gerais' }); this.#showCategories(); break;
      case 'category': this.#push({ role: 'user', text: label || action.id }); this.#showCategory(action.id); break;
      case 'compare': this.#push({ role: 'user', text: label || 'Comparar' }); this.#comparePlans(action.a, action.b); break;
      case 'handoff': this.#push({ role: 'user', text: label || 'Falar com a ContLup' }); this.#handoff(action.message); break;
      case 'ask': this.#push({ role: 'user', text: action.text }); await this.#route(action.text); break;
      case 'link': this.#push({ role: 'user', text: label || 'Abrir no site' }); this.#bot('Prontinho, levei você até essa parte do site. 💜', 'success'); this.#emit('navigate', { href: action.href }); break;
      case 'retry': await this.#askAI({ retry: true }); break;
      default: return;
    }
    this.#commit();
  }

  // ---------- roteamento ----------
  async #route(text) {
    const det = detect(this.index, text);
    const best = det.best;
    const cmd = best && best.kind === 'command' ? best.id : null;
    const active = this.engine.active;

    if (cmd === 'handoff') return this.#handoff();
    if (cmd === 'restart') { this.restart(); this.#push({ role: 'notice', text: TEXT.restarted }); return; }

    if (active) {
      if (cmd === 'back') return this.#renderFlow(this.engine.back());
      if (cmd === 'cancel') return this.#cancelFlow();
      if (cmd === 'menu') { this.#suspend(); return this.#menu(); }
      // mudança clara de assunto: outra intenção forte, e o texto não é uma das opções da etapa
      const switching = best && (best.kind === 'flow' || best.kind === 'kb') && best.group !== this.#groupOfFlow(active.flowId) && !this.#isOptionText(text);
      if (!switching) {
        const out = this.engine.answerText(text);
        if (out) return this.#renderFlow(out, { answered: true });
      }
      this.#suspend();
    }

    if (cmd === 'greeting') { this.#bot(this.messages.some(m => m.role === 'user' && m !== this.messages.at(-1)) ? TEXT.greetingAgain : TEXT.greeting, 'welcome'); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'thanks') { this.#bot(TEXT.thanks, 'success', { visual: 'thanks' }); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'bye') { this.#bot(TEXT.bye, 'success', { visual: 'goodbye' }); return this.#setChips(this.#withResume(MENU)); }
    if (cmd === 'menu') return this.#menu();
    if (cmd === 'resume') return this.#resume();
    if (cmd === 'back' || cmd === 'cancel') { this.#bot(TEXT.nothingToCancel, 'idle'); return this.#setChips(this.#withResume(MENU)); }

    // pergunta nova e completa encerra a sequência de acompanhamentos; "e…?" curto continua no mesmo assunto
    if (!isFollowUp(text)) this.ctx.subject = null;
    if (this.#planQuestion(text, det)) return;
    if (this.#contextFollowUp(text, det)) return;
    if (this.#followUp(text, det)) return;

    // "analisa o meu caso: vale a pena sair do MEI?": responde o assunto, com a ressalva de que é explicação geral
    if (det.ambiguous) {
      const [a, b] = det.candidates;
      const topic = a.id === 'aconselhamento' ? b : b?.id === 'aconselhamento' ? a : null;
      if (topic && topic.kind === 'kb') return this.#answerIntent(topic.id, { caveat: true });
    }
    if (det.ambiguous) {
      // só oferece o que pode ser respondido; assunto em revisão nunca vira sugestão
      const strong = det.candidates.filter(c => c.strong && c.kind !== 'command').slice(0, 3);
      const opts = strong.filter(c => !c.held);
      if (!opts.length) return this.#held(strong[0].id);
      const note = opts.length < strong.length ? ` ${TEXT.partlyHeld}` : '';
      this.#bot((opts.length === 1 ? TEXT.confirmOne : TEXT.ambiguous) + note, 'thinking');
      return this.#setChips([...opts.map(c => this.#chipFor(c)), HANDOFF_CHIP]);
    }
    if (best && best.kind === 'kb' && best.held) return this.#held(best.id);
    if (best && best.kind === 'kb') return this.#answerIntent(best.id);
    if (best && best.kind === 'flow') return this.#startFlow(best.id);

    if (this.ai?.available) return this.#askAI();
    return this.#unknown(det);
  }

  #groupOfFlow(flowId) {
    for (const e of this.intents.values()) if (e.flow === flowId) return e.group || flowId;
    return flowId;
  }

  #isOptionText(text) {
    const st = this.engine.active;
    if (!st) return false;
    const step = this.engine.flow(st.flowId).steps[st.stepId];
    if (!step?.options) return false;
    const n = String(text).toLowerCase();
    return step.options.some(o => n.includes(o.label.toLowerCase())) || matchOption(step.options, text) >= 0;
  }

  #chipFor(c) {
    if (c.kind === 'flow') return { label: this.engine.flow(c.id).title, action: { kind: 'startFlow', id: c.id } };
    return { label: this.intents.get(c.id)?.title || c.id, action: { kind: 'kb', id: c.id } };
  }

  // ---------- planos e acompanhamento ----------
  /** Perguntas que citam planos ou se referem ao plano em discussão. Devolve true se respondeu. */
  #planQuestion(text, det) {
    const named = mentionedPlans(text);
    const q = questionType(text);
    const seg = mentionedSegment(text);
    const follow = isFollowUp(text);
    // desconto, fidelidade, contrato...: são condições comerciais, respondidas pela intenção própria
    if (/\b(desconto|descontos|promocao|promocoes|fidelidade|carencia|multa|contrato minimo|parcelar|parcelamento|teste gratis|gratis)\b/.test(normalize(text)) && this.intents.has('com-condicoes')) { this.#answerIntent('com-condicoes'); return true; }
    const strongOther = det.best && det.best.kind === 'kb' && !this.intents.get(det.best.id)?.id.startsWith('plano') && det.best.group !== 'planos' && det.best.id !== 'com-preco';

    // dois planos citados: comparação
    if (named.length >= 2 && (q.diff || /\b(ou|e|x)\b/.test(text.toLowerCase()))) {
      rememberPlan(this.ctx, named[0]); rememberPlan(this.ctx, named[1]);
      this.#comparePlans(named[0], named[1]);
      return true;
    }
    // "e para quem é MEI?" / "qual plano para o Simples?" → indicação por público
    const planTalk = named.length || /\bplanos?\b/i.test(text) || (follow && this.ctx.topic === 'planos');
    if (seg && q.audience && planTalk || (seg && /\bplanos?\b/i.test(text) && !named.length)) {
      this.#recommendForSegment(seg);
      return true;
    }
    let plan = named[0] || null;
    // "e quanto custa?" só se refere ao plano se a conversa ainda está nos planos (não presume depois de mudar de assunto)
    const onPlans = this.ctx.topic === 'planos';
    if (!plan && this.ctx.plan && (/\b(esse|este|nesse|neste|desse|deste) plano\b/.test(normalize(text)) || (onPlans && (refersToCurrent(text) || refersToOther(text) || follow))) && (q.price || q.includes || q.diff || q.audience || refersToOther(text))) plan = this.ctx.plan;
    if (!plan) {
      // "esse plano inclui folha?" sem plano em discussão: pergunta qual
      if (/\b(esse|este|nesse|neste|desse) plano\b/i.test(text) || (refersToOther(text) && this.ctx.topic === 'planos')) {
        this.#bot(TEXT.whichPlan, 'thinking');
        this.#setChips(this.plans.all().map(p => ({ label: p.name, action: { kind: 'kb', id: p.intent } })));
        return true;
      }
      return false;
    }
    if (strongOther && !named.length && !/\b(esse|este|nesse|neste|desse|deste|o) plano\b/.test(normalize(text))) return false;
    rememberPlan(this.ctx, plan);
    const p = this.plans.get(plan);

    if (refersToOther(text) || (q.diff && !named[1])) {
      const other = this.ctx.prevPlan && this.ctx.prevPlan !== plan ? this.ctx.prevPlan : null;
      if (other) { this.#comparePlans(other, plan); return true; }
      this.#bot(TEXT.whichOther(p.name), 'thinking');
      this.#setChips(this.plans.all().filter(o => o.id !== plan).map(o => ({ label: o.name, action: { kind: 'compare', a: plan, b: o.id } })));
      return true;
    }
    if (q.price) {
      this.#bot(`Os valores do **${p.name}** são definidos em proposta, conforme o porte e a rotina da empresa, então eu não informo preços por aqui. A equipe comercial responde pelo WhatsApp: ${this.#waDisplay()}.`, 'explaining');
      this.ctx.topic = 'planos';
      this.#setChips(this.#withResume([{ label: 'Pedir informações', action: { kind: 'handoff', message: `Olá! Gostaria de saber mais sobre o plano ${p.name}.` } }, { label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } }]));
      return true;
    }
    if (q.includes) {
      const keys = this.plans.featureKeys(text);
      if (!keys.length) {
        if (!named.length && !refersToCurrent(text)) return false;
        // "o que tem no Lup MEI?": pergunta geral sobre o plano, não sobre um item
        if (/\bo que (tem|inclui|incluem|oferece|vem|esta incluido)\b|\bquais (os )?beneficios\b|\bo que (o|esse|este) plano\b/.test(normalize(text))) { this.#answerIntent(p.intent); return true; }
        this.#bot(`Não encontrei esse item entre os benefícios informados do **${p.name}**. Para confirmar se ele pode ser incluído, fale com a ContLup.`, 'thinking');
        this.#setChips(this.#withResume([{ label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } }, { label: 'Perguntar no WhatsApp', action: { kind: 'handoff', message: `Olá! Tenho uma dúvida sobre o que está incluído no plano ${p.name}.` } }]));
        return true;
      }
      const r = this.plans.includes(plan, keys);
      const parts = [];
      if (r.matched.length) {
        const list = r.matched.map(f => `- ${f.text}${f.from !== plan ? ` (benefício do ${this.plans.get(f.from).name}, incluído no ${p.name})` : ''}`).join('\n');
        parts.push(`Sim. O **${p.name}** inclui:\n${list}`);
      }
      if (r.missing.length) {
        const others = r.others.length ? ` Esse item aparece no ${joinPt(r.others.map(o => `**${o.name}**`))}.` : '';
        parts.push(`${r.matched.length ? 'Já o que você perguntou além disso' : 'Isso'} não aparece entre os benefícios informados do **${p.name}**.${others} Para confirmar o que cabe no seu caso, fale com a ContLup.`);
      }
      this.#bot(parts.join('\n\n'), r.missing.length ? 'thinking' : 'explaining');
      this.ctx.topic = 'planos';
      this.#setChips(this.#withResume([{ label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } }, ...r.others.slice(0, 2).map(o => ({ label: `Ver o ${o.name}`, action: { kind: 'kb', id: o.intent } })), { label: 'Tenho interesse', action: { kind: 'handoff', message: `Olá! Gostaria de saber mais sobre o plano ${p.name}.` } }]));
      return true;
    }
    if (q.audience) {
      this.#bot(`O **${p.name}** é ${p.audienceText.charAt(0).toLowerCase() + p.audienceText.slice(1)}`, 'explaining');
      this.ctx.topic = 'planos';
      this.#setChips(this.#withResume([{ label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } }, { label: 'Encontrar um plano', action: { kind: 'startFlow', id: 'encontrar_plano' } }]));
      return true;
    }
    return false; // plano citado sem pergunta específica: a intenção do plano responde
  }

  #comparePlans(a, b) {
    const c = this.plans.compare(a, b);
    if (!c.a || !c.b) return this.#unknown(null);
    rememberPlan(this.ctx, a); rememberPlan(this.ctx, b);
    this.ctx.topic = 'planos';
    const lines = [`**${c.a.name} × ${c.b.name}**`, `- Público: ${c.a.name}: ${c.a.audienceText.replace(/\.$/, '')}. ${c.b.name}: ${c.b.audienceText}`];
    for (const ch of c.changed) lines.push(`- ${c.a.name}: ${ch.a} · ${c.b.name}: ${ch.b}`);
    if (c.onlyB.length) lines.push(`\nSó no **${c.b.name}**:\n${c.onlyB.map(f => '- ' + f.text).join('\n')}`);
    if (c.onlyA.length) lines.push(`\nSó no **${c.a.name}**:\n${c.onlyA.map(f => '- ' + f.text).join('\n')}`);
    this.#bot(lines.join('\n'), 'explaining');
    this.#setChips(this.#withResume([
      { label: `Ver o ${c.a.name}`, action: { kind: 'kb', id: c.a.intent } },
      { label: `Ver o ${c.b.name}`, action: { kind: 'kb', id: c.b.intent } },
      { label: 'Falar sobre os planos', action: { kind: 'handoff', message: `Olá! Gostaria de saber mais sobre os planos ${c.a.name} e ${c.b.name}.` } },
    ]));
  }

  #recommendForSegment(seg) {
    const list = this.plans.forSegment(seg);
    this.ctx.topic = 'planos';
    if (list.length === 1) rememberPlan(this.ctx, list[0].id);
    const items = list.map(p => `- **${p.name}**: ${p.tagline.toLowerCase()}. ${p.audienceText}`).join('\n');
    this.#bot(`Para **${SEGMENT_LABEL[seg]}**, ${list.length === 1 ? 'o plano indicado é' : 'os planos que atendem são'}:\n${items}\n\nÉ uma indicação geral, pelo público de cada plano. A escolha final é combinada com a ContLup.`, 'explaining');
    this.#setChips(this.#withResume([...list.map(p => ({ label: `Ver o ${p.name}`, action: { kind: 'kb', id: p.intent } })), { label: 'Encontrar um plano', action: { kind: 'startFlow', id: 'encontrar_plano' } }]));
  }

  /** Perguntas curtas que dependem do assunto anterior ("e quanto custa?", "e para MEI?"). */
  #followUp(text, det) {
    if (!isFollowUp(text)) return false;
    const last = this.ctx.lastIntent && this.intents.get(this.ctx.lastIntent);
    const q = questionType(text);
    const seg = mentionedSegment(text);
    if (last && seg === 'mei' && last.forMei) { this.#answerIntent(last.forMei); return true; }
    if (q.price) {
      if (last && (last.category === 'servicos' || last.category === 'planos')) {
        this.#bot(`Os valores de **${last.title}** são definidos em proposta, conforme o porte e a rotina da empresa. Eu não informo preços por aqui: a equipe comercial responde pelo WhatsApp, ${this.#waDisplay()}.`, 'explaining');
        const msg = (last.actions || []).find(a => a.type === 'whatsapp')?.message || `Olá! Gostaria de saber mais sobre ${last.title}.`;
        this.#setChips(this.#withResume([{ label: 'Pedir informações', action: { kind: 'handoff', message: msg } }]));
        return true;
      }
      this.#answerIntent('com-preco');
      return true;
    }
    if (det.best && !det.ambiguous) return false; // a própria pergunta já tem resposta
    if (!this.ctx.lastIntent) {
      this.#bot(TEXT.needContext, 'thinking');
      this.#setChips([...MENU.slice(0, 3), MENU_CHIP]);
      return true;
    }
    return false;
  }

  // ---------- respostas do repertório ----------
  #answerIntent(id, { caveat = false } = {}) {
    const e = this.intents.get(id);
    if (!e) return this.index.held.has(id) ? this.#held(id) : this.#unknown(null);
    rememberIntent(this.ctx, e);
    const plan = this.plans.all().find(p => p.intent === id);
    if (plan) rememberPlan(this.ctx, plan.id);
    // intenção que existe para abrir um fluxo (sem ações próprias): começa o fluxo
    if (e.flow && !(e.actions || []).length && this.engine.has(e.flow)) return this.#startFlow(e.flow, { withIntro: true });
    // id e categoria vão junto só para a camada visual escolher a pose (ex.: gráfico no BPO); nada de texto do visitante
    this.#bot(e.answer, e.expression || 'explaining', { intent: e.id, category: e.category, ...(caveat || e.review?.legalSensitive ? { caveat: TEXT.caveat } : {}) });
    const chips = (e.actions || []).map(a => this.#chipForAction(a)).filter(Boolean);
    if (!chips.some(c => c.action.kind === 'handoff')) chips.push(HANDOFF_CHIP);
    this.#setChips(this.#withResume(chips.slice(0, 4)));
  }

  /** Assunto reconhecido, mas com resposta em revisão: não mostra nada da resposta pendente, só oferece o contato. */
  #held(id) {
    const h = this.index.held.get(id);
    if (h) rememberIntent(this.ctx, h); // só id e categoria, para entender o acompanhamento
    this.#bot(TEXT.held, 'thinking', { fallback: 'held' });
    this.#setChips(this.#withResume([{ label: 'Falar com a ContLup', action: { kind: 'handoff' } }, { label: 'Dúvidas gerais', action: { kind: 'categories' } }, MENU_CHIP]));
  }

  /**
   * Acompanhamento de um assunto anterior pelas regras do repertório ("e se eu atrasar?" depois do DAS).
   * Um destino: responde (ou avisa que está em revisão). Vários: pergunta qual, em vez de presumir.
   */
  #contextFollowUp(text, det) {
    const words = this.index.norm(text).split(' ').filter(Boolean);
    const direct = det.best && det.best.strong && !det.ambiguous && det.best.kind !== 'command';
    if (!isFollowUp(text) && (words.length > 5 || direct)) return false;
    const { targets, groups } = followUpTargets(this.ctx, this.followUps, words);
    if (!targets.length) return false;
    const keep = () => { this.ctx.subject = groups; };
    const usable = targets.filter(t => typeof t !== 'string' || this.intents.has(t));
    if (targets.length === 1) {
      const t = targets[0];
      if (typeof t === 'string') this.#answerIntent(t);
      else { this.#bot(TEXT.confirmOne, 'thinking'); this.#setChips(this.#withResume([this.#chipForTarget(t), HANDOFF_CHIP])); }
      keep();
      return true;
    }
    if (!usable.length) { this.#held(targets.find(t => typeof t === 'string')); keep(); return true; }
    const note = usable.length < targets.length ? ` ${TEXT.partlyHeld}` : '';
    this.#bot((usable.length === 1 ? TEXT.confirmOne : TEXT.followUpWhich) + note, 'thinking');
    this.#setChips(this.#withResume([...usable.map(t => this.#chipForTarget(t)), HANDOFF_CHIP]));
    keep();
    return true;
  }

  #chipForTarget(t) {
    if (typeof t !== 'string') return { label: t.label, action: { kind: 'ask', text: t.ask } };
    return { label: this.intents.get(t).title, action: { kind: 'kb', id: t } };
  }

  #chipForAction(a) {
    if (a.type === 'intent') { const t = this.intents.get(a.id); return t ? { label: a.label || t.title, action: { kind: 'kb', id: a.id } } : null; }
    if (a.type === 'flow') return this.engine.has(a.id) ? { label: a.label || this.engine.flow(a.id).title, action: { kind: 'startFlow', id: a.id } } : null;
    if (a.type === 'whatsapp') return { label: a.label || 'Falar com a ContLup', action: { kind: 'handoff', message: a.message } };
    if (a.type === 'link') return { label: a.label, action: { kind: 'link', href: a.href } };
    return null;
  }

  #menu() {
    this.#bot(TEXT.menu, 'idle', { visual: 'idea' });
    this.#setChips(this.#withResume(MENU));
  }

  #showCategories() {
    this.#bot(TEXT.categories, 'idle', { visual: 'idea' });
    this.#setChips(this.#withResume([...this.categories.map(c => ({ label: c.label, action: { kind: 'category', id: c.id } })), MENU_CHIP]));
  }

  #showCategory(id) {
    const cat = this.categories.find(c => c.id === id);
    if (!cat) return this.#showCategories();
    const list = [...this.intents.values()].filter(e => e.category === id && e.menu !== false);
    this.#bot(TEXT.category(cat.label), 'explaining', { visual: 'idea' });
    this.#setChips(this.#withResume([...list.slice(0, 12).map(e => ({ label: e.title, action: { kind: 'kb', id: e.id } })), { label: 'Outros assuntos', action: { kind: 'categories' }, secondary: true }]));
  }

  /** Pergunta fora do repertório: não inventa, sugere até 3 assuntos parecidos e oferece contato, sem repetir a mesma frase. */
  #unknown(det) {
    const streak = this.ctx.unknownStreak++;
    const opener = TEXT.unknown[Math.min(streak, TEXT.unknown.length - 1)];
    const partial = (det?.partial || []).filter(c => this.intents.has(c.id)).slice(0, 3);
    if (streak >= 1) {
      this.#bot(`${opener} ${TEXT.unknownEscalate}`, 'thinking', { fallback: 'unknown' });
      return this.#setChips(this.#withResume([{ label: 'Falar com a ContLup', action: { kind: 'handoff' } }, ...partial.map(c => this.#chipFor(c)), MENU_CHIP]));
    }
    this.#bot(`${opener} ${partial.length ? TEXT.unknownWithSuggestions : TEXT.unknownNoSuggestions}`, 'thinking', { fallback: 'unknown' });
    this.#setChips(this.#withResume([...partial.map(c => this.#chipFor(c)), ...(partial.length ? [] : [{ label: 'Dúvidas gerais', action: { kind: 'categories' } }]), HANDOFF_CHIP, MENU_CHIP]));
  }

  // ---------- fluxos ----------
  #startFlow(id, opts) {
    if (!this.engine.has(id)) return this.#unknown(null);
    if (this.engine.active) this.#suspend();
    if (this.suspended?.flowId === id) this.suspended = null;
    // a explicação de abertura do fluxo não se repete se acabou de ser mostrada
    const skipRef = this.engine.flow(id).introRef === this.ctx.lastIntent;
    this.#renderFlow(this.engine.start(id, { ...opts, skipRef }));
  }

  /** answered: o visitante acabou de responder uma etapa (a Lupi mostra o "ok" antes da próxima pergunta). */
  #renderFlow(out, { answered = false } = {}) {
    if (!out) return;
    out.messages.forEach((m, i) => {
      const last = i === out.messages.length - 1;
      const visual = last ? (out.done ? 'celebrate' : answered ? 'stepDone' : 'notes') : m.visual;
      this.#bot(m.text, m.expression, visual ? { visual } : {});
    });
    this.placeholder = out.placeholder || '';
    if (out.done) {
      this.lastCompleted = this.engine.lastCompleted;
      const rec = this.engine.lastCompleted?.recommended || [];
      if (rec.length) rememberPlan(this.ctx, rec[0]);
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

  // ---------- IA (opcional; desligada no site) ----------
  #aiHistory() {
    const turns = [];
    for (const m of this.messages) {
      if (m.role === 'user') turns.push({ role: 'user', content: truncate(redact(m.text), 600) });
      else if (m.role === 'bot' && m.kind !== 'handoff') turns.push({ role: 'assistant', content: truncate(m.text, 1200) });
    }
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
    this.#bot(res.reply, res.needsHuman ? 'thinking' : 'explaining', { source: 'ai', guarded: res.guarded || undefined });
    const chips = res.suggestions.map(s => ({ label: s, action: { kind: 'ask', text: s } }));
    this.#setChips(this.#withResume(res.needsHuman ? [{ label: 'Falar com a ContLup', action: { kind: 'handoff' } }, ...chips] : [...chips, HANDOFF_CHIP]));
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
  /** Prepara a mensagem (nunca com o texto livre digitado pelo visitante) e mostra para revisão. */
  #handoff(message) {
    const last = this.ctx.lastIntent && this.intents.get(this.ctx.lastIntent);
    const intentMsg = last && (last.actions || []).find(a => a.type === 'whatsapp')?.message;
    const summary = message
      ? sanitizeSummary(message)
      : buildHandoffSummary({ flowSummary: this.lastCompleted?.summary || '', intentMessage: intentMsg || '', topic: last ? (last.topicLabel || last.title) : '' });
    this.#bot(TEXT.handoffIntro, 'success', { visual: 'handoff' });
    this.#push({ role: 'bot', kind: 'handoff', text: summary, state: 'draft' });
    this.#setChips(this.#withResume([MENU_CHIP]));
  }

  #waDisplay() { return this.knowledge.contact?.whatsappDisplay || '(19) 97131-0182'; }

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
    this.store?.save({ messages: this.messages, flow: this.engine.snapshot(), suspended: this.suspended, lastCompleted: this.lastCompleted, chips: this.chips, ctx: this.ctx });
    this.#emit('change');
  }
}

function joinPt(list) {
  if (list.length <= 1) return list[0] || '';
  return list.slice(0, -1).join(', ') + ' e ' + list.at(-1);
}
