// Testes unitários: motor de fluxos guiados (funciona sem IA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlowEngine, matchOption, renderSummary } from '../../js/lupi/flow-engine.js';
import { knowledge, flows } from '../support/helpers.mjs';

const approved = new Map(knowledge.intents.filter(e => e.status === 'approved').map(e => [e.id, e]));
const plans = new Map(knowledge.plans.map(p => [p.id, p]));
const engine = () => new FlowEngine(flows, id => approved.get(id) || null, id => plans.get(id) || null);

test('[fluxos] A — abrir empresa: caminho completo gera resumo sem promessas', () => {
  const e = engine();
  let out = e.start('abrir_empresa');
  assert.equal(out.messages.at(-1).text, 'Que tipo de atividade você pretende ter?');
  out = e.choose(0); // serviços
  out = e.choose(1); // planejando
  out = e.choose(1); // tenho MEI
  out = e.choose(2); // passo a passo
  assert.equal(out.done, true);
  assert.equal(e.active, null);
  assert.match(out.summary, /abertura de uma empresa na área de serviços/);
  assert.match(out.summary, /Hoje tenho um MEI/);
  assert.match(out.summary, /Podemos conversar\?$/);
  assert.doesNotMatch(out.messages[0].text, /Simples Nacional|garant/i, 'não promete regime');
});

test('[fluxos] B — trocar de contador: conclusão avisa que não precisa enviar documentos', () => {
  const e = engine();
  e.start('troca_contador');
  e.choose(0); e.choose(1);
  const out = e.choose(0);
  assert.equal(out.done, true);
  assert.match(out.messages[0].text, /não precisa enviar documentos/);
  assert.match(out.summary, /trocar de contador/);
});

test('[fluxos] C — MEI: resposta em revisão nunca aparece no fluxo; entra o texto neutro (fallbackText)', () => {
  const e = engine();
  e.start('mei');
  e.choose(0);
  const out = e.choose(0); // faturamento -> info (mei-limite, em revisão)
  const texts = out.messages.map(m => m.text).join('\n');
  const pending = knowledge.intents.find(x => x.id === 'mei-limite');
  assert.equal(pending.status, 'pending_review');
  assert.ok(!texts.includes(pending.answer.slice(0, 50)), 'texto pendente não aparece');
  const step = flows.flows.find(f => f.id === 'mei').steps.info_faturamento;
  assert.ok(texts.includes(step.fallbackText));
  assert.doesNotMatch(texts, /R\$|\d{2,} mil/);
  assert.equal(out.done, true);
});

test('[fluxos] E — encontrar plano: regras de indicação por respostas', () => {
  const run = (...idx) => { const e = engine(); e.start('encontrar_plano'); let out; for (const i of idx) out = e.choose(i); return { e, out }; };
  const cases = [
    [[0], ['lup-mei'], 'o plano Lup MEI'],
    [[1, 0, 0], ['lup-start'], 'o plano Lup Start'],
    [[1, 0, 1], ['lup-plus'], 'o plano Lup Plus'],
    [[1, 1, 2], ['lup-prime'], 'o plano Lup Prime'],
    [[1, 2, 0], ['lup-prime'], 'o plano Lup Prime'],
    [[1, 3, 3], ['lup-start', 'lup-plus', 'lup-prime'], 'os planos Lup Start, Lup Plus e Lup Prime'],
  ];
  for (const [idx, rec, field] of cases) {
    const { e, out } = run(...idx);
    assert.equal(out.done, true, idx.join());
    assert.deepEqual(e.lastCompleted.recommended, rec, idx.join());
    assert.equal(e.lastCompleted.answers.plano, field, idx.join());
    assert.equal(out.summary, `Olá! Gostaria de saber mais sobre ${field}.`);
    for (const id of rec) assert.ok(out.chips.some(c => c.action.kind === 'kb' && c.action.id === plans.get(id).intent), `chip ${id}`);
  }
  const { e, out } = run(2); // ainda não tenho empresa
  assert.deepEqual(e.lastCompleted.recommended, []);
  assert.equal(out.summary, 'Olá! Gostaria de saber mais sobre a abertura de uma empresa.');
});

