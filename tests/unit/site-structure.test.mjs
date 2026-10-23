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

const ORDER = ['inicio', 'servicos', 'planos', 'contlup', 'priscila', 'jeito', 'numeros', 'historia', 'situacoes', 'lupi-explica', 'contato', 'fale-conosco'];
const GROUP = { inicio: 'inicio', contlup: 'contlup', priscila: 'contlup', jeito: 'contlup', servicos: 'servicos', planos: 'planos', numeros: 'numeros', historia: 'numeros', situacoes: 'numeros', 'lupi-explica': 'numeros', contato: 'contato', 'fale-conosco': 'contato' };
const NAV = [['inicio', 'Início'], ['servicos', 'Serviços'], ['planos', 'Planos'], ['contlup', 'Sobre'], ['numeros', 'Seus números'], ['contato', 'Contato']];

test('[estrutura] seções na ordem pedida: Início, Serviços, Planos, Sobre (com a Priscila), Entenda seus números, Contato', () => {
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
    // dados oficiais de 23/10/2026: BPO detalhado no painel, atendimento 100% online, sem endereço físico
    /^Apoio à organização e ao acompanhamento das rotinas financeiras/, /^Cidade Pedreira\/SP$/, /^Atendimento Pelo WhatsApp e por e-mail$/,
    /^Escritório de contabilidade em Pedreira\/SP\./,
    // rodapé reorganizado (coluna Serviços virou Navegação) e Hero sem referência geográfica
    /^Contabilidade 100% online$/, /^Pedreira\/SP Atendimento personalizado$/, /De Pedreira\/SP\.$/,
    /^Abrir empresa ou trocar de contador$/, /^E-mail · contato@contlup\.com\.br$/,
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

const footerHtml = html.slice(html.indexOf('<footer class="site-foot">'), html.indexOf('</footer>', html.indexOf('<footer class="site-foot">')));
const footer = strip(footerHtml);
const col = (cls) => footerHtml.match(new RegExp(`<(?:div|nav) class="foot-col ${cls}"[^>]*>([\\s\\S]*?)</(?:div|nav)>\\s*(?=<(?:div|nav) class="foot-col|</div>\\s*<!-- Nível 2)`))[1];
const links = (h) => [...h.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => [m[1].replace(/&amp;/g, '&'), strip(m[2])]);

test('[rodapé] nível 1: quatro colunas (institucional, navegação, contato, links úteis)', () => {
  const heads = [...footerHtml.matchAll(/<h4>([^<]+)<\/h4>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Navegação', 'Contato', 'Links úteis']);
  const brand = col('foot-brand');
  assert.match(brand, /<img src="img\/logo\.png" alt="ContLup Studio Contábil"/);
  assert.match(strip(brand), /Atendimento 100% online/);
  assert.deepEqual(links(col('foot-nav')), [['#inicio', 'Início'], ['#servicos', 'Serviços'], ['#planos', 'Planos'], ['#contlup', 'Sobre'], ['#numeros', 'Seus números'], ['#contato', 'Contato']]);
  const contact = links(col('foot-contact'));
  assert.equal(contact.length, 3);
  assert.match(contact[0][0], /^https:\/\/wa\.me\/5519971310182\?text=/);
  assert.equal(contact[0][1], 'WhatsApp (19) 97131-0182');
  assert.deepEqual(contact.slice(1), [['mailto:contato@contlup.com.br', 'E-mail contato@contlup.com.br'], ['https://www.instagram.com/contlupstudiocontabil/', 'Instagram @contlupstudiocontabil']]);
});

test('[rodapé] links úteis oficiais preservados exatamente como na versão publicada', (t) => {
  const now = links(col('foot-links'));
  assert.deepEqual(now.map(l => l[1]), ['Receita Federal', 'Simples Nacional', 'Portal do Empreendedor (MEI)', 'eSocial']);
  for (const [href] of now) assert.match(href, /^https:\/\/(www\.gov\.br|www8\.receita\.fazenda\.gov\.br)\//);
  let old;
  try { old = execFileSync('git', ['show', 'origin/main:index.html'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { t.skip('origin/main indisponível'); return; }
  const oldUseful = links(old.match(/<h4>Links úteis<\/h4><ul>([\s\S]*?)<\/ul>/)[1]);
  assert.deepEqual(now, oldUseful);
});

test('[rodapé] nível 2: faixa legal com empresa, CNPJ, responsável técnica, privacidade (uma vez) e direitos', () => {
  const legal = footerHtml.match(/<div class="legal">([\s\S]*?)<\/div>/)[1];
  const t2 = strip(legal);
  assert.match(t2, /ContLup Studio Contábil/);
  assert.match(t2, /CNPJ 68\.970\.978\/0001-10/);
  assert.match(t2, /Responsável técnica: Priscila Petean · Contadora/);
  assert.match(t2, /© 2026 · Todos os direitos reservados/);
  assert.equal((footer.match(/68\.970\.978\/0001-10/g) || []).length, 1, 'CNPJ uma vez');
  assert.equal((footer.match(/Política de privacidade/gi) || []).length, 1, 'acionador da política aparece uma vez');
  assert.match(legal, /<button class="legal-priv js-priv-toggle" type="button" aria-expanded="false" aria-controls="privacidade">Política de privacidade<\/button>/);
  assert.doesNotMatch(footerHtml, /<details|<summary/);
  // o texto completo continua no site, fechado até alguém pedir
  assert.match(footerHtml, /<div class="privacy" id="privacidade" role="region" aria-label="Política de privacidade" tabindex="-1" hidden>\s*<p>Este site não usa cookies de rastreamento/);
  assert.match(footerHtml, /Lei Geral de Proteção de Dados \(Lei nº 13\.709\/2018\)/);
});

test('[rodapé] nível 3: assinatura Or7 — Lorenzo Orsetti logo abaixo da faixa legal', () => {
  const iLegal = footerHtml.indexOf('<div class="legal">'), iPriv = footerHtml.indexOf('id="privacidade"'), iSig = footerHtml.indexOf('<div class="sig"');
  assert.ok(iLegal < iPriv && iPriv < iSig, 'ordem: faixa legal, texto da política, assinatura');
  assert.match(footerHtml, /<span class="sig-mark" aria-hidden="true">Or<b>7<\/b><\/span>/);
  assert.match(footer, /Idealizado e desenvolvido por Lorenzo Orsetti/);
  assert.match(footerHtml, /aria-label="Idealizado e desenvolvido por Or7, Lorenzo Orsetti"/);
});

test('[rodapé] sem CRC, endereço, horário, escritório ou Pedreira/SP', () => {
  assert.doesNotMatch(footer, /CRC|a inserir|\bRua\b|\bAv\.|\bCEP\b|\d{1,2}h\b|\d{1,2}:\d{2}|[Ee]scritório|Pedreira/);
  assert.match(footer, /100% online/);
});

test('[Hero] microtexto do topo: atendimento 100% online, sem cidade', () => {
  assert.match(html, /<p class="loc"><b>Atendimento 100% online<\/b><br>Contabilidade próxima,<br>onde você estiver<\/p>/);
  const hero = strip(html.slice(html.indexOf('id="inicio"'), html.indexOf('<!-- ================= 2. SERVIÇOS')));
  assert.doesNotMatch(hero, /Pedreira|Atendimento personalizado/);
  const mmenu = strip(html.slice(html.indexOf('<div class="mmenu"'), html.indexOf('<!-- ================= 1. INÍCIO')));
  assert.doesNotMatch(mmenu, /Pedreira/i, 'menu do celular sem a cidade');
});

test('[Pedreira/SP] nenhuma menção comercial à cidade: conteúdo, título, descrição, compartilhamento e dados estruturados', () => {
  assert.doesNotMatch(html, /Pedreira/, 'nenhuma menção no HTML');
  assert.match(html, /<title>ContLup Studio Contábil \| Contabilidade online para empresas e MEIs<\/title>/);
  assert.match(html, /<meta property="og:title" content="ContLup Studio Contábil · Contabilidade online para empresas e MEIs">/);
  assert.match(html, /<meta name="description" content="Contabilidade 100% online, com atendimento próximo pelo WhatsApp e por e-mail\./);
  for (const e of knowledge.intents.filter(x => x.status === 'approved')) assert.doesNotMatch(e.answer, /Pedreira/, e.id);
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'worker/src/prompt.js'), 'utf8'), /escritório de contabilidade em/);
});

test('[institucional] atendimento 100% online em destaque; nenhum endereço físico no site', () => {
  const contato = strip(html.slice(html.indexOf('id="fale-conosco"'), html.indexOf('<footer')));
  assert.match(html, /<p class="online-pill"><i aria-hidden="true"><\/i>Atendimento 100% online<\/p>/);
  assert.match(contato, /Atendimento 100% online, pelo WhatsApp e por e-mail/);
  assert.match(strip(html.slice(html.indexOf('id="contlup"'), html.indexOf('id="priscila"'))), /100% online/);
  assert.doesNotMatch(text, /\bRua\b|\bAvenida\b|\bCEP\b|[Ee]scritório de contabilidade em|endereço completo/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.taxID, '68.970.978/0001-10');
  assert.equal(ld.address, undefined, 'dados estruturados sem endereço');
});

test('[imagens] toda imagem citada no site existe; nenhuma referência às poses antigas removidas', () => {
  const files = ['index.html', 'css/style.css', 'css/lupi.css', 'js/main.js', ...fs.readdirSync(path.join(ROOT, 'js/lupi')).filter(f => f.endsWith('.js')).map(f => 'js/lupi/' + f)];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [ref] of src.matchAll(/img\/[\w\-/]+\.(?:webp|png|svg|jpg)/g)) if (!fs.existsSync(path.join(ROOT, ref))) missing.push(`${f}: ${ref}`);
    assert.doesNotMatch(src, /img\/lupi\/(aponta|apresenta|celular|confiante|ideia|notebook|pensando|piscadinha)\.webp/, `${f}: pose antiga`);
  }
  assert.deepEqual(missing, []);
  assert.ok(fs.existsSync(path.join(ROOT, 'img/lupi/avatar.webp')), 'avatar padrão (botão, mensagens e último fallback)');
});
