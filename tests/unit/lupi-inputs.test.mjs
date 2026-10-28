// Bateria de entradas representativas da Lupi 2.0 (sem IA).
// Cada linha é uma mensagem real que um visitante poderia escrever e o resultado esperado da conversa:
//   intent: id da intenção respondida · flow: fluxo iniciado · amb: pede para escolher · unknown: resposta honesta sem inventar
//   re: trecho que a última resposta precisa ter · no: o que ela não pode ter · setup: mensagens anteriores (contexto)
// Intenção pendente de revisão (pending_review) é reconhecida, mas a Lupi só avisa que o assunto está em revisão:
// o teste exige o aviso e confere, em TODAS as entradas, que nenhum texto pendente aparece.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newConversation, knowledge, fullIntents, flows, lastBot } from '../support/helpers.mjs';
import { buildIndex, detect } from '../../js/lupi/nlu.js';
import { TEXT } from '../../js/lupi/conversation.js';
import { BPO_FORBIDDEN } from '../support/official.mjs';

const NO_PRICE = /R\$\s*\d|\d+\s?%|\d+,\d{2}/;

export const CASES = [
  // ---- perguntas diretas ----
  { q: 'Quem é a ContLup?', intent: 'inst-contlup' },
  { q: 'Quem é a Priscila?', intent: 'inst-priscila' },
  { q: 'Vocês atendem quem?', intent: 'inst-publico' },
  { q: 'Qual o telefone de vocês?', intent: 'inst-contato' },
  { q: 'Onde fica a ContLup?', intent: 'inst-localizacao' },
  { q: 'Como funciona o atendimento?', intent: 'inst-atendimento' },
  { q: 'Qual o horário de atendimento?', intent: 'inst-horario', no: /\d{1,2}h|\d{1,2}:\d{2}/ },
  { q: 'Quem é a Lupi?', intent: 'inst-lupi' },
  { q: 'Vocês guardam meus dados?', intent: 'inst-privacidade' },
  { q: 'Quero uma proposta', intent: 'atd-proposta' },
  { q: 'O que preciso para a primeira conversa?', intent: 'atd-primeira-conversa' },
  { q: 'Como contratar a ContLup?', intent: 'atd-contratacao' },
  { q: 'Quais serviços vocês oferecem?', intent: 'serv-areas', re: /BPO Financeiro/ },
  { q: 'Vocês fazem a parte fiscal?', intent: 'serv-fiscal' },
  { q: 'Vocês cuidam da folha de pagamento dos funcionários?', intent: 'serv-trabalhista' },
  { q: 'Vocês fazem alteração de contrato social?', intent: ['emp-alteracao', 'serv-societario'] },
  { q: 'O que é o BPO financeiro?', intent: 'serv-bpo', re: /terceirização das rotinas financeiras/, no: BPO_FORBIDDEN },
  { q: 'Quais são os planos?', intent: 'planos' },
  { q: 'Qual a diferença entre os planos?', intent: 'planos-diferencas' },
  { q: 'Qual plano devo escolher?', intent: 'planos-qual-escolher' },
  { q: 'O que é MEI?', intent: 'mei-o-que-e' },
  { q: 'Como abrir um MEI?', intent: 'mei-abrir' },
  { q: 'Como pagar o DAS?', intent: 'mei-das' },
  { q: 'Como faço a declaração anual do MEI?', intent: 'mei-dasn' },
  { q: 'MEI precisa emitir nota fiscal?', intent: ['mei-notas', 'duv-emitir-nota'] },
  { q: 'Como dar baixa no MEI?', intent: 'mei-baixa' },
  { q: 'MEI pode ter funcionário?', intent: 'mei-empregado' },
  { q: 'Qual o limite de faturamento do MEI?', intent: 'mei-limite', no: /R\$\s*\d/ },
  { q: 'Quais as obrigações do MEI?', intent: 'mei-obrigacoes' },
  { q: 'Estourei o limite do MEI, e agora?', intent: 'mei-desenquadramento' },
  { q: 'Como abrir uma empresa?', intent: 'emp-abertura' },
  { q: 'Como fechar minha empresa?', intent: 'emp-encerramento' },
  { q: 'Quais documentos preciso para abrir empresa?', intent: 'emp-documentacao' },
  { q: 'O que é Simples Nacional?', intent: 'reg-simples' },
  { q: 'O que é lucro presumido?', intent: 'reg-presumido' },
  { q: 'O que é lucro real?', intent: 'reg-real' },
  { q: 'Qual a diferença entre Simples, Presumido e Real?', intent: 'reg-diferencas' },
  { q: 'O que é pró-labore?', intent: 'rot-pro-labore' },
  { q: 'O que é DRE?', intent: 'rot-dre' },
  { q: 'O que é balancete?', intent: 'rot-balancete' },
  { q: 'Para que serve o balanço patrimonial?', intent: 'rot-balanco' },
  { q: 'O que é fluxo de caixa?', intent: 'rot-fluxo-caixa' },
  { q: 'Faturamento é a mesma coisa que lucro?', intent: 'rot-faturamento-lucro' },
  { q: 'Saldo em conta é lucro?', intent: 'rot-saldo-lucro' },
  { q: 'Por que o dinheiro não sobra no caixa?', intent: 'rot-sobra-caixa' },
  { q: 'Como calcular o preço do meu produto?', intent: 'rot-precificacao' },
  { q: 'O que é margem de lucro?', intent: 'rot-margem' },
  { q: 'Quais são os encargos de um funcionário?', intent: 'rot-encargos' },
  { q: 'Preciso de contador sendo MEI?', intent: 'duv-contador-mei' },
  { q: 'Quero trocar de contador', intent: 'emp-troca' },
  { q: 'Estou com impostos atrasados', intent: 'duv-atraso-impostos' },
  { q: 'Quando preciso emitir nota fiscal?', intent: 'duv-emitir-nota' },
  { q: 'Posso ter CLT e empresa ao mesmo tempo?', intent: 'duv-clt-empresa' },
  { q: 'Como organizar as finanças da empresa?', intent: 'duv-organizar-financas' },

  // ---- BPO Financeiro e dados institucionais oficiais (23/10/2026) ----
  { q: 'Quais atividades o BPO financeiro inclui?', intent: 'bpo-atividades', re: /Gestão de contas a pagar[\s\S]*Acompanhamento financeiro/, no: BPO_FORBIDDEN },
  { q: 'o BPO faz conciliação bancária?', intent: 'bpo-atividades' },
  { q: 'quais as vantagens do BPO?', intent: 'bpo-beneficios', re: /Menor dependência de planilhas/ },
  { q: 'para quem é o BPO financeiro?', intent: 'bpo-publico', re: /pequenas e médias empresas/ },
  { q: 'quero uma proposta de BPO', intent: 'bpo-proposta', re: /\(19\) 97131-0182/, no: NO_PRICE },
  { q: 'quanto custa o BPO?', intent: 'bpo-proposta', no: NO_PRICE },
  { q: 'vocês fazem os pagamentos da minha empresa?', intent: 'bpo-aprovacao', re: /sujeitos à aprovação do cliente/ },
  { q: 'a ContLup mexe na minha conta?', intent: 'bpo-aprovacao', re: /nenhum pagamento é feito sem a sua aprovação/ },
  { q: 'A ContLup atende online?', intent: 'inst-atendimento', re: /100% online/ },
  { q: 'o atendimento é presencial?', intent: 'inst-atendimento', re: /100% online/ },
  { q: 'vocês têm endereço físico?', intent: 'inst-localizacao', re: /não tem endereço físico/ },
  { q: 'posso ir até o escritório?', intent: 'inst-localizacao', re: /não tem endereço físico/ },
  { q: 'Qual é o CNPJ da ContLup?', intent: 'inst-cnpj', re: /68\.970\.978\/0001-10/ },
  { setup: ['o que é BPO financeiro?'], q: 'e quais atividades?', intent: 'bpo-atividades' },
  { setup: ['o que é BPO financeiro?'], q: 'e os pagamentos?', intent: 'bpo-aprovacao' },
  { setup: ['o que é BPO financeiro?'], q: 'e quanto custa?', intent: 'bpo-proposta', no: NO_PRICE },
  { q: 'quero abrir um cnpj', flow: 'abrir_empresa' },

  // ---- sinônimos e outras formas de dizer ----
  { q: 'qual o zap de vocês?', intent: 'inst-contato' },
  { q: 'qual o email?', intent: 'inst-contato', re: /contato@contlup\.com\.br/ },
  { q: 'guia do mei', intent: 'mei-das' },
  { q: 'boleto do MEI', intent: 'mei-das' },
  { q: 'encerrar o MEI', intent: 'mei-baixa' },
  { q: 'cancelar meu cnpj de mei', intent: 'mei-baixa' },
  { q: 'formalizar meu negócio como MEI', intent: 'mei-abrir' },
  { q: 'retirada dos sócios', intent: 'rot-pro-labore' },
  { q: 'demonstração do resultado', intent: 'rot-dre' },
  { q: 'mudar de escritório de contabilidade', intent: 'duv-mudar-contador' },
  { q: 'encargos trabalhistas', intent: 'rot-encargos' },
  { q: 'como precificar', intent: 'rot-precificacao' },

  // ---- sem acentos e caixa alta ----
  { q: 'o que e pro labore', intent: 'rot-pro-labore' },
  { q: 'declaracao anual do mei', intent: 'mei-dasn' },
  { q: 'QUAL O LIMITE DO MEI?', intent: 'mei-limite' },
  { q: 'QUERO ABRIR UMA EMPRESA', intent: 'emp-abertura' },
  { q: 'simples nacional o que e', intent: 'reg-simples' },
  { q: 'Preciso De Contador Sendo Mei', intent: 'duv-contador-mei' },
  { q: 'precificacao', intent: 'rot-precificacao' },
  { q: 'o que e balanco patrimonial', intent: 'rot-balanco' },

  // ---- erros leves de digitação ----
  { q: 'qnto custa a contabilidade?', intent: 'com-preco', no: NO_PRICE },
  { q: 'fluxo de caxa', intent: 'rot-fluxo-caixa' },
  { q: 'qual o orario de atendimento', intent: 'inst-horario' },
  { q: 'trocar de contadr', intent: 'emp-troca' },
  { q: 'declaraçao anual do mei', intent: 'mei-dasn' },
  { q: 'como abro meu mei', intent: 'mei-abrir' },
  { q: 'prolabore', intent: 'rot-pro-labore' },
  { q: 'balansete', intent: 'rot-balancete' },
  { q: 'balanço patrimonal', intent: 'rot-balanco' },
  { q: 'desenquadramemto', intent: 'mei-desenquadramento' },
  { q: 'simpes nacional', intent: 'reg-simples' },
  { q: 'lucro presumdo', intent: 'reg-presumido' },
  { q: 'faturamneto e lucro', intent: 'rot-faturamento-lucro' },

  // ---- desambiguação ----
  { q: 'quero abrir MEI', intent: 'mei-abrir' },
  { q: 'quero dar baixa no MEI', intent: 'mei-baixa' },
  { q: 'pagar DAS', intent: 'mei-das' },
  { q: 'declarar MEI', intent: 'mei-dasn' },
  { q: 'DAS', intent: 'mei-das' },
  { q: 'trocar de contador e abrir empresa', amb: true },
  { q: 'quanto custa abrir uma empresa?', amb: true },

  // ---- preços e condições não publicados ----
  { q: 'Quanto custa?', intent: 'com-preco', no: NO_PRICE },
  { q: 'Qual o valor da mensalidade?', intent: 'com-preco', no: NO_PRICE },
  { q: 'Quanto custa o Lup MEI?', re: /valores do \*\*Lup MEI\*\* são definidos em proposta/, no: NO_PRICE },
  { q: 'qual o preço do plano plus?', re: /valores do \*\*Lup Plus\*\*/, no: NO_PRICE },
  { q: 'Vocês dão desconto?', intent: 'com-condicoes', no: NO_PRICE },
  { q: 'tem fidelidade no lup start?', intent: 'com-condicoes' },
  { q: 'aceitam pix?', intent: 'com-condicoes' },

  // ---- pedidos de orientação específica ----
  { q: 'Qual regime é melhor para minha clínica?', held: true },
  { q: 'Quanto vou pagar de imposto na minha empresa?', held: true, no: NO_PRICE },
  { q: 'Analisa o meu caso: vale a pena sair do MEI?', held: true },
  { q: 'Quando preciso emitir nota fiscal na minha loja?', intent: 'duv-emitir-nota', caveat: true },

  // ---- planos: perguntas diretas ----
  { q: 'O que tem no Lup MEI?', intent: 'plano-lup-mei', re: /DASN-SIMEI/ },
  { q: 'lup start', intent: 'plano-lup-start' },
  { q: 'o que inclui o plano plus?', intent: 'plano-lup-plus' },
  { q: 'plano prime', intent: 'plano-lup-prime' },
  { q: 'lup plus ou lup prime?', re: /Lup Plus[\s\S]*Lup Prime/ },
  { q: 'o lup start inclui folha de pagamento?', re: /^Sim\. O \*\*Lup Start\*\* inclui/ },
  { q: 'o lup mei tem reuniões de acompanhamento?', re: /não aparece entre os benefícios informados do \*\*Lup MEI\*\*/ },
  { q: 'qual plano para empresa do lucro presumido?', re: /Lup Plus[\s\S]*Lup Prime/ },

  // ---- acompanhamento com contexto ----
  { setup: ['o que é o lup start?'], q: 'E quanto custa?', re: /Lup Start/, no: NO_PRICE },
  { setup: ['o que é o lup start?'], q: 'Esse plano inclui folha?', re: /^Sim\. O \*\*Lup Start\*\* inclui/ },
  { setup: ['lup plus', 'lup prime'], q: 'Qual a diferença para o outro?', re: /Lup Plus[\s\S]*Lup Prime|Lup Prime[\s\S]*Lup Plus/ },
  { setup: ['lup start'], q: 'Qual a diferença para o outro?', re: /Comparar o \*\*Lup Start\*\* com qual plano/ },
  { setup: ['quais são os planos?'], q: 'E para quem é MEI?', re: /Lup MEI/ },
  { setup: ['o que é o lup start?'], q: 'Como falo com vocês?', intent: 'inst-contato' },
  { setup: ['lup plus'], q: 'e para quem ele é indicado?', re: /Lup Plus\*\* é para empresas do Simples Nacional e Lucro Presumido/ },
  { setup: ['o que é o DAS?'], q: 'e se eu atrasar o DAS?', intent: 'mei-pendencias' },
  { setup: ['como fechar minha empresa?'], q: 'e para quem é MEI?', intent: 'mei-baixa' },
  { setup: ['o que é DRE?'], q: 'e o balancete?', intent: 'rot-balancete' },
  { q: 'Esse plano inclui folha?', re: new RegExp(TEXT.whichPlan.replace('?', '\\?')) },

  // ---- comandos e mudança de assunto ----
  { q: 'oi', re: /Eu sou a Lupi/ },
  { q: 'obrigada!', re: /Imagina/ },
  { q: 'menu', re: /Posso te ajudar com estes assuntos/ },
  { q: 'quero falar com um atendente', handoff: true },
  { q: 'falar com a ContLup', handoff: true },
  { setup: ['quero encontrar um plano'], q: 'o que é DRE?', intent: 'rot-dre', resume: true },

  // ---- fluxos ----
  { q: 'me ajuda a encontrar um plano', flow: 'encontrar_plano' },
  { q: 'quero conhecer os serviços', flow: 'servicos' },
  { q: 'primeiro atendimento', flow: 'primeiro_atendimento' },
  { q: 'não sei por onde começar', flow: 'primeiro_atendimento' },
  { q: 'sou MEI e tenho uma dúvida', intent: 'mei-atende', re: /Lup MEI/ },

  // ---- desconhecidas (não inventar) ----
  { q: 'qual a melhor marca de café para o escritório?', unknown: true },
  { q: 'quem ganhou o jogo ontem?', unknown: true },
  { q: 'me recomenda um filme', unknown: true },
  { q: 'qual a capital da Austrália?', unknown: true },
  { q: 'asdfgh qwerty', unknown: true },
];

