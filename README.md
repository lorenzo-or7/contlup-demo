<p align="center">
  <img src="banner.svg" width="100%" alt="ContLup Studio Contábil" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-040607?style=for-the-badge&logo=html5&logoColor=BF40FA" />
  <img src="https://img.shields.io/badge/CSS3-040607?style=for-the-badge&logo=css&logoColor=BF40FA" />
  <img src="https://img.shields.io/badge/JavaScript-040607?style=for-the-badge&logo=javascript&logoColor=BF40FA" />
  <img src="https://img.shields.io/badge/GitHub%20Pages-040607?style=for-the-badge&logo=githubpages&logoColor=BF40FA" />
</p>

<p align="center">
  Demo de site para um escritório de contabilidade real de Pedreira/SP, com tema escuro e claro, serviços, planos, uma seção editorial sobre os números da empresa, a assistente virtual Lupi e pedido de proposta.
</p>

<p align="center">
  <a href="https://lorenzo-or7.github.io/contlup-demo/"><b>🔗 Acessar o site</b></a>
</p>

---

## 🖥️ Preview

<p align="center">
  <a href="https://lorenzo-or7.github.io/contlup-demo/"><img src="preview.webp" alt="Página inicial de ContLup Studio Contábil" width="90%" /></a>
</p>

---

## 📌 Sobre o projeto

Contabilidade costuma ter sites frios e genéricos. A proposta foi mostrar uma contabilidade próxima, com a contadora em destaque, linguagem simples e elementos visuais que transformam números em uma história fácil de entender.

Azul-marinho profundo com **violeta** e lilás, tipografia condensada em caixa alta e detalhes em pixel inspirados no monograma da marca.

---

## ✨ Funcionalidades

Seções, na ordem: **Início → Serviços → Planos → Sobre a ContLup → Entenda seus números → Contato**.

- 🧭 Barra lateral que expande ao passar o mouse, com opção de fixar aberta (desktop), e menu de tela cheia no celular, ambos com o item da seção atual destacado
- 🌗 Tema escuro e claro
- 👩‍💼 Sobre a ContLup: a empresa, a contadora responsável e o jeito de trabalhar
- 🗂️ Cinco serviços: contábil, fiscal e tributário, trabalhista, societário e BPO Financeiro, com painel lateral de detalhes (atividades, benefícios e aprovação dos pagamentos)
- 🌐 Atendimento 100% online, com o CNPJ no rodapé
- 💳 Planos ContLup (Lup MEI, Start, Plus e Prime) com contato direto pelo WhatsApp comercial
- 📈 Entenda seus números: números que fazem sentido (painel ilustrativo), problemas reais, assuntos do dia a dia e "A Lupi explica"
- 🤖 **Lupi 2.0**, assistente virtual **sem IA**: entende perguntas por regras (sinônimos, erros leves de digitação, desambiguação), lembra o contexto da conversa ("E quanto custa?", "Esse plano inclui folha?"), tem 41 respostas aprovadas no ar, incluindo BPO Financeiro, atendimento online e CNPJ (outras 39 aguardam revisão profissional e ficam fora do ar), fluxos guiados (incluindo "Encontrar um plano") e prepara a mensagem para o WhatsApp comercial, que o visitante revisa antes de enviar
- 📝 Formulário de pedido de proposta
- 📲 Contatos com botão de copiar e WhatsApp

---

## 🛠️ Tecnologias

- **HTML5** para a estrutura
- **CSS3** para identidade visual, responsividade e animações
- **JavaScript** puro para as interações
- **GitHub Pages** para hospedagem

- **Cloudflare Workers** para um backend de IA opcional, guardado e desligado (as chaves nunca iriam para o site)
- **Node.js test runner** e **Playwright** para os testes

Estrutura: `css/style.css` e `js/main.js` (site), `css/lupi.css` e `js/lupi/` (assistente), `data/` (base de conhecimento e fluxos editáveis), `worker/` (backend), `eval/` (comparação Gemini x OpenAI) e `tests/`.

---

## ⚙️ Como rodar

```bash
git clone https://github.com/lorenzo-or7/contlup-demo.git
cd contlup-demo
npm run serve        # http://localhost:8080
```

O chat da Lupi usa módulos JavaScript, que precisam de um servidor (não abra o `index.html` direto do disco).
A Lupi funciona sem IA e sem servidor. O backend com IA em `worker/` está desligado e o site não baixa esse código.

## 🤖 Lupi 2.0

- Guia (como ela entende as perguntas, contexto, fluxos, como manter o repertório e, para o futuro, como ligar a IA): [`docs/LUPI-2.md`](docs/LUPI-2.md)
- Relatório de testes: [`docs/RELATORIO-TESTES.md`](docs/RELATORIO-TESTES.md)
- Pendências para revisão da Priscila: [`docs/PENDENCIAS-PRISCILA.md`](docs/PENDENCIAS-PRISCILA.md)

```bash
npm install && npm test && npm run test:ui
```

> Este é um projeto demonstrativo: os números exibidos no painel são ilustrativos e não representam dados de clientes.

---

## 👨‍💻 Autor

<p>
  Feito por <b>Lorenzo Orsetti</b><br/>
  <a href="https://lorenzo-or7.github.io">
    <img src="https://img.shields.io/badge/Portf%C3%B3lio-BF40FA?style=for-the-badge&logo=googlechrome&logoColor=040607" />
  </a>
  <a href="https://www.linkedin.com/in/lorenzo-orsetti-031906349/">
    <img src="https://img.shields.io/badge/LinkedIn-040607?style=for-the-badge&logo=linkedin&logoColor=BF40FA" />
  </a>
  <a href="https://github.com/lorenzo-or7">
    <img src="https://img.shields.io/badge/GitHub-040607?style=for-the-badge&logo=github&logoColor=BF40FA" />
  </a>
</p>

<p align="center">
  <img src="footer.svg" width="100%" alt="" />
</p>
