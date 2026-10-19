/* Leitura e validação da configuração do Worker.
   Tudo vem de variáveis de ambiente (wrangler.toml [vars]) e de secrets (wrangler secret put).
   Modelos e preços NÃO têm valor padrão de propósito: mudam com frequência e precisam ser escolhidos por quem publica. */

const num = (v, def, min, max) => {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const optNum = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const list = (v) => String(v || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);

export function readConfig(env = {}) {
  return {
    enabled: String(env.AI_ENABLED || '').toLowerCase() === 'true',
    provider: String(env.AI_PROVIDER || '').toLowerCase().trim(),
    gemini: {
      apiKey: env.GEMINI_API_KEY || '',
      model: String(env.GEMINI_MODEL || '').trim(),
      thinkingBudget: optNum(env.GEMINI_THINKING_BUDGET),
      priceInPerMTok: optNum(env.GEMINI_PRICE_INPUT_PER_MTOK),
      priceOutPerMTok: optNum(env.GEMINI_PRICE_OUTPUT_PER_MTOK),
    },
    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      model: String(env.OPENAI_MODEL || '').trim(),
      reasoningEffort: String(env.OPENAI_REASONING_EFFORT || '').trim() || undefined,
      priceInPerMTok: optNum(env.OPENAI_PRICE_INPUT_PER_MTOK),
      priceOutPerMTok: optNum(env.OPENAI_PRICE_OUTPUT_PER_MTOK),
    },
    temperature: optNum(env.AI_TEMPERATURE),
    maxOutputTokens: num(env.MAX_OUTPUT_TOKENS, 700, 128, 4000),
    timeoutMs: num(env.PROVIDER_TIMEOUT_MS, 15000, 2000, 30000),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    ipSalt: env.IP_HASH_SALT || '',
    limits: {
      perMinute: num(env.RATE_LIMIT_PER_MINUTE, 6, 1, 120),
      perDay: num(env.RATE_LIMIT_PER_DAY, 60, 1, 5000),
      globalPerDay: num(env.GLOBAL_REQUESTS_PER_DAY, 500, 1, 1e6),
      tokensPerDay: num(env.DAILY_TOKEN_BUDGET, 400000, 1000, 1e10),
      costPerDayUsd: num(env.DAILY_COST_BUDGET_USD, 0, 0, 1e6), // 0 = sem teto em dinheiro (vale o teto de tokens)
    },
    input: {
      maxBodyBytes: 16000,
      maxTurns: 16,
      maxUserChars: 600,
      maxAssistantChars: 1600,
      maxTotalChars: 9000,
    },
  };
}

/** Provedor ativo pronto para uso? (chave e modelo presentes) */
export function activeProvider(cfg) {
  if (!cfg.enabled) return { ready: false, reason: 'disabled' };
  if (cfg.provider !== 'gemini' && cfg.provider !== 'openai') return { ready: false, reason: 'not_configured' };
  const p = cfg[cfg.provider];
  if (!p.apiKey || !p.model) return { ready: false, reason: 'not_configured' };
  return { ready: true, name: cfg.provider, settings: p };
}

export function estimateCostUsd(settings, usage) {
  if (settings?.priceInPerMTok === undefined || settings?.priceOutPerMTok === undefined) return 0;
  return ((usage.inputTokens || 0) * settings.priceInPerMTok + (usage.outputTokens || 0) * settings.priceOutPerMTok) / 1e6;
}