const flowIds = new Set(flows.flows.map(f => f.id));
const statusOf = new Map(knowledge.intents.map(e => [e.id, e.status]));
// trechos de todas as respostas pendentes: nenhum pode aparecer em nenhuma resposta
const HELD_TEXTS = fullIntents.filter(e => e.status !== 'approved').map(e => [e.id, e.answer.slice(0, 60)]);

async function run(c) {
  if (c.setup) for (const s of c.setup) await conv.send(s);
}
let conv;

function outcome(conv, before) {
  const bot = lastBot(conv);
  return {
    bot,
    intent: conv.ctx.lastIntent,
    flow: conv.engine.active?.flowId || null,
    amb: bot.text === TEXT.ambiguous,
    unknown: TEXT.unknown.some(u => bot.text.startsWith(u)),
    handoff: conv.messages.at(-1).kind === 'handoff',
    fresh: conv.messages.length > before,
  };
}

test(`[entradas] bateria com ${CASES.length} mensagens representativas`, async (t) => {
  assert.ok(CASES.length >= 100, `pedido: pelo menos 100 entradas (tem ${CASES.length})`);
  for (const c of CASES) {
    await t.test(`${c.setup ? c.setup.join(' → ') + ' → ' : ''}${c.q}`, async () => {
      conv = newConversation();
      await run(c);
      const n = conv.messages.length;
      await conv.send(c.q);
      const o = outcome(conv, n);
      const where = `→ "${o.bot.text.slice(0, 90)}" (intent=${o.intent}, flow=${o.flow})`;
      if (c.intent) {
        assert.ok([c.intent].flat().includes(o.intent), `esperado ${c.intent} ${where}`);
        if (statusOf.get(o.intent) === 'approved') assert.notEqual(o.bot.fallback, 'held', `aprovada deve ser respondida ${where}`);
        else if (statusOf.has(o.intent)) assert.equal(o.bot.text, TEXT.held, `pendente: só o aviso de revisão ${where}`);
      }
      if (c.held) assert.equal(o.bot.text, TEXT.held, where);
      if (c.flow) { assert.ok(flowIds.has(c.flow)); assert.equal(o.flow, c.flow, where); }
      if (c.amb) assert.equal(o.amb, true, where);
      if (c.unknown) {
        assert.equal(o.unknown, true, where);
        assert.ok(conv.chips.filter(x => x.action.kind === 'kb').length <= 3, 'no máximo 3 sugestões');
        assert.ok(conv.chips.some(x => x.action.kind === 'handoff'), 'oferece contato');
      }
      if (c.handoff) assert.equal(o.handoff, true, where);
      if (c.caveat) assert.equal(o.bot.caveat, TEXT.caveat, `deveria ter ressalva ${where}`);
      if (c.resume) assert.ok(conv.chips.some(x => x.action.kind === 'resume'), 'oferece retomar o fluxo');
      const recent = conv.messages.slice(n).filter(m => m.role === 'bot').map(m => m.text).join('\n');
      if (c.re) assert.match(recent, c.re, where);
      if (c.no) assert.doesNotMatch(recent, c.no, where);
      // nunca aparece preço, em nenhuma resposta da bateria
      assert.doesNotMatch(recent, /R\$\s*\d/);
      // nenhum texto de resposta pendente, nem como resposta nem como sugestão
      const all = conv.messages.filter(m => m.role === 'bot').map(m => m.text).join('\n');
      for (const [id, t] of HELD_TEXTS) assert.ok(!all.includes(t), `texto pendente de ${id} apareceu`);
      for (const ch of conv.chips) if (ch.action.kind === 'kb') assert.equal(statusOf.get(ch.action.id), 'approved', `sugestão pendente: ${ch.action.id}`);
    });
  }
});

