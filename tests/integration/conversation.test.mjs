// Testes de integração do orquestrador da conversa (sem DOM).
// No site a Lupi funciona sem IA: newConversation() cria a conversa sem cliente de IA.
// O caminho de IA continua existindo para o futuro e é testado à parte com um MOCK (mockAI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newConversation, mockAI, memoryStorage, lastBot, botTexts, chipLabels } from '../support/helpers.mjs';
import { createSessionStore } from '../../js/lupi/session-store.js';
import { TEXT, MENU } from '../../js/lupi/conversation.js';
import { BPO, BPO_FORBIDDEN, stripOfficial } from '../support/official.mjs';

const WA = 'https://wa.me/5519971310182?text=';

test('[início] saudação, aviso de privacidade e menu principal', () => {
  const c = newConversation();
  assert.equal(c.messages[0].text, TEXT.greeting);
  assert.equal(c.messages[1].role, 'notice');
  assert.equal(c.messages[1].text, TEXT.disclaimer);
  assert.deepEqual(chipLabels(c), ['Encontrar um plano', 'Conhecer os planos', 'Conhecer os serviços', 'Primeiro atendimento', 'Dúvidas gerais']);
  assert.deepEqual(chipLabels(c), MENU.map(m => m.label));
});

test('[fluxos] "Encontrar um plano": Simples + relatórios indica o Lup Plus e prepara a mensagem', async () => {
  const c = newConversation();
  await c.act(MENU[0].action, MENU[0].label);
  assert.equal(c.engine.active.flowId, 'encontrar_plano');
  await c.send('tenho empresa');
  await c.send('simples nacional');
  await c.act({ kind: 'option', index: 1 }); // acompanhamento com relatórios
  assert.ok(botTexts(c).some(t => /Lup Plus/.test(t) && /podem? combinar/.test(t)), 'indicação preliminar');
  assert.ok(botTexts(c).some(t => /preliminar/i.test(t)), 'deixa claro que é uma indicação preliminar');
  assert.ok(chipLabels(c).includes('Ver o Lup Plus'));
  await c.act({ kind: 'handoff' });
  const card = c.messages.at(-1);
  assert.equal(card.kind, 'handoff');
  assert.equal(card.text, 'Olá! Gostaria de saber mais sobre o plano Lup Plus.');
  assert.equal(c.confirmHandoff(card.id).link, WA + encodeURIComponent(card.text));
});

test('[fluxos] "Encontrar um plano": MEI indica o Lup MEI; quem não tem empresa vai para a abertura', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'encontrar_plano' });
  await c.send('sou MEI');
  assert.ok(botTexts(c).some(t => /Lup MEI/.test(t)));
  await c.act({ kind: 'handoff' });
  assert.equal(c.messages.at(-1).text, 'Olá! Gostaria de saber mais sobre o plano Lup MEI.');

  const d = newConversation();
  await d.act({ kind: 'startFlow', id: 'encontrar_plano' });
  await d.act({ kind: 'option', index: 2 }); // ainda não tenho empresa
  await d.act({ kind: 'handoff' });
  assert.equal(d.messages.at(-1).text, 'Olá! Gostaria de saber mais sobre a abertura de uma empresa.');
});

test('[fluxos] "Primeiro atendimento": regularizar → mensagem pronta', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'primeiro_atendimento' });
  await c.send('regularizar');
  await c.act({ kind: 'handoff' });
  assert.equal(c.messages.at(-1).text, 'Olá! Gostaria de conversar sobre a regularização da minha empresa.');
});

test('[fluxos] "Conhecer os serviços" inclui o BPO Financeiro', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'servicos' });
  assert.ok(chipLabels(c).some(l => /BPO/.test(l)));
});

