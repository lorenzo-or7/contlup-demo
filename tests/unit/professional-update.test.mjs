// Atualização de 28/10/2026: conteúdo pedido, privacidade, respostas pendentes fora do site, SEO, segurança e publicação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, knowledge, pendingDrafts } from '../support/helpers.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const html = read('index.html');
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Arquivos que o GitHub Pages publica: tudo, menos o que começa com "_" ou "." e o que está em _config.yml. */
function publishedFiles() {
  const exclude = read('_config.yml').split('\n').map(l => l.match(/^\s+-\s+(\S+)/)?.[1]).filter(Boolean);
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (/^[_.]/.test(e.name) || exclude.some(x => rel === x || rel.startsWith(x + '/'))) continue;
      if (e.isDirectory()) walk(rel); else out.push(rel);
    }
  })('');
  return out;
}

test('[conteúdo] Sobre: atendimento por WhatsApp, telefone e e-mail; telefone com link de ligação', () => {
  assert.match(html, /<p>O atendimento é <strong>100% online<\/strong>, por WhatsApp, telefone e e-mail\.<\/p>/);
  assert.doesNotMatch(html, /O atendimento é <strong>100% online<\/strong>, pelo WhatsApp e por e-mail/);
  assert.match(html, /<a class="copy call" href="tel:\+5519971310182" aria-label="Ligar para \(19\) 97131-0182">Ligar<\/a>/);
});

test('[conteúdo] "Para quem é a ContLup": cards na ordem pedida, textos preservados', () => {
  const seg = html.match(/<ul class="seg rv">([\s\S]*?)<\/ul>/)[1];
  const items = [...seg.matchAll(/<li><b>([^<]+)<\/b><span>([^<]+)<\/span><\/li>/g)].map(m => m[1]);
  assert.deepEqual(items, ['MEI', 'Quem está começando', 'Pequenas empresas', 'Empresas em crescimento', 'Negócios B2B']);
  assert.match(seg, /Empreendedores que querem formalizar o negócio do jeito certo\./);
});

