// Testes de interface da reorganização do site: larguras pedidas, temas, sobreposição, planos e navegação.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const ORDER = ['inicio', 'contlup', 'priscila', 'jeito', 'servicos', 'planos', 'numeros', 'historia', 'situacoes', 'lupi-explica', 'contato', 'fale-conosco'];
const WIDTHS = [320, 375, 768, 1024, 1440];
const COLUMNS = { 320: 1, 375: 1, 768: 2, 1024: 2, 1440: 4 };
const lightTheme = () => localStorage.setItem('cl-theme', 'light');

// contraste WCAG entre o texto e o primeiro fundo sólido dos ancestrais
const CONTRAST = () => {
  const parse = (c) => { const k = c.startsWith('color(') ? 1 : 255; const v = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).map(Number); return { rgb: v.slice(0, 3).map(x => x / k), a: v[3] ?? 1 }; };
  const lum = ({ rgb }) => { const [r, g, b] = rgb.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement) return null; // imagem/gradiente: não dá para medir assim
      const c = parse(cs.backgroundColor);
      if (c.a >= 0.95) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  for (const el of document.querySelectorAll('main section h2, main section h3, main section p, main section li, footer p, footer a')) {
    if (!el.offsetParent || !el.textContent.trim() || el.closest('#lupi-chat, .dash, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) < 1 || cs.visibility !== 'visible') continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const fg = parse(cs.color);
    if (fg.a < 0.95) continue;
    const [x, y] = [lum(fg), lum(bg)].sort((m, n) => n - m);
    const ratio = (x + 0.05) / (y + 0.05);
    const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" ${ratio.toFixed(2)}`);
  }
  return out;
};

for (const width of WIDTHS) {
  for (const theme of ['escuro', 'claro']) {
    test(`[layout] ${width}px, tema ${theme}: ordem, sem rolagem lateral, sem sobreposição, planos em ${COLUMNS[width]} coluna(s)`, async () => {
      const mobile = width < 900;
      const { page, ctx, errors } = await openPage(env, {
        viewport: { width, height: 900 }, isMobile: width <= 375, reducedMotion: 'reduce',
        colorScheme: theme === 'claro' ? 'light' : 'dark', init: theme === 'claro' ? lightTheme : undefined,
      });
      assert.equal(await page.getAttribute('html', 'data-cl'), theme === 'claro' ? 'light' : null);
      const r = await page.evaluate((order) => {
        const boxes = order.map(id => { const b = document.getElementById(id).getBoundingClientRect(); return { id, top: b.top + scrollY, bottom: b.bottom + scrollY, h: b.height }; });
        const plans = [...document.querySelectorAll('.plans-grid .plan')].map(p => { const b = p.getBoundingClientRect(); return { top: Math.round(b.top + scrollY), left: Math.round(b.left), right: Math.round(b.right), items: [...p.querySelectorAll('li')].filter(li => li.offsetHeight > 0).length, cta: !!p.querySelector('a.plan-cta[href^="https://wa.me/5519971310182"]') }; });
        const wide = [...document.querySelectorAll('main *, footer *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.marquee, .topics-track, [aria-hidden="true"]'); }).map(e => e.className || e.tagName).slice(0, 5);
        return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, boxes, plans, wide };
      }, ORDER);
      assert.ok(r.scrollW <= r.innerW, `rolagem lateral: ${r.scrollW} > ${r.innerW}`);
      assert.deepEqual(r.wide, [], 'elementos passando da largura da tela');
      for (let i = 1; i < r.boxes.length; i++) {
        assert.ok(r.boxes[i].h > 0, `#${r.boxes[i].id} sem altura`);
        assert.ok(r.boxes[i].top >= r.boxes[i - 1].bottom - 1, `#${r.boxes[i - 1].id} sobrepõe #${r.boxes[i].id}`);
      }
      // planos: 4 cards, todos os benefícios visíveis, botões individuais e colunas pedidas
      assert.equal(r.plans.length, 4);
      assert.deepEqual(r.plans.map(p => p.items), [7, 7, 6, 7]);
      assert.ok(r.plans.every(p => p.cta), 'cada plano com seu botão de WhatsApp');
      const perRow = r.plans.filter(p => p.top === r.plans[0].top).length;
      assert.equal(perRow, COLUMNS[width], `cards por linha: ${perRow}`);
      for (let i = 1; i < r.plans.length; i++) if (r.plans[i].top === r.plans[i - 1].top) assert.ok(r.plans[i].left >= r.plans[i - 1].right, 'cards lado a lado não se sobrepõem');
      const low = await page.evaluate(CONTRAST);
      assert.deepEqual(low, [], 'textos com contraste abaixo do mínimo WCAG AA');
      if (mobile) assert.equal(await page.isVisible('.mbar'), true);
      else assert.equal(await page.isVisible('.sb-nav'), true);
      assert.deepEqual(errors, []);
      await ctx.close();
    });
  }
}

