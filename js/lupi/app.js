/* Lupi 2.0: montagem do chat (carregado sob demanda pelo boot.js). */

import { readConfig } from './config.js';
import { Conversation } from './conversation.js';
import { createSessionStore } from './session-store.js';
import { createUI } from './ui.js';

let instance = null;

export async function start() {
  if (instance) return instance;
  const cfg = readConfig(document);
  const [knowledge, flows] = await Promise.all([fetchJson(cfg.knowledgeUrl), fetchJson(cfg.flowsUrl)]);
  // a IA está guardada para o futuro: o módulo só é baixado se houver um endereço configurado
  const ai = cfg.apiUrl
    ? (await import('./ai-client.js')).createAIClient({ url: cfg.apiUrl, timeoutMs: cfg.requestTimeoutMs })
    : null;
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
  ai?.health().then(() => ui.updateStatus());
  instance = {
    open: (from) => ui.open(from),
    close: () => ui.close(),
    get isOpen() { return ui.isOpen; },
    /** Abre o chat e envia uma pergunta (botões "Pergunte à Lupi" da página). */
    ask(text, from) {
      ui.open(from);
      if (!conversation.busy && !ui.isTyping) conversation.send(text);
    },
  };
  return instance;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url}`);
  return res.json();
}
