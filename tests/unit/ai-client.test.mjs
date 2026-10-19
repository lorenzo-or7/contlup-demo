// Testes unitários: cliente da API no navegador (fetch SIMULADO / mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAIClient } from '../../js/lupi/ai-client.js';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const mockFetch = (fn) => { const calls = []; const f = async (url, init) => { calls.push({ url, init }); return fn(url, init, calls.length); }; f.calls = calls; return f; };
const payload = { messages: [{ role: 'user', content: 'o que é DRE?' }] };

test('[falhas de API] sem endereço configurado: não chama nada e informa not_configured', async () => {
  const f = mockFetch(() => res(200, {}));
  const c = createAIClient({ url: '', fetchImpl: f });
  assert.equal(c.configured, false);
  assert.deepEqual(await c.ask(payload), { ok: false, reason: 'not_configured' });
  assert.equal(f.calls.length, 0);
});

test('[perguntas livres] resposta válida é normalizada', async () => {
  const f = mockFetch(() => res(200, { ok: true, reply: ' Explicação ', needsHuman: true, topic: 'DRE', suggestions: ['a', 1, 'b', 'c', 'd'] }));
  const c = createAIClient({ url: 'https://api.test', fetchImpl: f });
  const r = await c.ask(payload);
  assert.deepEqual(r, { ok: true, reply: 'Explicação', needsHuman: true, topic: 'DRE', suggestions: ['a', 'b', 'c'], guarded: false });
  assert.equal(f.calls[0].url, 'https://api.test/chat');
  assert.equal(f.calls[0].init.credentials, 'omit');
});

test('[limites] 429 vira rate_limited com espera e bloqueia novas chamadas', async () => {
  let t = 0;
  const f = mockFetch(() => res(429, { ok: false, error: 'rate_limited', retryAfter: 20 }));
  const c = createAIClient({ url: 'https://api.test', fetchImpl: f, now: () => t });
  assert.deepEqual(await c.ask(payload), { ok: false, reason: 'rate_limited', retryAfter: 20 });
  assert.equal(c.available, false);
  assert.equal((await c.ask(payload)).reason, 'cooldown');
  assert.equal(f.calls.length, 1);
  t = 21000;
  assert.equal(c.available, true);
});

test('[falhas de API] orçamento esgotado desliga a IA na sessão', async () => {
  const f = mockFetch(() => res(503, { ok: false, error: 'budget_exhausted' }));
  const c = createAIClient({ url: 'https://api.test', fetchImpl: f });
  assert.equal((await c.ask(payload)).reason, 'budget');
  assert.equal(c.available, false);
  assert.equal(c.offReason, 'budget');
});

test('[falhas de API] timeout real aborta a requisição', async () => {
  const f = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))));
  const c = createAIClient({ url: 'https://api.test', fetchImpl: f, timeoutMs: 30 });
  assert.equal((await c.ask(payload)).reason, 'timeout');
  assert.equal(c.offReason, 'cooldown');
});

test('[falhas de API] erro de rede, 500 e resposta inválida', async () => {
  const net = createAIClient({ url: 'https://api.test', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal((await net.ask(payload)).reason, 'network');
  const s500 = createAIClient({ url: 'https://api.test', fetchImpl: async () => res(500, null) });
  assert.equal((await s500.ask(payload)).reason, 'unavailable');
  const bad = createAIClient({ url: 'https://api.test', fetchImpl: async () => res(200, { ok: true, reply: '' }) });
  assert.equal((await bad.ask(payload)).reason, 'invalid_response');
});

test('[falhas de API] health informa IA desligada pelo servidor', async () => {
  const c = createAIClient({ url: 'https://api.test', fetchImpl: async () => res(200, { ok: true, ai: false, reason: 'budget' }) });
  assert.equal((await c.health()).reason, 'budget');
  assert.equal(c.available, false);
});
