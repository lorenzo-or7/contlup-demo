// Testes unitários: motor de fluxos guiados (funciona sem IA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FlowEngine, matchOption, renderSummary } from '../../js/lupi/flow-engine.js';
import { knowledge, flows } from '../support/helpers.mjs';

const approved = new Map(knowledge.entries.filter(e => e.status === 'approved').map(e => [e.id, e]));
const engine = () => new FlowEngine(flows, id => approved.get(id) || null);

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

test('[fluxos] C — MEI: conteúdo regulatório pendente usa o texto neutro (fallback)', () => {
  const e = engine();
  e.start('mei');
  e.choose(0);
  const out = e.choose(0); // faturamento -> info com kbRef pendente
  const texts = out.messages.map(m => m.text).join('\n');
  assert.match(texts, /dependem dos valores e das regras em vigor/);
  assert.doesNotMatch(texts, /R\$|\d{2,} mil/);
  assert.equal(out.done, true);
  assert.match(out.messages.at(-1).text, /análise profissional/);
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
      if (s.kbRef) assert.ok(knowledge.entries.some(k => k.id === s.kbRef), `${f.id}.${id}: kbRef ${s.kbRef} inexistente`);
    }
    assert.ok([...seen].some(id => f.steps[id].type === 'end'), `${f.id}: sem fim`);
    assert.equal(seen.size, Object.keys(f.steps).length, `${f.id}: há passos inalcançáveis`);
  }
});
