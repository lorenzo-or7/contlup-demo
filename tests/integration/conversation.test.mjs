// Testes de integração do orquestrador da conversa (navegador, sem DOM).
// A IA é um MOCK (mockAI) com respostas programadas: aqui testamos o roteamento, não a qualidade do modelo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newConversation, mockAI, memoryStorage, lastBot, botTexts, chipLabels } from '../support/helpers.mjs';
import { createSessionStore } from '../../js/lupi/session-store.js';
import { TEXT } from '../../js/lupi/conversation.js';

test('[fluxos] saudação inicial com aviso de IA/privacidade e menu', () => {
  const c = newConversation();
  assert.equal(c.messages[0].text, TEXT.greeting);
  assert.equal(c.messages[1].role, 'notice');
  assert.deepEqual(chipLabels(c), ['Conhecer os serviços', 'Abrir uma empresa', 'Trocar de contador', 'Sou MEI', 'Solicitar proposta']);
});

test('[fluxos] fluxo completo pelos chips até o resumo para a Priscila', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'troca_contador' }, 'Trocar de contador');
  await c.act({ kind: 'option', index: 0 });
  await c.act({ kind: 'option', index: 0 });
  await c.act({ kind: 'option', index: 3 });
  assert.match(lastBot(c).text, /não precisa enviar documentos/);
  await c.act({ kind: 'handoff' });
  const card = c.messages.at(-1);
  assert.equal(card.kind, 'handoff');
  assert.match(card.text, /trocar de contador/);
  assert.match(card.text, /busco um atendimento mais próximo/);
});

test('[fluxos] fluxo por texto digitado, com cancelar no meio', async () => {
  const c = newConversation();
  await c.send('sou mei');
  await c.send('sim, já sou MEI');
  assert.match(lastBot(c).text, /A sua dúvida é mais sobre qual assunto/);
  await c.send('cancelar');
  assert.equal(lastBot(c).text, TEXT.cancelled);
  assert.equal(c.engine.active, null);
});

test('[mudança de assunto] pergunta institucional no meio do fluxo pausa e permite retomar', async () => {
  const c = newConversation();
  await c.send('quero abrir uma empresa');
  await c.send('comércio');
  await c.send('qual o horário de atendimento?');
  assert.match(lastBot(c).text, /horários de atendimento ainda não foram publicados/);
  assert.equal(chipLabels(c)[0], 'Continuar: Abrir uma empresa');
  await c.act({ kind: 'resume' });
  assert.match(lastBot(c).text, /já está funcionando/);
  assert.equal(c.engine.active.answers.atividade, 'no comércio', 'resposta anterior preservada');
});

test('[mudança de assunto] começar outro fluxo pausa o atual', async () => {
  const c = newConversation();
  await c.send('quero trocar de contador');
  await c.send('quero abrir uma empresa');
  assert.equal(c.engine.active.flowId, 'abrir_empresa');
  assert.equal(c.suspended.flowId, 'troca_contador');
});

test('[mudança de assunto] "voltar" no fluxo volta uma etapa', async () => {
  const c = newConversation();
  await c.send('quero abrir uma empresa');
  await c.send('1');
  await c.send('voltar');
  assert.equal(c.engine.active.stepId, 'atividade');
});

test('[ambíguas] duas intenções pedem para escolher', async () => {
  const c = newConversation();
  await c.send('trocar de contador e abrir empresa');
  assert.equal(lastBot(c).text, TEXT.ambiguous);
  assert.ok(chipLabels(c).includes('Trocar de contador'));
  assert.ok(chipLabels(c).includes('Abrir uma empresa'));
});

test('[institucional] respostas aprovadas funcionam sem IA', async () => {
  const c = newConversation();
  for (const [q, re] of [
    ['quem é a Priscila?', /mais de 20 anos de experiência/],
    ['qual o e-mail de contato?', /contato@contlup\.com\.br/],
    ['onde fica o escritório?', /Pedreira\/SP/],
    ['vocês atendem MEI?', /atende MEI/],
    ['quais as áreas de atuação?', /quatro áreas/],
  ]) {
    await c.send(q);
    const all = botTexts(c).slice(-3).join('\n');
    assert.match(all, re, q);
  }
});

test('[comercial inexistente] desconto, prazo e preço não são inventados', async () => {
  const ai = mockAI();
  const c = newConversation({ ai });
  for (const q of ['vocês dão desconto no primeiro mês?', 'quanto custa a contabilidade?', 'qual o horário de atendimento?']) {
    await c.send(q);
    assert.doesNotMatch(lastBot(c).text, /R\$|\d+%|\d{1,2}h/, q);
  }
  assert.equal(ai.calls.length, 0, 'respondido pela base aprovada, sem IA');
});

