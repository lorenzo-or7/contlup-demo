# Lupi 2.0: assistente virtual da ContLup (sem IA)

Este guia explica como a Lupi funciona, como manter o repertório dela e, para o futuro, como ligar um backend com IA.

> **Decisão atual: a Lupi roda sem IA.** Ela entende as perguntas com regras determinísticas (sem OpenAI, Gemini, Claude ou
> qualquer modelo generativo, sem API externa e sem servidor). O backend com IA (`worker/`) fica guardado, desligado,
> e o site nem baixa o código de IA enquanto nenhum endereço de API estiver configurado.

---

## 1. Como funciona

```
Visitante ──> Site (GitHub Pages, tudo estático)
               js/lupi/boot.js        leve: botão, convite e botões "Pergunte à Lupi" da página
               js/lupi/app.js         carregado só quando o visitante abre o chat
                 ├─ conversation.js   orquestrador: decide o que responder
                 ├─ nlu.js            reconhecimento de intenções (normalização, sinônimos, pontuação, desambiguação)
                 ├─ context.js        contexto da sessão (intenção anterior, assunto, plano em discussão)
                 ├─ plans.js          perguntas sobre planos (inclui? quanto custa? diferença? para quem?)
                 ├─ flow-engine.js    fluxos guiados (perguntas, recomendação de plano, mensagem final)
                 ├─ whatsapp.js       mensagem e link do WhatsApp comercial (nunca envia sozinho)
                 └─ ui.js             interface (digitando…, ressalvas, links para seções do site)
               data/lupi-knowledge.json   repertório (intenções, sinônimos, planos)
               data/lupi-flows.json       fluxos guiados
```

Para cada mensagem, a Lupi decide nesta ordem:

1. **Proteção de dados:** CPF, CNPJ, cartão, e-mail, telefone e senha são removidos antes de guardar.
2. **Comandos:** falar com a ContLup, recomeçar, voltar, cancelar, menu, oi, obrigado. Um número ("1", "2"…) escolhe a sugestão correspondente.
3. **Fluxo guiado em andamento:** aceita a resposta da etapa (botão, número ou texto curto como "tenho empresa"), ou pausa o fluxo se o visitante mudar de assunto (dá para retomar).
4. **Perguntas sobre planos e de acompanhamento,** usando o contexto: "E quanto custa?", "Esse plano inclui folha?", "Qual a diferença para o outro?", "E para quem é MEI?". Sem contexto suficiente, ela pergunta em vez de chutar.
5. **Acompanhamento por assunto** ("e se eu atrasar?" depois do DAS, "e como contrato?" depois de um serviço), pelas regras `followUps` do repertório. Se a regra tem mais de um destino possível ("e quanto custa?" depois do DAS: valor do DAS ou preço do plano?), ela **pede confirmação** em vez de presumir.
6. **Intenções do repertório,** com desambiguação: se dois assuntos empatam (ou aparecem juntos, como "trocar de contador e abrir empresa"), ela oferece as opções. Só respostas aprovadas viram opção.
7. **Assunto em revisão:** se a pergunta é sobre uma resposta `pending_review`, ela diz que o assunto está em revisão e oferece o contato, sem mostrar nada da resposta pendente.
8. **Sem resposta no repertório:** diz isso com naturalidade, sugere até 3 assuntos parecidos e oferece o contato. Na segunda pergunta seguida sem resposta, indica direto o WhatsApp comercial (sem repetir a mesma frase).

### Como ela entende as perguntas (`js/lupi/nlu.js`)

- **Normalização:** minúsculas, sem acentos, sem pontuação, espaços únicos (Unicode NFD).
- **Sinônimos** (`synonyms` no JSON, 29 grupos hoje): "zap" e "wpp" viram "whatsapp", "microempreendedor" vira "mei", "tributos" vira "imposto", "mudar de contabilidade" vira "trocar de contador".
- **Erros leves de digitação:** até 1 erro (letra trocada, faltando ou sobrando) em palavras de 5 a 7 letras e até 2 em palavras de 8 ou mais, sempre com a mesma primeira letra (exceto o "h" mudo: "orario" → "horário"). Palavras de até 4 letras precisam ser exatas, salvo dentro de uma expressão em que outra palavra já bateu exatamente.
- **Palavras inteiras e expressões compostas:** "das" só vale como palavra inteira; expressões maiores valem mais ("lucro presumido" ganha de "lucro").
- **Pontuação de relevância:** expressões, perguntas de exemplo parecidas e prioridade de temas comerciais. Abaixo do limiar mínimo (`MIN_SCORE`), ela não responde direto.
- **Desambiguação:** quando o segundo colocado chega a 70% da nota do primeiro, ou quando há dois assuntos ligados por "e"/"ou", ela pergunta. Pedido de orientação para um caso específico ("analisa o meu caso: vale a pena sair do MEI?") recebe a explicação geral do assunto com a ressalva.

