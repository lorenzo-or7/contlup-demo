// Responsividade: as seis seções nas larguras pedidas, nos dois temas, deitado e com zoom.
// Motor testado: Chromium (Playwright). WebKit e Firefox não estão instalados neste ambiente; aparelhos físicos não foram usados.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const WIDTHS = [320, 360, 375, 390, 430, 768, 1024];
const SECTIONS = ['inicio', 'servicos', 'planos', 'contlup', 'numeros', 'contato'];

/** Medidas de layout de uma página já aberta. */
const measure = (page) => page.evaluate(() => {
  const iw = innerWidth;
  const rect = (el) => el.getBoundingClientRect();
  const plans = [...document.querySelectorAll('.plan')];
  const segs = [...document.querySelectorAll('.seg li')];
  const cards = (sel) => [...document.querySelectorAll(sel)].map(el => Math.round(rect(el).left));
  // texto cortado: elementos de texto cujo conteúdo é mais largo que a caixa (sem rolagem própria)
  const clipped = [...document.querySelectorAll('main h1, main h2, main h3, main p, main li, main a.btn, main button, footer a, footer p')]
    .filter(el => !el.closest('[aria-hidden="true"], .marquee, .sr, [hidden]') && el.offsetParent !== null)
    .filter(el => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'hidden')
    .map(el => el.className || el.tagName);
  const heroImg = document.querySelector('.hero-photo img');
  return {
    docW: document.documentElement.scrollWidth, iw,
    sections: [...document.querySelectorAll('[id]')].filter(e => ['inicio', 'servicos', 'planos', 'contlup', 'numeros', 'contato'].includes(e.id)).map(e => e.id),
    planLefts: plans.map(p => Math.round(rect(p).left)),
    planItemsHidden: plans.some(p => [...p.querySelectorAll('li, .plan-cta')].some(li => { const r = rect(li); return r.height === 0 || r.right > iw + 1 || li.offsetParent === null; })),
    planCtas: plans.map(p => !!p.querySelector('.plan-cta') && rect(p.querySelector('.plan-cta')).height >= 44),
    segLefts: segs.map(s => Math.round(rect(s).left)),
    segSideBorders: segs.filter(s => parseFloat(getComputedStyle(s).borderLeftWidth) > 0).length,
    afterFooter: document.documentElement.scrollHeight - Math.round(rect(document.querySelector('footer.site-foot')).bottom + scrollY),
    svcLefts: cards('#servicos .svc'),
    hero: { w: rect(heroImg).width, right: rect(heroImg).right, loaded: heroImg.complete && heroImg.naturalWidth > 0 },
    clipped,
  };
});

for (const theme of ['dark', 'light']) {
  test(`[responsivo] ${theme}: 320–1024 px sem rolagem lateral, cards em coluna no celular, planos completos, Hero com a ilustração`, async () => {
    for (const width of WIDTHS) {
      const mobile = width < 900;
      const { page, ctx, errors } = await openPage(env, {
        viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, reducedMotion: 'reduce',
        consent: { prefs: true }, init: theme === 'light' ? () => localStorage.setItem('cl-theme', 'light') : undefined,
      });
      if (theme === 'light') assert.equal(await page.getAttribute('html', 'data-cl'), 'light');
      await page.evaluate(() => document.fonts.ready);
      const m = await measure(page);
      assert.ok(m.docW <= m.iw, `${width}px: rolagem lateral (${m.docW} > ${m.iw})`);
      assert.deepEqual(m.sections, SECTIONS, `${width}px: seis seções`);
      assert.equal(m.planLefts.length, 4, 'quatro planos');
      assert.equal(m.planItemsHidden, false, `${width}px: benefício ou botão de plano escondido`);
      assert.ok(m.planCtas.every(Boolean), `${width}px: botões dos planos com 44 px`);
      if (width < 700) assert.equal(new Set(m.planLefts).size, 1, `${width}px: planos empilhados`);
      if (width < 600) {
        assert.equal(new Set(m.segLefts).size, 1, `${width}px: "Para quem é" em uma coluna`);
        assert.equal(m.segSideBorders, 0, `${width}px: cards empilhados sem borda lateral sobrando`);
        assert.equal(new Set(m.svcLefts).size, 1, `${width}px: serviços em uma coluna`);
      }
      assert.ok(m.hero.loaded && m.hero.w > 120 && m.hero.right <= m.iw + 40, `${width}px: ilustração do Hero visível`);
      assert.deepEqual(m.clipped, [], `${width}px: texto cortado`);
      assert.ok(m.afterFooter <= 1, `${width}px: espaço vazio depois do rodapé (${m.afterFooter}px)`);
      assert.deepEqual(errors, [], `${width}px: erros no console`);
      await ctx.close();
    }
  });
}

