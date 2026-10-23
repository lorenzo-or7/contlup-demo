// Bloqueio das respostas em revisão, manutenção das aprovadas e acompanhamento por contexto (sem IA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newConversation, knowledge, flows, memoryStorage, lastBot, chipLabels } from '../support/helpers.mjs';
import { createSessionStore } from '../../js/lupi/session-store.js';
import { TEXT } from '../../js/lupi/conversation.js';
import { buildSystemPrompt } from '../../worker/src/prompt.js';

const approved = knowledge.intents.filter(e => e.status === 'approved');
const pending = knowledge.intents.filter(e => e.status === 'pending_review');
const statusOf = new Map(knowledge.intents.map(e => [e.id, e.status]));
const snippet = (e) => e.answer.slice(0, 60);

// as respostas institucionais e comerciais confirmadas que precisam continuar no ar
const APPROVED_IDS = [
  'inst-contlup', 'inst-priscila', 'inst-publico', 'inst-contato', 'inst-localizacao', 'inst-atendimento', 'inst-horario', 'inst-lupi',
  'inst-privacidade', 'atd-proposta', 'atd-primeira-conversa', 'atd-contratacao', 'com-preco', 'com-condicoes', 'serv-areas', 'serv-contabil',
  'serv-fiscal', 'serv-trabalhista', 'serv-societario', 'serv-bpo', 'planos', 'plano-lup-mei', 'plano-lup-start', 'plano-lup-plus',
  'plano-lup-prime', 'planos-diferencas', 'planos-qual-escolher', 'mei-atende', 'emp-abertura', 'emp-troca', 'rot-saldo-lucro',
  'rot-sobra-caixa', 'rot-margem', 'rot-precificacao', 'duv-emitir-nota',
  // dados oficiais de 23/10/2026: BPO Financeiro e CNPJ
  'bpo-atividades', 'bpo-beneficios', 'bpo-publico', 'bpo-proposta', 'bpo-aprovacao', 'inst-cnpj',
];

/** Nenhum texto pendente em nenhuma mensagem e nenhuma sugestão apontando para pendente. */
function assertNothingPending(c, where = '') {
  const all = c.messages.filter(m => m.role === 'bot').map(m => m.text).join('\n');
  for (const e of pending) assert.ok(!all.includes(snippet(e)), `${where}: texto pendente de ${e.id} apareceu`);
  for (const ch of c.chips) {
    if (ch.action.kind === 'kb') assert.equal(statusOf.get(ch.action.id), 'approved', `${where}: sugestão pendente ${ch.action.id}`);
    for (const e of pending) assert.notEqual(ch.label, e.title, `${where}: título pendente "${e.title}" virou sugestão`);
  }
}

// ---------------- 1. status ----------------
test('[status] 39 respostas contábeis novas em pending_review, com o conteúdo preservado', () => {
  assert.equal(pending.length, 39);
  for (const e of pending) {
    assert.ok(e.answer.length > 40, `${e.id}: conteúdo preservado`);
    assert.ok(e.examples.length && e.keywords.length, `${e.id}: exemplos e palavras-chave preservados`);
    assert.equal(e.review.approvedBy, null, `${e.id}: sem aprovador enquanto pendente`);
    assert.equal(e.review.professionalReview, 'pendente');
  }
});

test('[status] institucionais e comerciais confirmadas continuam aprovadas (lista exata)', () => {
  assert.deepEqual(approved.map(e => e.id).sort(), [...APPROVED_IDS].sort());
  for (const e of approved) assert.ok(e.review.approvedBy, `${e.id}: aprovada com responsável`);
});

// ---------------- 2. bloqueio ----------------
test('[bloqueio] cada pergunta de exemplo de uma resposta pendente recebe só o aviso de revisão (ou uma aprovada do mesmo assunto)', async () => {
  let held = 0, sameSubject = 0;
  for (const e of pending) {
    for (const ex of e.examples) {
      const c = newConversation();
      await c.send(ex);
      const b = lastBot(c);
      if (b.text === TEXT.held) held++;
      else {
        assert.equal(statusOf.get(c.ctx.lastIntent), 'approved', `${e.id} ← "${ex}": deveria ser aviso ou aprovada → "${b.text.slice(0, 60)}"`);
        sameSubject++;
      }
      assertNothingPending(c, `${e.id} ← "${ex}"`);
    }
  }
  assert.ok(held >= 80, `avisos de revisão: ${held} (aprovadas do mesmo assunto: ${sameSubject})`);
});

