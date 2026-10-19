/* Rotas HTTP do Worker da Lupi.
   GET  /health  -> { ok, ai }   (não chama a IA, não revela provedor nem configurações)
   POST /chat    -> { ok, reply, needsHuman, topic, suggestions, guarded }
   Erros sempre no formato { ok: false, error } sem detalhes internos. */

import { readConfig, activeProvider, estimateCostUsd } from './config.js';
import { validateChatBody } from './validate.js';
import { runChat } from './ai-service.js';
import { createProvider } from './providers/index.js';
import { ProviderError } from './providers/base.js';

/**
 * @param {Request} request
 * @param {object} env
 * @param {object} [deps]  { kb, limiter, provider, fetchImpl, now, waitUntil, log }  (injetáveis para testes)
 */
export async function handleRequest(request, env, deps = {}) {
  const cfg = deps.config || readConfig(env);
  const now = deps.now ? deps.now() : Date.now();
  const log = deps.log || ((o) => console.log(JSON.stringify(o)));
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const allowed = !!origin && cfg.allowedOrigins.includes(origin);
  const cors = allowed ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  } : {};
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      Vary: 'Origin',
      ...cors,
      ...extra,
    },
  });

  if (url.pathname !== '/chat' && url.pathname !== '/health') return json(404, { ok: false, error: 'not_found' });
  if (!allowed) return json(403, { ok: false, error: 'forbidden' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, Vary: 'Origin' } });

  const provider = activeProvider(cfg);
  const limiter = deps.limiter || limiterFromEnv(env);

  if (url.pathname === '/health') {
    if (request.method !== 'GET') return json(405, { ok: false, error: 'method' });
    if (!provider.ready) return json(200, { ok: true, ai: false, reason: 'disabled' });
    if (!limiter) return json(200, { ok: true, ai: false, reason: 'disabled' });
    try {
      const st = await limiter.status({ now, limits: cfg.limits });
      return json(200, { ok: true, ai: !st.exhausted, reason: st.exhausted ? 'budget' : undefined });
    } catch { return json(200, { ok: true, ai: false, reason: 'disabled' }); }
  }

  // ---- /chat ----
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method' });
  if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) return json(415, { ok: false, error: 'invalid_request' });
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > cfg.input.maxBodyBytes) return json(413, { ok: false, error: 'invalid_request' });
  let raw;
  try { raw = await request.text(); } catch { return json(400, { ok: false, error: 'invalid_request' }); }
  if (new TextEncoder().encode(raw).length > cfg.input.maxBodyBytes) return json(413, { ok: false, error: 'invalid_request' });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'invalid_request' }); }
  const v = validateChatBody(body, cfg.input);
  if (!v.ok) return json(400, { ok: false, error: 'invalid_request' });

  if (!provider.ready) return json(503, { ok: false, error: provider.reason === 'disabled' ? 'disabled' : 'not_configured' });
  if (!limiter) { log({ event: 'limiter_missing' }); return json(503, { ok: false, error: 'unavailable' }); }

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'desconhecido', cfg.ipSalt);
  let r;
  try { r = await limiter.reserve({ ipHash, now, limits: cfg.limits }); }
  catch { log({ event: 'limiter_error' }); return json(503, { ok: false, error: 'unavailable' }); }
  if (!r.ok) {
    if (r.error === 'budget_exhausted') return json(503, { ok: false, error: 'budget_exhausted' });
    return json(429, { ok: false, error: 'rate_limited', retryAfter: r.retryAfter }, { 'Retry-After': String(r.retryAfter || 60) });
  }

  try {
    const ai = deps.provider || createProvider(provider.name, provider.settings, deps.fetchImpl || fetch);
    const kb = deps.kb;
    if (!kb) throw new Error('kb_missing');
    const out = await runChat({ messages: v.messages, context: v.context }, {
      provider: ai, kb, maxOutputTokens: cfg.maxOutputTokens, temperature: cfg.temperature, timeoutMs: cfg.timeoutMs,
    });
    if (out.calledProvider) {
      const tokens = (out.usage.inputTokens || 0) + (out.usage.outputTokens || 0);
      const rec = limiter.record({ now, tokens, costUsd: estimateCostUsd(provider.settings, out.usage) });
      deps.waitUntil ? deps.waitUntil(rec) : await rec;
    }
    if (out.guarded) log({ event: 'guarded', reason: out.guarded });
    return json(200, { ok: true, reply: out.reply, needsHuman: out.needsHuman, topic: out.topic, suggestions: out.suggestions, guarded: !!out.guarded });
  } catch (e) {
    // nunca registramos o conteúdo da conversa, só o tipo de falha
    log({ event: 'provider_error', kind: e instanceof ProviderError ? e.kind : 'internal', status: e?.status || 0 });
    return json(503, { ok: false, error: 'unavailable' });
  }
}

function limiterFromEnv(env) {
  if (!env?.LIMITER) return null;
  const stub = env.LIMITER.get(env.LIMITER.idFromName('global'));
  return {
    reserve: (a) => stub.reserve(a),
    record: (a) => stub.record(a),
    status: (a) => stub.status(a),
  };
}

export async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt}|${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
