/* Entrada do Cloudflare Worker da Lupi 2.0. */

import { DurableObject } from 'cloudflare:workers';
import { handleRequest } from './handler.js';
import { LimiterCore } from './limiter.js';
import kb from '../../data/lupi-knowledge.json';

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, { kb, waitUntil: (p) => ctx.waitUntil(p) });
  },
};

/** Durable Object único ("global") com os contadores de uso e orçamento. */
export class LupiLimiter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new LimiterCore(ctx.storage);
  }

  async #ensureAlarm() {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
  }

  async reserve(args) { await this.#ensureAlarm(); return this.core.reserve(args); }
  async record(args) { return this.core.record(args); }
  async status({ now, limits }) { return this.core.budgetState(now, limits); }

  async alarm() {
    await this.core.cleanup(Date.now());
    await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
  }
}
