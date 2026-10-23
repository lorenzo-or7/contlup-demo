/* Utilitários de texto compartilhados entre o site e o Worker.
   Puro (sem DOM, sem rede) para poder ser testado no Node. */

/** Minúsculas, sem acentos, só letras/números separados por um espaço. */
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s) {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

/** Distância de Levenshtein com corte: devolve max+1 assim que passar do limite. */
export function levenshtein(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Quantos erros de digitação aceitamos para uma palavra desse tamanho. */
export function typoBudget(word) {
  if (word.length >= 8) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

export function wordsMatch(a, b) {
  if (a === b) return true;
  // erros de digitação raramente estão na primeira letra ("caixa" não vira "baixa"); a exceção é o "h" mudo ("orario")
  if (a[0] !== b[0]) return a.replace(/^h/, '') === b.replace(/^h/, '');
  const max = Math.min(typoBudget(a), typoBudget(b));
  return max > 0 && levenshtein(a, b, max) <= max;
}

/**
 * Procura a frase (já normalizada) dentro da lista de tokens do texto.
 * Devolve 1 para correspondência exata, 0.8 para correspondência com erro de digitação, 0 se não achar.
 */
export function phraseScore(textTokens, phrase) {
  const p = phrase.split(' ');
  if (!p.length || p.length > textTokens.length) return 0;
  let best = 0;
  for (let i = 0; i + p.length <= textTokens.length; i++) {
    let exact = true, ok = true;
    for (let k = 0; k < p.length; k++) {
      const t = textTokens[i + k];
      if (t === p[k]) continue;
      exact = false;
      if (!wordsMatch(t, p[k])) { ok = false; break; }
    }
    if (ok) {
      best = Math.max(best, exact ? 1 : 0.8);
      if (best === 1) break;
    }
  }
  return best;
}

export function truncate(s, n) {
  s = String(s ?? '');
  if (s.length <= n) return s;
  return s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}