test('[fluxos] "Dúvidas gerais" lista as categorias e cada categoria lista dúvidas', async () => {
  const c = newConversation();
  await c.act({ kind: 'categories' });
  const labels = chipLabels(c);
  for (const l of ['ContLup', 'Planos', 'Serviços']) assert.ok(labels.some(x => x.includes(l)), l);
  // categoria sem nenhuma resposta aprovada não aparece (hoje: Regimes tributários, toda em revisão)
  assert.ok(!labels.some(x => /Regimes/.test(x)));
  const cat = c.chips.find(x => x.action.kind === 'category' && /ContLup/.test(x.label));
  await c.act(cat.action, cat.label);
  assert.ok(c.chips.filter(x => x.action.kind === 'kb').length >= 3);
});

test('[fluxos] número digitado escolhe a sugestão; no fluxo, escolhe a opção', async () => {
  const c = newConversation();
  await c.send('quero abrir uma empresa');
  const n = botTexts(c).length;
  await c.send('1'); // "Responder 4 perguntas rápidas"
  assert.equal(c.engine.active?.flowId, 'abrir_empresa');
  assert.equal(botTexts(c).slice(n).filter(t => /do primeiro passo ao CNPJ/.test(t)).length, 0, 'não repete a explicação que acabou de mostrar');
  await c.send('comércio');
  await c.send('1');
  assert.equal(c.engine.active.stepId, 'formalizacao');
});

test('[fluxos] voltar, cancelar e "nada para cancelar"', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'abrir_empresa' });
  await c.send('1');
  await c.send('voltar');
  assert.equal(c.engine.active.stepId, 'atividade');
  await c.send('cancelar');
  assert.equal(lastBot(c).text, TEXT.cancelled);
  assert.equal(c.engine.active, null);
  await c.send('cancelar');
  assert.equal(lastBot(c).text, TEXT.nothingToCancel);
});

test('[mudança de assunto] pergunta no meio do fluxo pausa e permite retomar', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'abrir_empresa' });
  await c.send('comércio');
  await c.send('qual o horário de atendimento?');
  assert.match(lastBot(c).text, /horários de atendimento ainda não foram publicados/);
  assert.match(chipLabels(c)[0], /^Continuar:/);
  await c.act({ kind: 'resume' });
  assert.match(lastBot(c).text, /já está funcionando/);
  assert.equal(c.engine.active.answers.atividade, 'no comércio', 'resposta anterior preservada');
});

test('[mudança de assunto] começar outro fluxo pausa o atual', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'troca_contador' });
  await c.act({ kind: 'startFlow', id: 'abrir_empresa' });
  assert.equal(c.engine.active.flowId, 'abrir_empresa');
  assert.equal(c.suspended.flowId, 'troca_contador');
});

test('[reiniciar] comando "recomeçar" apaga a conversa e o contexto', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('o que é o lup start?');
  assert.equal(c.ctx.plan, 'lup-start');
  await c.send('recomeçar');
  assert.equal(c.ctx.plan, null);
  assert.equal(c.ctx.lastIntent, null);
  assert.equal(c.messages[0].text, TEXT.greeting);
  assert.ok(c.messages.some(m => m.role === 'notice' && m.text === TEXT.restarted));
});

test('[ambíguas] dois assuntos na mesma frase pedem para escolher', async () => {
  const c = newConversation();
  await c.send('trocar de contador e abrir empresa');
  assert.equal(lastBot(c).text, TEXT.ambiguous);
  assert.ok(c.chips.length >= 3);
});

test('[contexto] acompanhamento de um plano: preço, inclui, comparação, público e contato', async () => {
  const c = newConversation();
  await c.send('o que é o lup start?');
  await c.send('E quanto custa?');
  assert.match(lastBot(c).text, /valores do \*\*Lup Start\*\* são definidos em proposta/);
  assert.doesNotMatch(lastBot(c).text, /R\$/);
  await c.send('Esse plano inclui folha?');
  assert.match(lastBot(c).text, /^Sim\. O \*\*Lup Start\*\* inclui:/);
  assert.match(lastBot(c).text, /Folha de pagamento/);
  await c.send('Qual a diferença para o outro?');
  assert.equal(lastBot(c).text, TEXT.whichOther('Lup Start'));
  await c.act({ kind: 'compare', a: 'lup-start', b: 'lup-plus' }, 'Lup Plus');
  assert.match(lastBot(c).text, /Lup Plus/);
  await c.send('E para quem é MEI?');
  assert.match(lastBot(c).text, /Para \*\*MEI\*\*[\s\S]*Lup MEI/);
  await c.send('Como falo com vocês?');
  assert.match(lastBot(c).text, /\(19\) 97131-0182/);
});

