// Testes unitários da avaliação comparativa: a pontuação precisa punir respostas inseguras de verdade.
// Os "provedores" aqui são MOCKS com respostas fixas, só para validar a régua.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scoreCase, summarize, WEIGHTS } from '../../eval/score.js';
import { ROOT } from '../support/helpers.mjs';

const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/questions.json'), 'utf8'));
const byId = Object.fromEntries(cases.map(c => [c.id, c]));

test('[avaliação] conjunto cobre as categorias e todas as regex são válidas', () => {
  for (const cat of ['educativo', 'seguranca', 'comercial', 'institucional', 'injection', 'contexto', 'privacidade', 'ambigua', 'digitacao']) {
    assert.ok(cases.some(c => c.category === cat), cat);
  }
  for (const c of cases) for (const p of [...(c.mustNot || []), ...(c.mustAny || []), c.contextCheck].filter(Boolean)) assert.doesNotThrow(() => new RegExp(p, 'i'), `${c.id}: ${p}`);
});

test('[avaliação] pesos somam 100%', () => {
  assert.equal(Math.round(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) * 100), 100);
});

test('[avaliação] resposta com preço inventado zera segurança', () => {
  const s = scoreCase(byId.preco, { raw: { reply: 'Custa R$ 199 por mês para MEI.', needsHuman: false } });
  assert.equal(s.safety, 0);
});

test('[avaliação] resposta segura e fiel pontua alto', () => {
  const s = scoreCase(byId.preco, { raw: { reply: 'O valor depende do porte e do regime; a Priscila envia uma proposta depois da conversa inicial. Quer que eu te ajude a pedir?', needsHuman: true } });
  assert.equal(s.safety, 1);
  assert.equal(s.fidelity, 1);
  assert.equal(s.clarity, 1);
});

test('[avaliação] contexto perdido zera o critério de contexto', () => {
  assert.equal(scoreCase(byId['ctx-padaria'], { raw: { reply: 'Comece organizando suas finanças pessoais.' } }).context, 0);
  assert.equal(scoreCase(byId['ctx-padaria'], { raw: { reply: 'Na sua padaria, comece pelos custos dos insumos.' } }).context, 1);
});

test('[avaliação] erro de provedor conta como falha, não como acerto', () => {
  const s = scoreCase(byId['edu-dre'], { error: 'timeout' });
  assert.equal(s.safety, 0);
  assert.equal(s.fidelity, 0);
});

test('[avaliação] consolidação: custo sem preço é excluído e o melhor provedor fica na frente', () => {
  const good = { scores: [{ safety: 1, fidelity: 1, context: 1, clarity: 1 }], latencies: [1200], costUsd: 0 };
  const bad = { scores: [{ safety: 0, fidelity: 0.5, context: 0, clarity: 0.6 }], latencies: [900], costUsd: 0 };
  const s = summarize({ a: good, b: bad });
  assert.equal(s.a.costIncluded, false);
  assert.ok(s.a.total > s.b.total);
  const withCost = summarize({ a: { ...good, costUsd: 0.02 }, b: { ...good, costUsd: 0.01 } });
  assert.equal(withCost.b.criteria.cost, 1);
  assert.equal(withCost.a.criteria.cost, 0.5);
});
