/* Cliente da API da Lupi (Cloudflare Worker).
   O navegador nunca fala direto com Gemini/OpenAI e nunca vê chaves: só chama o Worker.
   Qualquer falha vira um motivo conhecido para a conversa acionar o modo básico. */

export const REASONS = ['not_configured', 'disabled', 'budget', 'rate_limited', 'timeout', 'network', 'unavailable', 'invalid_response', 'cooldown'];

export function createAIClient({ url = '', fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 25000, cooldownMs = 60000, now = () => Date.now() } = {}) {
  let blockedUntil = 0;
  let permanentlyOff = !url;
  let offReason = url ? '' : 'not_configured';

  async function call(path, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(url + path, { ...init, signal: ctrl.signal, credentials: 'omit', mode: 'cors' });
    } finally { clearTimeout(timer); }
  }

  function fail(reason, extra = {}) {
    if (reason === 'disabled' || reason === 'budget') { permanentlyOff = true; offReason = reason; }
    else if (reason === 'timeout' || reason === 'network' || reason === 'unavailable' || reason === 'invalid_response') blockedUntil = now() + cooldownMs;
    else if (reason === 'rate_limited') blockedUntil = now() + Math.max(5, extra.retryAfter || 30) * 1000;
    return { ok: false, reason, ...extra };
  }

  return {
    get configured() { return !!url; },
    get available() { return !permanentlyOff && now() >= blockedUntil; },
    get offReason() { return permanentlyOff ? offReason : (now() < blockedUntil ? 'cooldown' : ''); },

    /** Consulta leve, sem custo de IA: o servidor diz se a IA está ligada e com orçamento. */
    async health() {
      if (!url) return { ok: false, reason: 'not_configured' };
      try {
        const res = await call('/health', { method: 'GET' });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) return { ok: false, reason: 'unavailable' };
        if (!data.ai) { permanentlyOff = true; offReason = data.reason === 'budget' ? 'budget' : 'disabled'; return { ok: false, reason: offReason }; }
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: e?.name === 'AbortError' ? 'timeout' : 'network' };
      }
    },

    /**
     * @param {{messages: {role:'user'|'assistant', content:string}[], context?: object}} payload
     */
    async ask(payload) {
      if (permanentlyOff) return { ok: false, reason: offReason };
      if (now() < blockedUntil) return { ok: false, reason: 'cooldown' };
      let res;
      try {
        res = await call('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } catch (e) {
        return fail(e?.name === 'AbortError' ? 'timeout' : 'network');
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        const code = data?.error;
        if (res.status === 429 || code === 'rate_limited') return fail('rate_limited', { retryAfter: Number(data?.retryAfter) || 30 });
        if (code === 'budget_exhausted') return fail('budget');
        if (code === 'disabled' || code === 'not_configured') return fail('disabled');
        if (code === 'invalid_request') return { ok: false, reason: 'invalid_request' };
        return fail('unavailable');
      }
      if (typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 4000) return fail('invalid_response');
      return {
        ok: true,
        reply: data.reply.trim(),
        needsHuman: !!data.needsHuman,
        topic: typeof data.topic === 'string' ? data.topic.slice(0, 160) : '',
        suggestions: Array.isArray(data.suggestions) ? data.suggestions.filter(s => typeof s === 'string' && s.trim()).slice(0, 3).map(s => s.slice(0, 60)) : [],
        guarded: !!data.guarded,
      };
    },
  };
}
