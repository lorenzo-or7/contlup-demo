/* Lê um arquivo .env simples (CHAVE=valor) sem dependências. Variáveis já definidas no ambiente têm prioridade. */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

export function loadEnv(file = path.join(ROOT, '.env')) {
  const out = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (/^(GEMINI|OPENAI|AI|MAX_OUTPUT|PROVIDER)_/.test(k) && v) out[k] = v;
  return out;
}

/** Provedores com chave e modelo preenchidos. */
export function configuredProviders(env) {
  const list = [];
  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) list.push('gemini');
  if (env.OPENAI_API_KEY && env.OPENAI_MODEL) list.push('openai');
  return list;
}