### Contexto da sessão (`js/lupi/context.js`)

Guarda só identificadores: `lastIntent`, `topic` (categoria), `plan` e `prevPlan` (para "o outro"), `subject` (os grupos de assunto
de uma sequência de acompanhamentos) e `unknownStreak`.

- **Acompanhamento por assunto:** `contextGroups` reúne intenções do mesmo assunto (`das`, `mei`, `notas`, `regimes`, `servicos`, e um
  grupo por `forMei`); cada regra em `followUps` diz, para um grupo, quais expressões (`match`) levam a quais destinos (`targets`).
  Um destino pode ser uma intenção ou uma pergunta pronta (`{ "label": "Preço do plano Lup MEI", "ask": "quanto custa o lup mei?" }`).
- **Sequência:** enquanto as mensagens forem de acompanhamento ("e…?", curtas), o assunto continua (serviço fiscal → "e como contrato?"
  → "e tem plano?" → "e a proposta?"). Uma pergunta nova e completa encerra a sequência, e o plano visto antes não é presumido depois
  de mudar de assunto.
- **Ambiguidade:** mais de um destino = a Lupi pergunta qual; destinos em revisão não viram opção (ela avisa que parte do assunto está em revisão).
**Nunca guarda o texto digitado.** Fica no `sessionStorage` da aba (some ao fechar) e é apagado com "Recomeçar".

### Respostas em revisão (`pending_review`)

- Ficam no índice **só para reconhecer o assunto** (sem isso, "como pagar o DAS?" cairia numa resposta aprovada parecida, como o plano Lup MEI).
- Nunca aparecem: nem o texto, nem o título, nem as ações. Não entram em sugestões, desambiguação, "Dúvidas gerais", fluxos (que usam o `fallbackText`), acompanhamentos nem no prompt do backend de IA.
- Dentro do mesmo assunto, uma resposta aprovada com correspondência forte ganha da que está em revisão ("quero trocar de contador" → `emp-troca`).
- Botão antigo salvo na sessão que aponte para uma resposta que voltou para revisão também só mostra o aviso.

### Fluxos guiados (`data/lupi-flows.json`)

| Fluxo | Para quê | Termina em |
|---|---|---|
| `encontrar_plano` | Até 3 perguntas (tipo de empresa, regime, prioridade) e uma **indicação preliminar** de plano | Mensagem "Olá! Gostaria de saber mais sobre o plano X." |
| `planos` | Conhecer cada plano ou ver as diferenças | Mensagem de interesse no plano escolhido |
| `servicos` | Conhecer as 5 áreas, incluindo o BPO Financeiro | Mensagem sobre o serviço |
| `primeiro_atendimento` | Abrir empresa, trocar de contador, regularizar ou contratar | "Olá! Gostaria de conversar sobre …" |
| `abrir_empresa`, `troca_contador`, `mei`, `proposta` | Atendimentos específicos | Resumo revisável para o WhatsApp |

"Dúvidas gerais" mostra as 8 categorias e as perguntas de cada uma. Todos os fluxos aceitam **Voltar**, **Cancelar**, **Recomeçar** e mudança de assunto.

### WhatsApp comercial

Destino único: `5519971310182`. A mensagem vem do fluxo concluído, da ação da intenção (por exemplo, "Olá! Tenho interesse no BPO Financeiro da ContLup.") ou de uma frase genérica.
**O texto livre digitado pelo visitante não entra na mensagem.** O visitante vê, pode editar e só então confirma; o link (`wa.me/…?text=`) é codificado com `encodeURIComponent` e nada é enviado automaticamente.

### Arquivos

| Caminho | O que é |
|---|---|
| `data/lupi-knowledge.json` | Repertório editável: intenções, sinônimos, planos e benefícios |
| `data/lupi-flows.json` | Fluxos guiados editáveis |
| `js/lupi/` | Lupi no navegador (módulos ES, sem dependências) |
| `js/lupi/shared/` | Código usado pelo site **e** pelo Worker (texto e privacidade) |
| `css/lupi.css` | Visual do chat (temas claro e escuro) |
| `worker/` | Backend com IA, **desligado** (guardado para o futuro) |
| `tests/` | Testes automatizados |

