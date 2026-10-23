// Testes do conteúdo do site (HTML estático): planos, BPO, WhatsApp comercial e navegação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, knowledge } from '../support/helpers.mjs';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const COMMERCIAL = '5519971310182';
const PRISCILA = '5519997447919';
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&amp;/g, '&');

// Conteúdo exatamente como enviado pela ContLup (briefing de 23/10/2026)
const PLANS = {
  'Lup MEI': { tag: 'Simples e sem complicação', for: 'Para Microempreendedores Individuais.', inherits: null, items: ['Orientação para abertura e regularização do MEI', 'Emissão e controle do DAS', 'Declaração Anual do MEI (DASN-SIMEI)', 'Orientações sobre notas fiscais', 'Acompanhamento de pendências e obrigações', 'Atendimento por WhatsApp e e-mail', 'Portal para documentos e guias'] },
  'Lup Start': { tag: 'Organização e segurança', for: 'Para empresas do Simples Nacional.', inherits: null, items: ['Contabilidade e escrituração fiscal', 'Apuração de impostos e obrigações acessórias', 'Folha de pagamento, pró-labore e encargos', 'Demonstrações contábeis obrigatórias', 'Orientações contábeis, fiscais e trabalhistas', 'Atendimento por WhatsApp e e-mail', 'Portal para documentos e guias'] },
  'Lup Plus': { tag: 'Mais controle para crescer', for: 'Para empresas do Simples Nacional e Lucro Presumido.', inherits: 'Lup Start', items: ['Balancete e DRE trimestrais', 'Balanço Patrimonial anual', 'Análise dos resultados contábeis e orientações', 'Reuniões trimestrais de acompanhamento', 'Orientações sobre distribuição de lucros', 'Suporte sobre impactos da reforma tributária'] },
  'Lup Prime': { tag: 'Estratégia para ir além', for: 'Para empresas do Lucro Presumido e Lucro Real.', inherits: 'Lup Plus', items: ['Balancete e DRE mensais', 'Balanço Patrimonial anual', 'Análise dos resultados com orientação contínua', 'Reuniões mensais de acompanhamento', 'Orientação tributária personalizada', 'Acompanhamento da reforma tributária', 'Suporte estratégico e atendimento prioritário'] },
};