test('[contexto] "o outro" compara com o plano visto antes', async () => {
  const c = newConversation();
  await c.send('lup plus');
  await c.send('e o lup prime?');
  await c.send('qual a diferença para o outro?');
  const t = lastBot(c).text;
  assert.match(t, /Lup Plus/);
  assert.match(t, /Lup Prime/);
});

test('[contexto] Lup MEI não inclui folha: diz isso e mostra quais planos incluem', async () => {
  const c = newConversation();
  await c.send('plano lup mei');
  await c.send('esse plano inclui folha de pagamento?');
  assert.match(lastBot(c).text, /não aparece entre os benefícios informados do \*\*Lup MEI\*\*/);
  assert.match(lastBot(c).text, /Lup Start/);
});

test('[contexto] sem contexto suficiente, a Lupi pergunta em vez de inventar', async () => {
  const c = newConversation();
  await c.send('esse plano inclui folha?');
  assert.equal(lastBot(c).text, TEXT.whichPlan);
  const d = newConversation();
  await d.send('e quanto custa?');
  assert.doesNotMatch(lastBot(d).text, /R\$|\d+,\d{2}/);
});

test('[contexto] nunca guarda o texto digitado no contexto da sessão', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('minha padaria fatura bastante, o lup start serve?');
  const saved = createSessionStore(storage).load();
  assert.doesNotMatch(JSON.stringify(saved.ctx), /padaria/);
  assert.deepEqual(Object.keys(saved.ctx).sort(), ['lastIntent', 'plan', 'prevPlan', 'subject', 'topic', 'unknownStreak']);
});

test('[desconhecidas] não inventa, sugere no máximo 3 assuntos e escala para o contato', async () => {
  const c = newConversation();
  await c.send('qual a melhor marca de café para o escritório?');
  assert.ok(TEXT.unknown.some(u => lastBot(c).text.startsWith(u)));
  assert.ok(c.chips.filter(x => x.action.kind === 'kb').length <= 3);
  assert.ok(chipLabels(c).includes('Falar com a ContLup'));
  await c.send('quem ganhou o jogo ontem?');
  assert.match(lastBot(c).text, new RegExp(TEXT.unknownEscalate.slice(0, 40)));
  const texts = botTexts(c).slice(-2);
  assert.notEqual(texts[0], texts[1], 'não repete a mesma frase');
});

test('[comercial] preço, desconto e prazos não são inventados; BPO só com o que foi confirmado', async () => {
  const c = newConversation();
  for (const q of ['quanto custa o plano prime por mês?', 'o que exatamente o BPO financeiro faz?', 'quanto custa o BPO?', 'tem desconto no lup plus?', 'quanto custa a contabilidade?', 'qual o horário de atendimento?']) {
    await c.send(q);
    const t = stripOfficial(botTexts(c).slice(-2).join('\n'));
    assert.doesNotMatch(t, /R\$|\d+\s?%|\d{1,2}h/, q);
    assert.doesNotMatch(t, BPO_FORBIDDEN, q);
  }
});

test('[ressalva] resposta aprovada sujeita a mudança legal mostra a ressalva', async () => {
  const c = newConversation();
  await c.send('Quando preciso emitir nota fiscal?');
  assert.equal(c.ctx.lastIntent, 'duv-emitir-nota');
  assert.equal(lastBot(c).caveat, TEXT.caveat);
});

test('[aconselhamento] caso específico sobre assunto em revisão: só o aviso, sem resposta', async () => {
  const c = newConversation();
  await c.send('qual regime é melhor para minha clínica?');
  assert.equal(lastBot(c).text, TEXT.held);
});