test('[bloqueio] botão antigo guardado na sessão apontando para pendente não mostra o conteúdo', async () => {
  for (const e of pending) {
    const c = newConversation();
    await c.act({ kind: 'kb', id: e.id }, 'Botão antigo');
    assert.equal(lastBot(c).text, TEXT.held, e.id);
    assertNothingPending(c, e.id);
  }
});

test('[bloqueio] ações das respostas aprovadas nunca levam a pendentes', async () => {
  for (const e of approved) {
    const c = newConversation();
    await c.act({ kind: 'kb', id: e.id });
    assert.notEqual(lastBot(c).text, TEXT.held, `${e.id} respondida`);
    assertNothingPending(c, e.id);
  }
});

test('[bloqueio] "Dúvidas gerais" só lista respostas aprovadas, em todas as categorias', async () => {
  const c = newConversation();
  await c.act({ kind: 'categories' });
  const cats = c.chips.filter(x => x.action.kind === 'category');
  assert.ok(cats.length >= 5);
  for (const cat of cats) {
    await c.act(cat.action, cat.label);
    assertNothingPending(c, cat.label);
    assert.ok(c.chips.some(x => x.action.kind === 'kb'), `${cat.label}: tem ao menos uma aprovada`);
  }
});

test('[bloqueio] fluxos guiados usam o texto neutro no lugar de respostas pendentes', async () => {
  const flowSteps = [];
  for (const f of flows.flows) for (const [id, s] of Object.entries(f.steps)) if (s.kbRef && statusOf.get(s.kbRef) !== 'approved') flowSteps.push([f.id, id, s]);
  assert.ok(flowSteps.length >= 5, 'há passos que dependem de respostas pendentes');
  // percorre cada fluxo por todas as opções do primeiro passo e do seguinte
  for (const f of flows.flows) {
    const first = f.steps[f.start];
    for (let i = 0; i < (first.options || []).length; i++) {
      const c = newConversation();
      await c.act({ kind: 'startFlow', id: f.id });
      await c.act({ kind: 'option', index: i });
      if (c.engine.active) await c.act({ kind: 'option', index: 0 });
      if (c.engine.active) await c.act({ kind: 'option', index: 0 });
      assertNothingPending(c, `${f.id} opção ${i}`);
    }
  }
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'primeiro_atendimento' });
  await c.send('regularizar');
  assert.ok(c.messages.some(m => m.text === flows.flows.find(f => f.id === 'primeiro_atendimento').steps.info_regularizar.fallbackText));
});

test('[bloqueio] desambiguação e "não encontrei" não sugerem pendentes', async () => {
  for (const q of ['trocar de contador e abrir empresa', 'dre e balancete', 'qual a melhor marca de café?', 'lucro', 'nota', 'imposto do mei e folha']) {
    const c = newConversation();
    await c.send(q);
    assertNothingPending(c, q);
  }
});

test('[bloqueio] dois assuntos, um aprovado e um em revisão: confirma só o aprovado e avisa da revisão', async () => {
  for (const [q, ok] of [['Quem é a ContLup e como pago o das?', 'inst-publico'], ['Quem é a ContLup e o que é mei?', 'inst-publico']]) {
    const c = newConversation();
    await c.send(q);
    assert.equal(lastBot(c).text, `${TEXT.confirmOne} ${TEXT.partlyHeld}`, q);
    assert.deepEqual(c.chips.filter(x => x.action.kind === 'kb').map(x => x.action.id), [ok], q);
    assertNothingPending(c, q);
  }
});

test('[bloqueio] encaminhamento depois de um assunto em revisão usa mensagem genérica', async () => {
  const c = newConversation();
  await c.send('como pagar o DAS?');
  assert.equal(lastBot(c).text, TEXT.held);
  await c.act({ kind: 'handoff' });
  const card = c.messages.at(-1);
  assert.equal(card.text, 'Olá! Vim pelo site da ContLup e conversei com a Lupi. Gostaria de conversar com a equipe.');
});

