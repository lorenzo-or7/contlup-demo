/* AIService: o mesmo pipeline para o Worker e para a avaliação comparativa (eval/).
   1. remove dados pessoais das mensagens;
   2. bloqueia prompt injection óbvio sem chamar a IA;
   3. monta as instruções + base aprovada;
   4. chama o provedor com tempo limite;
   5. interpreta o JSON, valida, aplica as guardas de saída e normaliza. */

import { redact } from '../../js/lupi/shared/privacy.js';
import { truncate } from '../../js/lupi/shared/text.js';
import { buildSystemPrompt } from './prompt.js';
import { detectInjection, checkOutput, sanitizeReply, SAFE_REPLY, INJECTION_REPLY } from './guard.js';
import { ProviderError } from './providers/base.js';

export async function runChat({ messages, context = {} }, { provider, kb, maxOutputTokens = 700, temperature, timeoutMs = 15000 }) {
  const clean = messages.map(m => ({ role: m.role, content: redact(m.content) }));
  const last = clean.at(-1).content;

  if (detectInjection(last)) {
    return { reply: INJECTION_REPLY, needsHuman: false, topic: '', suggestions: ['Quais são os serviços?', 'Como funciona a troca de contador?'], guarded: 'injection', usage: { inputTokens: 0, outputTokens: 0 }, calledProvider: false };
  }

  const system = buildSystemPrompt(kb, context);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let result;
  try {
    result = await provider.generate({ system, messages: clean, maxOutputTokens, temperature, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(e?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseModelJson(result.text);
  if (!parsed) throw new ProviderError('empty', 200, 'json_parse');

  let reply = sanitizeReply(parsed.reply);
  let needsHuman = parsed.needsHuman;
  let guarded = false;
  const check = checkOutput(reply);
  if (!check.ok) { reply = SAFE_REPLY; needsHuman = true; guarded = check.reason; }

  return {
    reply,
    needsHuman,
    topic: truncate(redact(parsed.topic).replace(/\[dado removido\]/g, '').replace(/\s+/g, ' ').trim(), 120),
    suggestions: guarded ? [] : parsed.suggestions
      .map(s => truncate(redact(s).replace(/\[dado removido\]/g, '').trim(), 60))
      .filter(s => s && checkOutput(s).ok && !/https?:\/\//.test(s))
      .slice(0, 3),
    guarded,
    usage: result.usage,
    calledProvider: true,
    // resposta original do modelo (antes das guardas): usada só pela avaliação comparativa, nunca enviada ao visitante
    raw: { reply: parsed.reply, needsHuman: parsed.needsHuman },
  };
}

/** Aceita o JSON puro, cercado por ```json``` ou com texto antes/depois. */
export function parseModelJson(text) {
  const raw = String(text || '').trim();
  const candidates = [raw, raw.replace(/^```(?:json)?\s*|\s*```$/gi, '')];
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(raw.slice(a, b + 1));
  for (const c of candidates) {
    try {
      const o = JSON.parse(c);
      if (o && typeof o === 'object' && typeof o.reply === 'string' && o.reply.trim()) {
        return {
          reply: o.reply,
          needsHuman: o.needs_human === true || o.needsHuman === true,
          topic: typeof o.topic === 'string' ? o.topic : '',
          suggestions: Array.isArray(o.suggestions) ? o.suggestions.filter(s => typeof s === 'string') : [],
        };
      }
    } catch { /* tenta o próximo formato */ }
  }
  return null;
}