test('[perguntas livres] pergunta aberta vai para a IA com o histórico limitado', async () => {
  const ai = mockAI({ replies: [{ reply: 'Margem é a diferença entre preço e custo.', topic: 'margem', suggestions: ['Como calcular?'] }] });
  const c = newConversation({ ai });
  await c.send('qual a diferença entre margem e markup no varejo de roupas?');
  assert.equal(ai.calls.length, 1);
  const sent = ai.calls[0].messages;
  assert.equal(sent.at(-1).role, 'user');
  assert.equal(sent[0].role, 'user', 'histórico começa pelo visitante (saudação não vai)');
  assert.equal(lastBot(c).source, 'ai');
  assert.ok(chipLabels(c).includes('Como calcular?'));
});

test('[contexto] a IA recebe as mensagens anteriores da conversa', async () => {
  const ai = mockAI({ replies: [{ reply: 'Entendi, uma padaria.' }, { reply: 'Para padaria, a margem...' }] });
  const c = newConversation({ ai });
  await c.send('tenho uma padaria e penso em contratar alguém novo');
  await c.send('e isso muda alguma coisa nos custos?');
  const second = ai.calls[1].messages.map(m => m.content);
  assert.ok(second.some(t => /padaria/.test(t)));
  assert.ok(second.some(t => t === 'Entendi, uma padaria.'));
});

test('[contexto] histórico enviado à IA é limitado', async () => {
  const ai = mockAI();
  const c = newConversation({ ai });
  for (let i = 0; i < 14; i++) await c.send(`pergunta aberta número ${i} sobre contabilidade de restaurantes`);
  const last = ai.calls.at(-1).messages;
  assert.ok(last.length <= 16, `enviou ${last.length}`);
  assert.match(last.at(-1).content, /número 13/);
});

test('[privacidade] CPF é removido antes de guardar e de enviar, com aviso', async () => {
  const ai = mockAI();
  const store = createSessionStore(memoryStorage());
  const c = newConversation({ ai, store });
  await c.send('meu cpf é 123.456.789-09, posso abrir um MEI de doces?');
  assert.ok(c.messages.some(m => m.role === 'notice' && /removi CPF/.test(m.text)));
  assert.doesNotMatch(JSON.stringify(store.load()), /123\.456/);
  assert.doesNotMatch(JSON.stringify(ai.calls), /123\.456/);
});

test('[privacidade] mensagem só com dado sensível não segue adiante', async () => {
  const ai = mockAI();
  const c = newConversation({ ai });
  await c.send('123.456.789-09');
  assert.equal(c.messages.at(-1).text, TEXT.onlySensitive);
  assert.equal(ai.calls.length, 0);
});

test('[fallback] sem IA configurada: modo básico honesto, fluxos continuam', async () => {
  const c = newConversation({ ai: mockAI({ configured: false }) });
  await c.send('qual a diferença entre lucro presumido e lucro real para clínicas?');
  const b = lastBot(c);
  assert.equal(b.fallback, 'not_configured');
  assert.equal(b.text, TEXT.basicMode);
  assert.notEqual(b.source, 'ai', 'não finge que a IA respondeu');
  await c.act({ kind: 'startFlow', id: 'mei' });
  assert.equal(c.engine.active.flowId, 'mei');
});

for (const reason of ['timeout', 'network', 'unavailable', 'budget']) {
  test(`[fallback] falha "${reason}" da IA: mensagem discreta, opções e encaminhamento`, async () => {
    const c = newConversation({ ai: mockAI({ fail: reason }) });
    await c.send('qual a diferença entre lucro presumido e lucro real para clínicas?');
    const b = lastBot(c);
    assert.equal(b.text, TEXT.temporary);
    assert.doesNotMatch(b.text, /erro \d|exception|stack|undefined/i);
    assert.ok(chipLabels(c).includes('Falar com a Priscila'));
    if (reason !== 'budget') assert.equal(chipLabels(c)[0], 'Tentar de novo');
    assert.equal(c.busy, false, 'chat não fica travado');
  });
}

test('[limites] limite de requisições: mensagem específica', async () => {
  const c = newConversation({ ai: mockAI({ fail: 'rate_limited' }) });
  await c.send('qual a diferença entre lucro presumido e lucro real para clínicas?');
  assert.equal(lastBot(c).text, TEXT.rateLimited);
});

