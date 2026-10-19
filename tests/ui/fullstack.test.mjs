// Integração de ponta a ponta SEM mocks na API: site no navegador -> Worker real (workerd via wrangler dev, com Durable Object).
// O provedor de IA recebe uma chave FALSA, então a resposta da IA falha de verdade: o teste confirma
// CORS, /health, o caminho de erro real e o fallback da interface. Sem wrangler instalado, o teste é PULADO.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createStaticServer } from '../support/static-server.mjs';
import { ROOT } from '../support/helpers.mjs';

const WRANGLER = path.join(ROOT, 'worker/node_modules/.bin/wrangler');
const available = fs.existsSync(WRANGLER);
const SITE_PORT = 8093, API_PORT = 8798;
const SITE = `http://localhost:${SITE_PORT}`, API = `http://localhost:${API_PORT}`;
let proc, server, browser;

before(async () => {
  if (!available) return;
  const state = path.join(ROOT, 'worker/.wrangler/fullstack-state');
  fs.rmSync(state, { recursive: true, force: true });
  const vars = { AI_ENABLED: 'true', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'chave-falsa', OPENAI_MODEL: 'modelo-falso', ALLOWED_ORIGINS: SITE, IP_HASH_SALT: 'x', PROVIDER_TIMEOUT_MS: '5000' };
  const args = ['dev', '--port', String(API_PORT), '--ip', '127.0.0.1', '--persist-to', state];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  proc = spawn(WRANGLER, args, { cwd: path.join(ROOT, 'worker'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: 'pipe' });
  server = createStaticServer();
  await new Promise(r => server.listen(SITE_PORT, '127.0.0.1', r));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${API}/health`, { headers: { Origin: SITE } })).ok) break; } catch { /* subindo */ }
    await new Promise(r => setTimeout(r, 500));
  }
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); proc?.kill('SIGTERM'); if (server) await new Promise(r => server.close(r)); });

test('[integração ponta a ponta] site + Worker real: status de IA, falha real do provedor e fallback', { skip: available ? false : 'wrangler não instalado' }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(SITE + '/', async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('<meta name="lupi-api" content="">', `<meta name="lupi-api" content="${API}">`) });
  });
  await page.goto(SITE + '/');
  await page.click('.lc-launch');
  await page.waitForFunction(() => document.querySelector('.lc-status')?.dataset.state === 'ai', null, { timeout: 15000 });
  await page.fill('#lc-in', 'como funciona a depreciação de máquinas na contabilidade?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => /dificuldade temporária/.test(document.querySelector('.lc-log').textContent), null, { timeout: 20000 });
  assert.equal(await page.getAttribute('.lc-status', 'data-state'), 'off');
  assert.equal(await page.locator('.lc-tag').count(), 0, 'não finge resposta de IA');
  // fluxos continuam funcionando com a IA fora
  await page.click('.lc-chip >> text=Abrir uma empresa');
  await page.waitForFunction(() => /tipo de atividade/.test(document.querySelector('.lc-log').textContent));
  assert.deepEqual(errors, []);
});
