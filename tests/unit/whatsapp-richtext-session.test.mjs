// Testes unitários: resumo/links do WhatsApp, formatação segura e histórico da sessão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHandoffSummary, buildWhatsAppLink, reviewSummary, sanitizeSummary, MAX_SUMMARY } from '../../js/lupi/whatsapp.js';
import { parseRich, parseInline, isAllowedLink, toPlainText } from '../../js/lupi/rich-text.js';
import { createSessionStore, STORAGE_KEY, MAX_MESSAGES, TTL_MS } from '../../js/lupi/session-store.js';
import { memoryStorage } from '../support/helpers.mjs';

// ---- WhatsApp ----
test('[whatsapp] resumo de fluxo concluído é usado como está (limpo)', () => {
  const s = buildHandoffSummary({ flowSummary: 'Olá, Priscila! Quero abrir uma empresa. Podemos conversar?' });
  assert.equal(s, 'Olá, Priscila! Quero abrir uma empresa. Podemos conversar?');
});

test('[whatsapp] assunto do repertório vira a mensagem, sem dados pessoais', () => {
  const s = buildHandoffSummary({ topic: 'Regime tributário, cpf 123.456.789-09' });
  assert.match(s, /^Olá! Vim pelo site da ContLup e conversei com a Lupi\. Gostaria de conversar sobre regime tributário/);
  assert.doesNotMatch(s, /123|dado removido/);
});

test('[whatsapp] prioridade: resumo do fluxo > mensagem da intenção > assunto > genérica', () => {
  assert.equal(buildHandoffSummary({ flowSummary: 'Olá! A.', intentMessage: 'Olá! B.', topic: 'C' }), 'Olá! A.');
  assert.equal(buildHandoffSummary({ intentMessage: 'Olá! Tenho interesse no BPO Financeiro da ContLup.', topic: 'C' }), 'Olá! Tenho interesse no BPO Financeiro da ContLup.');
  assert.equal(buildHandoffSummary(), 'Olá! Vim pelo site da ContLup e conversei com a Lupi. Gostaria de conversar com a equipe.');
});

test('[whatsapp] mensagens de exemplo pedidas são codificadas corretamente', () => {
  for (const msg of ['Olá! Gostaria de saber mais sobre o plano Lup MEI.', 'Olá! Tenho interesse no BPO Financeiro da ContLup.', 'Olá! Gostaria de conversar sobre a abertura de uma empresa.']) {
    const l = buildWhatsAppLink(msg);
    assert.ok(l.startsWith('https://wa.me/5519971310182?text='));
    assert.equal(decodeURIComponent(l.split('?text=')[1]), msg);
    assert.doesNotMatch(l.split('?text=')[1], /[ áçã]/, 'sem caracteres crus no link');
  }
});

test('[whatsapp] link usa só o número oficial e codifica o texto', () => {
  const l = buildWhatsAppLink('Olá & tudo bem? #1');
  assert.equal(l, 'https://wa.me/5519971310182?text=Ol%C3%A1%20%26%20tudo%20bem%3F%20%231');
  assert.throws(() => buildWhatsAppLink('x', '123'));
});

test('[whatsapp] revisão aponta texto vazio, longo e dados sensíveis', () => {
  assert.equal(reviewSummary('  ').empty, true);
  assert.equal(reviewSummary('a'.repeat(MAX_SUMMARY + 1)).tooLong, true);
  assert.deepEqual(reviewSummary('meu cpf 123.456.789-09').sensitive, ['cpf']);
  assert.deepEqual(reviewSummary('Olá, Priscila!').sensitive, []);
});

test('[whatsapp] sanitizeSummary limita o tamanho', () => {
  assert.ok(sanitizeSummary('palavra '.repeat(200)).length <= MAX_SUMMARY);
});

