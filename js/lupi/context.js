/* Contexto da conversa (somente na sessão).
   Guarda o mínimo para entender perguntas de acompanhamento: intenção anterior, assunto atual, plano em discussão
   (e o anterior, para "e o outro?"), o assunto de uma sequência de acompanhamentos (subject: nomes de grupos)
   e quantas perguntas seguidas ficaram sem resposta. Nunca guarda o texto do visitante. */

import { normalize, phraseScore } from './shared/text.js';

export function createContext(saved) {
  return { lastIntent: null, topic: null, plan: null, prevPlan: null, subject: null, unknownStreak: 0, ...(saved || {}) };
}

export function rememberIntent(ctx, intent) {
  ctx.lastIntent = intent.id;
  ctx.topic = intent.category;
  ctx.unknownStreak = 0;
}

export function rememberPlan(ctx, planId) {
  if (!planId || ctx.plan === planId) return;
  ctx.prevPlan = ctx.plan;
  ctx.plan = planId;
}

const pad = (t) => ' ' + normalize(t) + ' ';

/** Tipo de pergunta sobre um plano ou assunto já em discussão. */
export function questionType(text) {
  const n = pad(text);
  return {
    price: / (quanto custa|quanto|preco|precos|valor|valores|mensalidade|custa|custo|cobra|cobram) /.test(n),
    includes: / (inclui|incluem|incluido|tem|possui|oferece|oferecem|cobre|faz|fazem|vem com|entra|contempla|da direito) /.test(n),
    diff: / (diferenca|diferencas|difere|comparar|compara|comparando|versus|vs|x|melhor que|ou o) /.test(n),
    audience: / (para quem|pra quem|serve para|serve pra|indicado|e para|e pra|quem pode) /.test(n),
  };
}

/** Referência a "esse plano"/"ele" (plano em discussão) e a "o outro". */
export function refersToCurrent(text) {
  return / (esse plano|este plano|nesse plano|neste plano|desse plano|deste plano|o plano|esse|nele|dele|ele) /.test(pad(text));
}
export function refersToOther(text) {
  return / (o outro|outro plano|do outro|pro outro|para o outro|com o outro|os outros|outros planos) /.test(pad(text));
}

/** Mensagem curta que só faz sentido com o contexto ("E quanto custa?", "e para MEI?", "isso inclui folha?"). */
export function isFollowUp(text) {
  const n = normalize(text);
  const words = n ? n.split(' ') : [];
  if (!words.length || words.length > 8) return false;
  return words[0] === 'e' || / (isso|esse|essa|nesse|nessa|dele|dela|disso|o outro|ele|ela) /.test(' ' + n + ' ');
}

/**
 * Destinos das regras de acompanhamento (followUps do repertório) que valem para o assunto anterior.
 * Ex.: depois do DAS, "e se eu atrasar?" → mei-pendencias. targets: ids de intenção ou {label, ask}; vários = perguntar qual.
 * Vale para os grupos da última intenção e para o assunto da sequência de acompanhamentos (ctx.subject).
 * @param {string[]} tt  tokens já normalizados (com sinônimos)
 */
export function followUpTargets(ctx, { groups = {}, rules = [] } = {}, tt = []) {
  const mine = new Set([...Object.entries(groups).filter(([, ids]) => ids.includes(ctx.lastIntent)).map(([g]) => g), ...(ctx.subject || [])]);
  if (!mine.size || !tt.length) return { targets: [], groups: [] };
  const out = [];
  const key = (t) => (typeof t === 'string' ? t : t.ask);
  for (const r of rules) {
    if (!mine.has(r.group) || !r.match.some(p => phraseScore(tt, p) >= 0.8)) continue;
    for (const t of r.targets) if (!out.some(o => key(o) === key(t))) out.push(t);
  }
  // o assunto que acabou de ser respondido só fica se for o único destino ("e se eu esquecer de pagar?" depois do DAS atrasado)
  const others = out.filter(t => t !== ctx.lastIntent);
  return { targets: others.length ? others : out, groups: [...mine] };
}