test('[entradas] todas as perguntas de exemplo do repertório chegam à própria intenção (ou ao mesmo assunto)', () => {
  // vale também para as pendentes: o assunto precisa ser reconhecido para a Lupi avisar que está em revisão
  const idx = buildIndex({ intents: knowledge.intents, flows: flows.flows, synonyms: knowledge.synonyms });
  const misses = [];
  let total = 0;
  for (const e of knowledge.intents) {
    for (const ex of e.examples) {
      total++;
      const r = detect(idx, ex);
      // pendente pode ceder o lugar a uma resposta aprovada forte do mesmo assunto
      const ok = r.best && !r.ambiguous && (r.best.id === e.id || (e.flow && r.best.id === e.flow) || (r.best.group && r.best.group === (e.group || e.flow || e.id)));
      if (!ok) misses.push(`${e.id} ← "${ex}" (${r.best?.id || '—'}${r.ambiguous ? ', ambígua' : ''})`);
    }
  }
  assert.ok(total >= 200, `exemplos: ${total}`);
  assert.deepEqual(misses, []);
});

test('[entradas] variações automáticas dos exemplos: sem acento e em maiúsculas', () => {
  const idx = buildIndex({ intents: knowledge.intents, flows: flows.flows, synonyms: knowledge.synonyms });
  const deaccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const misses = [];
  for (const e of knowledge.intents) {
    for (const ex of e.examples) {
      for (const v of [deaccent(ex), ex.toUpperCase()]) {
        const r = detect(idx, v);
        const ok = r.best && !r.ambiguous && (r.best.id === e.id || (e.flow && r.best.id === e.flow) || (r.best.group && r.best.group === e.group));
        if (!ok) misses.push(`${e.id} ← "${v}"`);
      }
    }
  }
  assert.deepEqual(misses, []);
});
