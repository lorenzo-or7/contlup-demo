/* Fábrica de provedores: escolhe Gemini ou OpenAI conforme AI_PROVIDER (só no servidor). */

import { createGeminiProvider } from './gemini.js';
import { createOpenAIProvider } from './openai.js';

export function createProvider(name, settings, fetchImpl) {
  if (name === 'gemini') return createGeminiProvider({ ...settings, fetchImpl });
  if (name === 'openai') return createOpenAIProvider({ ...settings, fetchImpl });
  throw new Error(`Provedor desconhecido: ${name}`);
}
