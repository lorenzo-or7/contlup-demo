# Lupi 2.0: assistente virtual híbrida da ContLup

Este guia explica como a Lupi 2.0 funciona, como rodar no seu computador, como publicar o backend com segurança e como ligar a IA no site do GitHub Pages.

> **Decisão atual: a Lupi roda sem IA.** O site usa só os fluxos guiados e as respostas aprovadas, e a interface não menciona IA.
> O backend com IA (`worker/`) fica guardado no repositório, desligado, para uso futuro. Para ligá-lo, siga as seções 3 e 4 e o checklist da seção 8.

---

## 1. Como funciona

```
Visitante ──> Site (GitHub Pages) ──────────────────────────────┐
               js/lupi/boot.js   (leve: botão + convite)         │ só quando a IA está ligada
               js/lupi/app.js    (carregado ao abrir o chat)      ▼
                 ├─ conversation.js  roteador híbrido     Cloudflare Worker (worker/)
                 ├─ flow-engine.js   fluxos guiados  ───>  ├─ valida e limita (Durable Object)
                 ├─ intents.js       respostas aprovadas   ├─ remove dados pessoais
                 └─ ai-client.js     chama o Worker        ├─ monta instruções + base aprovada
                                                           ├─ Gemini OU OpenAI (escolha no servidor)
                                                           └─ guardas de saída (preços, promessas...)
```

Para cada mensagem, a Lupi decide nesta ordem:

1. **Proteção de dados:** CPF, CNPJ, cartão, e-mail, telefone e senha são removidos antes de guardar ou enviar.
2. **Comandos:** voltar, cancelar, falar com a Priscila, oi, obrigado.
3. **Fluxo guiado em andamento:** a resposta da etapa ou a mudança de assunto (o fluxo fica pausado e pode ser retomado).
4. **Respostas aprovadas** da base de conhecimento e início de fluxos.
5. **IA** para perguntas abertas, quando disponível.
6. **Modo básico honesto** quando a IA não está disponível. Ela nunca finge que a IA respondeu.

### Arquivos

| Caminho | O que é |
|---|---|
| `data/lupi-knowledge.json` | Base de conhecimento editável (com status de revisão) |
| `data/lupi-flows.json` | Fluxos guiados editáveis (abrir empresa, troca de contador, MEI, serviços, proposta) |
| `js/lupi/` | Frontend da Lupi (módulos ES, sem dependências) |
| `js/lupi/shared/` | Código usado pelo site **e** pelo Worker (texto e privacidade) |
| `css/lupi.css` | Visual do chat (usa os tokens de cor do site: temas claro e escuro) |
| `worker/` | Backend serverless (Cloudflare Worker + Durable Object) |
| `worker/src/providers/` | Adaptadores `GeminiProvider` e `OpenAIProvider` (mesma interface) |
| `worker/src/prompt.js` | Instruções da Lupi para o modelo |
| `worker/src/guard.js` | Guardas de segurança de entrada e saída |
| `eval/` | Avaliação comparativa Gemini x OpenAI |
| `tests/` | Testes automatizados (unidade, integração, segurança, interface, IA real) |

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

Sem configurar nada, a Lupi roda no **modo básico**. Para testar a IA localmente:

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
npm run test:ui       # interface no Chromium (Playwright): desktop, celular, temas, acessibilidade, fallback
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