test('[fluxos] E — encontrar plano: a indicação é apresentada como preliminar', () => {
  const e = engine();
  e.start('encontrar_plano');
  e.choose(1); e.choose(0);
  const out = e.choose(0);
  const texts = out.messages.map(m => m.text).join('\n');
  assert.match(texts, /preliminar/i);
  assert.doesNotMatch(texts, /R\$/);
});

test('[fluxos] G — primeiro atendimento: cada objetivo mostra a explicação e gera a mensagem', () => {
  const expected = ['a abertura de uma empresa', 'a troca de contador', 'a regularização da minha empresa', 'os serviços da ContLup'];
  flows.flows.find(f => f.id === 'primeiro_atendimento').steps.objetivo.options.forEach((o, i) => {
    const e = engine();
    e.start('primeiro_atendimento');
    const out = e.choose(i);
    assert.equal(out.done, true);
    assert.ok(out.messages.length >= 2, 'explicação + conclusão');
    assert.match(out.summary, /^Olá! Gostaria de conversar sobre /);
    assert.equal(out.summary, `Olá! Gostaria de conversar sobre ${e.lastCompleted.answers.objetivo}.`);
    assert.ok(expected.includes(e.lastCompleted.answers.objetivo), e.lastCompleted.answers.objetivo);
  });
});

test('[fluxos] resposta digitada curta casa com o rótulo, sem confundir sim/não nem empatar', () => {
  const tipo = flows.flows.find(f => f.id === 'encontrar_plano').steps.tipo.options;
  assert.equal(matchOption(tipo, 'tenho empresa'), 1);
  assert.equal(matchOption(tipo, 'não tenho empresa'), 2);
  assert.equal(matchOption(tipo, 'mei'), 0);
  const form = flows.flows.find(f => f.id === 'abrir_empresa').steps.formalizacao.options;
  assert.equal(matchOption(form, 'tenho'), -1, 'serve para duas opções');
  assert.equal(matchOption(form, 'não'), -1);
  assert.equal(matchOption(form, 'tenho mei'), 1);
  const obj = flows.flows.find(f => f.id === 'primeiro_atendimento').steps.objetivo.options;
  assert.equal(matchOption(obj, 'regularizar'), 2);
});

test('[fluxos] D — serviços: mostra só áreas confirmadas e oferece proposta', () => {
  const e = engine();
  const start = e.start('servicos');
  assert.deepEqual(start.chips.filter(c => !c.secondary).map(c => c.label), ['Contábil', 'Fiscal e Tributário', 'Trabalhista', 'Societário', 'BPO Financeiro']);
  const out = e.choose(2);
  assert.match(out.messages[0].text, /Folha de pagamento/);
  assert.ok(out.chips.some(c => c.action.kind === 'startFlow' && c.action.id === 'proposta'));
});

test('[fluxos] F — proposta: conclusão abre o resumo automaticamente e não fala de valores', () => {
  const e = engine();
  e.start('proposta');
  e.choose(0); e.choose(1);
  const out = e.choose(0); // sem detalhe
  assert.equal(out.handoff, true);
  assert.match(out.summary, /solicitar uma proposta para a contabilidade da minha empresa/);
  assert.doesNotMatch(out.summary, /Detalhe:/, 'frase com campo vazio é omitida');
  assert.doesNotMatch(out.messages[0].text, /R\$/);
});

test('[fluxos] voltar desfaz a última resposta', () => {
  const e = engine();
  e.start('abrir_empresa');
  e.choose(0);
  assert.equal(e.active.answers.atividade, 'na área de serviços');
  const out = e.back();
  assert.equal(e.active.stepId, 'atividade');
  assert.equal(e.active.answers.atividade, undefined);
  assert.match(out.messages[0].text, /tipo de atividade/);
});

