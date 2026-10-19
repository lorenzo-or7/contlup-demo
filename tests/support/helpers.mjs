/* Utilitários dos testes. Tudo que é MOCK está identificado no nome. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Conversation } from '../../js/lupi/conversation.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const knowledge = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lupi-knowledge.json'), 'utf8'));
export const flows = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lupi-flows.json'), 'utf8'));

/** MOCK de cliente de IA: devolve respostas programadas e registra o que recebeu. */
export function mockAI({ configured = true, replies = [], fail = null } = {}) {
  const calls = [];
  let i = 0;
  let available = configured;
  return {
    calls,
    get configured() { return configured; },
    get available() { return available; },
    get offReason() { return configured ? (available ? '' : 'cooldown') : 'not_configured'; },
    async health() { return { ok: configured }; },
    async ask(payload) {
      calls.push(structuredClone(payload));
      if (fail) { if (['timeout', 'network', 'unavailable'].includes(fail)) available = false; return { ok: false, reason: fail }; }
      const r = replies[Math.min(i++, replies.length - 1)] || { reply: 'Resposta de teste.' };
      return { ok: true, needsHuman: false, topic: '', suggestions: [], ...r };
    },
  };
}

/** MOCK de sessionStorage em memória. */
export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _map: m };
}

export function newConversation(opts = {}) {
  const c = new Conversation({ knowledge, flows, ai: opts.ai || mockAI({ configured: false }), store: opts.store || null, whatsapp: '5519997447919' });
  c.init();
  return c;
}

export const lastBot = (c) => [...c.messages].reverse().find(m => m.role === 'bot');
export const botTexts = (c) => c.messages.filter(m => m.role === 'bot').map(m => m.text);
export const chipLabels = (c) => c.chips.map(x => x.label);