## 1.1 Como manter o repertório

Cada intenção em `data/lupi-knowledge.json` tem:

```json
{
  "id": "mei-das",                     // estável: não mude (é usado em ações, fluxos e testes)
  "category": "mei",                   // contlup, servicos, planos, mei, empresas, regimes, rotinas, duvidas
  "title": "DAS do MEI",
  "examples": ["Como pago o DAS?", "…"],  // perguntas reais; os testes exigem que todas cheguem a esta intenção
  "keywords": ["pagar das", "guia do mei", "…"],  // sem acentos, em minúsculas
  "exclude": ["dasn simei"],           // opcional: expressões que impedem a intenção
  "answer": "Texto em **markdown simples**",
  "actions": [ { "type": "intent", "id": "mei-pendencias", "label": "DAS atrasado" },
               { "type": "whatsapp", "label": "Falar com a ContLup", "message": "Olá! …" },
               { "type": "flow", "id": "mei", "label": "…" },
               { "type": "link", "href": "#planos", "label": "Ver os planos no site" } ],
  "status": "approved",                // só "approved" aparece; use "outdated" para desligar
  "review": { "legalSensitive": true, "professionalReview": "pendente", "approvedBy": "…", "source": "…", "updatedAt": "2026-10-23" }
}
```

(Os comentários `//` acima são só explicação: o arquivo é JSON puro.)

- **Conteúdo sujeito a mudança legal** (`legalSensitive: true`) mostra automaticamente a ressalva "Explicação geral: regras, valores e prazos podem mudar…".
- **Nunca coloque** preços, percentuais, valores de limite, horários ou prazos que não tenham sido confirmados. Os testes falham se aparecer `R$ 1…`, `10%`, `81.000`, `9h` etc.
- Depois de editar, rode `npm test`: ele confere ids, categorias, ações, metadados de revisão, se todas as perguntas de exemplo chegam à intenção certa (também sem acento e em maiúsculas) e a bateria de entradas representativas.

### Expressões da Lupi

Os estados `idle`, `welcome`, `thinking`, `explaining` e `success` usam as ilustrações **originais** da personagem (veja `img/lupi/estados/LEIA-ME.md`). Para trocar por artes novas, basta alterar `js/lupi/expressions.js`.

---

## 2. Rodar no seu computador

