// Testes de interface da seção de planos e do BPO (Chromium real): layout, legibilidade, temas e navegação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

async function goToPlans(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.rv').forEach(e => e.classList.remove('rv-pending'));
    const s = document.getElementById('planos');
    const offset = innerWidth < 900 ? 64 : 0;
    window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - offset, behavior: 'instant' });
  });
  await page.mouse.move(5, 5); // tira o mouse de cima dos cards (sem hover)
  await page.mouse.move(page.viewportSize().width - 5, 120);
  await page.waitForTimeout(700);
}

const measure = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('.plan')];
  const rects = cards.map(c => c.getBoundingClientRect());
  const rows = new Map();
  cards.forEach((c, i) => { const k = Math.round(rects[i].top); (rows.get(k) || rows.set(k, []).get(k)).push(c); });
  const outside = [];
  cards.forEach((c, i) => c.querySelectorAll('li, p, h3, .plan-cta').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.left < rects[i].left - 1 || r.right > rects[i].right + 1 || r.bottom > rects[i].bottom + 1) outside.push(el.textContent.trim().slice(0, 40));
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' || cs.display === 'none' || cs.visibility === 'hidden') outside.push('oculto: ' + el.textContent.slice(0, 30));
  }));
  const ctaBottoms = [...rows.values()].map(row => new Set(row.map(c => Math.round(c.querySelector('.plan-cta').getBoundingClientRect().bottom))).size);
  const internalScroll = cards.some(c => c.scrollHeight > c.clientHeight + 1 || /auto|scroll/.test(getComputedStyle(c).overflowY + getComputedStyle(c.querySelector('.plan-list')).overflowY));
  const minFont = Math.min(...cards.flatMap(c => [...c.querySelectorAll('li')].map(li => parseFloat(getComputedStyle(li).fontSize))));
  return {
    cols: new Set(rects.map(r => Math.round(r.left))).size,
    sectionTop: Math.round(document.querySelector('.plans-head').getBoundingClientRect().top),
    bottom: Math.round(Math.max(...rects.map(r => r.bottom))),
    outside, ctaBottoms, internalScroll, minFont,
    hscroll: document.documentElement.scrollWidth > innerWidth,
    items: cards.reduce((n, c) => n + c.querySelectorAll('li').length, 0),
  };
});