test('[fluxos] voltar no primeiro passo não quebra', () => {
  const e = engine();
  e.start('mei');
  const out = e.back();
  assert.match(out.messages[0].text, /primeiro passo/);
  assert.equal(e.active.stepId, 'possui');
});

test('[fluxos] cancelar encerra o fluxo', () => {
  const e = engine();
  e.start('mei');
  assert.equal(e.cancel().cancelled, true);
  assert.equal(e.active, null);
  assert.equal(e.cancel().cancelled, false);
});

test('[fluxos] resposta digitada: número, rótulo e rótulo com erro', () => {
  const opts = flows.flows.find(f => f.id === 'mei').steps.possui.options;
  assert.equal(matchOption(opts, '2'), 1);
  assert.equal(matchOption(opts, 'sim, já sou MEI'), 0);
  assert.equal(matchOption(opts, 'ja fui mei'), 2);
  assert.equal(matchOption(opts, '9'), -1);
  assert.equal(matchOption(opts, 'qual o limite de faturamento?'), -1);
});

test('[fluxos] texto livre só é aceito em etapas que permitem e é limpo de dados pessoais', () => {
  const e = engine();
  e.start('abrir_empresa');
  const out = e.answerText('padaria artesanal, meu cpf 123.456.789-09');
  assert.ok(out);
  assert.match(e.active.answers.atividade, /^com a atividade: padaria artesanal/);
  assert.doesNotMatch(e.active.answers.atividade, /123/);
  assert.equal(e.answerText('qualquer coisa'), null, 'etapa "funcionando" não aceita texto livre');
});

test('[fluxos] snapshot/restore preservam o passo e as respostas', () => {
  const e = engine();
  e.start('troca_contador'); e.choose(0);
  const snap = e.snapshot();
  const e2 = engine();
  assert.equal(e2.restore(snap), true);
  assert.equal(e2.active.stepId, 'motivo');
  assert.equal(e2.restore({ flowId: 'inexistente', stepId: 'x' }), false);
  assert.equal(e2.active, null);
});

test('[fluxos] renderSummary: campos obrigatórios e opcionais', () => {
  const tpl = ['A {x}.', 'B {?y}.', 'C {z}.'];
  assert.equal(renderSummary(tpl, { x: 'um', y: '' }), 'A um. B.');
  assert.equal(renderSummary(tpl, { x: 'um', y: 'dois', z: 'três' }), 'A um. B dois. C três.');
});

test('[fluxos] todos os fluxos têm etapas válidas, alcançáveis e um fim', () => {
  for (const f of flows.flows) {
    assert.ok(f.steps[f.start], `${f.id}: start inválido`);
    const seen = new Set();
    const queue = [f.start];
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      const s = f.steps[id];
      assert.ok(s, `${f.id}: passo ${id} não existe`);
      const nexts = [s.next, s.textNext, ...(s.options || []).map(o => o.next)].filter(Boolean);
      for (const n of nexts) { assert.ok(f.steps[n], `${f.id}.${id} -> ${n} inexistente`); queue.push(n); }
      if (s.kbRef) {
        assert.ok(knowledge.intents.some(k => k.id === s.kbRef), `${f.id}.${id}: kbRef ${s.kbRef} inexistente`);
        if (!approved.has(s.kbRef)) assert.ok(s.fallbackText, `${f.id}.${id}: ${s.kbRef} não está aprovada e o passo não tem fallbackText`);
      }
      if (s.type === 'info' && !s.kbRef) assert.ok(s.fallbackText, `${f.id}.${id}: info sem conteúdo`);
    }
    assert.ok([...seen].some(id => f.steps[id].type === 'end'), `${f.id}: sem fim`);
    assert.equal(seen.size, Object.keys(f.steps).length, `${f.id}: há passos inalcançáveis`);
  }
});
