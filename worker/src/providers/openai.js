/* OpenAIProvider: OpenAI Chat Completions API.
   Documentação: https://platform.openai.com/docs/api-reference/chat/create */

import { ProviderError, postJson } from './base.js';

export function createOpenAIProvider({ apiKey, model, reasoningEffort, fetchImpl = fetch }) {
  if (!apiKey || !model) throw new Error('OpenAI sem chave ou modelo');
  return {
    name: 'openai',
    model,
    async generate({ system, messages, maxOutputTokens, temperature, signal }) {
      const body = {
        model,
        messages: [{ role: 'system', content: system }, ...messages.map(m => ({ role: m.role, content: m.content }))],
        max_completion_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
        store: false,
      };
      if (temperature !== undefined) body.temperature = temperature;
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;
      const data = await postJson(fetchImpl, 'https://api.openai.com/v1/chat/completions', { Authorization: `Bearer ${apiKey}` }, body, signal);
      const choice = data?.choices?.[0];
      if (choice?.message?.refusal) throw new ProviderError('blocked', 200, 'refusal');
      const text = String(choice?.message?.content || '').trim();
      if (!text) throw new ProviderError('empty', 200, choice?.finish_reason || '');
      const u = data.usage || {};
      return {
        text,
        finishReason: choice?.finish_reason || '',
        usage: { inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 },
      };
    },
  };
}
