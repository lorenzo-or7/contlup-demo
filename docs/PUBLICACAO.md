# Revisar e publicar

## Revisar a branch (sem mexer no site público)

```bash
git fetch origin
git checkout claude/affectionate-clarke-ehqqp7
npm install          # só na primeira vez (Playwright, usado nos testes)
npm run serve        # abre em http://localhost:8080
npm test             # testes rápidos
npm run test:ui      # testes no navegador (Chromium)
```

Para ver o aviso de privacidade de novo: no navegador, apague os dados do site (ou abra uma janela anônima).

## Publicar no GitHub Pages (depois de autorizar)

O GitHub Pages publica a branch `main`. Publicar = abrir um pull request desta branch para a `main` e fazer o merge.
Em 1–2 minutos o site em https://lorenzo-or7.github.io/contlup-demo/ é atualizado (aba **Actions → pages build and deployment**).

O `_config.yml` deixa fora do site: `_revisao/` (respostas pendentes da Lupi), `docs/`, `tests/`, `eval/`, `worker/`
e os arquivos de desenvolvimento. O `.htaccess` também não vai para o GitHub Pages.

## Hospedagem própria (HostGator ou outra com Apache) — quando for migrar

1. Envie só o site: `index.html`, `404.html`, `robots.txt`, `sitemap.xml`, `.htaccess` e as pastas `css/`, `js/`, `img/`, `fonts/`, `data/`
   (para a raiz do domínio, normalmente `public_html/`).
   **Não envie** `_revisao/`, `docs/`, `tests/`, `eval/`, `worker/`, `node_modules/` nem `package*.json`.
2. Ative o certificado HTTPS do domínio no painel da hospedagem antes de usar o `.htaccess` (ele redireciona tudo para HTTPS).
3. Troque o endereço `https://lorenzo-or7.github.io/contlup-demo/` pelo domínio novo (7 vezes em `index.html`: canonical,
   og:url, og:image e dados estruturados; 1 vez em `404.html`, `robots.txt` e `sitemap.xml`). O teste
   `tests/unit/launch-readiness.test.mjs` lista esses lugares: depois da troca, ajuste o endereço esperado nele.
4. HSTS fica comentado no `.htaccess`: ligue só depois de confirmar que o domínio inteiro funciona em HTTPS.
5. Se a IA da Lupi for ligada um dia (`<meta name="lupi-api">`), inclua o endereço dela em `connect-src` na política de
   segurança do `index.html`.
6. Se o site der "erro 500" logo depois do envio, apague a linha `Options -Indexes` do `.htaccess` (alguns planos não a permitem).
7. Depois da migração, desative o GitHub Pages (Settings → Pages) para a página de demonstração não competir com o site
   oficial nos buscadores (conteúdo duplicado).

O site é estático: não precisa de PHP, banco de dados nem servidor Node em produção. O formulário de proposta não envia
nada a um servidor: ele monta a mensagem e abre o WhatsApp comercial, onde o visitante confirma o envio.
