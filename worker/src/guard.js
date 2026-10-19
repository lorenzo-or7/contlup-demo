/* Guardas de segurança no servidor (não dependem só do prompt).
   - Entrada: tentativas óbvias de prompt injection recebem uma resposta fixa, sem chamar a IA.
   - Saída: respostas que inventem preços/alíquotas/valores, prometam resultados, peçam dados sensíveis,
     se passem por humano ou vazem instruções internas são trocadas por uma resposta segura. */

import { normalize } from '../../js/lupi/shared/text.js';
import { redact } from '../../js/lupi/shared/privacy.js';

export const SAFE_REPLY = 'Essa situação precisa de uma análise mais específica para eu não te passar uma orientação incorreta. Posso te ajudar a conversar com a Priscila? 💜';
export const INJECTION_REPLY = 'Não posso compartilhar minhas instruções internas nem mudar a forma como funciono, mas sigo aqui para te ajudar com dúvidas sobre contabilidade e sobre a ContLup. 💜 O que você gostaria de saber?';

const INJECTION = [
  /\b(ignore|ignora|ignorar|desconsidere|desconsidera|esqueca|esqueça|esquece)\b.{0,40}\b(instruc|regra|orienta|prompt|anterior|acima|sistema)/i,
  /\b(revele|revela|mostre|mostra|repita|repete|imprima|imprime|exiba|exibe|liste|cite|copie|vaza|vazar|qual (e|é) (o seu|a sua|seu|sua))\b.{0,60}\b(prompt|instruc|configurac|chave|api ?key|secret|segredo|token)/i,
  /\b(texto|mensagem|conteudo|conteúdo) (acima|anterior|inicial)\b.{0,40}\b(palavra por palavra|na integra|na íntegra|completo)/i,
  /\b(modo|mode)\s+(desenvolvedor|developer|dan|jailbreak|deus|god|admin)\b/i,
  /\bjailbreak\b/i,
  /\b(voce|você) (agora )?(e|é|sera|será) (um|uma|o|a) (outro|outra|nova|novo|ia sem|assistente sem|chatgpt|gpt|gemini|dan)\b/i,
  /\b(act as|pretend to be|you are now|ignore (all|previous|the above)|system prompt|developer message)\b/i,
  /^\s*(system|sistema|assistant|developer)\s*:/im,
  /<\/?(system|instructions?|prompt)>/i,
];

export function detectInjection(text) {
  const t = String(text || '');
  const n = normalize(t);
  return INJECTION.some(re => re.test(t) || re.test(n));
}

// ---------- saída ----------
const MONEY = /R\$\s*\d|\b\d[\d.]*,?\d*\s*(reais|mil reais)\b/i;
const MONEY_CONTEXT = /\b(custa|custo|preco|preço|valor|mensalidade|honorario|honorário|cobra|cobramos|cobrança|plano|pacote|taxa|aliquota|alíquota|imposto|limite|faturamento|teto|desconto|das|multa)\b/i;
const PERCENT = /\b\d+(?:[.,]\d+)?\s?%/;
const PERCENT_CONTEXT = /\b(aliquota|alíquota|imposto|tribut|icms|iss|pis|cofins|irpj|csll|inss|fgts|simples|presumido|desconto|multa|juros|taxa)\b/i;
const BIG_NUMBER_LIMIT = /\b\d{2,3}(?:[.,]\d{3})*(?:\s?mil)?\b.{0,30}\b(limite|teto|por ano|anual|faturamento)\b|\b(limite|teto)\b.{0,30}\b\d{2,3}(?:[.,]\d{3})*(?:\s?mil)?\b/i;
const GUARANTEE = /\b(garant(o|imos|ido|ida)|economia garantida|com certeza (vai|voce vai|você vai) (economizar|pagar menos|reduzir)|sem risco nenhum|100% (seguro|garantido|legal))\b/i;
const HUMAN_CLAIM = /\b(eu sou|sou) (a |uma )?(priscila|humana|pessoa real|pessoa de verdade|contadora|atendente humana)\b|\baqui (e|é) a priscila\b/i;
const ASK_SENSITIVE = /\b(me (envie|envia|passe|passa|informe|informa|mande|manda|diga|diz)|qual (e|é) (o )?seu|preciso (do|da) seu|digite (o )?seu)\b.{0,25}\b(cpf|senha|rg|cartao|cartão|conta bancaria|conta bancária|certificado digital|codigo de acesso|código de acesso)\b/i;
const FAKE_ACCESS = /\b(analisei|verifiquei|consultei|acessei|olhei)\b.{0,25}\b(seus|os seus|sua|seu|o seu|a sua|receita federal|e-?cac|cadastro|cnpj|documentos|extratos|declarac)/i;
const LEAK = /(INSTRUÇÕES INTERNAS|BASE_CONTLUP|<<<|>>>|regras absolutas|system prompt|prompt do sistema|\bsk-[A-Za-z0-9_-]{8,}|\bAIza[0-9A-Za-z_-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,})/i;

export function checkOutput(reply) {
  const r = String(reply || '');
  if (!r.trim()) return { ok: false, reason: 'empty' };
  if (LEAK.test(r)) return { ok: false, reason: 'leak' };
  if (HUMAN_CLAIM.test(r)) return { ok: false, reason: 'human_claim' };
  if (ASK_SENSITIVE.test(r)) return { ok: false, reason: 'asks_sensitive' };
  if (FAKE_ACCESS.test(r)) return { ok: false, reason: 'fake_access' };
  if (GUARANTEE.test(r)) return { ok: false, reason: 'guarantee' };
  for (const sentence of r.split(/(?<=[.!?\n])/)) {
    if (MONEY.test(sentence) && MONEY_CONTEXT.test(sentence)) return { ok: false, reason: 'money' };
    if (PERCENT.test(sentence) && PERCENT_CONTEXT.test(sentence)) return { ok: false, reason: 'rate' };
    if (BIG_NUMBER_LIMIT.test(sentence)) return { ok: false, reason: 'limit_value' };
  }
  return { ok: true };
}

const ALLOWED_URL = [
  /^https:\/\/wa\.me\/5519997447919/,
  /^https:\/\/(www\.)?instagram\.com\/contlupstudiocontabil/,
  /^https:\/\/([a-z0-9-]+\.)*gov\.br(\/|$)/i,
  /^mailto:contato@contlup\.com\.br$/i,
];

/** Remove links que não estão na lista permitida e dados pessoais que a IA tenha repetido. */
export function sanitizeReply(reply) {
  let r = String(reply || '').replace(/\r/g, '').trim();
  r = r.replace(/\[([^\]]{1,120})\]\(([^)\s]+)\)/g, (m, label, url) => (ALLOWED_URL.some(re => re.test(url)) ? m : label));
  r = r.replace(/\bhttps?:\/\/[^\s)]+/g, (url) => (ALLOWED_URL.some(re => re.test(url)) ? url : '[link removido]'));
  // contatos oficiais da ContLup podem aparecer; qualquer outro dado pessoal é removido
  const keep = [];
  r = r.replace(/contato@contlup\.com\.br|\(19\)\s?99744-7919|5519997447919/gi, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  r = redact(r).replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
  return r.length > 1500 ? r.slice(0, 1499).replace(/\s+\S*$/, '') + '…' : r;
}
