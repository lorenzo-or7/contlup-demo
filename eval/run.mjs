#!/usr/bin/env node
/* Avaliação comparativa Gemini x OpenAI para a Lupi.
   - Usa o MESMO pipeline do Worker (worker/src/ai-service.js), as mesmas instruções e a mesma base aprovada.
   - Lê as chaves de .env (nunca do repositório). Provedor sem chave/modelo = "não executado".
   - Não declara vencedor se os dois provedores não forem executados.
   Uso: npm run eval            (todos os provedores configurados)
        npm run eval -- gemini  (só um)
*/
import fs from 'node:fs';
import path from 'node:path';
import { runChat } from '../worker/src/ai-service.js';
import { createProvider } from '../worker/src/providers/index.js';
import { estimateCostUsd } from '../worker/src/config.js';
import { scoreCase, summarize, WEIGHTS } from './score.js';
import { loadEnv, configuredProviders } from '../tests/support/env.mjs';
import { ROOT, knowledge } from '../tests/support/helpers.mjs';

const env = loadEnv();
const wanted = process.argv.slice(2).filter(a => !a.startsWith('-'));
const all = ['gemini', 'openai'];
const ready = configuredProviders(env);
const targets = (wanted.length ? wanted : all);
const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/questions.json'), 'utf8'));

const settings = {
  gemini: { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL, thinkingBudget: env.GEMINI_THINKING_BUDGET !== undefined && env.GEMINI_THINKING_BUDGET !== '' ? Number(env.GEMINI_THINKING_BUDGET) : undefined, priceInPerMTok: num(env.GEMINI_PRICE_INPUT_PER_MTOK), priceOutPerMTok: num(env.GEMINI_PRICE_OUTPUT_PER_MTOK) },
  openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, reasoningEffort: env.OPENAI_REASONING_EFFORT || undefined, priceInPerMTok: num(env.OPENAI_PRICE_INPUT_PER_MTOK), priceOutPerMTok: num(env.OPENAI_PRICE_OUTPUT_PER_MTOK) },
};
const common = {
  kb: knowledge,
  maxOutputTokens: Number(env.MAX_OUTPUT_TOKENS || 700),
  temperature: num(env.AI_TEMPERATURE),
  timeoutMs: Number(env.PROVIDER_TIMEOUT_MS || 20000),
};
function num(v) { return v === undefined || v === '' ? undefined : Number(v); }

const results = { startedAt: new Date().toISOString(), cases: cases.length, weights: WEIGHTS, providers: {} };
const byProvider = {};

for (const name of targets) {
  if (!ready.includes(name)) {
    results.providers[name] = { status: 'não executado', reason: `faltam ${name.toUpperCase()}_API_KEY e/ou ${name.toUpperCase()}_MODEL no .env` };
    console.log(`- ${name}: NÃO EXECUTADO (sem chave ou modelo)`);
    continue;
  }
  const provider = createProvider(name, settings[name]);
  const rows = [];
  const acc = { scores: [], latencies: [], costUsd: 0, tokens: 0 };
  console.log(`- ${name} (${settings[name].model}): ${cases.length} casos`);
  for (const c of cases) {
    const history = [];
    let last = null, latency = 0;
    try {
      for (const turn of c.turns) {
        history.push({ role: 'user', content: turn });
        const t0 = performance.now();
        last = await runChat({ messages: history }, { ...common, provider });
        latency = performance.now() - t0;
        history.push({ role: 'assistant', content: last.reply });
        acc.tokens += (last.usage.inputTokens || 0) + (last.usage.outputTokens || 0);
        acc.costUsd += estimateCostUsd(settings[name], last.usage);
      }
    } catch (e) {
      last = { error: e.kind || e.message };
    }
    const s = scoreCase(c, last);
    acc.scores.push(s);
    if (!last.error && last.calledProvider) acc.latencies.push(latency);
    rows.push({ id: c.id, category: c.category, latencyMs: Math.round(latency), reply: last.raw?.reply ?? last.reply ?? null, needsHuman: last.raw?.needsHuman ?? null, guarded: last.guarded || false, error: last.error || null, score: s });
    process.stdout.write(s.safety === 1 && !last.error ? '.' : 'x');
  }
  process.stdout.write('\n');
  byProvider[name] = acc;
  results.providers[name] = { status: 'executado', model: settings[name].model, tokens: acc.tokens, rows };
}

const executed = Object.keys(byProvider);
if (executed.length) {
  const summary = summarize(byProvider);
  for (const n of executed) results.providers[n].summary = summary[n];
  if (executed.length === all.length) {
    const ranking = executed.sort((a, b) => summary[b].total - summary[a].total);
    results.ranking = ranking;
    results.note = summary[ranking[0]].total === summary[ranking[1]].total ? 'Empate técnico.' : `Melhor desempenho nesta rodada: ${ranking[0]} (${summary[ranking[0]].total} x ${summary[ranking[1]].total}).`;
  } else {
    results.note = 'Comparação incompleta: só um provedor foi executado; nenhum vencedor declarado.';
  }
} else {
  results.note = 'Nenhum provedor executado (sem chaves). Nada foi comparado.';
}

const dir = path.join(ROOT, 'eval/results');
fs.mkdirSync(dir, { recursive: true });
const stamp = results.startedAt.replace(/[:.]/g, '-');
fs.writeFileSync(path.join(dir, `${stamp}.json`), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(dir, `${stamp}.md`), toMarkdown(results));
console.log(`\n${results.note}\nRelatório: eval/results/${stamp}.md`);

function toMarkdown(r) {
  const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
  let md = `# Avaliação Lupi: Gemini x OpenAI\n\nData: ${r.startedAt} · ${r.cases} casos · mesmas instruções, base e mensagens para todos.\n\n`;
  md += `Pesos: segurança e precisão 35% · fidelidade 20% · contexto 15% · clareza/personalidade 15% (heurística) · tempo 10% · custo 5%.\n\n`;
  md += '| Provedor | Status | Modelo | Segurança | Fidelidade | Contexto | Clareza | Latência (mediana) | Custo estimado | Nota |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const [n, p] of Object.entries(r.providers)) {
    if (p.status !== 'executado') { md += `| ${n} | ${p.status} | — | — | — | — | — | — | — | — |\n`; continue; }
    const s = p.summary; const c = s.criteria;
    md += `| ${n} | executado | ${p.model} | ${pct(c.safety)} | ${pct(c.fidelity)} | ${pct(c.context)} | ${pct(c.clarity)} | ${s.medianLatencyMs ? Math.round(s.medianLatencyMs) + ' ms' : '—'} | ${s.costIncluded ? 'US$ ' + s.costUsd.toFixed(4) : 'sem preço configurado'} | **${s.total}** |\n`;
  }
  md += `\n**Conclusão:** ${r.note}\n`;
  if (Object.values(r.providers).some(p => p.summary && !p.summary.costIncluded)) md += '\n> Custo não entrou na nota (preços não configurados no .env); os demais pesos foram reescalados.\n';
  for (const [n, p] of Object.entries(r.providers)) {
    if (!p.rows) continue;
    md += `\n## ${n}: respostas para revisão humana\n\n| Caso | Categoria | Segurança | Observações | Resposta |\n|---|---|---|---|---|\n`;
    for (const row of p.rows) md += `| ${row.id} | ${row.category} | ${row.score.safety ? 'ok' : 'FALHOU'} | ${row.score.notes.join('; ') || '—'} | ${(row.reply || row.error || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
  }
  return md;
}
