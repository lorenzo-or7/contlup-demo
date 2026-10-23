// Rodapé em três níveis e Hero sem referência geográfica, no navegador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const lightTheme = () => localStorage.setItem('cl-theme', 'light');
const COLS = { 320: 'mobile', 375: 'mobile', 768: 2, 1024: 4, 1440: 4 };

const layout = (page) => page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
  const cols = ['.foot-brand', '.foot-nav', '.foot-contact', '.foot-links'].map(s => r(document.querySelector(s)));
  const legal = [...document.querySelectorAll('.legal > *')].map(r);
  return { cols, legal, sig: r(document.querySelector('.sig')), legalBox: r(document.querySelector('.legal')), iw: innerWidth, docW: document.documentElement.scrollWidth };
});

for (const width of [320, 375, 768, 1024, 1440]) {
  for (const theme of ['escuro', 'claro']) {
    test(`[rodapé] ${width}px, tema ${theme}: colunas organizadas, faixa legal e assinatura sem sobreposição`, async () => {
      const { page, ctx, errors } = await openPage(env, {
        viewport: { width, height: 900 }, isMobile: width <= 375, reducedMotion: 'reduce',
        colorScheme: theme === 'claro' ? 'light' : 'dark', init: theme === 'claro' ? lightTheme : undefined,
      });
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
      const L = await layout(page);
      const [brand, nav, contact, links] = L.cols;
      if (COLS[width] === 4) {
        assert.ok(L.cols.every(c => Math.abs(c.y - brand.y) <= 6), 'as quatro colunas na mesma linha');
        for (let i = 1; i < 4; i++) assert.ok(L.cols[i].x >= L.cols[i - 1].right, 'colunas lado a lado sem sobreposição');
      } else if (COLS[width] === 2) {
        assert.ok(Math.abs(nav.y - brand.y) <= 6 && Math.abs(links.y - contact.y) <= 6 && contact.y > brand.y, 'duas colunas, duas linhas');
      } else {
        assert.ok(brand.w >= width - 40, 'institucional ocupa a largura');
        assert.ok(Math.abs(nav.y - links.y) <= 6 && links.x > nav.x, 'navegação e links úteis lado a lado (página mais curta)');
        assert.ok(contact.y > nav.y, 'contato abaixo');
      }
      assert.ok(L.legalBox.y > Math.max(...L.cols.map(c => c.y + c.h)), 'faixa legal abaixo do conteúdo');
      assert.ok(L.sig.y >= L.legalBox.y + L.legalBox.h - 1, 'assinatura logo abaixo da faixa legal');
      assert.ok(L.sig.y - (L.legalBox.y + L.legalBox.h) < 40, 'assinatura não fica solta');
      for (let i = 0; i < L.legal.length; i++) for (let j = i + 1; j < L.legal.length; j++) {
        const a = L.legal[i], b = L.legal[j];
        const overlap = a.x < b.right && b.x < a.right && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, 'itens da faixa legal sem sobreposição');
      }
      assert.ok(L.docW <= L.iw, 'sem rolagem lateral');
      // CNPJ inteiro numa linha e legível
      const cnpj = await page.evaluate(() => { const e = document.querySelector('.legal .cnpj'); return { lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)), text: e.textContent }; });
      assert.equal(cnpj.text, 'CNPJ 68.970.978/0001-10');
      assert.equal(cnpj.lines, 1);
      // contraste AA dos textos do rodapé contra o fundo azul-marinho
      const low = await page.evaluate(() => {
        const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255);
        const lum = (rgb) => { const [r, g, b] = rgb.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = lum(parse(getComputedStyle(document.querySelector('footer.site-foot')).backgroundColor));
        const out = [];
        for (const el of document.querySelectorAll('footer.site-foot h4, footer.site-foot p, footer.site-foot a, footer.site-foot a small, footer.site-foot .legal *, footer.site-foot .sig-txt *')) {
          if (!el.textContent.trim() || el.closest('[hidden]')) continue;
          const fg = lum(parse(getComputedStyle(el).color));
          const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          if (ratio < 4.5) out.push(`${el.className || el.tagName} ${ratio.toFixed(2)}`);
        }
        return out;
      });
      assert.deepEqual(low, []);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }
}

test('[rodapé] política de privacidade: um único botão abre e fecha o texto; link do chat também abre', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  assert.equal(await page.locator('footer.site-foot >> text=/Política de privacidade/i').count(), 1);
  assert.equal(await page.isHidden('#privacidade'), true);
  await page.click('.js-priv-toggle');
  assert.equal(await page.getAttribute('.js-priv-toggle', 'aria-expanded'), 'true');
  assert.equal(await page.isVisible('#privacidade'), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'privacidade', 'foco vai para o texto');
  await page.click('.js-priv-toggle');
  assert.equal(await page.isHidden('#privacidade'), true);
  assert.equal(await page.getAttribute('.js-priv-toggle', 'aria-expanded'), 'false');
  // o link "Privacidade" do rodapé do chat abre o mesmo texto
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
  await page.click('.lc-note a[href="#privacidade"]');
  await page.waitForFunction(() => !document.getElementById('privacidade').hidden);
  assert.equal(await page.getAttribute('.js-priv-toggle', 'aria-expanded'), 'true');
  await ctx.close();
});

