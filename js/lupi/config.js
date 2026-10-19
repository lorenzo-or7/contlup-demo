/* Configuração pública da Lupi (vai para o navegador: NUNCA coloque chaves aqui).
   O endereço da API vem da tag <meta name="lupi-api" content="https://..."> do index.html.
   Sem endereço, a Lupi funciona no "modo básico" (fluxos guiados e respostas aprovadas, sem IA). */

export function readConfig(doc = globalThis.document) {
  const meta = doc?.querySelector?.('meta[name="lupi-api"]');
  const apiUrl = (meta?.content || '').trim().replace(/\/+$/, '');
  return {
    apiUrl: /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(apiUrl) ? apiUrl : '',
    whatsapp: '5519997447919',
    requestTimeoutMs: 25000,
    maxInputChars: 500,
    aiHistoryTurns: 8,
    knowledgeUrl: 'data/lupi-knowledge.json',
    flowsUrl: 'data/lupi-flows.json',
  };
}