test('[privacidade] aviso: aceitar, recusar e personalizar; nada pré-marcado; sem botão de fechar; imagem da Lupi com cookie', () => {
  const ck = html.match(/<section class="ck js-ck"[\s\S]*?<\/section>/)[0];
  for (const t of ['Aceitar opcionais', 'Recusar opcionais', 'Personalizar preferências', 'Salvar preferências', 'Sempre ativos']) assert.ok(strip(ck).includes(t), t);
  assert.doesNotMatch(ck, /checked/, 'nenhuma opção marcada de fábrica');
  assert.doesNotMatch(ck, /aria-label="Fechar|>\s*×\s*<|js-ck-close/i, 'não há como dispensar sem decidir');
  assert.match(ck, /img\/lupi\/cookie-1x\.webp 1x, img\/lupi\/cookie\.webp 2x/);
  assert.match(ck, /<button class="ck-btn ck-accept star-border js-ck-accept" type="button">Aceitar opcionais<\/button>/);
  assert.ok(html.indexOf('class="ck js-ck"') < html.indexOf('<header class="nav'), 'aviso no começo do documento (teclado e leitor de tela)');
  for (const f of ['img/lupi/cookie.webp', 'img/lupi/cookie-1x.webp']) {
    const b = fs.readFileSync(path.join(ROOT, f));
    assert.equal(b.toString('ascii', 12, 16), 'VP8X', `${f}: WebP com transparência`);
  }
});

test('[privacidade] a política descreve o que o site realmente guarda (e nada além)', () => {
  const pol = strip(html.match(/<div class="privacy" id="privacidade"[\s\S]*?<\/div>/)[0]);
  assert.match(pol, /não usa cookies de publicidade, de análise ou de rastreamento/);
  assert.match(pol, /Essencial: a sua escolha no aviso de privacidade/);
  assert.match(pol, /Preferências, só se você permitir: o tema claro ou escuro/);
  assert.match(pol, /Lei nº 13\.709\/2018/);
  // o código só usa as chaves que a política descreve
  const js = ['js/main.js', 'js/consent.js', 'js/lupi/boot.js', 'js/lupi/session-store.js'].map(read).join('\n');
  const keys = [...js.matchAll(/(?:localStorage|sessionStorage)\.(?:setItem|getItem|removeItem)\(\s*'([^']+)'/g), ...js.matchAll(/_KEY\s*=\s*'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(keys)].sort(), ['cl-consent', 'cl-theme', 'lupi:v2:session', 'lupi:v2:teaser']);
  assert.doesNotMatch(html + js, /document\.cookie|google-analytics|googletagmanager|gtag\(|fbq\(|hotjar|clarity\.ms/);
});

test('[privacidade] fontes e scripts do próprio site: nenhuma requisição a terceiros ao abrir a página', () => {
  const srcs = [...html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !u.startsWith('#'));
  const external = srcs.filter(u => /^https?:/.test(u));
  assert.deepEqual(external, ['https://lorenzo-or7.github.io/contlup-demo/'], 'só o canonical é absoluto');
  const fonts = read('css/fonts.css');
  assert.doesNotMatch(fonts, /https?:/);
  for (const [, f] of fonts.matchAll(/url\(\.\.\/(fonts\/[^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
});

test('[Lupi] respostas pendentes: o arquivo público só tem o resumo; nenhum arquivo publicado contém o texto delas', () => {
  const publicPending = knowledge.intents.filter(e => e.status === 'pending_review');
  assert.equal(publicPending.length, 39);
  assert.equal(pendingDrafts.length, 39);
  for (const e of publicPending) for (const k of ['answer', 'title', 'actions', 'review']) assert.equal(e[k], undefined, `${e.id}.${k}`);
  const files = publishedFiles().filter(f => /\.(html|js|json|css|md|txt|xml)$/.test(f));
  assert.ok(files.includes('data/lupi-knowledge.json') && files.includes('index.html'));
  assert.ok(!files.some(f => f.startsWith('_revisao') || f.startsWith('docs/') || f.startsWith('tests/')), 'rascunhos, documentação e testes fora do site');
  const published = files.map(read).join('\n');
  for (const d of pendingDrafts) {
    assert.ok(!published.includes(d.answer.slice(0, 80)), `texto pendente de ${d.id} publicado`);
    assert.ok(!published.includes(d.answer.slice(-80)), `final do texto pendente de ${d.id} publicado`);
  }
});

test('[segurança] política de conteúdo restrita ao próprio site; links externos com noopener', () => {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-src 'none'", "connect-src 'self'"]) assert.ok(csp.includes(d), d);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline|\*/);
  for (const [a] of html.matchAll(/<a [^>]*target="_blank"[^>]*>/g)) assert.match(a, /rel="noopener/, a);
  assert.doesNotMatch(html, /\son[a-z]+="/, 'sem manipuladores de evento inline');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map(m => m[1]);
  assert.deepEqual(inline, [' type="application/ld+json"'], 'só dados estruturados inline');
});

test('[formulário] limites de tamanho e confirmação honesta (nada é enviado pelo site)', () => {
  for (const [id, max] of [['f-nome', 80], ['f-empresa', 100], ['f-tel', 20]]) assert.match(html, new RegExp(`<input id="${id}"[^>]*maxlength="${max}"`));
  assert.match(html, /<textarea id="f-msg"[^>]*maxlength="600"/);
  assert.match(html, /<p class="form-ok" id="form-ok" role="status" hidden>Mensagem pronta\. Se o WhatsApp não abriu/);
  assert.doesNotMatch(strip(html), /mensagem enviada com sucesso|enviado com sucesso/i);
});

test('[SEO] canonical, compartilhamento, ícones, robots, sitemap e dados estruturados sem dados inventados', () => {
  const url = 'https://lorenzo-or7.github.io/contlup-demo/';
  assert.match(html, new RegExp(`<link rel="canonical" href="${url}">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${url}">`));
  assert.match(html, /<meta property="og:image" content="https:\/\/lorenzo-or7\.github\.io\/contlup-demo\/img\/og-contlup\.jpg">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  for (const f of ['img/og-contlup.jpg', 'img/favicon-32.png', 'img/apple-touch-icon.png', 'robots.txt', 'sitemap.xml', 'img/logo.png']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.match(read('sitemap.xml'), new RegExp(`<loc>${url}</loc>`));
  assert.match(read('robots.txt'), /Disallow: \/_revisao\//);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Organization');
  assert.equal(ld.taxID, '68.970.978/0001-10');
  assert.equal(ld.address, undefined, 'atendimento 100% online: sem endereço');
  assert.doesNotMatch(JSON.stringify(ld), /openingHours|aggregateRating|review|priceRange|CRC|Pedreira/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, 'um h1');
  assert.doesNotMatch(html.slice(html.indexOf('<footer')), /<h4/, 'rodapé sem pular nível de título');
});

test('[publicação] caminhos relativos e arquivos referenciados existem', () => {
  const refs = [...html.matchAll(/(?:src|href|srcset)="([^"]+)"/g)].flatMap(m => m[1].split(',').map(x => x.trim().split(' ')[0]))
    .filter(u => u && !/^(https?:|mailto:|tel:|#)/.test(u));
  assert.ok(refs.length > 20);
  for (const r of refs) {
    assert.ok(!r.startsWith('/'), `${r}: caminho absoluto quebra fora da raiz do domínio`);
    assert.ok(fs.existsSync(path.join(ROOT, r)), `${r} não existe`);
  }
  const css = read('css/style.css') + read('css/lupi.css');
  for (const [, u] of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(/^(data:|["']?#)/.test(u), `CSS aponta para arquivo: ${u}`);
  // _config.yml mantém fora do site o que não é site
  const cfg = read('_config.yml');
  for (const x of ['docs', 'tests', 'eval', 'worker', 'node_modules', 'README.md']) assert.match(cfg, new RegExp(`- ${x}\\b`));
});