test('[rodapé] links com hover e foco visíveis (microinteração)', async () => {
  const { page, ctx } = await openPage(env);
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  const a = page.locator('.foot-nav a').first();
  const before = await a.evaluate(e => getComputedStyle(e, '::after').transform);
  const box = await a.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(450);
  const after = await a.evaluate(e => [getComputedStyle(e).color, getComputedStyle(e, '::after').transform]);
  assert.notEqual(after[1], before, 'sublinhado anima no hover');
  await page.keyboard.press('Tab');
  await a.focus();
  assert.equal(await a.evaluate(e => getComputedStyle(e).outlineStyle !== 'none' || getComputedStyle(e, '::after').transform !== 'matrix(0, 0, 0, 1, 0, 0)'), true, 'foco visível');
  await ctx.close();
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`[Hero] ${width}px: "Atendimento 100% online" no lugar da cidade, dentro da tela`, async () => {
    const { page, ctx } = await openPage(env, { viewport: { width, height: 800 }, isMobile: width <= 375, reducedMotion: 'reduce' });
    const r = await page.evaluate(() => {
      const loc = document.querySelector('.hero .loc');
      const b = loc.getBoundingClientRect();
      return { text: loc.innerText.replace(/\s+/g, ' ').trim(), left: b.left, right: b.right, visible: b.width > 0 && getComputedStyle(loc).display !== 'none', iw: innerWidth, docW: document.documentElement.scrollWidth };
    });
    assert.match(r.text, /^ATENDIMENTO 100% ONLINE CONTABILIDADE PRÓXIMA, ONDE VOCÊ ESTIVER$/i);
    if (r.visible) assert.ok(r.left >= 0 && r.right <= r.iw, `dentro da tela (${r.left}–${r.right})`);
    assert.ok(r.docW <= r.iw);
    assert.doesNotMatch(await page.textContent('.hero'), /Pedreira/);
    await ctx.close();
  });
}

// Regressão: no celular cada palavra do título vira bloco com line-height .88, e o gradiente recortado no texto
// (background-clip:text) não chegava aos acentos de "Ú" e "Õ". Confere a geometria e os pixels pintados.
for (const width of [320, 375, 768, 1024, 1440]) {
  for (const theme of ['escuro', 'claro']) {
    test(`[Hero] ${width}px, tema ${theme}: acentos de "NÚMEROS" e "DECISÕES" pintados`, async () => {
      const { page, ctx } = await openPage(env, {
        viewport: { width, height: 800 }, isMobile: width <= 375, reducedMotion: 'reduce',
        colorScheme: theme === 'claro' ? 'light' : 'dark', init: theme === 'claro' ? lightTheme : undefined,
      });
      await page.evaluate(() => document.fonts.ready);
      // 1) geometria: a área pintada de cada palavra (e do título, que no tema claro tem filtro) começa acima do topo da fonte
      const geo = await page.evaluate(() => {
        const t = document.querySelector('.hero-title');
        const title = t.getBoundingClientRect();
        const filtered = getComputedStyle(t).filter !== 'none'; // só o filtro (tema claro no celular) cria camada que corta
        return [...document.querySelectorAll('.hero-title .w')].map(w => {
          const rg = document.createRange(); rg.selectNodeContents(w);
          const glyphTop = rg.getClientRects()[0].top;
          return { word: w.textContent.trim(), box: w.getBoundingClientRect().top - glyphTop, title: filtered ? title.top - glyphTop : 0 };
        });
      });
      for (const g of geo) {
        assert.ok(g.box <= 0.5, `${g.word}: gradiente começa ${g.box.toFixed(1)}px abaixo do topo da fonte`);
        assert.ok(g.title <= 0.5, `${g.word}: título corta ${g.title.toFixed(1)}px do topo`);
      }
      // 2) pixels: sem a foto e o fundo, a zona do acento acima de "U" e de "O" tem tinta do título
      // o mouse começa em (0,0), em cima da barra lateral, que abre por hover e cobre o início do título
      await page.mouse.move(width / 2, 790);
      await page.addStyleTag({ content: '.sidebar,.mbar,.hero-photo,.hero-bg,.hero-ring,.hero-px,.hero-top,.hero-foot{visibility:hidden!important}' });
      for (const [word, idx] of [['Números', 1], ['Decisões', 5]]) {
        const zone = await page.evaluate(([wd, i]) => {
          const w = [...document.querySelectorAll('.hero-title .w')].find(x => x.textContent.trim() === wd);
          const rg = document.createRange(); rg.setStart(w.firstChild, i); rg.setEnd(w.firstChild, i + 1);
          const r = rg.getBoundingClientRect();
          return { x: r.x + r.width * 0.15, y: r.y, width: r.width * 0.7, height: r.height * 0.2 };
        }, [word, idx]);
        const png = await page.screenshot({ clip: zone });
        const ink = await page.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data;
          const bg = [d[0], d[1], d[2]];            // canto: fundo
          let n = 0;
          for (let p = 0; p < d.length; p += 4) if (Math.abs(d[p] - bg[0]) + Math.abs(d[p + 1] - bg[1]) + Math.abs(d[p + 2] - bg[2]) > 120) n++;
          return n / (d.length / 4);
        }, png.toString('base64'));
        assert.ok(ink > 0.04, `${word}: zona do acento sem tinta (${(ink * 100).toFixed(1)}%)`);
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem lateral');
      await ctx.close();
    });
  }
}
