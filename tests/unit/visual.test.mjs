// Lupi 3.0: camada visual (estados e poses), testada sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, newConversation } from '../support/helpers.mjs';
import { POSES, STATES, DEFAULT_STATE, FIRST_POSES, POSE_DIR, visualStateFor, poseSrc } from '../../js/lupi/visual.js';

/** Largura e altura de um WebP (cabeçalho VP8X, que é o formato com transparência). */
function webpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 12, 16), 'VP8X', `${file}: WebP com canal alfa`);
  assert.ok(b[20] & 0x10, `${file}: tem transparência`);
  return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
}

test('[poses] as 12 poses existem em 2x e 1x, com transparência e as dimensões declaradas', () => {
  assert.equal(Object.keys(POSES).length, 12);
  for (const [name, [w, h]] of Object.entries(POSES)) {
    assert.deepEqual(webpSize(path.join(ROOT, POSE_DIR, `${name}.webp`)), [w, h], name);
    const [w1, h1] = webpSize(path.join(ROOT, POSE_DIR, `${name}-1x.webp`));
    assert.equal(h1, 170, `${name}-1x: altura 1x`);
    assert.ok(Math.abs(w1 / h1 - w / h) < 0.01, `${name}-1x: proporção preservada`);
    assert.ok(fs.statSync(path.join(ROOT, POSE_DIR, `${name}.webp`)).size < 40000, `${name}: leve`);
  }
});

test('[estados] todo estado usa uma pose existente; passageiros voltam para um estado válido', () => {
  const expected = ['idle', 'welcome', 'thinking', 'explaining', 'finance', 'organize', 'idea', 'notes', 'stepDone', 'handoff', 'doubt', 'celebrate', 'thanks', 'goodbye'];
  assert.deepEqual(Object.keys(STATES), expected);
  for (const [name, s] of Object.entries(STATES)) {
    assert.ok(POSES[s.pose], `${name}: pose ${s.pose}`);
    if (s.then) {
      assert.ok(STATES[s.then], `${name}: volta para ${s.then}`);
      assert.ok(s.after >= 1000 && s.after <= 8000, `${name}: tempo de volta ${s.after}`);
    }
  }
  assert.equal(DEFAULT_STATE, 'idle');
  for (const p of FIRST_POSES) assert.ok(POSES[p], p);
  // nenhum estado fica "preso" num ciclo sem chegar ao idle ou a um estado estável
  for (const name of Object.keys(STATES)) {
    let cur = name, hops = 0;
    while (STATES[cur].then && hops < 5) { cur = STATES[cur].then; hops++; }
    assert.ok(hops < 5, `${name}: ciclo de estados`);
  }
});

test('[estados] mapeamento das mensagens para os estados pedidos', () => {
  const v = (m) => visualStateFor({ role: 'bot', ...m });
  assert.equal(v({ expression: 'welcome' }), 'welcome');
  assert.equal(v({ expression: 'explaining' }), 'explaining');
  assert.equal(v({ expression: 'explaining', intent: 'serv-bpo', category: 'servicos' }), 'finance');
  assert.equal(v({ expression: 'explaining', intent: 'bpo-atividades' }), 'finance');
  assert.equal(v({ expression: 'explaining', intent: 'rot-sobra-caixa' }), 'finance');
  assert.equal(v({ expression: 'explaining', intent: 'plano-lup-start', category: 'planos' }), 'organize');
  assert.equal(v({ expression: 'explaining', intent: 'inst-contato', category: 'contlup' }), 'explaining');
  assert.equal(v({ expression: 'thinking' }), 'doubt', 'ambiguidade: pensativa, não erro');
  assert.equal(v({ expression: 'thinking', fallback: 'unknown' }), 'doubt');
  assert.equal(v({ expression: 'thinking', fallback: 'held' }), 'doubt');
  assert.equal(v({ kind: 'handoff', expression: 'explaining' }), 'handoff');
  assert.equal(v({ expression: 'success' }), 'celebrate');
  assert.equal(v({ expression: 'success', visual: 'thanks' }), 'thanks', 'dica da conversa tem prioridade');
  assert.equal(v({ expression: 'explaining', visual: 'inexistente' }), 'explaining', 'dica desconhecida é ignorada');
  assert.equal(visualStateFor({ role: 'user', text: 'oi' }), null, 'mensagem do visitante não muda a Lupi');
  assert.equal(visualStateFor(null), null);
});

test('[carregamento] 1x para telas comuns, 2x para telas de alta densidade', () => {
  assert.equal(poseSrc('ok', 1), 'img/lupi/poses/ok-1x.webp');
  assert.equal(poseSrc('ok', 2), 'img/lupi/poses/ok.webp');
  assert.equal(poseSrc('ok', 1.25), 'img/lupi/poses/ok-1x.webp');
});

test('[conversa → visual] a conversa marca as mensagens; a camada visual escolhe a pose', async () => {
  const c = newConversation();
  const last = () => [...c.messages].reverse().find(m => m.role === 'bot');
  assert.equal(visualStateFor(c.messages[0]), 'welcome');
  await c.send('O que é BPO financeiro?');
  assert.equal(last().intent, 'serv-bpo');
  assert.equal(visualStateFor(last()), 'finance');
  await c.send('o que é o lup start?');
  assert.equal(visualStateFor(last()), 'organize');
  await c.send('menu');
  assert.equal(visualStateFor(last()), 'idea');
  await c.send('obrigada!');
  assert.equal(visualStateFor(last()), 'thanks');
  await c.send('trocar de contador e abrir empresa');
  assert.equal(visualStateFor(last()), 'doubt');
  await c.send('quero falar com a ContLup');
  assert.equal(visualStateFor(last()), 'handoff');
  await c.send('tchau');
  assert.equal(visualStateFor(last()), 'goodbye');
});

test('[conversa → visual] fluxo guiado: pergunta = anotando; etapa respondida = ok; fim = celebração', async () => {
  const c = newConversation();
  const last = () => [...c.messages].reverse().find(m => m.role === 'bot');
  await c.act({ kind: 'startFlow', id: 'encontrar_plano' });
  assert.equal(visualStateFor(last()), 'notes');
  await c.act({ kind: 'option', index: 1 });
  assert.equal(visualStateFor(last()), 'stepDone');
  await c.send('simples nacional');
  assert.equal(visualStateFor(last()), 'stepDone', 'resposta digitada também conta como etapa');
  await c.act({ kind: 'option', index: 1 });
  const bots = c.messages.filter(m => m.role === 'bot');
  assert.equal(visualStateFor(bots.at(-2)), 'organize', 'indicação de plano usa o checklist');
  assert.equal(visualStateFor(bots.at(-1)), 'celebrate');
  assert.doesNotMatch(bots.at(-1).text, /contratad|contrato fechado|assinad/i, 'celebração não diz que algo foi contratado');
});

test('[privacidade] as marcas visuais só têm ids e nomes de estado, nunca o texto do visitante', async () => {
  const c = newConversation();
  await c.send('minha padaria precisa de BPO financeiro');
  for (const m of c.messages.filter(x => x.role === 'bot')) {
    for (const k of ['intent', 'category', 'visual']) if (m[k] !== undefined) assert.match(m[k], /^[a-z-]+$/i, `${k}: ${m[k]}`);
  }
  assert.doesNotMatch(JSON.stringify(c.messages.filter(x => x.role === 'bot').map(({ intent, category, visual }) => ({ intent, category, visual }))), /padaria/);
});
