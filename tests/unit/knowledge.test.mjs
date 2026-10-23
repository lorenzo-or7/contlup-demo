// Testes unitários: estrutura do repertório da Lupi (lupi-knowledge.json, versão 3) e regras de revisão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knowledge, flows } from '../support/helpers.mjs';
import { buildSystemPrompt } from '../../worker/src/prompt.js';
import { BPO, BPO_FORBIDDEN, CNPJ, stripOfficial } from '../support/official.mjs';

const CATEGORIES = ['contlup', 'servicos', 'planos', 'mei', 'empresas', 'regimes', 'rotinas', 'duvidas'];
const STATUSES = new Set(['draft', 'pending_review', 'approved', 'outdated']);
const intents = knowledge.intents;
const ids = new Set(intents.map(e => e.id));
const flowIds = new Set(flows.flows.map(f => f.id));

test('[repertório] versão 3, 8 categorias pedidas e nenhuma categoria vazia', () => {
  assert.equal(knowledge.version, 3);
  assert.deepEqual(knowledge.categories.map(c => c.id), CATEGORIES);
  for (const c of CATEGORIES) assert.ok(intents.some(e => e.category === c), c);
});

test('[repertório] toda intenção tem id estável, categoria, exemplos, palavras-chave, resposta e ações', () => {
  assert.equal(ids.size, intents.length, 'ids únicos');
  for (const e of intents) {
    assert.match(e.id, /^[a-z]+(-[a-z0-9]+)*$/, `${e.id}: id em minúsculas com hífen`);
    assert.ok(CATEGORIES.includes(e.category), `${e.id}: categoria ${e.category}`);
    assert.ok(e.title, `${e.id}: título`);
    assert.ok(Array.isArray(e.examples) && e.examples.length >= 2, `${e.id}: pelo menos 2 perguntas de exemplo`);
    assert.ok(Array.isArray(e.keywords) && e.keywords.length >= 1, `${e.id}: palavras-chave`);
    assert.ok(e.answer && e.answer.length >= 40, `${e.id}: resposta`);
    assert.ok(Array.isArray(e.actions), `${e.id}: ações`);
    assert.ok(STATUSES.has(e.status), `${e.id}: status`);
  }
});