test('[fallback] cliente de IA que lança exceção não trava o chat', async () => {
  const ai = { configured: true, available: true, offReason: '', async ask() { throw new Error('boom'); } };
  const c = newConversation({ ai });
  await c.send('pergunta aberta qualquer sobre contabilidade de academias');
  assert.equal(lastBot(c).text, TEXT.temporary);
  assert.equal(c.busy, false);
});

test('[whatsapp] encaminhamento exige confirmação e usa o link oficial', async () => {
  const c = newConversation({ ai: mockAI({ replies: [{ reply: 'Depende do caso.', needsHuman: true, topic: 'regime para clínica odontológica' }] }) });
  await c.send('qual regime é melhor para minha clínica odontológica?');
  assert.equal(chipLabels(c)[0], 'Preparar resumo para a Priscila', 'IA indicou atendimento humano: sugestão em destaque');
  await c.send('quero falar com a Priscila');
  const card = c.messages.at(-1);
  assert.equal(card.kind, 'handoff');
  assert.equal(card.state, 'draft', 'nada é aberto antes da confirmação');
  assert.match(card.text, /regime para clínica odontológica/);
  const r = c.confirmHandoff(card.id, card.text + ' Obrigada!');
  assert.equal(r.ok, true);
  assert.match(r.link, /^https:\/\/wa\.me\/5519997447919\?text=/);
  assert.match(decodeURIComponent(r.link), /Obrigada!$/);
  assert.equal(card.state, 'opened');
});

test('[whatsapp] resumo editado com CPF pede confirmação extra; vazio é recusado', async () => {
  const c = newConversation();
  await c.act({ kind: 'handoff' });
  const card = c.messages.at(-1);
  assert.equal(c.confirmHandoff(card.id, '   ').error, 'empty');
  const r = c.confirmHandoff(card.id, 'meu cpf 123.456.789-09');
  assert.equal(r.ok, false);
  assert.deepEqual(r.sensitive, ['cpf']);
  assert.equal(c.confirmHandoff(card.id, 'meu cpf 123.456.789-09', { force: true }).ok, true);
});

test('[whatsapp] proposta concluída abre o resumo automaticamente; descartar não envia nada', async () => {
  const c = newConversation();
  await c.act({ kind: 'startFlow', id: 'proposta' });
  await c.act({ kind: 'option', index: 1 });
  await c.act({ kind: 'option', index: 0 });
  await c.send('Tenho uma loja de bairro');
  const card = c.messages.at(-1);
  assert.equal(card.kind, 'handoff');
  assert.match(card.text, /proposta para abrir uma empresa/);
  assert.match(card.text, /Detalhe: Tenho uma loja de bairro\./);
  c.cancelHandoff(card.id);
  assert.equal(card.state, 'cancelled');
});

test('[whatsapp] sem fluxo nem IA, resumo usa a última pergunta relevante (sem dados pessoais)', async () => {
  const c = newConversation();
  await c.send('preciso de ajuda com a contabilidade da minha clínica, tel (19) 98888-7777');
  await c.send('falar com a Priscila');
  const card = c.messages.at(-1);
  assert.match(card.text, /contabilidade da minha clínica/);
  assert.doesNotMatch(card.text, /98888|dado removido/);
});

test('[histórico] conversa e fluxo em andamento são restaurados após recarregar', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('quero abrir uma empresa');
  await c.send('comércio');
  const n = c.messages.length;
  const c2 = newConversation({ store: createSessionStore(storage) });
  assert.equal(c2.messages.length, n);
  assert.equal(c2.engine.active.stepId, 'funcionando');
  await c2.send('ainda não, estou planejando');
  assert.equal(c2.engine.active.stepId, 'formalizacao');
  assert.ok(new Set(c2.messages.map(m => m.id)).size === c2.messages.length, 'ids únicos após restaurar');
});

test('[histórico] reiniciar apaga a sessão e recomeça', async () => {
  const storage = memoryStorage();
  const c = newConversation({ store: createSessionStore(storage) });
  await c.send('quero abrir uma empresa');
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

test('[erros de digitação] fluxo e base respondem mesmo com erros', async () => {
  const c = newConversation();
  await c.send('quero trocar de contadr');
  assert.equal(c.engine.active?.flowId, 'troca_contador');
});

test('[conversa] mensagem longa é cortada no limite e vazia é ignorada', async () => {
  const ai = mockAI();
  const c = newConversation({ ai });
  const n = c.messages.length;
  await c.send('   ');
  assert.equal(c.messages.length, n);
  await c.send('pergunta aberta sobre contabilidade '.repeat(40));
  assert.ok(c.messages.find(m => m.role === 'user').text.length <= 500);
});
