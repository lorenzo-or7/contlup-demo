// Prontidão para o lançamento (auditoria de 29/10/2026): página 404, troca de domínio e configuração da hospedagem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../support/helpers.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DEMO = 'https://lorenzo-or7.github.io/contlup-demo/';

test('[404] página de erro autossuficiente: sem arquivos externos, fora do índice, com volta para o início', () => {
  const p = read('404.html');
  assert.match(p, /<html lang="pt-BR">/);
  assert.match(p, /<meta name="robots" content="noindex">/);
  assert.match(p, /<h1>Página não encontrada\.<\/h1>/);
  assert.doesNotMatch(p, /<(?:link|script|img)\b/, 'nada carregado de fora (funciona em qualquer endereço)');
  assert.match(p, new RegExp(`<a href="${DEMO}">Voltar para a página inicial</a>`));
  assert.match(read('.htaccess'), /ErrorDocument 404 \/404\.html/);
});

test('[domínio] o endereço oficial atual aparece só nos lugares documentados, sempre igual', () => {
  const where = {};
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'js/main.js', 'js/consent.js', 'js/lupi/config.js', 'data/lupi-knowledge.json', 'css/style.css']) {
    const n = (read(f).match(/https:\/\/lorenzo-or7\.github\.io\/contlup-demo\//g) || []).length;
    if (n) where[f] = n;
  }
  assert.deepEqual(where, { 'index.html': 7, '404.html': 1, 'robots.txt': 1, 'sitemap.xml': 1 });
  assert.doesNotMatch(read('index.html'), /github\.io(?!\/contlup-demo\/)/, 'nenhuma variação do endereço');
  const guide = read('docs/PUBLICACAO.md');
  for (const f of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) assert.ok(guide.includes(f), `guia cita ${f}`);
});

test('[sem JavaScript] menu do celular vira lista e botões que dependem de script somem', () => {
  const ns = read('index.html').match(/<noscript><style>([\s\S]*?)<\/style><\/noscript>/)[1];
  for (const s of ['.lc-launch', '.js-bpo-open', '.nav-burger', '.nav-menu{position:static;visibility:visible']) assert.ok(ns.includes(s), s);
});

test('[hospedagem] modelo .htaccess: HTTPS, pastas de trabalho bloqueadas, cabeçalhos de segurança, cache e compressão', () => {
  const h = read('.htaccess');
  for (const re of [/RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[L,R=301\]/, /\(_revisao\|docs\|tests\|eval\|worker\|node_modules\)/,
    /X-Content-Type-Options "nosniff"/, /Referrer-Policy/, /X-Frame-Options "DENY"/, /frame-ancestors 'none'/, /Permissions-Policy/,
    /# Header always set Strict-Transport-Security/, /ExpiresByType font\/woff2 "access plus 1 year"/, /mod_deflate/]) assert.match(h, re);
  assert.match(read('_config.yml'), /^include: \[\]$/m, '.htaccess não vai para o GitHub Pages');
});
