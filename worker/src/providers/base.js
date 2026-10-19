/* Contrato comum dos provedores de IA (AIProvider).
   Cada provedor expõe:
     name: 'gemini' | 'openai'
     model: string
     generate({ system, messages, maxOutputTokens, temperature, signal })
       -> Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }>
   e lança ProviderError em qualquer falha. Assim o resto do Worker não sabe qual modelo está em uso. */

export class ProviderError extends Error {
  /** @param {'timeout'|'quota'|'auth'|'http'|'blocked'|'empty'|'network'} kind */
  constructor(kind, status = 0, detail = '') {
    super(`provider_${kind}`);
    this.kind = kind;
    this.status = status;
    this.detail = detail; // só para log interno; nunca vai ao visitante
  }
}

export function httpErrorKind(status) {
  if (status === 429) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  return 'http';
}

export async function postJson(fetchImpl, url, headers, body, signal) {
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === 'AbortError') throw new ProviderError('timeout');
    throw new ProviderError('network');
  }
  if (!res.ok) throw new ProviderError(httpErrorKind(res.status), res.status);
  try { return await res.json(); } catch { throw new ProviderError('empty', res.status, 'json'); }
}
