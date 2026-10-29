# Auditoria pré-lançamento — 29/10/2026

Versão auditada: `main` em `fb1e36c` (merge do PR #9, já publicada no GitHub Pages; árvore idêntica a `8b57669`).
Referência local do estado inicial: tag `auditoria-inicio-2026-10-29` (não enviada ao GitHub).

**Parecer: APTO COM CONFIGURAÇÕES PENDENTES.** Nenhum P0. Um P1 fora do site (rascunhos da Lupi visíveis no repositório
público) depende de decisão do proprietário. O resto são configurações da hospedagem e melhorias opcionais.

## Corrigido nesta auditoria

| Prioridade | Problema | Correção |
|---|---|---|
| P2 | Fechar o menu do celular tocando fora fazia o cabeçalho sumir (a volta à posição parecia "rolar para baixo") | referência de rolagem zerada ao destravar |
| P2 | Tema claro: rótulo "Fale com a ContLup" e pílula "Atendimento 100% online" escuros sobre a faixa azul-marinho (1,1–1,5:1) | cores claras nos dois temas |
| P2 | "Priscila Petean · Contadora" e a trilha "Números → …" ilegíveis sobre a ilustração no desktop | fundo de vidro discreto atrás do texto |
| P2 | Painel do BPO: texto não rolava pelo teclado (WCAG 2.1.1) | área focável, com foco visível |
| P2 | Botão "Ligar" com a fonte grande dos contatos | mesmo desenho do "Copiar" |
| P2 | Sem página 404 | `404.html` autossuficiente + `ErrorDocument` no modelo `.htaccess` |
| P3 | Contrastes abaixo de 4,5:1: verde "↑ 8,2%" (tema claro), rótulos do cartão "Resultado", rótulos do Contato, microtexto do Hero no tema claro | cores ajustadas |
| P3 | Sem JavaScript, o menu do celular ficava inacessível e botões ficavam inertes | `<noscript>`: menu vira lista, botões que dependem de script somem |

## Pendências

- **P1 — decisão do proprietário:** os rascunhos das 39 respostas em revisão estão em `_revisao/` e no histórico do Git de um
  repositório **público**. O site publicado não os contém (verificado no build do Jekyll), mas qualquer pessoa pode lê-los no
  GitHub. Opções: tornar o repositório privado (GitHub Pages privado exige plano pago) ou guardar os rascunhos fora dele;
  o histórico antigo continua com os textos até uma limpeza específica, que precisa de avaliação separada.
- **P2 — hospedagem:** domínio definitivo ainda não informado: canonical, og:url, og:image, dados estruturados, `404.html`,
  `robots.txt` e `sitemap.xml` apontam para o GitHub Pages (lista exata em `docs/PUBLICACAO.md`).
- **P2 — hospedagem:** depois da migração, desativar o GitHub Pages para não haver conteúdo duplicado.
- **P3:** no GitHub Pages não é possível enviar cabeçalhos HTTP (proteção contra iframe, HSTS próprio); ficam no `.htaccess`.
- **P3:** legenda "━" do gráfico ilustrativo e textos do documento fiscal decorativo abaixo de 4,5:1 (ilustrações marcadas como
  demonstrativas, sem informação essencial).
- **P3:** descrição do repositório no GitHub ainda cita Pedreira/SP; textos do Contato e da Lupi sobre atendimento ainda não citam
  o telefone (decisão comercial, `docs/PENDENCIAS-PRISCILA.md`).

## Como foi testado

- Testes automatizados no Chromium (Playwright): unidade, integração, segurança e interface, incluindo 320–1920 px, temas,
  paisagem, zoom 200%, toque, teclado, Lupi e aviso juntos, injeção de código, histórico adulterado, console e rede.
- axe-core 4.10 (WCAG 2.0/2.1/2.2 A e AA) em 9 cenários: 0 violações depois das correções; contrastes que o axe não calcula
  (gradientes) medidos por pixel.
- Build com Jekyll 3.10 (mesmo do GitHub Pages): 72 arquivos publicados, sem `_revisao/`, `docs/`, `tests/`, `worker/`, `.htaccess`,
  sem texto pendente e sem chaves.
- Desempenho (diagnóstico, não meta): celular em 4G lenta com CPU 4x e compressão gzip — load ≈ 2,3 s, LCP ≈ 2,4 s, CLS 0;
  ≈ 315 KB comprimidos, nenhuma requisição a terceiros.
- **Não testado:** Safari/WebKit e Firefox (não instalados no ambiente), aparelhos físicos, teclado virtual real, leitores de tela
  reais, cabeçalhos HTTP do GitHub Pages (rede do ambiente bloqueia github.io). A política de privacidade não teve revisão jurídica.
