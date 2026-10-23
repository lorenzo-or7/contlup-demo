/* Encaminhamento para o WhatsApp da ContLup.
   A Lupi só PREPARA a mensagem: o visitante revisa, edita e confirma antes de abrir o WhatsApp.
   Nada é enviado automaticamente. */

import { redact, detectSensitive } from './shared/privacy.js';
import { truncate } from './shared/text.js';

export const OFFICIAL_NUMBER = '5519971310182'; // WhatsApp comercial da ContLup
export const MAX_SUMMARY = 500;
const OPENING = 'Olá, Priscila! Vim pelo site da ContLup e conversei com a Lupi.';

/**
 * Resumo curto para a Priscila.
 * - fluxo concluído: usa o resumo do fluxo;
 * - conversa livre: usa o tema indicado pela IA ou a última pergunta (sempre sem dados pessoais);
 * - sem contexto: mensagem genérica.
 */
export function buildHandoffSummary({ flowSummary = '', topic = '', lastQuestion = '' } = {}) {
  if (flowSummary) return sanitizeSummary(flowSummary);
  const subject = cleanFragment(topic) || cleanFragment(lastQuestion);
  if (subject) return sanitizeSummary(`${OPENING} Gostaria de orientação sobre: ${subject}. Podemos conversar?`);
  return sanitizeSummary(`${OPENING} Gostaria de conversar sobre a contabilidade do meu negócio. Podemos conversar?`);
}

function cleanFragment(s) {
  const t = redact(String(s || '')).replace(/\[dado removido\]/g, '').replace(/\s+/g, ' ').trim().replace(/[?.!]+$/, '');
  return truncate(t, 160);
}

export function sanitizeSummary(text) {
  return truncate(redact(String(text || '')).replace(/[ \t]+/g, ' ').trim(), MAX_SUMMARY);
}

/** Link oficial (wa.me) com o texto já codificado. */
export function buildWhatsAppLink(text, number = OFFICIAL_NUMBER) {
  if (!/^\d{12,13}$/.test(number)) throw new Error('Número de WhatsApp inválido');
  return `https://wa.me/${number}?text=${encodeURIComponent(String(text || '').slice(0, MAX_SUMMARY))}`;
}

/** Avisos antes de abrir: dados sensíveis digitados pelo próprio visitante ao editar o resumo. */
export function reviewSummary(text) {
  const t = String(text || '').trim();
  return {
    empty: !t,
    tooLong: t.length > MAX_SUMMARY,
    sensitive: detectSensitive(t).filter(k => k !== 'telefone' && k !== 'email'),
  };
}
