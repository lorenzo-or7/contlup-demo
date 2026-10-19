// Testes de segurança: nenhuma chave no repositório público e o navegador nunca fala direto com provedores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../support/helpers.mjs';

function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{30,}/, // chave Google
  /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/, // chave OpenAI
  /Bearer\s+[A-Za-z0-9._-]{30,}/,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
];

test('[segurança] nenhum arquivo versionado contém chaves de API', () => {
  const files = trackedFiles().filter(f => !/\.(webp|png|jpg|svg|ico)$/.test(f) && !f.startsWith('tests/'));
  assert.ok(files.length > 10, 'não encontrou arquivos do repositório');
  for (const f of files) {
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const re of SECRET_PATTERNS) assert.doesNotMatch(txt, re, `${f} parece conter uma chave`);
  }
});

test('[segurança] arquivos de ambiente com segredos são ignorados pelo Git', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  for (const p of ['.env', '.dev.vars', 'node_modules']) assert.match(gi, new RegExp(`^${p.replace('.', '\\.')}`, 'm'), p);
  const ignored = execFileSync('git', ['check-ignore', '.env', 'worker/.dev.vars'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(ignored, /\.env/);
  assert.match(ignored, /\.dev\.vars/);
  assert.ok(fs.existsSync(path.join(ROOT, '.env.example')));
});

test('[segurança] código do navegador não chama provedores de IA nem carrega chaves', () => {
  const dir = path.join(ROOT, 'js');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(dir)) {
    const txt = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(txt, /generativelanguage\.googleapis|api\.openai\.com/, f);
    assert.doesNotMatch(txt, /API_KEY|apiKey/, f);
  }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /generativelanguage|api\.openai|API_KEY/);
});

test('[segurança] código de IA do navegador não usa innerHTML com texto de conversa', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'js/lupi/ui.js'), 'utf8');
  const uses = ui.match(/innerHTML\s*=.*$/gm) || [];
  // o único innerHTML é o indicador de digitação, com conteúdo fixo
  assert.equal(uses.length, 1);
  assert.doesNotMatch(uses[0], /\$\{|\+\s*\w/);
});