test('[repertório] ações apontam para intenções, fluxos e âncoras que existem', () => {
  for (const e of intents) {
    for (const a of e.actions) {
      assert.ok(a.label, `${e.id}: ação sem rótulo`);
      if (a.type === 'intent') assert.ok(ids.has(a.id), `${e.id}: intenção ${a.id} inexistente`);
      else if (a.type === 'flow') assert.ok(flowIds.has(a.id), `${e.id}: fluxo ${a.id} inexistente`);
      else if (a.type === 'whatsapp') assert.match(a.message, /^Olá! /, `${e.id}: mensagem de WhatsApp`);
      else if (a.type === 'link') assert.match(a.href, /^#[a-z-]+$/, `${e.id}: link interno`);
      else assert.fail(`${e.id}: tipo de ação ${a.type}`);
    }
    if (e.flow) assert.ok(flowIds.has(e.flow), `${e.id}: fluxo ${e.flow}`);
  }
});

test('[revisão] toda intenção tem metadados de revisão; aprovada tem responsável e fonte', () => {
  for (const e of intents) {
    const r = e.review;
    assert.ok(r, `${e.id}: sem review`);
    assert.equal(typeof r.legalSensitive, 'boolean', `${e.id}: legalSensitive`);
    assert.ok(r.professionalReview, `${e.id}: professionalReview`);
    assert.ok(r.source, `${e.id}: source`);
    assert.match(r.updatedAt, /^\d{4}-\d{2}-\d{2}$/, `${e.id}: updatedAt`);
    if (e.status === 'approved') assert.ok(r.approvedBy, `${e.id}: aprovada sem responsável`);
  }
});

test('[revisão] conteúdo sujeito a mudança legal está marcado (MEI, regimes, rotinas fiscais e trabalhistas)', () => {
  const must = ['mei-das', 'mei-dasn', 'mei-limite', 'mei-desenquadramento', 'mei-empregado', 'reg-simples', 'reg-presumido', 'reg-real', 'rot-encargos', 'rot-pro-labore'];
  for (const id of must) assert.equal(intents.find(e => e.id === id)?.review.legalSensitive, true, id);
  for (const id of ['inst-contato', 'inst-contlup', 'plano-lup-start']) assert.equal(intents.find(e => e.id === id).review.legalSensitive, false, id);
});

test('[comercial inexistente] nenhuma resposta traz preço, percentual, horário ou valor de limite inventado', () => {
  for (const e of intents) {
    const answer = stripOfficial(e.answer); // CNPJ e "100% online" são dados oficiais
    assert.doesNotMatch(answer, /R\$\s*\d/, `${e.id}: preço`);
    assert.doesNotMatch(answer, /\b\d{1,2}h\b|\b\d{1,2}:\d{2}\b/, `${e.id}: horário`);
    assert.doesNotMatch(answer, /\b\d+([.,]\d+)?\s?%/, `${e.id}: percentual`);
    assert.doesNotMatch(answer, /\b\d{2,3}\.\d{3}\b|\bmil reais\b/i, `${e.id}: valor monetário`);
  }
});

test('[BPO] repertório com exatamente o conteúdo confirmado: atividades, benefícios, público e aprovação dos pagamentos', () => {
  const get = (id) => intents.find(e => e.id === id);
  for (const id of ['serv-bpo', 'bpo-atividades', 'bpo-beneficios', 'bpo-publico', 'bpo-proposta', 'bpo-aprovacao']) {
    const e = get(id);
    assert.equal(e.status, 'approved', id);
    assert.match(e.review.approvedBy, /dados institucionais oficiais/, id);
    assert.doesNotMatch(e.answer, BPO_FORBIDDEN, `${id}: preço, prazo, integração ou movimentação sem aprovação`);
  }
  const acts = get('bpo-atividades').answer;
  for (const [name, desc] of BPO.activities) assert.ok(acts.includes(`**${name}**: ${desc[0].toLowerCase()}${desc.slice(1)}`), name);
  assert.equal(acts.split('\n').filter(l => l.startsWith('- ')).length, 7, 'só as 7 atividades confirmadas');
  const bens = get('bpo-beneficios').answer.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
  assert.deepEqual(bens, BPO.benefits);
  assert.match(get('bpo-publico').answer, /pequenas e médias empresas, prestadores de serviços, comércios e empresários que desejam profissionalizar a gestão financeira/);
  for (const id of ['serv-bpo', 'bpo-atividades', 'bpo-aprovacao']) assert.match(get(id).answer, /sujeitos à (sua )?aprovação/, `${id}: aprovação dos pagamentos`);
  assert.equal(get('bpo-proposta').actions.find(a => a.type === 'whatsapp').message, BPO.message);
});

test('[institucional] CNPJ, atendimento 100% online e ausência de endereço físico', () => {
  const get = (id) => intents.find(e => e.id === id);
  assert.match(get('inst-cnpj').answer, new RegExp(CNPJ.replace(/[./]/g, '\\$&')));
  assert.match(get('inst-atendimento').answer, /100% online/);
  assert.match(get('inst-localizacao').answer, /não tem endereço físico/);
  for (const e of intents.filter(x => x.status === 'approved')) {
    assert.doesNotMatch(e.answer, /\b(rua|avenida|av\.|sala \d|cep)\b|o escritório fica|endereço completo/i, `${e.id}: endereço`);
    assert.doesNotMatch(e.answer, /\bCRC\b/, `${e.id}: CRC`);
  }
});

test('[planos] quatro planos, com benefícios por chave e herança Start → Plus → Prime', () => {
  assert.deepEqual(knowledge.plans.map(p => p.name), ['Lup MEI', 'Lup Start', 'Lup Plus', 'Lup Prime']);
  const byId = Object.fromEntries(knowledge.plans.map(p => [p.id, p]));
  assert.equal(byId['lup-plus'].inherits, 'lup-start');
  assert.equal(byId['lup-prime'].inherits, 'lup-plus');
  for (const p of knowledge.plans) {
    assert.ok(ids.has(p.intent), `${p.id}: intenção ${p.intent}`);
    for (const f of p.features) assert.ok(f.key && f.text, `${p.id}: benefício sem chave`);
  }
});

test('[IA guardada] o prompt do Worker lê o formato novo e só leva intenções aprovadas', () => {
  const p = buildSystemPrompt(knowledge);
  for (const e of intents) assert.equal(p.includes(`[${e.id}]`), e.status === 'approved', e.id);
});

test('[contato] contato oficial confere com o site', () => {
  assert.equal(knowledge.contact.whatsapp, '5519971310182', 'WhatsApp comercial');
  assert.equal(knowledge.contact.email, 'contato@contlup.com.br');
});
