// Testes unitários: consultas sobre os planos (plans.js) e contexto da conversa (context.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledge } from '../support/helpers.mjs';
import { createPlans, mentionedPlans, mentionedSegment } from '../../js/lupi/plans.js';
import { createContext, rememberIntent, rememberPlan, questionType, refersToCurrent, refersToOther, isFollowUp } from '../../js/lupi/context.js';

const plans = createPlans(knowledge);
const texts = (id) => plans.features(id).map(f => f.text);

test('[planos] herança: Plus inclui o Start; Prime inclui o Plus, com as próprias condições no lugar das do Plus', () => {
  const start = texts('lup-start');
  const plus = texts('lup-plus');
  const prime = texts('lup-prime');
  for (const t of start) assert.ok(plus.includes(t), `Plus herda "${t}"`);
  assert.ok(plus.includes('Balancete e DRE trimestrais'));
  assert.ok(prime.includes('Folha de pagamento, pró-labore e encargos'), 'Prime herda do Start pelo Plus');
  assert.ok(prime.includes('Balancete e DRE mensais'));
  assert.ok(!prime.includes('Balancete e DRE trimestrais'), 'condição do Prime substitui a do Plus');
  assert.ok(!prime.includes('Reuniões trimestrais de acompanhamento'));
  assert.deepEqual(texts('lup-mei'), knowledge.plans.find(p => p.id === 'lup-mei').features.map(f => f.text), 'MEI não herda nada');
});

test('[planos] "inclui?" por benefício, com os planos que têm o que falta', () => {
  const keys = plans.featureKeys('inclui folha de pagamento?');
  assert.ok(keys.length >= 1);
  const yes = plans.includes('lup-plus', keys);
  assert.equal(yes.missing.length, 0);
  assert.equal(yes.matched[0].from, 'lup-start', 'mostra de onde veio o benefício');
  const no = plans.includes('lup-mei', keys);
  assert.deepEqual(no.matched, []);
  assert.deepEqual(no.others.map(p => p.id), ['lup-start', 'lup-plus', 'lup-prime']);
});

test('[planos] comparação: o que só um tem e o que muda entre os dois', () => {
  const c = plans.compare('lup-plus', 'lup-prime');
  assert.ok(c.changed.some(x => /trimestrais/.test(x.a) && /mensais/.test(x.b)));
  assert.ok(c.onlyB.some(f => /prioritário/.test(f.text)));
  const m = plans.compare('lup-mei', 'lup-start');
  assert.ok(m.onlyA.some(f => /DAS/.test(f.text)));
  assert.ok(m.onlyB.some(f => /Folha/.test(f.text)));
});

test('[planos] público de cada plano e menções no texto', () => {
  assert.deepEqual(plans.forSegment('mei').map(p => p.id), ['lup-mei']);
  assert.deepEqual(plans.forSegment('presumido').map(p => p.id), ['lup-plus', 'lup-prime']);
  assert.deepEqual(plans.forSegment('real').map(p => p.id), ['lup-prime']);
  assert.deepEqual(mentionedPlans('o PLUS ou o lup prime?'), ['lup-plus', 'lup-prime']);
  assert.deepEqual(mentionedPlans('plano para MEI'), ['lup-mei']);
  assert.deepEqual(mentionedPlans('quanto custa?'), []);
  assert.equal(mentionedSegment('e para quem é MEI?'), 'mei');
  assert.equal(mentionedSegment('empresa no lucro presumido'), 'presumido');
  assert.equal(mentionedSegment('lucro real'), 'real');
  assert.equal(mentionedSegment('o que é lucro?'), null);
});

test('[contexto] guarda só ids, troca o plano atual e lembra o anterior', () => {
  const ctx = createContext();
  rememberIntent(ctx, { id: 'plano-lup-plus', category: 'planos' });
  rememberPlan(ctx, 'lup-plus');
  rememberPlan(ctx, 'lup-prime');
  rememberPlan(ctx, 'lup-prime');
  assert.deepEqual(ctx, { lastIntent: 'plano-lup-plus', topic: 'planos', plan: 'lup-prime', prevPlan: 'lup-plus', subject: null, unknownStreak: 0 });
  assert.deepEqual(createContext({ plan: 'lup-mei' }).plan, 'lup-mei', 'restaura da sessão');
});

test('[contexto] tipos de pergunta e referências', () => {
  assert.equal(questionType('E quanto custa?').price, true);
  assert.equal(questionType('esse plano inclui folha?').includes, true);
  assert.equal(questionType('qual a diferença para o outro?').diff, true);
  assert.equal(questionType('e para quem é MEI?').audience, true);
  assert.equal(questionType('o que é DRE?').price, false);
  assert.equal(refersToCurrent('esse plano tem reunião?'), true);
  assert.equal(refersToOther('e o outro?'), true);
  assert.equal(refersToOther('o que é lucro?'), false);
  assert.equal(isFollowUp('E quanto custa?'), true);
  assert.equal(isFollowUp('isso vale para MEI?'), true);
  assert.equal(isFollowUp('qual a diferença entre lucro presumido e lucro real para empresas de serviço?'), false);
});