test('[institucional] respostas aprovadas', async () => {
  const c = newConversation();
  for (const [q, re] of [
    ['quem é a Priscila?', /mais de 20 anos de experiência/],
    ['qual o e-mail de contato?', /contato@contlup\.com\.br/],
    ['onde fica o escritório?', /Pedreira\/SP/],
    ['vocês atendem MEI?', /atende MEI/],
    ['quais serviços vocês oferecem?', /BPO Financeiro/],
    ['qual o whatsapp comercial?', /\(19\) 97131-0182/],
  ]) {
    await c.send(q);
    assert.match(botTexts(c).slice(-3).join('\n'), re, q);
  }
});

test('[privacidade] CPF é removido antes de guardar, com aviso; só dado sensível não segue', async () => {
  const store = createSessionStore(memoryStorage());
  const c = newConversation({ store });
  await c.send('meu cpf é 123.456.789-09, posso abrir um MEI de doces?');
  assert.ok(c.messages.some(m => m.role === 'notice' && /removi CPF/.test(m.text)));
  assert.doesNotMatch(JSON.stringify(store.load()), /123\.456/);
  await c.send('123.456.789-09');
  assert.equal(c.messages.at(-1).text, TEXT.onlySensitive);
});

test('[whatsapp] encaminhamento exige confirmação; mensagem nunca leva o texto livre do visitante', async () => {
  const c = newConversation();
  await c.send('preciso de ajuda com a contabilidade da minha clínica, tel (19) 98888-7777');
  await c.send('quero falar com a ContLup');
  const card = c.messages.at(-1);
  assert.equal(card.kind, 'handoff');
  assert.equal(card.state, 'draft', 'nada é aberto antes da confirmação');
  assert.doesNotMatch(card.text, /clínica|98888|dado removido/);
  assert.equal(card.text, 'Olá! Vim pelo site da ContLup e conversei com a Lupi. Gostaria de conversar com a equipe.');
  const r = c.confirmHandoff(card.id, card.text + ' Obrigada!');
  assert.equal(r.ok, true);
  assert.equal(r.link, WA + encodeURIComponent(card.text));
  assert.match(decodeURIComponent(r.link), /Obrigada!$/);
});

test('[whatsapp] mensagem do assunto: BPO e abertura de empresa', async () => {
  const c = newConversation();
  await c.send('vocês fazem BPO financeiro?');
  await c.act({ kind: 'handoff' });
  assert.equal(c.messages.at(-1).text, BPO.message);
  const d = newConversation();
  await d.send('como abrir uma empresa?');
  await d.act({ kind: 'handoff' });
  assert.equal(d.messages.at(-1).text, 'Olá! Gostaria de conversar sobre a abertura de uma empresa.');
});

test('[whatsapp] plano escolhido no fluxo "Conhecer os planos"', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'planos' }, 'Conhecer os planos');
  await c.act({ kind: 'option', index: 3 }); // Lup Prime
  assert.ok(botTexts(c).some(t => /Inclui todos os benefícios do \*\*Lup Plus\*\*/.test(t)));
  await c.act({ kind: 'handoff' }, 'Tenho interesse');
  const card = c.messages.at(-1);
  assert.equal(card.text, 'Olá! Tenho interesse no plano Lup Prime da ContLup e gostaria de saber mais informações.');
  assert.equal(c.confirmHandoff(card.id).link, WA + encodeURIComponent(card.text));
});

test('[whatsapp] resumo editado com CPF pede confirmação extra; vazio é recusado; descartar não envia', async () => {
  const c = newConversation();
  await c.act({ kind: 'handoff' });
  const card = c.messages.at(-1);
  assert.equal(c.confirmHandoff(card.id, '   ').error, 'empty');
  const r = c.confirmHandoff(card.id, 'meu cpf 123.456.789-09');
  assert.equal(r.ok, false);
  assert.deepEqual(r.sensitive, ['cpf']);
  assert.equal(c.confirmHandoff(card.id, 'meu cpf 123.456.789-09', { force: true }).ok, true);
  await c.act({ kind: 'handoff' });
  const other = c.messages.at(-1);
  c.cancelHandoff(other.id);
  assert.equal(other.state, 'cancelled');
});

