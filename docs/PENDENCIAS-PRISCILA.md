# Pendências para revisão da Priscila

Atualizado em 23/10/2026 (dados institucionais oficiais, BPO Financeiro detalhado e nova ordem das seções).

A Lupi só usa o que está com `"status": "approved"` em `data/lupi-knowledge.json`. Para tirar qualquer resposta do ar
sem apagar, troque o `status` para `outdated`. Cada intenção tem o bloco `review` com a origem do texto.

## 1. Repertório novo da Lupi: precisa de revisão profissional (39 intenções)

Estes textos são **explicações gerais novas**, escritas para a Lupi 2.0 (MEI, empresas, regimes, rotinas e dúvidas recorrentes).
Desde 23/10/2026 estão com `"status": "pending_review"` (`approvedBy: null`, `professionalReview: "pendente"`): **ficam guardados e
não aparecem para ninguém**. Quando o visitante pergunta sobre um desses assuntos, a Lupi só diz que o assunto está em revisão pela
equipe e oferece o WhatsApp comercial. Também não aparecem em sugestões, em "Dúvidas gerais", nos fluxos (que usam um texto neutro)
nem nas perguntas de acompanhamento.

**Para publicar uma resposta depois da revisão:** troque `"status"` para `"approved"`, preencha `review.approvedBy` (nome e data) e
`review.professionalReview` (`"revisado"`), e rode `npm test`. O teste `tests/integration/pending-context.test.mjs` tem a lista exata
das aprovadas e precisa ser atualizado junto (isso evita publicar algo sem querer).

| Categoria | IDs |
|---|---|
| ContLup e atendimento | `aconselhamento` |
| MEI | `mei-o-que-e`, `mei-abrir`, `mei-das`, `mei-dasn`, `mei-notas`, `mei-pendencias`, `mei-regularizacao`, `mei-baixa`, `mei-empregado`, `mei-desenquadramento`, `mei-limite`, `mei-obrigacoes` |
| Empresas | `emp-alteracao`, `emp-encerramento`, `emp-documentacao`, `emp-contabilidade-mensal`, `emp-obrigacoes`, `emp-regularizacao` |
| Regimes tributários | `reg-simples`, `reg-presumido`, `reg-real`, `reg-diferencas`, `reg-orientacao` |
| Rotinas contábeis e financeiras | `rot-nota-fiscal`, `rot-faturamento-lucro`, `rot-receita-despesa`, `rot-fluxo-caixa`, `rot-pro-labore`, `rot-folha`, `rot-encargos`, `rot-balancete`, `rot-balanco`, `rot-dre` |
| Dúvidas recorrentes | `duv-contador-mei`, `duv-clt-empresa`, `duv-atraso-impostos`, `duv-mudar-contador`, `duv-organizar-financas` |

### Marcadas como sujeitas a mudança legal (30)

Mostram a ressalva "Explicação geral: regras, valores e prazos podem mudar. Para o seu caso, confirme com a ContLup."
Conferir se a lista está completa:

`aconselhamento`, `mei-o-que-e`, `mei-abrir`, `mei-das`, `mei-dasn`, `mei-notas`, `mei-pendencias`, `mei-regularizacao`, `mei-baixa`, `mei-empregado`, `mei-desenquadramento`, `mei-limite`, `mei-obrigacoes`, `emp-encerramento`, `emp-documentacao`, `emp-obrigacoes`, `emp-regularizacao`, `reg-simples`, `reg-presumido`, `reg-real`, `reg-diferencas`, `reg-orientacao`, `rot-nota-fiscal`, `rot-pro-labore`, `rot-folha`, `rot-encargos`, `duv-contador-mei`, `duv-clt-empresa`, `duv-atraso-impostos`, `duv-emitir-nota`

## 2. Conteúdo que veio do site publicado (27 intenções)

`approvedBy: "Conteúdo publicado no site (confirmação da Priscila pendente)"`. Inclui as respostas da antiga seção de
dúvidas frequentes, que saiu da página e passou para a Lupi.

| Categoria | IDs |
|---|---|
| ContLup e atendimento | `inst-contlup`, `inst-priscila`, `inst-publico`, `inst-contato`, `inst-localizacao`, `inst-atendimento`, `inst-horario`, `inst-lupi`, `inst-privacidade`, `atd-proposta`, `atd-primeira-conversa`, `atd-contratacao`, `com-preco`, `com-condicoes` |
| Serviços | `serv-areas`, `serv-contabil`, `serv-fiscal`, `serv-trabalhista`, `serv-societario` |
| MEI | `mei-atende` |
| Empresas | `emp-abertura`, `emp-troca` |
| Rotinas contábeis e financeiras | `rot-saldo-lucro`, `rot-sobra-caixa`, `rot-margem`, `rot-precificacao` |
| Dúvidas recorrentes | `duv-emitir-nota` |

## 3. Conteúdo informado pela ContLup em 23/10/2026 (8 intenções)

Planos e BPO: `serv-bpo`, `planos`, `plano-lup-mei`, `plano-lup-start`, `plano-lup-plus`, `plano-lup-prime`, `planos-diferencas`, `planos-qual-escolher`.

