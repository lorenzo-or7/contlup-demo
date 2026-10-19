/* Limites de uso e orçamento.
   A lógica fica aqui (testável no Node com um storage em memória); no Cloudflare ela roda dentro de
   um Durable Object (classe LupiLimiter em index.js). Um Durable Object processa uma requisição por vez,
   então as contagens valem entre todas as instâncias do Worker, sem condição de corrida.

   Contadores:
   - por visitante (IP com hash e sal, nunca o IP puro): por minuto e por dia;
   - global: requisições por dia, tokens por dia e (opcional) custo estimado por dia em US$. */

const DAY_MS = 86400000;

export function dayKey(now) { return new Date(now).toISOString().slice(0, 10); }
function minuteKey(now) { return Math.floor(now / 60000); }
function secondsToNextDay(now) { return Math.ceil((DAY_MS - (now % DAY_MS)) / 1000); }

export class LimiterCore {
  /** @param {{get, put, delete, list}} storage  API compatível com ctx.storage do Durable Object */
  constructor(storage) { this.storage = storage; }

  async #n(key) { return Number(await this.storage.get(key)) || 0; }

  async budgetState(now, limits) {
    const d = dayKey(now);
    const [req, tok, cost] = await Promise.all([this.#n(`g:${d}:req`), this.#n(`g:${d}:tok`), this.#n(`g:${d}:cost`)]);
    const exhausted = req >= limits.globalPerDay || tok >= limits.tokensPerDay || (limits.costPerDayUsd > 0 && cost >= limits.costPerDayUsd);
    return { exhausted, req, tok, cost };
  }

  /**
   * Reserva uma chamada. Só incrementa se tudo estiver dentro dos limites.
   * @returns {Promise<{ok: true} | {ok: false, error: 'rate_limited'|'budget_exhausted', retryAfter?: number}>}
   */
  async reserve({ ipHash, now, limits }) {
    const d = dayKey(now), m = minuteKey(now);
    const budget = await this.budgetState(now, limits);
    if (budget.exhausted) return { ok: false, error: 'budget_exhausted' };

    const kMin = `ipm:${ipHash}:${m}`, kDay = `ipd:${ipHash}:${d}`;
    const [perMin, perDay] = await Promise.all([this.#n(kMin), this.#n(kDay)]);
    if (perMin >= limits.perMinute) return { ok: false, error: 'rate_limited', retryAfter: 60 - Math.floor((now % 60000) / 1000) };
    if (perDay >= limits.perDay) return { ok: false, error: 'rate_limited', retryAfter: secondsToNextDay(now) };

    await this.storage.put(kMin, perMin + 1);
    await this.storage.put(kDay, perDay + 1);
    await this.storage.put(`g:${d}:req`, budget.req + 1);
    return { ok: true };
  }

  /** Registra o consumo real depois da resposta do provedor. */
  async record({ now, tokens = 0, costUsd = 0 }) {
    const d = dayKey(now);
    if (tokens > 0) await this.storage.put(`g:${d}:tok`, (await this.#n(`g:${d}:tok`)) + tokens);
    if (costUsd > 0) await this.storage.put(`g:${d}:cost`, (await this.#n(`g:${d}:cost`)) + costUsd);
  }

  /** Apaga contadores antigos (chamado pelo alarme do Durable Object). */
  async cleanup(now) {
    const d = dayKey(now), m = minuteKey(now);
    const all = await this.storage.list();
    const old = [];
    for (const key of all.keys()) {
      if (key.startsWith('ipm:')) { if (Number(key.split(':').at(-1)) < m - 1) old.push(key); }
      else if (!key.includes(d)) old.push(key);
    }
    for (const k of old) await this.storage.delete(k);
    return old.length;
  }
}

/** Storage em memória com a mesma interface (testes e desenvolvimento). */
export class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(k) { return this.map.get(k); }
  async put(k, v) { this.map.set(k, v); }
  async delete(k) { return this.map.delete(k); }
  async list() { return new Map(this.map); }
}
