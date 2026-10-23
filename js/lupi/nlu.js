/* Reconhecimento de intenções da Lupi (determinístico, sem IA).
   Etapas: normalização (Unicode, acentos, caixa, pontuação, espaços) → sinônimos → correspondência por palavras
   inteiras e expressões compostas → pontuação por intenção → exclusões → limiar de confiança → desambiguação.
   Nada aqui usa serviços externos. */

import { normalize, phraseScore, wordsMatch, levenshtein } from './shared/text.js';

/** Palavras que, sozinhas, não bastam para reconhecer um assunto (ex.: "das" é contração e também a guia do MEI). */
export const WEAK_WORDS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma',
  'para', 'pra', 'por', 'com', 'que', 'se', 'ao', 'me', 'eu', 'meu', 'minha', 'voce', 'voces', 'qual', 'quais', 'como', 'quero', 'tem', 'ter',
  'sou', 'e', 'isso', 'esse', 'essa', 'ele', 'ela', 'mais', 'muito', 'sobre', 'quando', 'onde', 'porque', 'pq', 'ou', 'oi', 'ola', 'ai', 'la',
  'nota', 'notas', 'valor', 'folha', 'real', 'simples', 'plano', 'planos', 'abre', 'fecha', 'margem', 'balanco', 'lucro', 'mei', 'servico', 'servicos']);

/** Comandos de conversa. Os "curtos" só valem quando a mensagem é curta (evita "oi, quanto custa?" virar só um "oi"). */
export const COMMANDS = {
  handoff: ['falar com a priscila', 'falar com alguem', 'falar com uma pessoa', 'falar com um humano', 'falar com humano', 'atendimento humano',
    'atendente', 'falar com um atendente', 'falar com atendente', 'quero um atendente', 'conversar com a priscila', 'chamar a priscila', 'falar com a contadora', 'quero falar com voces', 'pessoa de verdade',
    'falar com a contlup', 'falar com a equipe', 'falar com o comercial', 'falar no whatsapp', 'me chama no whatsapp', 'chamar no whatsapp'],
  greeting: ['oi', 'ola', 'oie', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa', 'hello', 'hey', 'oi lupi', 'ola lupi', 'oi tudo bem', 'tudo bem'],
  thanks: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'brigada', 'agradeco', 'muito obrigado', 'muito obrigada', 'ajudou muito', 'obg'],
  bye: ['tchau', 'ate mais', 'ate logo', 'falou', 'bye', 'adeus', 'ate a proxima'],
  back: ['voltar', 'volta', 'anterior', 'pergunta anterior'],
  cancel: ['cancelar', 'cancela', 'parar', 'sair do fluxo', 'nao quero mais', 'deixa pra la', 'deixa para la'],
  menu: ['menu', 'menu principal', 'voltar ao menu', 'inicio', 'opcoes', 'ver opcoes', 'outras opcoes', 'outro assunto', 'mudar de assunto'],
  resume: ['continuar', 'retomar', 'voltar ao fluxo', 'continuar de onde parei'],
  restart: ['reiniciar', 'recomecar', 'comecar de novo', 'limpar conversa', 'reiniciar conversa', 'apagar conversa', 'zerar conversa', 'nova conversa'],
};
const SHORT_ONLY = new Set(['greeting', 'thanks', 'bye', 'back', 'cancel', 'menu', 'resume', 'restart']);

export const MIN_SCORE = 1;          // abaixo disso não há resposta direta
const EXAMPLE_STRONG = 0.8;          // semelhança com uma pergunta de exemplo que basta para responder
const EXAMPLE_PARTIAL = 0.5;         // semelhança que só vale como sugestão
const AMBIGUITY_RATIO = 0.7;         // segundo colocado forte com pelo menos 70% da nota do primeiro = perguntar

