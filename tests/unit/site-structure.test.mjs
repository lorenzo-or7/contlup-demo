// Testes da reorganização do site (HTML estático): ordem das seções, navegação, conteúdo preservado e rodapé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, knowledge } from '../support/helpers.mjs';
import { buildIndex, detect } from '../../js/lupi/nlu.js';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const text = strip(html);

const ORDER = ['inicio', 'contlup', 'priscila', 'jeito', 'servicos', 'planos', 'numeros', 'historia', 'situacoes', 'lupi-explica', 'contato', 'fale-conosco'];
const GROUP = { inicio: 'inicio', contlup: 'contlup', priscila: 'contlup', jeito: 'contlup', servicos: 'servicos', planos: 'planos', numeros: 'numeros', historia: 'numeros', situacoes: 'numeros', 'lupi-explica': 'numeros', contato: 'contato', 'fale-conosco': 'contato' };
const NAV = [['inicio', 'Início'], ['contlup', 'Sobre'], ['servicos', 'Serviços'], ['planos', 'Planos'], ['numeros', 'Seus números'], ['contato', 'Contato']];

test('[estrutura] seções na ordem pedida: Início, Sobre, Serviços, Planos, Entenda seus números, Contato', () => {
  const ids = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]).filter(id => id !== 'lupi-chat');
  assert.deepEqual(ids, ORDER);
  const footer = html.indexOf('<footer');
  assert.ok(footer > html.indexOf('id="fale-conosco"'), 'rodapé por último');
});

test('[estrutura] cada seção pertence ao item certo da navegação (data-sec)', () => {
  for (const id of ORDER) {
    const tag = html.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`))[0];
    const sec = tag.match(/data-sec="([^"]+)"/)?.[1];
    assert.equal(sec, GROUP[id], `#${id}`);
  }
});

test('[navegação] barra lateral e menu do celular: 6 itens, mesmos destinos, âncoras existentes', () => {
  const side = html.match(/<ol class="sb-nav">([\s\S]*?)<\/ol>/)[1];
  const mobile = html.match(/<div class="mmenu"[\s\S]*?<ol>([\s\S]*?)<\/ol>/)[1];
  for (const nav of [side, mobile]) {
    const items = [...nav.matchAll(/href="#([a-z-]+)"[^>]*><span class="n">(\d+)<\/span><span class="lbl">([^<]+)</g)].map(m => [m[1], m[3]]);
    assert.deepEqual(items, NAV);
  }
  const targets = [...side.matchAll(/data-target="([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(targets, NAV.map(n => n[0]), 'estado ativo usa os mesmos ids');
});

test('[navegação] todo link interno aponta para um id que existe e não há ids duplicados', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'ids duplicados: ' + ids.filter((x, i) => ids.indexOf(x) !== i));
  for (const [, href] of html.matchAll(/href="#([^"]*)"/g)) {
    if (!href) continue;
    assert.ok(ids.includes(href), `#${href} não existe`);
  }
});

