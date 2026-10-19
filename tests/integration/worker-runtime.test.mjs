// Teste de integração no runtime real do Cloudflare (workerd via `wrangler dev`), com o Durable Object de verdade.
// Usa uma chave FALSA de propósito: a chamada ao provedor falha, o que permite verificar CORS, /health,
// tratamento de erro e o rate limit entre requisições SEM gastar créditos de IA.
// Se o wrangler não estiver instalado (cd worker && npm install), o teste é marcado como PULADO, não como aprovado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../support/helpers.mjs';

const WRANGLER = path.join(ROOT, 'worker/node_modules/.bin/wrangler');
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:8080';
const available = fs.existsSync(WRANGLER);
let proc;

before(async () => {
  if (!available) return;
  const vars = {
    AI_ENABLED: 'true', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'chave-falsa-para-teste', GEMINI_MODEL: 'modelo-falso',
    ALLOWED_ORIGINS: ORIGIN, IP_HASH_SALT: 'teste', RATE_LIMIT_PER_MINUTE: '3', PROVIDER_TIMEOUT_MS: '4000',
  };
  const args = ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', path.join(ROOT, 'worker/.wrangler/test-state')];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  fs.rmSync(path.join(ROOT, 'worker/.wrangler/test-state'), { recursive: true, force: true });
  proc = spawn(WRANGLER, args, { cwd: path.join(ROOT, 'worker'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: 'pipe' });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/health`, { headers: { Origin: ORIGIN } }); if (r.status === 200) return; } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('wrangler dev não respondeu em 60s');
});
after(() => { proc?.kill('SIGTERM'); });

const opts = { skip: available ? false : 'wrangler não instalado (rode: cd worker && npm install)' };
const post = (body, origin = ORIGIN) => fetch(`${BASE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });

test('[runtime] /health no workerd responde com a IA ativa e sem detalhes internos', opts, async () => {
  const r = await fetch(`${BASE}/health`, { headers: { Origin: ORIGIN } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.deepEqual(await r.json(), { ok: true, ai: true });
});

test('[runtime] origem desconhecida é recusada', opts, async () => {
  const r = await post({ messages: [{ role: 'user', content: 'oi' }] }, 'https://evil.example');
  assert.equal(r.status, 403);
});

test('[runtime] chave inválida no provedor: 503 genérico, sem vazar a chave', opts, async () => {
  const r = await post({ messages: [{ role: 'user', content: 'o que é DRE?' }] });
  assert.equal(r.status, 503);
  const raw = await r.text();
  assert.equal(raw, '{"ok":false,"error":"unavailable"}');
});

test('[runtime] rate limit pelo Durable Object vale entre requisições', opts, async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await post({ messages: [{ role: 'user', content: 'pergunta ' + i }] })).status);
  // a 1ª requisição do teste anterior já contou: o limite (3/min) estoura antes da 4ª desta rodada
  assert.ok(statuses.includes(429), `esperava um 429, recebeu ${statuses}`);
  const r = await post({ messages: [{ role: 'user', content: 'de novo' }] });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
});