const section = html.slice(html.indexOf('<section class="sec wrap plans-sec"'), html.indexOf('</section>', html.indexOf('plans-sec')));
const cards = [...section.matchAll(/<article class="plan[\s\S]*?<\/article>/g)].map(m => m[0]);

test('[planos] quatro cards na ordem certa, com nome, chamada, público e todos os benefícios do briefing', () => {
  assert.equal(cards.length, 4);
  cards.forEach((card, i) => {
    const name = Object.keys(PLANS)[i];
    const p = PLANS[name];
    assert.match(card, new RegExp(`<h3[^>]*>${name}</h3>`));
    assert.match(card, new RegExp(`<p class="plan-tag">${p.tag}</p>`));
    assert.match(card, new RegExp(`<p class="plan-for">${p.for.replace(/\./g, '\\.')}</p>`));
    const items = [...card.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
    assert.deepEqual(items, p.items, name);
    if (p.inherits) assert.match(strip(card), new RegExp(`Todos os benefícios do ${p.inherits}`));
    else assert.doesNotMatch(card, /plan-inherit/);
  });
});

test('[planos] "Tenho interesse" abre o WhatsApp comercial com a mensagem exata, sem envio automático', () => {
  cards.forEach((card, i) => {
    const name = Object.keys(PLANS)[i];
    const a = /<a class="btn btn-primary plan-cta" href="([^"]+)" target="_blank" rel="noopener"[^>]*>[\s\S]*?Tenho interesse<\/a>/.exec(card);
    assert.ok(a, `${name}: botão ausente`);
    const url = new URL(decode(a[1]));
    assert.equal(url.origin + url.pathname, `https://wa.me/${COMMERCIAL}`);
    assert.equal(url.searchParams.get('text'), `Olá! Tenho interesse no plano ${name} da ContLup e gostaria de saber mais informações.`);
    assert.deepEqual([...url.searchParams.keys()], ['text'], 'nenhum parâmetro além do texto');
  });
});

test('[planos] nenhum preço, desconto ou condição comercial inventada', () => {
  const text = strip(section);
  assert.doesNotMatch(text, /R\$|\d+\s?%|reais|desconto|grátis|gratuito|promo|mais vendido|mais popular|por mês|\/mês/i);
  assert.match(text, /valores são definidos em proposta/i);
});

test('[planos] acesso pela navegação: barra lateral e menu do celular, numeração em sequência', () => {
  for (const nav of [html.match(/<ol class="sb-nav">([\s\S]*?)<\/ol>/)[1], html.match(/<div class="mmenu"[\s\S]*?<ol>([\s\S]*?)<\/ol>/)[1]]) {
    const items = [...nav.matchAll(/href="#([a-z]+)"[^>]*><span class="n">(\d+)<\/span><span class="lbl">([^<]+)</g)].map(m => [m[1], m[2], m[3]]);
    assert.deepEqual(items.map(x => x[1]), ['01', '02', '03', '04', '05', '06', '07', '08']);
    assert.deepEqual(items[3], ['planos', '04', 'Planos']);
    for (const [id] of items) assert.match(html, new RegExp(`id="${id}"`), `âncora #${id}`);
  }
  assert.match(html, /id="planos" data-sec="planos"/);
  assert.match(html, /data-target="planos"/);
});

test('[BPO] card na seção de serviços só com a descrição genérica provisória', () => {
  const card = html.match(/<article class="svc svc--wide rv" id="svc-bpo">[\s\S]*?<\/article>/);
  assert.ok(card, 'card do BPO ausente');
  const text = strip(card[0]);
  assert.match(text, /BPO Financeiro/);
  assert.match(text, /Apoio à organização e ao acompanhamento das rotinas financeiras da sua empresa\./);
  assert.doesNotMatch(card[0], /<li>/, 'sem lista de atividades inventadas');
  assert.doesNotMatch(text, /R\$|garant|conciliação|contas a pagar|contas a receber|fluxo de caixa/i);
  const href = decode(card[0].match(/href="([^"]+)"/)[1]);
  assert.ok(href.startsWith(`https://wa.me/${COMMERCIAL}?text=`));
  const servicos = html.slice(html.indexOf('id="servicos"'), html.indexOf('<!-- ================= PLANOS'));
  assert.ok(servicos.includes('id="svc-bpo"'), 'BPO fica dentro da seção de serviços');
});

test('[whatsapp] links comerciais usam o novo número; só os dois "direto com a Priscila" mantêm o anterior', () => {
  const links = [...html.matchAll(/<a\b[^>]*href="(https:\/\/wa\.me\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => ({ number: m[2], text: strip(m[3]), href: decode(m[1]) }));
  assert.ok(links.length >= 20, `encontrou ${links.length} links`);
  const priscila = links.filter(l => l.number === PRISCILA);
  assert.deepEqual(priscila.map(l => l.text).sort(), ['Conversar com a Priscila', 'Vamos conversar? fale direto com a Priscila pelo WhatsApp']);
  for (const l of links) {
    assert.ok([COMMERCIAL, PRISCILA].includes(l.number), `número inesperado em "${l.text}"`);
    const u = new URL(l.href);
    if (u.search) assert.ok(u.searchParams.get('text').startsWith('Olá'), `mensagem inválida em "${l.text}"`);
  }
  assert.equal(links.filter(l => l.number === COMMERCIAL).length, links.length - 2);
});

test('[whatsapp] número comercial exibido no contato, rodapé, menu e dados estruturados; formulário usa o comercial', () => {
  assert.equal((html.match(/\(19\) 97131-0182/g) || []).length >= 3, true);
  assert.doesNotMatch(html, /\(19\) 99744-7919/, 'número anterior não aparece mais como contato exibido');
  assert.match(html, /"telephone":"\+55 19 97131-0182"/);
  assert.match(html, /data-copy="\(19\) 97131-0182"/);
  const main = fs.readFileSync(path.join(ROOT, 'js/main.js'), 'utf8');
  assert.match(main, /wa\.me\/5519971310182\?text=/);
  assert.doesNotMatch(main, /5519997447919/);
});

test('[Lupi] base de conhecimento com os planos iguais ao site e BPO sem detalhes inventados', () => {
  const kb = Object.fromEntries(knowledge.entries.map(e => [e.id, e]));
  const ids = { 'Lup MEI': 'plano-lup-mei', 'Lup Start': 'plano-lup-start', 'Lup Plus': 'plano-lup-plus', 'Lup Prime': 'plano-lup-prime' };
  for (const [name, id] of Object.entries(ids)) {
    const e = kb[id];
    assert.equal(e.status, 'approved');
    const bullets = e.answer.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
    assert.deepEqual(bullets, PLANS[name].items, name);
    assert.doesNotMatch(e.answer, /R\$|\d+\s?%/);
    assert.match(e.answer, /\(19\) 97131-0182/);
  }
  assert.match(kb['planos-diferencas'].answer, /trimestrais[\s\S]*mensais/);
  assert.match(kb['serv-bpo'].answer, /rotinas financeiras/);
  assert.match(kb['serv-bpo'].answer, /ainda vão ser publicados/);
  assert.equal(knowledge.contact.whatsappDisplay, '(19) 97131-0182');
});