test('[bloqueio] sessão restaurada com assunto pendente no contexto não vaza conteúdo', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('o que é DRE?');
  const c2 = newConversation({ store: createSessionStore(storage) });
  assert.equal(c2.ctx.lastIntent, 'rot-dre');
  await c2.send('e o balancete?');
  assertNothingPending(c2, 'restaurada');
});

test('[bloqueio] o prompt do backend de IA (desligado) também não leva pendentes', () => {
  const p = buildSystemPrompt(knowledge);
  for (const e of pending) assert.ok(!p.includes(`[${e.id}]`), e.id);
  for (const e of approved) assert.ok(p.includes(`[${e.id}]`), e.id);
});

// ---------------- 3. aprovadas mantidas ----------------
test('[aprovadas] cada pergunta de exemplo das aprovadas continua respondida com o texto aprovado', async () => {
  const misses = [];
  for (const e of approved) {
    for (const ex of e.examples) {
      const c = newConversation();
      await c.send(ex);
      const shown = c.messages.filter(m => m.role === 'bot').map(m => m.text).join('\n');
      const b = lastBot(c);
      const answered = b.text !== TEXT.held && !b.fallback; // nem aviso de revisão, nem "não encontrei"
      // se a própria intenção respondeu, o texto aprovado aparece (ou ela abriu o fluxo dela, como "Encontrar um plano")
      const own = c.ctx.lastIntent !== e.id || shown.includes(snippet(e)) || (e.flow && c.engine.active?.flowId === e.flow);
      if (!answered || !own) misses.push(`${e.id} ← "${ex}" → ${c.ctx.lastIntent}`);
    }
  }
  assert.deepEqual(misses, []);
});

// ---------------- 4. contexto ----------------
const run = async (...msgs) => { const c = newConversation(); for (const m of msgs) await c.send(m); return c; };

test('[contexto] DAS: "e se eu atrasar?" e "e se eu esquecer de pagar?" ficam no assunto (em revisão)', async () => {
  const c = await run('como pagar o DAS?', 'e se eu atrasar?');
  assert.equal(c.ctx.lastIntent, 'mei-pendencias');
  assert.equal(lastBot(c).text, TEXT.held);
  await c.send('e se eu esquecer de pagar?');
  assert.equal(c.ctx.lastIntent, 'mei-pendencias');
  await c.send('e a declaração?');
  assert.equal(c.ctx.lastIntent, 'mei-dasn');
  assertNothingPending(c, 'DAS');
});

test('[contexto] DAS + "e quanto custa?": ambíguo, pede confirmação em vez de presumir', async () => {
  const c = await run('como pagar o DAS?', 'e quanto custa?');
  assert.ok(lastBot(c).text.startsWith(TEXT.confirmOne));
  assert.match(lastBot(c).text, new RegExp(TEXT.partlyHeld));
  assert.deepEqual(chipLabels(c), ['Preço do plano Lup MEI', 'Falar com a ContLup']);
  await c.act(c.chips[0].action, c.chips[0].label);
  assert.match(lastBot(c).text, /valores do \*\*Lup MEI\*\* são definidos em proposta/);
});

test('[contexto] MEI: plano, preço do plano e "precisa de contador?"', async () => {
  const c = await run('a ContLup atende MEI?', 'e o plano?');
  assert.equal(c.ctx.lastIntent, 'plano-lup-mei');
  await c.send('e quanto custa?');
  assert.match(lastBot(c).text, /valores do \*\*Lup MEI\*\*/);
  const d = await run('a ContLup atende MEI?', 'e precisa de contador?');
  assert.equal(d.ctx.lastIntent, 'duv-contador-mei');
  assert.equal(lastBot(d).text, TEXT.held);
  const e = await run('a ContLup atende MEI?', 'e quanto custa?');
  assert.ok(lastBot(e).text.startsWith(TEXT.confirmOne), 'MEI + preço: confirma (DAS, abertura ou plano?)');
});

test('[contexto] notas fiscais: "e se eu for MEI?", "e como emito?"', async () => {
  const c = await run('Quando preciso emitir nota fiscal?', 'e se eu for MEI?');
  assert.equal(c.ctx.lastIntent, 'mei-notas');
  assert.equal(lastBot(c).text, TEXT.held);
  const d = await run('Quando preciso emitir nota fiscal?', 'e como emito?');
  assert.equal(d.ctx.lastIntent, 'rot-nota-fiscal');
  assertNothingPending(d, 'notas');
});

