/* Detecção e remoção de dados pessoais/sensíveis.
   Usado no navegador (antes de guardar ou enviar qualquer mensagem)
   e de novo no Worker (o servidor não confia no que o navegador manda). */

const PATTERNS = [
  // CNPJ antes do CPF para não ser engolido por ele
  { type: 'cnpj', re: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  { type: 'cpf', re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { type: 'cartao', re: /\b(?:\d[ -]?){13,19}\b/g },
  { type: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'telefone', re: /(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g },
  { type: 'senha', re: /\b(senha|password|pin)\b\s*(?:[:=é]|e|eh)?\s*\S+/gi },
];

export const REDACTED = '[dado removido]';

/** Lista os tipos de dado sensível encontrados no texto. */
export function detectSensitive(text) {
  const found = new Set();
  const s = String(text ?? '');
  for (const { type, re } of PATTERNS) {
    re.lastIndex = 0;
    if (re.test(s)) found.add(type);
  }
  return [...found];
}

/** Substitui dados sensíveis por um marcador neutro. */
export function redact(text) {
  let s = String(text ?? '');
  for (const { re } of PATTERNS) {
    re.lastIndex = 0;
    s = s.replace(re, REDACTED);
  }
  return s;
}

export const SENSITIVE_LABELS = {
  cpf: 'CPF', cnpj: 'CNPJ', cartao: 'número de cartão', email: 'e-mail',
  telefone: 'telefone', senha: 'senha',
};