- [ ] **Planos:** confirmar nomes, chamadas, públicos e benefícios exatamente como estão no site.
- [ ] **Lup Prime:** a lista repete "Balanço Patrimonial anual", que também está no Lup Plus. Mantido como enviado.
- [ ] **"Portal para documentos e guias"** (Lup MEI e Lup Start): confirmar que já está disponível.
- [x] **BPO Financeiro:** descrição, 7 atividades, 7 benefícios, público indicado e regra de aprovação dos pagamentos publicados no painel lateral do site e na Lupi (`serv-bpo`, `bpo-atividades`, `bpo-beneficios`, `bpo-publico`, `bpo-proposta`, `bpo-aprovacao`), exatamente como enviados.
- [ ] **Proposta de BPO Financeiro:** o botão do painel diz "Solicitar proposta de BPO Financeiro" e leva ao WhatsApp comercial. Planos, o que cada um inclui e valores não foram enviados; a Lupi diz que os valores são apresentados na proposta e não informa preços.
- [ ] **Aprovação dos pagamentos:** o site e a Lupi dizem que todos os pagamentos dependem da aprovação do cliente e que "os detalhes de como essa aprovação é organizada no dia a dia são combinados com a equipe". Se houver um processo definido (por exemplo, como o cliente aprova), envie para publicarmos.
- [ ] **Sistemas e bancos:** nada foi dito sobre integrações bancárias, sistemas ou acesso a contas, e nada foi publicado sobre isso. A Lupi orienta a não compartilhar senhas nem dados bancários pelo chat.

## 4. Regras da indicação de plano (fluxo "Encontrar um plano")

A Lupi mostra uma **indicação preliminar** e deixa claro que a escolha final é combinada com a ContLup. As regras foram
montadas só com o público de cada plano publicado no site e **precisam ser validadas**:

| Respostas | Indicação |
|---|---|
| Sou MEI | Lup MEI |
| Ainda não tenho empresa | abertura de empresa (sem plano) |
| Simples Nacional + rotina e obrigações em dia | Lup Start |
| Simples Nacional + relatórios e acompanhamento, ou estratégia | Lup Plus |
| Simples Nacional + não sei | Lup Start e Lup Plus |
| Lucro Presumido + estratégia | Lup Prime |
| Lucro Presumido + rotina, ou relatórios | Lup Plus |
| Lucro Presumido + não sei | Lup Plus e Lup Prime |
| Lucro Real | Lup Prime |
| Não sei o regime | Lup Start, Lup Plus e Lup Prime |

(Arquivo: `data/lupi-flows.json`, fluxo `encontrar_plano`, passo `resultado`.)

## 5. WhatsApp

- [x] **Mensagens comerciais padronizadas:** os 3 links comerciais e a mensagem do formulário que diziam "Olá, Priscila!" agora seguem o padrão "Olá! Vim pelo site da ContLup e…". Nenhuma mensagem comercial do site ou da Lupi cita a Priscila.
- [ ] **(19) 99744-7919:** continua só nos dois botões que dizem "fale direto com a Priscila" (texto e destino **não foram alterados**). Confirmar se ficam nesse número.
- [ ] **Botão do chat** passou a se chamar "Falar com a ContLup" e abre o WhatsApp comercial. Confirmar o rótulo.

## 6. Informações que não estão no site (a Lupi diz que não foram publicadas)

Foram retirados do rodapé e do contato os campos "a inserir" (sem inventar dados). Se quiser publicá-los, envie:

- [x] **CNPJ** da ContLup: 68.970.978/0001-10, no rodapé (linha legal), nos dados estruturados da página e na Lupi (`inst-cnpj`)
- [x] **Atendimento 100% online, sem endereço físico:** no topo da página, em "Sobre", no contato, no rodapé e na Lupi (`inst-atendimento`, `inst-localizacao`). Os textos que diziam "escritório em Pedreira/SP" foram trocados
- [ ] Registro no **CRC** da Priscila (não publicado)
- [ ] **Dias e horários** de atendimento (a Lupi continua dizendo que não foram publicados)
- [ ] **Atendimento por cidade/estado:** com o atendimento online, confirmar se a ContLup atende qualquer cidade do Brasil. Hoje a Lupi pede para o visitante confirmar com a equipe, e os dados estruturados da página não informam área atendida
- [ ] **"Pedreira/SP" no site:** o título da página ("Contabilidade em Pedreira/SP"), o canto do topo e o rodapé ("De Pedreira/SP") continuam citando a cidade como origem da ContLup. Confirmar se deve continuar
- [ ] Alguma **condição comercial** que possa ser divulgada (a Lupi hoje nunca fala de valores, descontos, fidelidade ou prazos)

## 7. Textos para validar

- [ ] Saudação, aviso, mensagens de "não encontrei" e ressalva (`js/lupi/conversation.js`, objeto `TEXT`)
- [ ] Perguntas e conclusões dos 8 fluxos (`data/lupi-flows.json`)
- [ ] Nova seção **Entenda seus números** (texto de abertura e índice) e a linha "Para quem é a ContLup" em Serviços
- [ ] Aviso dos assuntos em revisão ("Esse assunto ainda está em revisão pela equipe da ContLup…") e o texto neutro do fluxo "Primeiro atendimento › Regularizar"
- [ ] Botões da seção "A Lupi explica": "Preciso de contador sendo MEI?" foi trocado por "Saldo em conta é lucro?" (texto que já estava publicado no site), porque a resposta sobre MEI está em revisão
- [ ] Trecho da **política de privacidade** sobre o chat (histórico só na aba do navegador; nada é enviado a servidores)