test('[responsivo] celular deitado (844×390) e zoom de 200% (640×450): sem rolagem lateral, menu e Lupi utilizáveis', async () => {
  for (const [w, h, mobile] of [[844, 390, true], [640, 450, false]]) {
    const { page, ctx } = await openPage(env, { viewport: { width: w, height: h }, isMobile: mobile, reducedMotion: 'reduce' });
    const m = await measure(page);
    assert.ok(m.docW <= m.iw, `${w}x${h}: rolagem lateral`);
    await page.click('.js-burger');
    const menu = await page.evaluate(() => { const n = document.querySelector('#nav-menu'); return { scroll: n.scrollHeight > n.clientHeight, bottom: n.getBoundingClientRect().bottom, ih: innerHeight, oy: getComputedStyle(n).overflowY }; });
    assert.ok(menu.bottom <= menu.ih + 1, 'menu cabe na tela');
    if (menu.scroll) assert.equal(menu.oy, 'auto', 'menu maior que a tela rola por dentro');
    await page.keyboard.press('Escape');
    await page.click('.lc-launch');
    await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
    const r = await page.evaluate(() => { const b = document.querySelector('#lc-in').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ih: innerHeight }; });
    assert.ok(r.top >= 0 && r.bottom <= r.ih, `${w}x${h}: campo da Lupi visível`);
    await ctx.close();
  }
});

test('[toque] celular: controles principais com pelo menos 44 px', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 375, height: 800 }, isMobile: true, consent: null });
  await page.waitForSelector('.js-ck:not([hidden])');
  const small = await page.evaluate(() => {
    const sel = '.nav-burger, .nav-theme, .nav-logo, .js-ck-accept, .js-ck-reject, .fab, .lc-launch, .plan-cta, .btn, .copy, .foot-col li a, .legal-priv, .areas-btn, .q-btn, .lupi-q, .path, .ig-link';
    return [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map(el => { const r = el.getBoundingClientRect(); return { c: el.className, t: el.textContent.trim().slice(0, 20), w: r.width, h: r.height }; })
      .filter(x => x.h < 44 || x.w < 44);
  });
  assert.deepEqual(small, []);
  await ctx.close();
});

test('[teclado] desktop: navegação, tema e WhatsApp alcançáveis com foco visível', async () => {
  const { page, ctx } = await openPage(env);
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => {
      const a = document.activeElement; const cs = getComputedStyle(a);
      return { k: a.className || a.tagName, t: a.textContent.trim().slice(0, 22), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 };
    }));
  }
  const labels = seen.map(s => s.t);
  for (const t of ['Início', 'Serviços', 'Planos', 'Sobre a ContLup', 'Entenda seus números', 'Contato']) assert.ok(labels.some(l => l.endsWith(t)), t);
  assert.ok(seen.some(s => /nav-theme/.test(s.k)) && seen.some(s => /nav-wa/.test(s.k)));
  assert.ok(seen.filter(s => !/skip/.test(s.k)).every(s => s.outline), 'foco visível em todos');
  await ctx.close();
});
