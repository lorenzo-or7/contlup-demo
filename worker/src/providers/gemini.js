/* GeminiProvider: Google Gemini API (generateContent).
   Documentação: https://ai.google.dev/api/generate-content */

import { ProviderError, postJson } from './base.js';

export function createGeminiProvider({ apiKey, model, thinkingBudget, fetchImpl = fetch }) {
  if (!apiKey || !model) throw new Error('Gemini sem chave ou modelo');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  return {
    name: 'gemini',
    model,
    async generate({ system, messages, maxOutputTokens, temperature, signal }) {
      const generationConfig = { maxOutputTokens, responseMimeType: 'application/json' };
      if (temperature !== undefined) generationConfig.temperature = temperature;
      if (thinkingBudget !== undefined) generationConfig.thinkingConfig = { thinkingBudget };
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        generationConfig,
      };
      const data = await postJson(fetchImpl, url, { 'x-goog-api-key': apiKey }, body, signal);
      if (data?.promptFeedback?.blockReason) throw new ProviderError('blocked', 200, data.promptFeedback.blockReason);
      const cand = data?.candidates?.[0];
      const text = (cand?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (!text) throw new ProviderError(cand?.finishReason === 'SAFETY' ? 'blocked' : 'empty', 200, cand?.finishReason || '');
      const u = data.usageMetadata || {};
      return {
        text,
        finishReason: cand?.finishReason || '',
        usage: { inputTokens: u.promptTokenCount || 0, outputTokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) },
      };
    },
  };
}
