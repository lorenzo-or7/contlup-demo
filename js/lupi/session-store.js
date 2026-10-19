/* Histórico temporário da conversa.
   Fica no sessionStorage: sobrevive a fechar/abrir o chat e a recarregar a página,
   mas some quando a aba é fechada. Nada vai para o servidor por aqui. */

export const STORAGE_KEY = 'lupi:v2:session';
export const MAX_MESSAGES = 80;
export const TTL_MS = 6 * 60 * 60 * 1000;

export function createSessionStore(storage = safeSessionStorage(), { now = () => Date.now() } = {}) {
  return {
    load() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.v !== 2 || !Array.isArray(data.messages)) return null;
        if (now() - (data.savedAt || 0) > TTL_MS) { storage.removeItem(STORAGE_KEY); return null; }
        return data;
      } catch { return null; }
    },
    save(state) {
      if (!storage) return false;
      const data = {
        v: 2,
        savedAt: now(),
        messages: (state.messages || []).slice(-MAX_MESSAGES),
        flow: state.flow ?? null,
        suspended: state.suspended ?? null,
        lastCompleted: state.lastCompleted ?? null,
        chips: state.chips ?? [],
      };
      try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
      catch { return false; }
    },
    clear() {
      if (!storage) return;
      try { storage.removeItem(STORAGE_KEY); } catch { /* sem armazenamento: nada a limpar */ }
    },
  };
}

function safeSessionStorage() {
  try {
    const s = globalThis.sessionStorage;
    const k = '__lupi_test__';
    s.setItem(k, '1'); s.removeItem(k);
    return s;
  } catch { return null; }
}