Requisitos: [Node.js](https://nodejs.org) 20 ou mais recente.

```bash
npm install            # instala o Playwright (só para os testes de interface)
npm run serve          # abre o site em http://localhost:8080
```

> O chat usa módulos JavaScript modernos, que **não funcionam abrindo o `index.html` direto do disco** (`file://`). Use sempre um servidor, como o comando acima.

Sem configurar nada, a Lupi roda **sem IA** (é o modo oficial do site). Só se um dia quiser testar a IA localmente:

1. `cd worker && npm install`
2. Copie `worker/.dev.vars.example` para `worker/.dev.vars` e preencha a chave e o modelo (esse arquivo é ignorado pelo Git).
3. `npm run dev` (dentro de `worker/`). O backend sobe em `http://localhost:8787`.
4. No `index.html`, coloque temporariamente `<meta name="lupi-api" content="http://localhost:8787">`.
5. Abra `http://localhost:8080`. **Não faça commit** dessa troca de endereço.

---

## 3. Publicar o backend (Cloudflare Workers)

Escolhemos Cloudflare Workers porque o GitHub Pages não executa código de servidor. O Worker guarda as chaves com segurança, aplica os limites e fala com a IA. O plano gratuito da Cloudflare atende um site deste porte; confira os limites atuais em <https://developers.cloudflare.com/workers/platform/limits/>.

### 3.1 Conseguir a chave da IA (só de quem for usar)

- **Gemini:** <https://aistudio.google.com/apikey> → "Create API key".
- **OpenAI:** <https://platform.openai.com/api-keys> → "Create new secret key".

⚠️ **Nunca** cole a chave no chat, em e-mail, no `index.html`, em arquivos do repositório ou em prints. Ela só vai no comando `wrangler secret put` (passo 6).

💡 Ative também um **limite de gastos no painel do provedor** (Google AI Studio / OpenAI → Billing/Limits). É uma segunda trava, além da que o Worker já aplica.

### 3.2 Passo a passo

1. Crie uma conta gratuita em <https://dash.cloudflare.com/sign-up>.
2. No terminal, entre na pasta do backend e instale:
   ```bash
   cd worker
   npm install
   ```
3. Faça login (abre o navegador para autorizar):
   ```bash
   npx wrangler login
   ```
4. Abra `worker/wrangler.toml` e ajuste a seção `[vars]`:
   - `AI_PROVIDER`: `"gemini"` ou `"openai"`;
   - `GEMINI_MODEL` ou `OPENAI_MODEL`: o nome de um modelo **atual** (consulte <https://ai.google.dev/gemini-api/docs/models> ou <https://platform.openai.com/docs/models>). Não deixamos valor padrão de propósito, porque os modelos mudam;
   - `ALLOWED_ORIGINS`: já vem com `https://lorenzo-or7.github.io`. Se o site ganhar domínio próprio, acrescente-o separado por vírgula;
   - limites (`RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_PER_DAY`, `GLOBAL_REQUESTS_PER_DAY`, `DAILY_TOKEN_BUDGET`, `DAILY_COST_BUDGET_USD`): os valores iniciais são conservadores.
5. Deixe `AI_ENABLED = "false"` na primeira publicação (para testar com segurança).
6. Cadastre os segredos. O terminal pede o valor, e ele **não fica salvo em nenhum arquivo**:
   ```bash
   npx wrangler secret put GEMINI_API_KEY      # ou OPENAI_API_KEY
   npx wrangler secret put IP_HASH_SALT        # digite um texto aleatório longo (protege a privacidade dos IPs)
   ```
7. Publique:
   ```bash
   npx wrangler deploy
   ```
   No fim aparece o endereço, por exemplo `https://contlup-lupi.SEU-USUARIO.workers.dev`.
8. Teste (deve responder `{"ok":true,"ai":false,"reason":"disabled"}`):
   ```bash
   curl -H "Origin: https://lorenzo-or7.github.io" https://contlup-lupi.SEU-USUARIO.workers.dev/health
   ```
9. Para ligar a IA, troque `AI_ENABLED = "true"` no `wrangler.toml` e rode `npx wrangler deploy` de novo. O teste do passo 8 passa a responder `{"ok":true,"ai":true}`.

### 3.3 Operação do dia a dia

| Quero... | Faço... |
|---|---|
| Desligar a IA na hora (o site continua no modo básico) | `AI_ENABLED = "false"` + `npx wrangler deploy` |
| Trocar de Gemini para OpenAI | Cadastre `OPENAI_API_KEY`, ajuste `AI_PROVIDER`/`OPENAI_MODEL` e rode `npx wrangler deploy` |
| Trocar uma chave vazada | Revogue no painel do provedor, crie outra e rode `npx wrangler secret put ...` |
| Ver erros | Painel da Cloudflare → Workers → contlup-lupi → Logs. Só aparecem tipos de erro, **nunca** o conteúdo das conversas |
| Mudar os limites | Edite `[vars]` e rode `npx wrangler deploy` |

---

## 4. Conectar o site (GitHub Pages) ao backend

1. No `index.html`, troque a linha
   ```html
   <meta name="lupi-api" content="">
   ```
   pelo endereço do Worker (sem barra no final):
   ```html
   <meta name="lupi-api" content="https://contlup-lupi.SEU-USUARIO.workers.dev">
   ```
2. Faça commit e push para a `main`. O GitHub Pages publica em alguns minutos.
3. Abra o site e o chat: o selo no topo deve mostrar **"IA ativa · pode errar"**. Se mostrar "IA indisponível agora" ou "Modo básico", confira os passos 8 e 9 da seção 3.

O endereço do Worker é público e pode aparecer no HTML: a segurança não depende de escondê-lo. Ela vem dos segredos guardados na Cloudflare, da lista de origens permitidas, dos limites por visitante, do orçamento diário e das guardas de conteúdo.

---

## 5. Segurança: o que está implementado

- **Chaves** só como *secrets* do Worker. O navegador nunca fala com Gemini/OpenAI (há teste automático que garante isso) e `.env`/`.dev.vars` são ignorados pelo Git.
- **Rate limit real entre instâncias** (Durable Object): por visitante, por minuto e por dia (IP com hash e sal, nunca guardado puro), mais um limite global de requisições.
- **Orçamento diário** de tokens e, opcionalmente, de custo em US$: quando o limite é atingido, a IA para de ser chamada e o site cai no modo básico.
- **Validação** de tamanho de corpo, número de mensagens, tamanho de cada mensagem, papéis permitidos, ordem e caracteres invisíveis.
- **CORS** com lista de origens. O CORS **não** é a única proteção: os limites valem para qualquer cliente.
- **Separação de instruções:** as instruções do sistema vão em campo próprio, a base aprovada é marcada como "dados, não instruções" e as mensagens do visitante vão como mensagens separadas.
- **Guardas no servidor (não só no prompt):**
  - tentativas óbvias de *prompt injection* recebem resposta fixa, sem gastar IA;
  - respostas com preços, alíquotas, valores-limite, promessas de economia, pedidos de dados sensíveis, alegação de ser humana ou de ter consultado sistemas, ou vazamento de instruções são **substituídas** por uma resposta segura que oferece a Priscila;
  - links fora de uma lista permitida são removidos.
- **Privacidade:** dados pessoais removidos no navegador e de novo no servidor. O servidor não registra o conteúdo das conversas. O histórico fica só no `sessionStorage` da aba (expira em 6h ou ao fechar a aba) e pode ser apagado com o botão de reiniciar.
- **WhatsApp:** a Lupi só prepara o resumo. O visitante revisa, edita e confirma, e só então o link oficial (`wa.me/5519997447919`) é aberto. Nada é enviado automaticamente.

**Limites conhecidos (honestidade técnica):**
- As guardas de conteúdo são heurísticas (expressões regulares). Elas reduzem muito o risco, mas não substituem a revisão humana das respostas na fase de testes reais.
- A detecção de *prompt injection* cobre padrões comuns. Ataques novos podem passar e, nesse caso, as guardas de saída e as instruções do modelo são as próximas barreiras.
- Para tráfego alto ou ataques automatizados, a recomendação é adicionar **Cloudflare Turnstile** (verificação anti-robô) antes da primeira pergunta à IA.

---

## 6. Comparar Gemini x OpenAI

A arquitetura permite usar qualquer um dos dois: o visitante nunca escolhe e o servidor usa só um por vez (`AI_PROVIDER`). Para decidir qual usar:

1. Copie `.env.example` para `.env` e preencha as chaves e os modelos dos dois provedores. Preencha também os **preços oficiais vigentes** por milhão de tokens, se quiser que o custo entre na nota.
2. Rode `npm run eval`.
3. O relatório sai em `eval/results/<data>.md`, com notas por critério, as respostas de cada modelo para revisão humana e a conclusão.

Critérios e pesos: segurança e precisão 35% · fidelidade à ContLup 20% · continuidade de contexto 15% · clareza e personalidade 15% (heurística) · tempo de resposta 10% · custo 5%. Os dois recebem **exatamente** as mesmas instruções, base, mensagens e configurações. Sem chaves, o relatório diz "não executado" e **nenhum vencedor é declarado**.

---

## 7. Testes

```bash
npm test              # unidade + integração + segurança (inclui o Worker no runtime real, se worker/node_modules existir)
npm run test:ui       # interface no Chromium (Playwright): chat, site em 320–1440 px, temas, navegação, acessibilidade
npm run test:live     # IA real: só roda com chaves no .env; sem elas, fica "pulado"
npm run eval          # avaliação comparativa (precisa de chaves)
```

O relatório da última execução está em [`docs/RELATORIO-TESTES.md`](RELATORIO-TESTES.md). As informações que dependem da Priscila estão em [`docs/PENDENCIAS-PRISCILA.md`](PENDENCIAS-PRISCILA.md).

---

## 8. Checklist para ligar a IA no futuro

1. Publicar o backend (seção 3) e conectar o site (seção 4).
2. A interface muda sozinha: com o endereço da API preenchido, o cabeçalho passa a dizer "Assistente virtual com IA", o selo mostra o estado da IA e o aviso inicial menciona o provedor de IA.
3. **Atualizar a política de privacidade** no rodapé do `index.html`, acrescentando que as perguntas abertas são enviadas (com dados pessoais removidos) a um provedor de IA e que o servidor da Lupi não grava o conteúdo das conversas. Recomenda-se revisão jurídica/LGPD.
4. Revisar os textos `inst-lupi` e `inst-privacidade` em `data/lupi-knowledge.json` para mencionar a IA.
5. Rodar `npm run test:live` e `npm run eval` com as chaves no `.env` antes de liberar ao público.
