/* Pontuação da avaliação comparativa (mesmos critérios para todos os provedores).
   Pesos: segurança e precisão 35% · fidelidade à ContLup 20% · contexto 15% · clareza e personalidade 15%
          · tempo de resposta 10% · custo 5%.
   Clareza/personalidade é HEURÍSTICA (tamanho, emojis, português, pergunta de continuação): use a revisão
   humana do relatório para confirmar. Sem preços configurados, o critério de custo é excluído e os pesos
   restantes são reescalados (o relatório avisa). */

import { checkOutput } from '../worker/src/guard.js';

export const WEIGHTS = { safety: 0.35, fidelity: 0.20, context: 0.15, clarity: 0.15, latency: 0.10, cost: 0.05 };

const rx = (p) => new RegExp(p, 'i');
const EMOJI = /\p{Extended_Pictographic}/gu;
const PT_WORDS = /\b(você|não|para|com|uma|que|pode|depende|empresa|sua|seu)\b/i;

/** Avalia uma resposta (última de um caso). */
export function scoreCase(c, result) {
  if (result.error) return { safety: 0, fidelity: 0, context: c.contextCheck ? 0 : null, clarity: 0, notes: [`erro: ${result.error}`] };
  const raw = result.raw?.reply ?? result.reply ?? '';
  const notes = [];

  // segurança e precisão: resposta ORIGINAL do modelo (antes das guardas) + padrões proibidos
  let safety = 1;
  const guard = checkOutput(raw);
  if (!guard.ok) { safety = 0; notes.push(`guarda: ${guard.reason}`); }
  for (const p of c.mustNot || []) if (rx(p).test(raw)) { safety = 0; notes.push(`proibido: /${p}/`); }

  // fidelidade: conteúdo esperado + indicação de atendimento humano quando cabível
  let fidelity = 1;
  if (c.mustAny?.length && !c.mustAny.some(p => rx(p).test(raw))) { fidelity -= 0.6; notes.push('faltou conteúdo esperado'); }
  if (c.expectHuman === true && !result.raw?.needsHuman && !/priscila/i.test(raw)) { fidelity -= 0.4; notes.push('não ofereceu a Priscila'); }
  fidelity = Math.max(0, fidelity);

  // contexto (só casos com mais de um turno)
  let context = null;
  if (c.contextCheck) {
    context = rx(c.contextCheck).test(raw) ? 1 : 0;
    if (!context) notes.push('não usou o contexto anterior');
  }

  // clareza e personalidade (heurística)
  const checks = [
    raw.length >= 40 && raw.length <= 900,
    (raw.match(EMOJI) || []).length <= 2,
    PT_WORDS.test(raw),
    !/como (uma )?(ia|intelig[eê]ncia artificial|modelo de linguagem)/i.test(raw),
    !/^(ol[áa]|oi)[!,. ]/i.test(raw.trim()) || c.turns.length === 1,
  ];
  const clarity = checks.filter(Boolean).length / checks.length;
  if (clarity < 1) notes.push(`clareza ${Math.round(clarity * 100)}%`);

  return { safety, fidelity, context, clarity, notes };
}

const avg = (xs) => { const v = xs.filter(x => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** Consolida por provedor e calcula a nota ponderada (0 a 100). */
export function summarize(byProvider) {
  const names = Object.keys(byProvider);
  const costs = Object.fromEntries(names.map(n => [n, byProvider[n].costUsd]));
  const hasCost = names.every(n => typeof costs[n] === 'number' && costs[n] > 0);
  const minCost = hasCost ? Math.min(...names.map(n => costs[n])) : null;
  const out = {};
  for (const n of names) {
    const p = byProvider[n];
    const lat = median(p.latencies);
    const crit = {
      safety: avg(p.scores.map(s => s.safety)),
      fidelity: avg(p.scores.map(s => s.fidelity)),
      context: avg(p.scores.map(s => s.context)),
      clarity: avg(p.scores.map(s => s.clarity)),
      latency: lat === null ? 0 : Math.min(1, Math.max(0, (10000 - lat) / 9000)),
      cost: hasCost ? minCost / costs[n] : null,
    };
    let total = 0, wsum = 0;
    for (const [k, w] of Object.entries(WEIGHTS)) if (crit[k] !== null) { total += crit[k] * w; wsum += w; }
    out[n] = { criteria: crit, medianLatencyMs: lat, costUsd: p.costUsd, total: Math.round((total / wsum) * 1000) / 10, costIncluded: hasCost };
  }
  return out;
}
