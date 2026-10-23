// Testes de interface do painel lateral do BPO Financeiro (Chromium real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';
import { BPO } from '../support/official.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const lightTheme = () => localStorage.setItem('cl-theme', 'light');
const OPEN = '.js-bpo-open';

async function openPanel(page) {
  await page.locator(OPEN).scrollIntoViewIfNeeded();
  await page.click(OPEN);
  await page.waitForFunction(() => document.getElementById('bpo-painel').open);
  // fim da animação de entrada: o painel fica encostado na direita da tela
  await page.waitForFunction(() => {
    const b = document.querySelector('.bpo-panel').getBoundingClientRect();
    return Math.abs(b.right - innerWidth) < 1 && getComputedStyle(document.querySelector('.bpo-panel')).transform === 'none';
  });
}
const state = (page) => page.evaluate(() => ({
  open: document.getElementById('bpo-painel').open,
  lock: document.body.classList.contains('bpo-lock'),
  overflow: getComputedStyle(document.body).overflow,
  active: document.activeElement?.className || document.activeElement?.tagName,
}));

// contraste WCAG dos textos do painel contra o fundo do painel
const PANEL_CONTRAST = () => {
  const parse = (c) => { const k = c.startsWith('color(') ? 1 : 255; const v = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).map(Number); return { rgb: v.slice(0, 3).map(x => x / k), a: v[3] ?? 1 }; };
  const lum = ({ rgb }) => { const [r, g, b] = rgb.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bg = parse(getComputedStyle(document.querySelector('.bpo-panel')).backgroundColor);
  const out = [];
  for (const el of document.querySelectorAll('.bpo-panel h2, .bpo-panel h3, .bpo-panel p, .bpo-panel li b, .bpo-panel li span, .bpo-panel .bpo-bens li')) {
    if (!el.textContent.trim() || el.closest('.bpo-note, .bpo-cta')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const [x, y] = [lum(fg), lum(bg)].sort((m, n) => n - m);
    const ratio = (x + 0.05) / (y + 0.05);
    const large = parseFloat(cs.fontSize) >= 24;
    if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}`);
  }
  return out;
};

test('[BPO] desktop: abre pela direita, fundo escurecido e travado, foco no fechar, conteúdo confirmado', async () => {
  const { page, ctx, errors } = await openPage(env);
  await page.locator(OPEN).scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  await openPanel(page);
  const s = await state(page);
  assert.equal(s.lock, true);
  assert.equal(s.overflow, 'hidden', 'página de fundo não rola');
  assert.match(s.active, /js-bpo-close/, 'foco no botão de fechar');
  const box = await page.locator('.bpo-panel').boundingBox();
  assert.ok(box.width <= 560 && box.width >= 480, `largura ${box.width}`);
  assert.ok(Math.abs(box.x + box.width - 1440) < 1 && box.y === 0 && Math.abs(box.height - 900) < 1);
  const backdrop = await page.evaluate(() => getComputedStyle(document.getElementById('bpo-painel'), '::backdrop').backgroundColor);
  assert.match(backdrop, /rgba\(4, 7, 18, 0\.56\)/, 'fundo escurecido');
  assert.equal(await page.isVisible('.js-bpo-close'), true);
  assert.equal(await page.textContent('#bpo-t'), BPO.title);
  assert.equal(await page.locator('.bpo-acts li').count(), 7);
  assert.equal(await page.locator('.bpo-bens li').count(), 7);
  const href = new URL(await page.getAttribute('.bpo-cta', 'href'));
  assert.equal(href.origin + href.pathname, 'https://wa.me/5519971310182');
  assert.equal(href.searchParams.get('text'), BPO.message);
  assert.equal(await page.evaluate(() => scrollY), scrollBefore, 'abrir não mexe na rolagem da página');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[BPO] rolagem independente: o conteúdo do painel rola e a página não', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 1440, height: 700 } });
  await openPanel(page);
  const y0 = await page.evaluate(() => scrollY);
  const dims = await page.evaluate(() => { const b = document.querySelector('.bpo-body'); return { sh: b.scrollHeight, ch: b.clientHeight }; });
  assert.ok(dims.sh > dims.ch, 'conteúdo maior que a área visível (rolagem interna)');
  await page.mouse.move(1200, 400);
  await page.mouse.wheel(0, 900);
  await page.waitForFunction(() => document.querySelector('.bpo-body').scrollTop > 100);
  assert.equal(await page.evaluate(() => scrollY), y0, 'a página de fundo não rolou');
  assert.equal(await page.isVisible('.bpo-cta'), true, 'CTA fixo no rodapé do painel');
  await ctx.close();
});

test('[BPO] teclado: foco preso no painel, Escape fecha e o foco volta para o "Saiba mais"', async () => {
  const { page, ctx } = await openPage(env);
  await openPanel(page);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.getElementById('bpo-painel').contains(document.activeElement)), true, `Shift+Tab ${i + 1} saiu do painel`);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.getElementById('bpo-painel').contains(document.activeElement)), true, `Tab ${i + 1} saiu do painel`);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('bpo-painel').open);
  const s = await state(page);
  assert.equal(s.lock, false);
  assert.notEqual(s.overflow, 'hidden');
  assert.match(s.active, /js-bpo-open/, 'foco restaurado no botão que abriu');
  await ctx.close();
});

test('[BPO] fecha pelo botão e pelo clique fora; fundo não recebe cliques com o painel aberto', async () => {
  const { page, ctx } = await openPage(env);
  await openPanel(page);
  // o que está "por baixo" do escurecido é o próprio painel (::backdrop), não a página
  const hit = await page.evaluate(() => document.elementFromPoint(300, 450)?.id);
  assert.equal(hit, 'bpo-painel');
  assert.equal(await page.evaluate(() => { const a = document.querySelector('.sb-nav a'); a.focus(); return document.activeElement === a; }), false, 'página de fundo inerte');
  await page.click('.js-bpo-close');
  await page.waitForFunction(() => !document.getElementById('bpo-painel').open);
  assert.match((await state(page)).active, /js-bpo-open/);
  await openPanel(page);
  await page.mouse.click(300, 450);
  await page.waitForFunction(() => !document.getElementById('bpo-painel').open);
  assert.equal((await state(page)).lock, false);
  // clique dentro do painel não fecha
  await openPanel(page);
  await page.click('.bpo-intro');
  await page.waitForTimeout(600);
  assert.equal((await state(page)).open, true);
  await ctx.close();
});

test('[BPO] movimento reduzido: abre e fecha sem animação', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await page.locator(OPEN).scrollIntoViewIfNeeded();
  await page.click(OPEN);
  const t = await page.evaluate(() => getComputedStyle(document.querySelector('.bpo-panel')).transitionDuration);
  assert.equal(t, '0s');
  // o ::backdrop não entra na regra global "*" do site: o escurecido também não pode ter transição
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('bpo-painel'), '::backdrop').transitionDuration), '0s');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.bpo-panel')).transform === 'none', null, { timeout: 300 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('bpo-painel').open, null, { timeout: 300 });
  await ctx.close();
});

for (const width of [320, 375, 768, 1024, 1440]) {
  for (const theme of ['escuro', 'claro']) {
    test(`[BPO] ${width}px, tema ${theme}: painel na tela, sem rolagem lateral, contraste AA`, async () => {
      const mobile = width <= 375;
      const { page, ctx, errors } = await openPage(env, {
        viewport: { width, height: mobile ? 700 : 900 }, isMobile: mobile, reducedMotion: 'reduce',
        colorScheme: theme === 'claro' ? 'light' : 'dark', init: theme === 'claro' ? lightTheme : undefined,
      });
      await openPanel(page);
      const r = await page.evaluate(() => {
        const p = document.querySelector('.bpo-panel').getBoundingClientRect();
        const body = document.querySelector('.bpo-body');
        const x = document.querySelector('.js-bpo-close').getBoundingClientRect();
        const cta = document.querySelector('.bpo-cta').getBoundingClientRect();
        const wide = [...document.querySelectorAll('.bpo-panel *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > p.right + 1 || b.left < p.left - 1); }).map(e => e.className).slice(0, 4);
        return { p: { left: p.left, right: p.right, width: p.width, height: p.height }, overflowX: body.scrollWidth - body.clientWidth, x, cta, wide, docW: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, padTop: parseFloat(getComputedStyle(document.querySelector('.bpo-head')).paddingTop) };
      });
      if (width <= 600) assert.ok(Math.abs(r.p.width - width) < 1, `largura total no celular (${r.p.width})`);
      else assert.ok(r.p.width <= 560, `largura ${r.p.width}`);
      assert.ok(r.p.left >= 0 && Math.abs(r.p.right - r.iw) < 1);
      assert.ok(Math.abs(r.p.height - r.ih) < 1);
      assert.ok(r.overflowX <= 0, 'conteúdo do painel sem rolagem lateral');
      assert.deepEqual(r.wide, [], 'nada passa da largura do painel');
      assert.ok(r.docW <= r.iw, 'página sem rolagem lateral');
      assert.ok(r.x.top >= 0 && r.x.right <= r.iw && r.x.height >= 44, 'fechar visível e com área de toque');
      assert.ok(r.cta.bottom <= r.ih && r.cta.height >= 44, 'CTA visível');
      assert.ok(r.padTop >= 18, 'respiro no topo (soma a área segura no celular)');
      assert.deepEqual(await page.evaluate(PANEL_CONTRAST), [], 'contraste');
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }
}
