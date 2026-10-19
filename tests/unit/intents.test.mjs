// Testes unitários: reconhecimento local de intenções (sem IA), incluindo erros de digitação e ambiguidade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, detect } from '../../js/lupi/intents.js';
import { knowledge, flows } from '../support/helpers.mjs';

const index = buildIndex(knowledge.entries, flows.flows);
const best = (t) => detect(index, t).best;

const CASES = [
  // [texto, kind, id]
  ['quero abrir uma empresa', 'flow', 'abrir_empresa'],
  ['quero trocar de contador', 'flow', 'troca_contador'],
  ['sou MEI', 'flow', 'mei'],
  ['quais os serviços?', 'flow', 'servicos'],
  ['quero uma proposta', 'flow', 'proposta'],
  ['quanto custa a contabilidade?', 'kb', 'com-preco'],
  ['qual o horário de atendimento?', 'kb', 'inst-horario'],
  ['onde fica o escritório?', 'kb', 'inst-localizacao'],
  ['quem é a Priscila?', 'kb', 'inst-priscila'],
  ['vocês dão desconto?', 'kb', 'com-condicoes'],
  ['saldo em conta é lucro?', 'kb', 'gestao-lucro-saldo'],
  ['como precificar meu produto', 'kb', 'gestao-precificacao'],
  ['quero falar com a Priscila', 'command', 'handoff'],
  ['oi', 'command', 'greeting'],
  ['obrigada!', 'command', 'thanks'],
  ['voltar', 'command', 'back'],
  ['cancelar', 'command', 'cancel'],
];
for (const [text, kind, id] of CASES) {
  test(`[intenção] "${text}" -> ${kind}:${id}`, () => {
    const b = best(text);
    assert.ok(b, 'nada reconhecido');
    assert.equal(`${b.kind}:${b.id}`, `${kind}:${id}`);
    assert.ok(b.strong, 'deveria ser uma correspondência forte');
  });
}

const TYPOS = [
  ['quero abrir uma empreza', 'abrir_empresa'],
  ['trocar de contadr', 'troca_contador'],
  ['precificaçao', 'gestao-precificacao'],
  ['orario de atendimento', 'inst-horario'],
];
for (const [text, id] of TYPOS) {
  test(`[erros de digitação] "${text}" ainda reconhece ${id}`, () => {
    assert.equal(best(text)?.id, id);
  });
}

test('[intenção] "oi" no meio de uma pergunta longa não vira só cumprimento', () => {
  const b = best('oi, quanto custa a contabilidade da minha empresa?');
  assert.notEqual(b.kind, 'command');
});

test('[ambíguas] duas intenções fortes e próximas pedem esclarecimento', () => {
  const r = detect(index, 'trocar de contador e abrir empresa');
  assert.equal(r.ambiguous, true);
  const ids = r.candidates.slice(0, 2).map(c => c.id).sort();
  assert.deepEqual(ids, ['abrir_empresa', 'troca_contador']);
});

test('[ambíguas] pergunta sem relação não casa com nada forte', () => {
  const b = best('qual a previsão do tempo amanhã?');
  assert.ok(!b || !b.strong);
});

test('[conteúdo pendente] entradas não aprovadas não entram no índice', () => {
  const pending = knowledge.entries.filter(e => e.status !== 'approved').map(e => e.id);
  assert.ok(pending.length > 0);
  for (const id of pending) assert.ok(!index.some(t => t.kind === 'kb' && t.id === id), id);
});