test('[serviços] cinco serviços, incluindo o BPO Financeiro', () => {
  const sec = html.slice(html.indexOf('id="servicos"'), html.indexOf('id="planos"'));
  const names = [...sec.matchAll(/<article class="svc[^"]*"[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => strip(m[1]));
  assert.equal(names.length, 5, names.join(' | '));
  assert.ok(names.some(n => /BPO Financeiro/.test(n)));
});

test('[entenda] seção editorial reúne Números que fazem sentido, Problemas reais e Assuntos do dia a dia', () => {
  const sec = html.slice(html.indexOf('id="numeros"'), html.indexOf('id="contato"'));
  for (const t of ['Números que fazem sentido', 'Problemas reais', 'Assuntos do dia a dia', 'A Lupi explica']) assert.ok(strip(sec).includes(t), t);
  // o único bloco com números é o painel ilustrativo, que já existia e é identificado como exemplo
  const dash = sec.slice(sec.indexOf('<div class="dash"'), sec.indexOf('</p>', sec.indexOf('dash-note')) + 4);
  assert.match(dash, /Valores ilustrativos/);
  assert.match(dash, /Exemplo demonstrativo\. Não representa dados da ContLup nem de clientes\./);
  assert.doesNotMatch(strip(sec.replace(dash, '')), /\d+\s?%|R\$|\d+ (mil|milhões)|clientes atendidos|anos de mercado/i, 'sem estatísticas inventadas');
});

test('[FAQ] seção pública de dúvidas removida e conteúdo levado para a Lupi', () => {
  assert.doesNotMatch(html, /id="duvidas"/);
  assert.doesNotMatch(html, /FAQPage/);
  const idx = buildIndex({ intents: knowledge.intents, flows: [], synonyms: knowledge.synonyms });
  const faq = {
    'Quanto custa a contabilidade da minha empresa?': 'com-preco',
    'Como funciona a troca de contador?': ['emp-troca', 'duv-mudar-contador'],
    'A ContLup atende MEI?': 'mei-atende',
    'Posso abrir minha empresa com a ContLup?': 'emp-abertura',
    'O que preciso para a primeira conversa?': 'atd-primeira-conversa',
    'Como é o atendimento no dia a dia?': 'inst-atendimento',
  };
  for (const [q, want] of Object.entries(faq)) {
    const ids = [want].flat();
    for (const id of ids) assert.ok(knowledge.intents.some(e => e.id === id), id);
    assert.ok(ids.includes(detect(idx, q).best?.id), q);
  }
});

test('[conteúdo] nada se perdeu em relação à versão publicada (exceto o que foi movido de propósito)', (t) => {
  let old;
  try { old = execFileSync('git', ['show', 'origin/main:index.html'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { t.skip('origin/main indisponível'); return; }
  const blocks = [...old.matchAll(/<(h[1-4]|li|summary|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => strip(m[2])).filter(s => s.length > 3);
  // movido para a Lupi, renomeado ou removido por ser marcador de conteúdo a preencher
  const intentional = [
    /^0\d /, /^Quem somos$/, /^Áreas de atuação$/, /^Problemas reais$/, /^Dúvidas frequentes$/, /^Perguntas que todo empresário faz\.$/,
    /^Não encontrou a sua\?/, /^A Lupi é a personagem/, /^(Saldo em conta é lucro|Como saber se meu preço|Quando preciso emitir nota)[^?]*\?/,
    /^(Quanto custa a contabilidade|Como funciona a troca|A ContLup atende MEI|Posso abrir minha empresa|O que preciso para a primeira|Como é o atendimento)/,
    /^(O valor depende do porte|Depois que você decide|Sim\. Ajudamos o MEI|Sim\. Orientamos na escolha|Nada além de contar|Atendimento próximo e personalizado)/,
    /^WhatsApp \(19\) 97131-0182 Copiar$/, /a inserir$/,
  ];
  const lost = blocks.filter(b => !text.includes(b) && !intentional.some(re => re.test(b)));
  assert.deepEqual(lost, []);
});

test('[contato] WhatsApp comercial em destaque, outros canais, formulário e proposta', () => {
  const sec = html.slice(html.indexOf('id="contato"'), html.indexOf('<footer'));
  const s = strip(sec);
  assert.match(s, /WhatsApp comercial/);
  assert.match(s, /\(19\) 97131-0182/);
  assert.match(s, /contato@contlup\.com\.br/);
  assert.match(s, /Instagram/);
  assert.match(sec, /<form\b/);
  assert.match(s, /proposta/i);
  assert.doesNotMatch(s, /a inserir/);
});

test('[rodapé] sem CNPJ, CRC, endereço ou horários fictícios', () => {
  const footer = strip(html.slice(html.indexOf('<footer'), html.indexOf('</footer>')));
  assert.doesNotMatch(footer, /CNPJ|CRC|a inserir|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\bRua\b|\bAv\.|\d{1,2}h\b|\d{1,2}:\d{2}/);
  assert.match(footer, /Pedreira\/SP/);
});