test('[navegação] desktop: cada item da barra lateral leva à seção, abaixo do topo, e fica ativo', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  for (const id of ['contlup', 'servicos', 'planos', 'numeros', 'contato', 'inicio']) {
    await page.click(`.sb-nav a[href="#${id}"]`);
    await page.waitForFunction((i) => document.querySelector(`.sb-nav a[href="#${i}"]`).getAttribute('aria-current') === 'true', id, { timeout: 4000 });
    const top = await page.evaluate((i) => document.getElementById(i).getBoundingClientRect().top, id);
    assert.ok(Math.abs(top) <= 80, `#${id} no topo (${top}px)`);
    assert.equal(await page.locator('.sb-nav a[aria-current="true"]').count(), 1, 'só um item ativo');
  }
  await ctx.close();
});

test('[navegação] desktop: rolar até subseções mantém o item do grupo ativo (Sobre, Seus números, Contato)', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  for (const [sub, group] of [['priscila', 'contlup'], ['jeito', 'contlup'], ['historia', 'numeros'], ['situacoes', 'numeros'], ['lupi-explica', 'numeros'], ['fale-conosco', 'contato']]) {
    await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block: 'start' }), sub);
    await page.waitForFunction((g) => document.querySelector(`.sb-nav a[href="#${g}"]`).getAttribute('aria-current') === 'true', group, { timeout: 4000 });
  }
  await ctx.close();
});

for (const width of [320, 375]) {
  test(`[navegação] celular ${width}px: menu leva a cada seção sem ficar escondida atrás da barra fixa`, async () => {
    const { page, ctx, errors } = await openPage(env, { viewport: { width, height: 740 }, isMobile: true, reducedMotion: 'reduce' });
    for (const id of ['contlup', 'servicos', 'planos', 'numeros', 'contato']) {
      await page.tap('.mbar-btn');
      assert.equal(await page.isVisible('#mmenu'), true);
      await page.tap(`#mmenu a[href="#${id}"]`);
      assert.equal(await page.isHidden('#mmenu'), true, 'menu fecha ao escolher');
      await page.waitForFunction((i) => Math.abs(document.getElementById(i).getBoundingClientRect().top) < 120, id, { timeout: 4000 });
      await page.waitForFunction((i) => document.querySelector(`#mmenu a[href="#${i}"]`).getAttribute('aria-current') === 'true', id, { timeout: 2000 }).catch(() => {});
      const r = await page.evaluate((i) => {
        const bar = document.querySelector('.mbar').getBoundingClientRect().bottom;
        const head = document.querySelector(`#${i} h2, #${i} .eyebrow`).getBoundingClientRect().top;
        return { bar, head, active: document.querySelector(`#mmenu a[href="#${i}"]`).getAttribute('aria-current') };
      }, id);
      assert.ok(r.head >= r.bar - 1, `#${id}: título em ${r.head}px, barra até ${r.bar}px`);
      assert.equal(r.active, 'true', `#${id} ativo no menu do celular`);
    }
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'rolagem liberada depois de fechar o menu');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('[conteúdo] FAQ não aparece mais como seção; respostas continuam na Lupi', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  assert.equal(await page.locator('#duvidas, .faq').count(), 0);
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
  await page.fill('#lc-in', 'O que preciso para a primeira conversa?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.lc-bot').length >= 2);
  assert.doesNotMatch(await page.textContent('.lc-log'), /Não encontrei/);
  await ctx.close();
});