/** Cria a função de normalização com sinônimos (aplicados em uma passada, sem reprocessar o resultado). */
export function createNormalizer(synonyms = []) {
  const map = new Map();
  for (const { canonical, variants } of synonyms) {
    const c = normalize(canonical);
    for (const v of variants || []) { const nv = normalize(v); if (nv && !map.has(nv)) map.set(nv, c); }
  }
  if (!map.size) return (t) => normalize(t);
  const alts = [...map.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<= )(${alts.join('|')})(?= )`, 'g');
  return (text) => {
    const n = normalize(text);
    if (!n) return '';
    return (' ' + n + ' ').replace(re, (m) => map.get(m)).replace(/\s+/g, ' ').trim();
  };
}

const content = (toks) => toks.filter(t => !WEAK_WORDS.has(t) || ['mei', 'das', 'nota', 'plano', 'lucro', 'real', 'simples', 'folha', 'balanco', 'margem', 'valor'].includes(t));
/**
 * Procura a expressão nas palavras da mensagem e devolve nota e posição (para resolver sobreposições).
 * 1. sequência exata ou com erro leve de digitação (critério de shared/text.js);
 * 2. dentro de uma expressão em que as outras palavras batem exatamente, aceita 1 erro em palavras de 4 letras ("caxa");
 * 3. ignorando artigos e preposições dos dois lados ("declarar o meu mei" ~ "declarar meu mei"), com nota menor.
 */
function phraseMatch(tt, phrase) {
  const p = phrase.split(' ');
  let best = null;
  const consider = (m) => { if (!best || m.score > best.score) best = m; };
  for (let i = 0; i + p.length <= tt.length; i++) {
    let exact = 0, ok = true, relaxed = false;
    for (let k = 0; k < p.length; k++) {
      const a = tt[i + k], b = p[k];
      if (a === b) { exact++; continue; }
      if (wordsMatch(a, b)) continue;
      if (p.length >= 2 && a.length >= 4 && b.length >= 4 && a[0] === b[0] && levenshtein(a, b, 1) <= 1) { relaxed = true; continue; }
      ok = false; break;
    }
    if (!ok || (relaxed && exact === 0)) continue;
    consider({ score: exact === p.length ? 1 : 0.8, start: i, end: i + p.length });
    if (exact === p.length) return best;
  }
  if (best) return best;
  // sem artigos/preposições: só para expressões com pelo menos duas palavras de conteúdo
  const pc = p.filter(w => !FILLER.has(w));
  if (pc.length === p.length || pc.length < 2 || !pc.some(w => !WEAK_WORDS.has(w))) return null;
  const idx = tt.map((w, i) => [w, i]).filter(([w]) => !FILLER.has(w));
  for (let j = 0; j + pc.length <= idx.length; j++) {
    let ok = true;
    for (let k = 0; k < pc.length; k++) if (!(idx[j + k][0] === pc[k] || wordsMatch(idx[j + k][0], pc[k]))) { ok = false; break; }
    if (ok) return { score: 0.85, start: idx[j][1], end: idx[j + pc.length - 1][1] + 1 };
  }
  return null;
}

/** Artigos, preposições e possessivos que podem variar dentro de uma expressão sem mudar o assunto. */
const FILLER = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'para', 'pra', 'pro', 'ao']);

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / new Set([...A, ...B]).size;
}

/**
 * Monta o índice. Intenções "approved" respondem; as "pending_review" entram só para reconhecer o assunto
 * (held: true): a conversa avisa que está em revisão e nunca mostra o texto, o título nem as ações delas.
 * Rascunhos ("draft") e desativadas ("outdated") ficam de fora.
 * @returns {{norm: Function, targets: object[], intents: Map, held: Map}}
 */
export function buildIndex({ intents = [], flows = [], synonyms = [] } = {}) {
  const norm = createNormalizer(synonyms);
  const targets = [];
  const flowGroup = new Map();
  const active = intents.filter(e => e.status === 'approved');
  const held = intents.filter(e => e.status === 'pending_review');
  for (const e of active) if (e.flow) flowGroup.set(e.flow, e.group || e.flow);
  for (const e of [...active, ...held]) {
    targets.push({
      kind: 'kb', id: e.id, category: e.category, group: e.group || e.flow || e.id, priority: !!e.priority, held: e.status !== 'approved',
      phrases: [...new Set((e.keywords || []).map(norm).filter(Boolean))],
      exclude: (e.exclude || []).map(norm).filter(Boolean),
      examples: (e.examples || []).map(x => content(norm(x).split(' '))),
    });
  }
  for (const f of flows) {
    targets.push({ kind: 'flow', id: f.id, group: flowGroup.get(f.id) || f.id, phrases: (f.triggers || []).map(norm).filter(Boolean), exclude: [], examples: [] });
  }
  for (const [id, list] of Object.entries(COMMANDS)) {
    targets.push({ kind: 'command', id, group: 'cmd:' + id, phrases: list.map(normalize), exclude: [], examples: [], shortOnly: SHORT_ONLY.has(id) });
  }
  return {
    norm, targets,
    intents: new Map(active.map(e => [e.id, e])),
    // só o necessário para o contexto: id e categoria (nada de texto)
    held: new Map(held.map(e => [e.id, { id: e.id, category: e.category }])),
  };
}

/**
 * Pontua o texto contra todas as intenções.
 * @returns {{text: string, tokens: string[], best: object|null, candidates: object[], partial: object[], ambiguous: boolean}}
 *   best: só existe se a correspondência for forte e acima do limiar.
 *   partial: até 3 intenções com correspondência parcial (para sugestões quando não houver resposta).
 */
export function detect(index, text) {
  const n = index.norm(text);
  const tt = n ? n.split(' ') : [];
  const empty = { text: n, tokens: tt, best: null, candidates: [], partial: [], ambiguous: false };
  if (!tt.length) return empty;
  const ct = content(tt);
  const found = [];

  for (const t of index.targets) {
    if (t.shortOnly && tt.length > 4) continue;
    if (t.exclude.some(x => phraseScore(tt, x) === 1)) continue;
    let score = 0, strong = false, span = null;
    for (const p of t.phrases) {
      const words = p.split(' ');
      // palavra fraca sozinha só vale quando é praticamente a mensagem inteira ("DAS?", "o das")
      if (words.length === 1 && WEAK_WORDS.has(p) && t.kind !== 'command' && ct.length > 1) continue;
      const pm = phraseMatch(tt, p);
      if (!pm) continue;
      const m = pm.score;
      let s = m * (1 + 0.6 * (words.length - 1)) * (p.length >= 4 || !WEAK_WORDS.has(p) ? 1 : 0.7);
      if (n === p) s = Math.max(s, 1.2) + 0.5; // a mensagem é exatamente a expressão: decisivo
      // mensagem de uma palavra só, com erro leve de digitação ("balansete"): vale como resposta direta
      else if (words.length === 1 && tt.length === 1 && p.length >= 6 && m < 1) s = Math.max(s, 1.1);
      const isStrong = n === p || words.length >= 2 || (p.length >= 5 && tt.length <= 4) || (t.kind === 'command' && tt.length <= 4) || (t.priority && m === 1) || (words.length === 1 && ct.length <= 1);
      if (s > score || (s === score && isStrong && !strong)) { score = s; strong = isStrong; span = pm; }
    }
    // semelhança com as perguntas de exemplo (ajuda em paráfrases)
    let sim = 0;
    if (ct.length >= 2) for (const ex of t.examples) if (ex.length >= 2) sim = Math.max(sim, similarity(ct, ex));
    if (sim >= EXAMPLE_STRONG && 2.6 > score) { score = 2.6; strong = true; span = null; }
    else if (sim >= EXAMPLE_PARTIAL && score === 0) { score = 0.8; strong = false; }
    if (score > 0) found.push({ kind: t.kind, id: t.id, group: t.group, category: t.category, priority: t.priority, held: !!t.held, score, strong, span });
  }

  // uma por grupo; no mesmo grupo vence a maior nota (resposta pronta ganha de fluxo no empate)
  const byGroup = new Map();
  for (const c of found) {
    const cur = byGroup.get(c.group);
    // no mesmo assunto, o que pode ser respondido (aprovado ou fluxo) ganha do que está em revisão, desde que a correspondência seja forte
    if (cur && cur.held !== c.held) { const [h, a] = cur.held ? [cur, c] : [c, cur]; byGroup.set(c.group, a.strong ? a : h); continue; }
    if (!cur || c.score > cur.score || (c.score === cur.score && c.kind === 'kb' && cur.kind === 'flow')) byGroup.set(c.group, c);
  }
  const sorted = [...byGroup.values()].sort((a, b) => b.score - a.score || (b.priority - a.priority));
  // quem usou as mesmas palavras de uma expressão maior não concorre com ela ("o que é lucro" dentro de "o que é lucro presumido")
  const candidates = sorted.filter((c, i) => !sorted.slice(0, i).some(o => o.span && c.span && o.kind !== 'command' && c.span.start < o.span.end && o.span.start < c.span.end && o.score > c.score));
  const [a, b] = candidates;
  const best = a && a.strong && a.score >= MIN_SCORE ? a : null;
  const decisive = !!(best && best.span && best.span.start === 0 && best.span.end === tt.length && best.score > (b?.score || 0));
  // dois assuntos ligados por "e"/"ou" ("trocar de contador e abrir empresa"): melhor perguntar qual primeiro
  const joined = !!(best && b && b.strong && b.kind !== 'command' && a.kind !== 'command' && a.span && b.span && b.score >= MIN_SCORE
    && (a.span.end <= b.span.start || b.span.end <= a.span.start)
    && tt.slice(Math.min(a.span.end, b.span.end), Math.max(a.span.start, b.span.start)).some(w => w === 'e' || w === 'ou'));
  const ambiguous = joined || !decisive && !!(best && b && b.strong && a.kind !== 'command' && b.kind !== 'command' && b.score >= a.score * AMBIGUITY_RATIO && !(a.priority && !b.priority && a.score > b.score));
  const partial = candidates.filter(c => c.kind === 'kb' && !c.held && c.score >= 0.7).slice(0, 3);
  return { text: n, tokens: tt, best, candidates, partial, ambiguous };
}
