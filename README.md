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
  Demo de site para um escritório de contabilidade real de Pedreira/SP, com tema escuro e claro, áreas de atuação, painel de números ilustrativo, dúvidas frequentes e pedido de proposta.
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

- 🧭 Barra lateral que expande ao passar o mouse, com opção de fixar aberta (desktop)
- 🌗 Tema escuro e claro
- 🗂️ Áreas de atuação: contábil, fiscal, trabalhista e societário
- 🏢 "Para quem é": do MEI à empresa em crescimento
- 📈 Painel "Visão do mês" com números ilustrativos
- 👩‍💼 Apresentação da contadora responsável
- 💬 "A Lupi explica" e perguntas frequentes
- 🤖 **Lupi 2.0**, assistente virtual híbrida: fluxos guiados sem IA, respostas aprovadas pela ContLup, IA (Gemini ou OpenAI) para perguntas abertas via backend seguro, histórico da sessão, expressões da personagem e resumo revisável para o WhatsApp
- 📝 Formulário de pedido de proposta
- 📲 Contatos com botão de copiar e WhatsApp

---

## 🛠️ Tecnologias

- **HTML5** para a estrutura
- **CSS3** para identidade visual, responsividade e animações
- **JavaScript** puro para as interações
- **GitHub Pages** para hospedagem

- **Cloudflare Workers** para o backend da IA (as chaves nunca vão para o site)
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
Sem backend configurado, a Lupi funciona no **modo básico** (fluxos e respostas aprovadas, sem IA).

## 🤖 Lupi 2.0

- Guia completo (arquitetura, publicação do backend, chaves, conexão com o GitHub Pages, comparação de provedores): [`docs/LUPI-2.md`](docs/LUPI-2.md)
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