test('[histórico] conversa, fluxo e contexto são restaurados após recarregar', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('o que é o lup plus?');
  await c.act({ kind: 'startFlow', id: 'abrir_empresa' });
  await c.send('comércio');
  const n = c.messages.length;
  const c2 = newConversation({ store: createSessionStore(storage) });
  assert.equal(c2.messages.length, n);
  assert.equal(c2.engine.active.stepId, 'funcionando');
  assert.equal(c2.ctx.plan, 'lup-plus');
  await c2.send('ainda não, estou planejando');
  assert.equal(c2.engine.active.stepId, 'formalizacao');
  assert.equal(new Set(c2.messages.map(m => m.id)).size, c2.messages.length, 'ids únicos após restaurar');
});

test('[histórico] reiniciar apaga a sessão e recomeça', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.act({ kind: 'startFlow', id: 'abrir_empresa' });
  c.restart();
  assert.equal(c.engine.active, null);
  assert.equal(c.messages[0].text, TEXT.greeting);
  assert.equal(c.messages.length, 2);
  assert.equal(createSessionStore(storage).load().messages.length, 2);
});

test('[conversa] cumprimento repetido não repete a apresentação completa', async () => {
  const c = newConversation();
  await c.send('oi');
  assert.equal(lastBot(c).text, TEXT.greeting);
  await c.send('quem é a Priscila?');
  await c.send('oi');
  assert.equal(lastBot(c).text, TEXT.greetingAgain);
});

test('[conversa] mensagem longa é cortada no limite e vazia é ignorada', async () => {
  const c = newConversation();
  const n = c.messages.length;
  await c.send('   ');
  assert.equal(c.messages.length, n);
  await c.send('pergunta aberta sobre contabilidade '.repeat(40));
  assert.ok(c.messages.find(m => m.role === 'user').text.length <= 500);
});

test('[conversa] link para uma seção do site emite "navigate"', async () => {
  const c = newConversation();
  const events = [];
  c.on(e => { if (e.type === 'navigate') events.push(e.href); });
  await c.act({ kind: 'link', href: '#planos' }, 'Ver os planos no site');
  assert.deepEqual(events, ['#planos']);
});

// ---- caminho de IA (desligado no site; guardado para o futuro) ----
test('[IA opcional] sem cliente de IA, nenhuma pergunta tenta usar a IA', async () => {
  const c = newConversation();
  assert.equal(c.ai, null);
  await c.send('qual a melhor marca de café para o escritório?');
  assert.notEqual(lastBot(c).source, 'ai');
});

test('[IA opcional] se um dia for ligada, só recebe o que o repertório não cobre', async () => {
  const ai = mockAI({ replies: [{ reply: 'Resposta de teste.', suggestions: ['Outra'] }] });
  const c = newConversation({ ai });
  await c.send('o que é o lup start?');
  assert.equal(ai.calls.length, 0, 'repertório responde sem IA');
  await c.send('qual a melhor marca de café para o escritório?');
  assert.equal(ai.calls.length, 1);
  assert.equal(lastBot(c).source, 'ai');
});

for (const reason of ['timeout', 'network', 'unavailable', 'rate_limited']) {
  test(`[IA opcional] falha "${reason}": mensagem discreta e o chat não trava`, async () => {
    const c = newConversation({ ai: mockAI({ fail: reason }) });
    await c.send('qual a melhor marca de café para o escritório?');
    const b = lastBot(c);
    assert.equal(b.text, reason === 'rate_limited' ? TEXT.rateLimited : TEXT.temporary);
    assert.ok(chipLabels(c).includes('Falar com a ContLup'));
    assert.equal(c.busy, false);
  });
}
