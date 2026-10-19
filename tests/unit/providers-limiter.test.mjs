// Testes unitários: adaptadores Gemini/OpenAI (fetch SIMULADO), parser de JSON do modelo e limitador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../../worker/src/providers/gemini.js';
import { createOpenAIProvider } from '../../worker/src/providers/openai.js';
import { createProvider } from '../../worker/src/providers/index.js';
import { ProviderError } from '../../worker/src/providers/base.js';
import { parseModelJson } from '../../worker/src/ai-service.js';
import { LimiterCore, MemoryStorage, dayKey } from '../../worker/src/limiter.js';

const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });
const capture = (status, body) => { const f = async (url, init) => { f.url = url; f.init = init; f.body = JSON.parse(init.body); return jsonRes(status, body); }; return f; };
const msgs = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }, { role: 'user', content: 'o que é DRE?' }];

test('[provedores] Gemini: monta a requisição e lê texto e uso', async () => {
  const f = capture(200, { candidates: [{ content: { parts: [{ text: '{"reply":"x"}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 5 } });
  const p = createGeminiProvider({ apiKey: 'KEY', model: 'modelo-teste', thinkingBudget: 0, fetchImpl: f });
  const r = await p.generate({ system: 'SYS', messages: msgs, maxOutputTokens: 300 });
  assert.match(f.url, /models\/modelo-teste:generateContent$/);
  assert.equal(f.init.headers['x-goog-api-key'], 'KEY');
  assert.equal(f.body.systemInstruction.parts[0].text, 'SYS');
  assert.deepEqual(f.body.contents.map(c => c.role), ['user', 'model', 'user']);
  assert.equal(f.body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(f.body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(f.body.generationConfig.temperature, undefined, 'sem temperatura configurada, não envia');
  assert.deepEqual(r.usage, { inputTokens: 100, outputTokens: 25 });
});

test('[provedores] OpenAI: monta a requisição e lê texto e uso', async () => {
  const f = capture(200, { choices: [{ message: { content: '{"reply":"y"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 10 } });
  const p = createOpenAIProvider({ apiKey: 'KEY', model: 'modelo-teste', fetchImpl: f });
  const r = await p.generate({ system: 'SYS', messages: msgs, maxOutputTokens: 300, temperature: 0.3 });
  assert.equal(f.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(f.init.headers.Authorization, 'Bearer KEY');
  assert.deepEqual(f.body.messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(f.body.max_completion_tokens, 300);
  assert.equal(f.body.temperature, 0.3);
  assert.equal(f.body.store, false);
  assert.deepEqual(f.body.response_format, { type: 'json_object' });
  assert.equal(r.text, '{"reply":"y"}');
  assert.deepEqual(r.usage, { inputTokens: 50, outputTokens: 10 });
});

const ERRORS = [
  [401, 'auth'], [403, 'auth'], [429, 'quota'], [500, 'http'], [503, 'http'],
];
for (const [status, kind] of ERRORS) {
  for (const name of ['gemini', 'openai']) {
    test(`[falhas de API] ${name}: HTTP ${status} -> ${kind}`, async () => {
      const p = createProvider(name, { apiKey: 'k', model: 'm' }, async () => jsonRes(status, {}));
      await assert.rejects(p.generate({ system: 's', messages: msgs, maxOutputTokens: 10 }), (e) => e instanceof ProviderError && e.kind === kind);
    });
  }
}

test('[falhas de API] bloqueio de segurança e resposta vazia', async () => {
  const g = createGeminiProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => jsonRes(200, { promptFeedback: { blockReason: 'SAFETY' } }) });
  await assert.rejects(g.generate({ system: 's', messages: msgs }), e => e.kind === 'blocked');
  const o = createOpenAIProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => jsonRes(200, { choices: [{ message: { content: '' } }] }) });
  await assert.rejects(o.generate({ system: 's', messages: msgs }), e => e.kind === 'empty');
  const r = createOpenAIProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => jsonRes(200, { choices: [{ message: { refusal: 'não' } }] }) });
  await assert.rejects(r.generate({ system: 's', messages: msgs }), e => e.kind === 'blocked');
});

test('[provedores] sem chave ou modelo, não cria o provedor', () => {
  assert.throws(() => createGeminiProvider({ apiKey: '', model: 'm' }));
  assert.throws(() => createOpenAIProvider({ apiKey: 'k', model: '' }));
  assert.throws(() => createProvider('outro', {}));
});

test('[provedores] parser aceita JSON puro, cercado ou com texto em volta; rejeita o resto', () => {
  assert.equal(parseModelJson('{"reply":"a","needs_human":true}').needsHuman, true);
  assert.equal(parseModelJson('```json\n{"reply":"b"}\n```').reply, 'b');
  assert.equal(parseModelJson('Claro! {"reply":"c","suggestions":["x",2]} ok').suggestions.length, 1);
  assert.equal(parseModelJson('texto solto'), null);
  assert.equal(parseModelJson('{"reply":""}'), null);
  assert.equal(parseModelJson('{"answer":"x"}'), null);
});

// ---- limitador ----
const LIMITS = { perMinute: 2, perDay: 3, globalPerDay: 100, tokensPerDay: 1000, costPerDayUsd: 0 };
const T0 = Date.UTC(2026, 9, 19, 12, 0, 0);

test('[limites] por minuto e por dia, por visitante', async () => {
  const l = new LimiterCore(new MemoryStorage());
  assert.equal((await l.reserve({ ipHash: 'a', now: T0, limits: LIMITS })).ok, true);
  assert.equal((await l.reserve({ ipHash: 'a', now: T0 + 1000, limits: LIMITS })).ok, true);
  const third = await l.reserve({ ipHash: 'a', now: T0 + 2000, limits: LIMITS });
  assert.equal(third.error, 'rate_limited');
  assert.ok(third.retryAfter > 0 && third.retryAfter <= 60);
  assert.equal((await l.reserve({ ipHash: 'b', now: T0 + 2000, limits: LIMITS })).ok, true, 'outro visitante não é afetado');
  assert.equal((await l.reserve({ ipHash: 'a', now: T0 + 61000, limits: LIMITS })).ok, true, 'minuto seguinte libera');
  const day = await l.reserve({ ipHash: 'a', now: T0 + 122000, limits: LIMITS });
  assert.equal(day.error, 'rate_limited');
  assert.ok(day.retryAfter > 3600, 'espera até o dia seguinte');
});

test('[limites] recusa não consome cota', async () => {
  const st = new MemoryStorage();
  const l = new LimiterCore(st);
  await l.reserve({ ipHash: 'a', now: T0, limits: LIMITS });
  await l.reserve({ ipHash: 'a', now: T0, limits: LIMITS });
  await l.reserve({ ipHash: 'a', now: T0, limits: LIMITS });
  assert.equal(await st.get(`g:${dayKey(T0)}:req`), 2);
});

test('[limites] orçamento de tokens e de custo encerra as chamadas do dia', async () => {
  const l = new LimiterCore(new MemoryStorage());
  await l.record({ now: T0, tokens: 1000 });
  assert.equal((await l.reserve({ ipHash: 'x', now: T0, limits: LIMITS })).error, 'budget_exhausted');
  assert.equal((await l.reserve({ ipHash: 'x', now: T0 + 86400000, limits: LIMITS })).ok, true, 'novo dia, novo orçamento');
  const c = new LimiterCore(new MemoryStorage());
  await c.record({ now: T0, costUsd: 0.6 });
  assert.equal((await c.reserve({ ipHash: 'x', now: T0, limits: { ...LIMITS, costPerDayUsd: 0.5 } })).error, 'budget_exhausted');
});

test('[limites] limite global de requisições por dia', async () => {
  const l = new LimiterCore(new MemoryStorage());
  const lim = { ...LIMITS, perMinute: 100, perDay: 100, globalPerDay: 2 };
  await l.reserve({ ipHash: 'a', now: T0, limits: lim });
  await l.reserve({ ipHash: 'b', now: T0, limits: lim });
  assert.equal((await l.reserve({ ipHash: 'c', now: T0, limits: lim })).error, 'budget_exhausted');
});

test('[limites] limpeza remove contadores antigos e mantém os atuais', async () => {
  const st = new MemoryStorage();
  const l = new LimiterCore(st);
  await l.reserve({ ipHash: 'a', now: T0 - 2 * 86400000, limits: LIMITS });
  await l.reserve({ ipHash: 'a', now: T0, limits: LIMITS });
  const removed = await l.cleanup(T0 + 5 * 60000);
  assert.ok(removed >= 3);
  assert.ok([...st.map.keys()].every(k => k.includes(dayKey(T0))));
});