for (const [w, h] of [[1366, 768], [1440, 900], [1536, 864], [1920, 1080]]) {
  test(`[planos] desktop ${w}x${h}: 4 cards lado a lado com todos os benefícios em uma única tela`, async () => {
    const { page, ctx, errors } = await openPage(env, { viewport: { width: w, height: h } });
    await goToPlans(page);
    const m = await measure(page);
    assert.equal(m.cols, 4);
    assert.equal(m.items, 27, 'todos os benefícios renderizados');
    assert.ok(m.bottom <= h, `cards terminam em ${m.bottom}px numa tela de ${h}px`);
    assert.deepEqual(m.outside, [], 'nada cortado, escondido ou fora do card');
    assert.equal(m.internalScroll, false, 'sem rolagem interna');
    assert.deepEqual(m.ctaBottoms, [1], 'botões alinhados na base');
    assert.ok(m.minFont >= 14, `fonte mínima ${m.minFont}px`);
    assert.equal(m.hscroll, false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

for (const [w, h, cols, mobile] of [[1024, 768, 2, false], [820, 1180, 2, true], [390, 844, 1, true], [320, 568, 1, true]]) {
  test(`[planos] ${w}x${h}: ${cols} coluna(s), legível, sem cortes e com rolagem normal da página`, async () => {
    const { page, ctx, errors } = await openPage(env, { viewport: { width: w, height: h }, isMobile: mobile });
    await goToPlans(page);
    const m = await measure(page);
    assert.equal(m.cols, cols);
    assert.equal(m.items, 27);
    assert.deepEqual(m.outside, []);
    assert.equal(m.internalScroll, false);
    assert.ok(m.ctaBottoms.every(n => n === 1), 'botões alinhados em cada linha');
    assert.ok(m.minFont >= 14);
    assert.equal(m.hscroll, false, 'sem rolagem horizontal');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

for (const theme of ['dark', 'light']) {
  test(`[tema] planos no tema ${theme === 'dark' ? 'escuro' : 'claro'}: contraste do texto (WCAG AA)`, async () => {
    const { page, ctx } = await openPage(env, { init: theme === 'light' ? () => { localStorage.setItem('cl-consent', JSON.stringify({ v: 1, prefs: true, at: '2026-10-28T00:00:00.000Z' })); localStorage.setItem('cl-theme', 'light'); } : undefined });
    await goToPlans(page);
    const ratios = await page.evaluate(() => {
      const parse = (c) => { const k = c.startsWith('color(') ? 1 : 255; const v = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).map(Number); return { rgb: v.slice(0, 3).map(x => x / k), a: v[3] ?? 1 }; };
      const lum = ([r, g, b]) => [r, g, b].map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const pageBg = parse(getComputedStyle(document.body).backgroundColor).rgb;
      const card = document.querySelector('.plan');
      // fundo efetivo do card: camada translúcida sobre o fundo da página
      const grad = getComputedStyle(card).backgroundImage.match(/rgba?\([^)]+\)|color\([^)]+\)/)[0];
      const top = parse(grad);
      const bg = pageBg.map((v, i) => top.rgb[i] * top.a + v * (1 - top.a));
      const ratio = (el) => { const L1 = lum(parse(getComputedStyle(el).color).rgb), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
      return ['.plan-tag', '.plan-for', '.plan-list li', '.plan-num'].map(s => [s, +ratio(card.querySelector(s)).toFixed(2)]);
    });
    for (const [sel, r] of ratios) assert.ok(r >= 4.5, `${sel}: contraste ${r}`);
    await ctx.close();
  });
}

test('[planos] item "Planos" da barra superior leva à seção e fica ativo', async () => {
  const { page, ctx } = await openPage(env);
  await page.click('.nav-list a[data-target="planos"]');
  await page.waitForFunction(() => document.querySelector('.nav-list a[data-target="planos"]').classList.contains('is-active'), null, { timeout: 5000 });
  // espera a rolagem suave terminar
  await page.waitForFunction(() => new Promise(r => { const y = scrollY; setTimeout(() => r(scrollY === y), 250); }), null, { timeout: 5000 });
  const top = await page.evaluate(() => document.getElementById('planos').getBoundingClientRect().top);
  assert.ok(top > 60 && top < 110, `seção logo abaixo da barra superior (${top}px do topo)`);
  await ctx.close();
});

test('[planos] celular: item "Planos" do menu leva à seção', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true });
  await page.tap('.js-burger');
  await page.tap('#nav-menu a[href="#planos"]');
  await page.waitForTimeout(1200);
  assert.equal(await page.getAttribute('.js-burger', 'aria-expanded'), 'false');
  const top = await page.evaluate(() => document.getElementById('planos').getBoundingClientRect().top);
  assert.ok(top < 120 && top > -40, `seção a ${top}px do topo`);
  await ctx.close();
});

test('[acessibilidade] botões "Tenho interesse": nome acessível, foco visível pelo teclado e área de toque', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true });
  await goToPlans(page);
  const info = await page.$$eval('.plan-cta', els => els.map(e => ({ label: e.getAttribute('aria-label'), h: e.getBoundingClientRect().height })));
  assert.equal(info.length, 4);
  for (const i of info) { assert.match(i.label, /^Tenho interesse no plano Lup (MEI|Start|Plus|Prime): abre o WhatsApp comercial/); assert.ok(i.h >= 44); }
  await page.focus('.plan-cta');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(outline, 'none');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('plan-cta')), true);
  // cada card é uma região rotulada pelo nome do plano
  const labels = await page.$$eval('.plan', els => els.map(e => document.getElementById(e.getAttribute('aria-labelledby')).textContent));
  assert.deepEqual(labels, ['Lup MEI', 'Lup Start', 'Lup Plus', 'Lup Prime']);
  await ctx.close();
});

test('[BPO] card aparece na seção de serviços em desktop e celular, sem cortes', async () => {
  for (const [vp, mobile] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
    const { page, ctx } = await openPage(env, { viewport: vp, isMobile: mobile });
    await page.evaluate(() => { document.querySelectorAll('.rv').forEach(e => e.classList.remove('rv-pending')); document.getElementById('svc-bpo').scrollIntoView({ block: 'center', behavior: 'instant' }); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const c = document.getElementById('svc-bpo'); const b = c.getBoundingClientRect();
      const grid = c.parentElement.getBoundingClientRect();
      return { visible: b.height > 80, fullWidth: Math.abs(b.width - grid.width) < 2, text: c.textContent.replace(/\s+/g, ' ').trim(), overflow: [...c.querySelectorAll('h3,p')].some(e => e.getBoundingClientRect().right > b.right + 1) };
    });
    assert.ok(r.visible);
    assert.ok(r.fullWidth, 'ocupa a largura da grade');
    assert.equal(r.overflow, false);
    assert.match(r.text, /BPO Financeiro/);
    await ctx.close();
  }
});