test('[contexto] regimes: diferença, plano e imposto (ambíguo → confirma)', async () => {
  const c = await run('o que é simples nacional?', 'e qual a diferença?');
  assert.equal(c.ctx.lastIntent, 'reg-diferencas');
  await c.send('e qual plano?');
  assert.equal(c.ctx.lastIntent, 'planos-qual-escolher');
  const d = await run('o que é simples nacional?', 'e quanto vou pagar de imposto?');
  assert.ok(lastBot(d).text.startsWith(TEXT.confirmOne));
  assert.deepEqual(d.chips.filter(x => x.action.kind === 'kb').map(x => x.action.id), ['com-preco']);
  assertNothingPending(d, 'regimes');
});

test('[contexto] serviços: a sequência de acompanhamentos mantém o assunto', async () => {
  const c = await run('o que é o serviço fiscal?', 'e como contrato?');
  assert.equal(c.ctx.lastIntent, 'atd-contratacao');
  await c.send('e quanto custa?');
  assert.doesNotMatch(lastBot(c).text, /R\$/);
  await c.send('e tem plano?');
  assert.equal(c.ctx.lastIntent, 'planos');
  await c.send('e a proposta?');
  assert.equal(c.ctx.lastIntent, 'atd-proposta');
});

test('[contexto] BPO: atividades, benefícios, público, preço e pagamentos em sequência', async () => {
  const c = await run('O que é BPO financeiro?');
  const seq = [['e quais atividades?', 'bpo-atividades'], ['e os benefícios?', 'bpo-beneficios'], ['e para quem é?', 'bpo-publico'], ['e quanto custa?', 'bpo-proposta'], ['e os pagamentos?', 'bpo-aprovacao']];
  for (const [q, id] of seq) {
    await c.send(q);
    assert.equal(c.ctx.lastIntent, id, q);
  }
  assert.doesNotMatch(c.messages.filter(m => m.role === 'bot').map(m => m.text).join('\n'), /R\$/);
  // "e os planos?" depois do BPO pode ser os planos ContLup ou os planos de BPO: pergunta
  const d = await run('O que é BPO financeiro?', 'e os planos?');
  assert.ok(lastBot(d).text.startsWith(TEXT.followUpWhich), lastBot(d).text);
  assert.deepEqual(d.chips.filter(x => x.action.kind === 'kb').map(x => x.action.id).sort(), ['bpo-proposta', 'planos']);
});

test('[contexto] pergunta nova encerra o assunto anterior; sem contexto, pede esclarecimento', async () => {
  const c = await run('o que é o serviço fiscal?', 'e como contrato?', 'o que é DRE?', 'e a proposta?');
  assert.deepEqual(c.ctx.subject, null, 'pergunta nova encerrou a sequência de serviços');
  assert.notEqual(c.ctx.lastIntent, 'atd-proposta', 'não presume serviços depois de mudar de assunto');
  const d = await run('o que é o lup start?', 'o que é DRE?', 'e quanto custa?');
  assert.doesNotMatch(lastBot(d).text, /Lup Start/, 'não presume o plano visto antes de mudar de assunto');
  const e = await run('e se eu atrasar?');
  assert.equal(lastBot(e).text, TEXT.needContext);
});

test('[contexto] "e para quem é MEI?" depois de um assunto em revisão segue para a versão MEI', async () => {
  const c = await run('como fechar minha empresa?', 'e para quem é MEI?');
  assert.equal(c.ctx.lastIntent, 'mei-baixa');
  assert.equal(lastBot(c).text, TEXT.held);
});

test('[contexto] nada do texto digitado vai para o contexto salvo', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  for (const m of ['como pagar o DAS da minha padaria?', 'e se eu atrasar?', 'e quanto custa?']) await c.send(m);
  const ctx = createSessionStore(storage).load().ctx;
  assert.doesNotMatch(JSON.stringify(ctx), /padaria|atrasar|custa/);
  assert.deepEqual(ctx.subject, ['das', 'mei']);
});
