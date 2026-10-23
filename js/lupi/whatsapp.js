/* Encaminhamento para o WhatsApp da ContLup.
   A Lupi só PREPARA a mensagem: o visitante revisa, edita e confirma antes de abrir o WhatsApp.
   Nada é enviado automaticamente. */

import { redact, detectSensitive } from './shared/privacy.js';
import { truncate } from './shared/text.js';

export const OFFICIAL_NUMBER = '5519971310182'; // WhatsApp comercial da ContLup
export const MAX_SUMMARY = 500;
const OPENING = 'Olá! Vim pelo site da ContLup e conversei com a Lupi.';

/**
 * Mensagem curta para o WhatsApp comercial. Nunca inclui o texto livre digitado pelo visitante
 * (que pode ter dados pessoais, financeiros ou tributários): usa só conteúdos preparados.
 * - fluxo concluído: o resumo do fluxo;
 * - assunto reconhecido: a mensagem da ação de WhatsApp da intenção ou o título do assunto;
 * - sem contexto: mensagem genérica.
 */
export function buildHandoffSummary({ flowSummary = '', intentMessage = '', topic = '' } = {}) {
  if (flowSummary) return sanitizeSummary(flowSummary);
  if (intentMessage) return sanitizeSummary(intentMessage);
  const subject = cleanFragment(topic);
  if (subject) return sanitizeSummary(`${OPENING} Gostaria de conversar sobre ${subject.charAt(0).toLowerCase() + subject.slice(1)}.`);
  return sanitizeSummary(`${OPENING} Gostaria de conversar com a equipe.`);
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
