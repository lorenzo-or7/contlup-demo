/* Validação do corpo da requisição /chat. O que não passar aqui nunca chega ao provedor de IA. */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

export function cleanText(s) {
  return String(s).replace(CONTROL, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * @returns {{ok: true, messages: {role, content}[], context: object} | {ok: false, error: string}}
 */
export function validateChatBody(body, limits) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body' };
  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: 'messages' };
  if (messages.length > limits.maxTurns) return { ok: false, error: 'too_many_turns' };

  let total = 0;
  const out = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') return { ok: false, error: 'message_shape' };
    if (m.role !== 'user' && m.role !== 'assistant') return { ok: false, error: 'role' };
    if (typeof m.content !== 'string') return { ok: false, error: 'content_type' };
    const content = cleanText(m.content);
    if (!content) return { ok: false, error: 'empty' };
    const max = m.role === 'user' ? limits.maxUserChars : limits.maxAssistantChars;
    if (content.length > max) return { ok: false, error: 'too_long' };
    total += content.length;
    out.push({ role: m.role, content });
  }
  if (total > limits.maxTotalChars) return { ok: false, error: 'too_long_total' };
  if (out[0].role !== 'user' || out.at(-1).role !== 'user') return { ok: false, error: 'order' };
  for (let i = 1; i < out.length; i++) if (out[i].role === out[i - 1].role && out[i].role === 'assistant') return { ok: false, error: 'order' };

  // contexto: só identificadores conhecidos, nada de texto livre
  const FLOW_IDS = new Set(['abrir_empresa', 'troca_contador', 'mei', 'servicos', 'proposta']);
  const ctx = {};
  if (context && typeof context === 'object') {
    if (FLOW_IDS.has(context.flow)) ctx.flow = context.flow;
    if (FLOW_IDS.has(context.completedFlow)) ctx.completedFlow = context.completedFlow;
  }
  return { ok: true, messages: out, context: ctx };
}
