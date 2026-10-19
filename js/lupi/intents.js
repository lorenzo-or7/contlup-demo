/* Reconhecimento local de intenções (sem IA).
   Junta as entradas aprovadas da base, os gatilhos dos fluxos e alguns comandos de conversa.
   Tolerante a acentos, maiúsculas e pequenos erros de digitação. */

import { normalize, tokens, phraseScore } from './shared/text.js';

export const COMMANDS = {
  handoff: ['falar com a priscila', 'falar com alguem', 'falar com uma pessoa', 'falar com um humano', 'falar com humano',
    'atendimento humano', 'atendente', 'conversar com a priscila', 'chamar a priscila', 'mandar mensagem para a priscila',
    'falar com a contadora', 'quero falar com voces', 'pessoa de verdade'],
  greeting: ['oi', 'ola', 'oie', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'opa', 'hello', 'hey', 'oi lupi', 'ola lupi'],
  thanks: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'brigada', 'agradeco', 'muito obrigado', 'muito obrigada', 'ajudou muito'],
  bye: ['tchau', 'ate mais', 'ate logo', 'falou', 'bye', 'adeus', 'ate a proxima'],
  back: ['voltar', 'volta', 'anterior', 'pergunta anterior'],
  cancel: ['cancelar', 'cancela', 'parar', 'sair do fluxo', 'nao quero mais', 'deixa pra la', 'deixa para la'],
  menu: ['menu', 'inicio', 'opcoes', 'ver opcoes', 'outras opcoes', 'outro assunto', 'mudar de assunto'],
  resume: ['continuar', 'retomar', 'voltar ao fluxo', 'continuar de onde parei'],
};

// comandos curtos só valem quando a mensagem é curta (evita "oi, quanto custa?" virar só um "oi")
const SHORT_ONLY = new Set(['greeting', 'thanks', 'bye', 'back', 'cancel', 'menu', 'resume']);

export function buildIndex(kbEntries, flows) {
  const targets = [];
  for (const e of kbEntries) {
    if (e.status !== 'approved') continue;
    targets.push({ kind: 'kb', id: e.id, group: e.flow || e.id, phrases: (e.keywords || []).map(normalize), priority: !!e.priority });
  }
  for (const f of flows) {
    targets.push({ kind: 'flow', id: f.id, group: f.id, phrases: (f.triggers || []).map(normalize) });
  }
  for (const [id, list] of Object.entries(COMMANDS)) {
    targets.push({ kind: 'command', id, group: 'cmd:' + id, phrases: list.map(normalize), shortOnly: SHORT_ONLY.has(id) });
  }
  return targets;
}

/**
 * @returns {{best: object|null, candidates: object[], ambiguous: boolean, tokens: string[]}}
 *  best/candidates: {kind, id, group, score, strong}
 */
export function detect(index, text) {
  const tt = tokens(text);
  const n = tt.join(' ');
  const found = [];
  if (!tt.length) return { best: null, candidates: [], ambiguous: false, tokens: tt };

  for (const t of index) {
    if (t.shortOnly && tt.length > 4) continue;
    let score = 0, strong = false;
    for (const p of t.phrases) {
      if (!p) continue;
      const words = p.split(' ').length;
      const m = phraseScore(tt, p);
      if (!m) continue;
      const s = m * (1 + 0.6 * (words - 1)) * (p.length >= 4 ? 1 : 0.7);
      const isStrong = n === p || words >= 2 || (p.length >= 5 && tt.length <= 4) || (t.kind === 'command' && tt.length <= 4) || (t.priority && m === 1);
      if (s > score || (s === score && isStrong)) { score = s; strong = isStrong; }
    }
    if (score > 0) found.push({ kind: t.kind, id: t.id, group: t.group, score, strong });
  }

  // um por grupo; no mesmo grupo, fluxo ganha de resposta pronta
  const byGroup = new Map();
  for (const c of found) {
    const cur = byGroup.get(c.group);
    if (!cur || c.score > cur.score || (c.score === cur.score && c.kind === 'flow')) byGroup.set(c.group, c);
  }
  const candidates = [...byGroup.values()].sort((a, b) => b.score - a.score);
  const [a, b] = candidates;
  const ambiguous = !!(a && b && a.strong && b.strong && a.kind !== 'command' && b.kind !== 'command' && b.score >= a.score * 0.7);
  return { best: a || null, candidates, ambiguous, tokens: tt };
}
