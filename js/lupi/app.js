/* Lupi 2.0: montagem do chat (carregado sob demanda pelo boot.js). */

import { readConfig } from './config.js';
import { Conversation } from './conversation.js';
import { createAIClient } from './ai-client.js';
import { createSessionStore } from './session-store.js';
import { createUI } from './ui.js';

let instance = null;

export async function start() {
  if (instance) return instance;
  const cfg = readConfig(document);
  const [knowledge, flows] = await Promise.all([fetchJson(cfg.knowledgeUrl), fetchJson(cfg.flowsUrl)]);
  const ai = createAIClient({ url: cfg.apiUrl, timeoutMs: cfg.requestTimeoutMs });
  const conversation = new Conversation({
    knowledge, flows, ai,
    store: createSessionStore(),
    maxInput: cfg.maxInputChars,
    historyTurns: cfg.aiHistoryTurns,
    whatsapp: cfg.whatsapp,
  });
  const ui = createUI({ root: document.getElementById('lupi-chat'), conversation, ai, launch: document.querySelector('.lc-launch') });
  conversation.init();
  ui.renderAll();
  // checa a IA sem custo (não chama o modelo); o resultado só muda o selo de status
  ai.health().then(() => ui.updateStatus());
  instance = ui;
  return ui;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return res.json();
}
