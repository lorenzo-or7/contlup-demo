// Testes unitários: estrutura da base de conhecimento e regras de aprovação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledge } from '../support/helpers.mjs';
import { buildSystemPrompt } from '../../worker/src/prompt.js';

const STATUSES = new Set(['draft', 'pending_review', 'approved', 'outdated']);
const CATEGORIES = new Set(['institucional', 'servicos', 'empreendedorismo', 'mei', 'gestao', 'atendimento']);

test('[institucional] toda entrada tem os campos obrigatórios e status válido', () => {
  const ids = new Set();
  for (const e of knowledge.entries) {
    for (const f of ['id', 'category', 'title', 'answer', 'content', 'source', 'updatedAt', 'status']) assert.ok(e[f], `${e.id}: falta ${f}`);
    assert.ok(STATUSES.has(e.status), `${e.id}: status ${e.status}`);
    assert.ok(CATEGORIES.has(e.category), `${e.id}: categoria ${e.category}`);
    assert.ok(!ids.has(e.id), `id duplicado ${e.id}`); ids.add(e.id);
    assert.match(e.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    if (e.status === 'approved') assert.ok(e.approvedBy, `${e.id}: aprovada sem responsável`);
    else assert.equal(e.approvedBy, null, `${e.id}: não aprovada não pode ter aprovador`);
    for (const r of e.related || []) assert.ok(knowledge.entries.some(x => x.id === r), `${e.id}: related ${r} inexistente`);
  }
});

test('[institucional] cobre todas as categorias pedidas', () => {
  for (const c of CATEGORIES) assert.ok(knowledge.entries.some(e => e.category === c), c);
});

test('[comercial inexistente] nenhuma resposta aprovada traz preço, horário ou prazo inventado', () => {
  for (const e of knowledge.entries.filter(x => x.status === 'approved')) {
    assert.doesNotMatch(e.answer, /R\$\s*\d/, e.id);
    assert.doesNotMatch(e.answer, /\b\d{1,2}h\b|\b\d{1,2}:\d{2}\b/, `${e.id}: horário`);
    assert.doesNotMatch(e.answer, /\b\d+\s?%/, `${e.id}: percentual`);
  }
});

test('[conteúdo pendente] conteúdos regulatórios ficam pendentes de revisão', () => {
  for (const id of ['mei-faturamento', 'mei-obrigacoes', 'mei-crescimento', 'edu-regime']) {
    assert.equal(knowledge.entries.find(e => e.id === id).status, 'pending_review', id);
  }
});

test('[conteúdo pendente] prompt da IA só leva entradas aprovadas', () => {
  const p = buildSystemPrompt(knowledge);
  for (const e of knowledge.entries) {
    const inside = p.includes(`[${e.id}]`);
    assert.equal(inside, e.status === 'approved', `${e.id} (${e.status})`);
  }
});

test('[institucional] contato oficial confere com o site', () => {
  assert.equal(knowledge.contact.whatsapp, '5519997447919');
  assert.equal(knowledge.contact.email, 'contato@contlup.com.br');
});