// ---- formatação segura ----
test('[segurança] links fora da lista viram texto; javascript: nunca é link', () => {
  assert.equal(isAllowedLink('javascript:alert(1)'), false);
  assert.equal(isAllowedLink('https://evil.example.com'), false);
  assert.equal(isAllowedLink('https://wa.me/5519971310182?text=oi'), true, 'WhatsApp comercial');
  assert.equal(isAllowedLink('https://wa.me/5519997447919?text=oi'), true, 'WhatsApp da Priscila (links específicos)');
  assert.equal(isAllowedLink('https://wa.me/5511999999999'), false, 'outro número de WhatsApp');
  assert.equal(isAllowedLink('https://www.gov.br/receitafederal'), true);
  const parts = parseInline('veja [aqui](javascript:alert(1)) e https://phishing.example/x');
  assert.ok(parts.every(p => p.t !== 'a'));
  assert.ok(parts.some(p => p.v === '[link removido]'));
});

test('[mensagens] listas, negrito e parágrafos', () => {
  const b = parseRich('Oi **você**\n\n- um\n- dois\nfim');
  assert.equal(b[0].type, 'p');
  assert.deepEqual(b[0].inline.map(i => i.t), ['text', 'b']);
  assert.equal(b[1].type, 'ul');
  assert.equal(b[1].items.length, 2);
  assert.equal(b[2].type, 'p');
  assert.equal(toPlainText('- a\n- b'), '• a\n• b');
});

test('[mensagens] HTML vindo do texto é tratado como texto', () => {
  const b = parseRich('<img src=x onerror=alert(1)>');
  assert.equal(b[0].inline[0].t, 'text');
  assert.equal(b[0].inline[0].v, '<img src=x onerror=alert(1)>');
});

// ---- histórico ----
test('[histórico] salva e recupera a conversa', () => {
  const st = memoryStorage();
  const s = createSessionStore(st);
  s.save({ messages: [{ id: 'm1', role: 'user', text: 'oi' }], flow: { flowId: 'mei', stepId: 'tema' } });
  const d = s.load();
  assert.equal(d.messages[0].text, 'oi');
  assert.equal(d.flow.flowId, 'mei');
});

test('[histórico] guarda no máximo as últimas mensagens', () => {
  const s = createSessionStore(memoryStorage());
  s.save({ messages: Array.from({ length: MAX_MESSAGES + 20 }, (_, i) => ({ id: 'm' + i, role: 'user', text: String(i) })) });
  const d = s.load();
  assert.equal(d.messages.length, MAX_MESSAGES);
  assert.equal(d.messages.at(-1).text, String(MAX_MESSAGES + 19));
});

test('[histórico] expira depois do prazo e ignora dados corrompidos', () => {
  let t = 1000;
  const st = memoryStorage();
  const s = createSessionStore(st, { now: () => t });
  s.save({ messages: [{ id: 'm1', role: 'user', text: 'oi' }] });
  t += TTL_MS + 1;
  assert.equal(s.load(), null);
  st.setItem(STORAGE_KEY, '{quebrado');
  assert.equal(s.load(), null);
});

test('[histórico] limpar apaga tudo; sem sessionStorage não quebra', () => {
  const st = memoryStorage();
  const s = createSessionStore(st);
  s.save({ messages: [{ id: 'm1', role: 'user', text: 'oi' }] });
  s.clear();
  assert.equal(st.getItem(STORAGE_KEY), null);
  const none = createSessionStore(null);
  assert.equal(none.save({ messages: [] }), false);
  assert.equal(none.load(), null);
});

test('[whatsapp] Lupi encaminha para o WhatsApp comercial (configuração e padrão)', async () => {
  const { readConfig } = await import('../../js/lupi/config.js');
  const { OFFICIAL_NUMBER } = await import('../../js/lupi/whatsapp.js');
  assert.equal(readConfig({ querySelector: () => null }).whatsapp, '5519971310182');
  assert.equal(OFFICIAL_NUMBER, '5519971310182');
});
