/* Planos ContLup: consultas determinísticas sobre os dados de "plans" em lupi-knowledge.json.
   Nada é deduzido além do que está publicado: herança (Plus inclui Start; Prime inclui Plus com condições próprias),
   benefícios por chave, comparação entre planos e público de cada plano. */

import { normalize, phraseScore } from './shared/text.js';

export function createPlans(doc) {
  const plans = new Map((doc?.plans || []).map(p => [p.id, p]));
  const featureTerms = Object.entries(doc?.featureTerms || {}).map(([key, terms]) => [key, terms.map(normalize)]);

  /** Benefícios efetivos: os herdados entram, a não ser que o plano tenha a própria versão da mesma chave. */
  function features(id) {
    const p = plans.get(id);
    if (!p) return [];
    const own = p.features.map(f => ({ ...f, from: id }));
    if (!p.inherits) return own;
    const keys = new Set(own.map(f => f.key));
    return [...features(p.inherits).filter(f => !keys.has(f.key)), ...own];
  }

  /** Chaves de benefício mencionadas no texto (normalizado). */
  function featureKeys(text) {
    const tt = normalize(text).split(' ');
    return featureTerms.filter(([, terms]) => terms.some(t => phraseScore(tt, t) === 1)).map(([k]) => k);
  }

  /** O plano inclui? → { plan, matched: [benefícios], missing: [chaves], others: [planos que incluem as chaves que faltam] } */
  function includes(id, keys) {
    const fs = features(id);
    const matched = fs.filter(f => keys.includes(f.key));
    const missing = keys.filter(k => !fs.some(f => f.key === k));
    const others = [...plans.keys()].filter(o => o !== id && missing.length && missing.every(k => features(o).some(f => f.key === k)));
    return { plan: plans.get(id), matched, missing, others: others.map(o => plans.get(o)) };
  }

  /** Diferenças entre dois planos, por chave de benefício. */
  function compare(a, b) {
    const fa = features(a), fb = features(b);
    const ka = new Map(fa.map(f => [f.key, f])), kb = new Map(fb.map(f => [f.key, f]));
    return {
      a: plans.get(a), b: plans.get(b),
      onlyA: fa.filter(f => !kb.has(f.key)),
      onlyB: fb.filter(f => !ka.has(f.key)),
      changed: fa.filter(f => kb.has(f.key) && kb.get(f.key).text !== f.text).map(f => ({ key: f.key, a: f.text, b: kb.get(f.key).text })),
    };
  }

  /** Planos cujo público inclui o segmento (mei, simples, presumido, real). */
  function forSegment(seg) {
    return [...plans.values()].filter(p => p.audience.includes(seg));
  }

  return { all: () => [...plans.values()], get: (id) => plans.get(id), features, featureKeys, includes, compare, forSegment };
}

/** Planos citados no texto, na ordem em que aparecem. */
export function mentionedPlans(text) {
  const n = ' ' + normalize(text) + ' ';
  const found = [];
  const rules = [
    ['lup-mei', /\b(lup mei|plano mei|plano do mei|plano para mei)\b/g],
    ['lup-start', /\b(lup start|start)\b/g],
    ['lup-plus', /\b(lup plus|plus)\b/g],
    ['lup-prime', /\b(lup prime|prime)\b/g],
  ];
  for (const [id, re] of rules) for (const m of n.matchAll(re)) found.push([m.index, id]);
  return [...new Set(found.sort((x, y) => x[0] - y[0]).map(x => x[1]))];
}

/** Segmento de empresa citado (para "e para quem é MEI?", "plano para o Simples"). */
export function mentionedSegment(text) {
  const n = ' ' + normalize(text) + ' ';
  if (/ (lucro real) /.test(n)) return 'real';
  if (/ (lucro presumido|presumido) /.test(n)) return 'presumido';
  if (/ (simples nacional|simples) /.test(n)) return 'simples';
  if (/ (mei|microempreendedor) /.test(n)) return 'mei';
  return null;
}

export const SEGMENT_LABEL = { mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' };
