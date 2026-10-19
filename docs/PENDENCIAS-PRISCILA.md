# Pendências para revisão da Priscila

A Lupi só usa como informação oficial o que está com `"status": "approved"` em `data/lupi-knowledge.json`.
Nada abaixo foi aprovado pela Priscila: tudo precisa de revisão antes da apresentação ao público.

## 1. Conteúdos marcados como aprovados *provisoriamente*

Estes textos vieram **do site já publicado**, por isso estão como `approved` com
`approvedBy: "Conteúdo publicado no site (confirmação da Priscila pendente)"`. Peça à Priscila para confirmar cada um
e trocar o `approvedBy` pelo nome dela e a data:

| ID | Assunto |
|---|---|
| `inst-contlup` | O que é a ContLup |
| `inst-publico` | Para quem é (MEI, ME/EPP, crescimento, B2B, quem está começando) |
| `inst-priscila` | Priscila Petean, mais de 20 anos de experiência |
| `inst-contato` | WhatsApp, e-mail e Instagram |
| `inst-localizacao` | Pedreira/SP (endereço completo não publicado) |
| `inst-atendimento` | Atendimento por WhatsApp e e-mail |
| `inst-horario` | Informa que os horários ainda não foram publicados |
| `inst-lupi` | Quem é a Lupi (assistente virtual, não humana) |
| `inst-privacidade` | Privacidade no chat |
| `serv-areas`, `serv-contabil`, `serv-fiscal`, `serv-trabalhista`, `serv-societario` | Serviços das 4 áreas |
| `emp-abrir`, `emp-troca`, `emp-primeira-conversa` | Abertura, troca de contador e primeira conversa |
| `mei-atende`, `mei-nota` | Atendimento ao MEI e emissão de nota |
| `com-preco`, `com-condicoes` | Preço sob proposta; sem condições comerciais publicadas |
| `gestao-lucro-saldo`, `gestao-sobra-caixa`, `gestao-produto-margem`, `gestao-precificacao` | Conteúdos educativos do site |

## 2. Conteúdos novos aguardando revisão (`pending_review`, NÃO usados pela Lupi)

| ID | Assunto | Observação |
|---|---|---|
| `edu-fluxo-caixa` | O que é fluxo de caixa | educativo |
| `edu-custos-despesas` | Custo x despesa | educativo |
| `edu-dre` | O que é DRE | educativo |
| `edu-separar-contas` | Separar contas PF e PJ | educativo |
| `edu-pro-labore` | O que é pró-labore | educativo |
| `edu-regime` | Qual regime escolher | precisa de validação profissional |
| `mei-faturamento` | Limite de faturamento do MEI | **regulatório**: sem valores de propósito |
| `mei-obrigacoes` | Obrigações do MEI | **regulatório** |
| `mei-crescimento` | Mudar de porte / desenquadramento | **regulatório** |

Enquanto estiverem pendentes, os fluxos usam um texto neutro ("depende da sua situação, confira com a Priscila").

## 3. Informações que faltam no site (a Lupi diz que não foram publicadas)

- [ ] Número de registro no **CRC** da Priscila e **CNPJ** da ContLup
- [ ] **Endereço completo** do escritório
- [ ] **Dias e horários** de atendimento
- [ ] Se há **atendimento presencial** e em **quais cidades** a ContLup atende
- [ ] Se existe alguma **condição comercial** que possa ser divulgada (a Lupi hoje nunca fala de valores, descontos ou prazos)

## 4. Textos e decisões para validar

- [ ] Saudação, aviso de privacidade e mensagens de fallback (`js/lupi/conversation.js`, objeto `TEXT`)
- [ ] Perguntas e conclusões dos 5 fluxos (`data/lupi-flows.json`), em especial a conclusão do fluxo **Abrir empresa** e a do **MEI**
- [ ] Personalidade e regras da IA (`worker/src/prompt.js`), só quando a IA for ligada
- [ ] Trecho da **política de privacidade** sobre o chat (histórico guardado só na aba do navegador). Se a IA for ligada no futuro, a política precisará mencionar o provedor de IA (veja `docs/LUPI-2.md`, seção 8)
- [ ] Modelo de mensagem para o WhatsApp ("Olá, Priscila! Vim pelo site da ContLup e conversei com a Lupi...")
