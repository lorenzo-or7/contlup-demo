// Auditoria pré-lançamento (29/10/2026): injeção de código, histórico adulterado, console e rede, estabilidade do layout,
// links e destinos de contato, página sem JavaScript e telas largas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const PAYLOADS = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '[clique](javascript:window.__xss=1)',
  '"><svg onload="window.__xss=1">',
  '{{constructor.constructor("window.__xss=1")()}}',
];
const OK_WA = /^https:\/\/wa\.me\/(5519971310182|5519997447919)(\?|$)/;

test('[segurança] Lupi: texto malicioso aparece como texto, nada é executado nem vira HTML', async () => {
  const { page, ctx, errors } = await openPage(env, { reducedMotion: 'reduce' });
  let dialogs = 0;
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
  for (const p of PAYLOADS) {
    await page.fill('#lc-in', p);
    await page.press('#lc-in', 'Enter');
    await page.waitForFunction((t) => [...document.querySelectorAll('.lc-user .lc-b')].some(b => b.textContent === t), p);
    await page.waitForFunction(() => !document.querySelector('.lc-typing'));
  }
  const r = await page.evaluate(() => ({
    xss: window.__xss, injected: document.querySelectorAll('#lupi-chat img:not(.lc-av):not(.lc-pose), #lupi-chat script, #lupi-chat svg[onload], #lupi-chat [onerror]').length,
    jsLinks: [...document.querySelectorAll('#lupi-chat a')].filter(a => /^javascript:/i.test(a.getAttribute('href'))).length,
  }));
  assert.deepEqual(r, { xss: undefined, injected: 0, jsLinks: 0 });
  assert.equal(dialogs, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[segurança] histórico adulterado no navegador não executa código nem cria links fora da lista', async () => {
  const evil = {
    v: 2, savedAt: Date.now(), flow: null, suspended: null, lastCompleted: null, chips: [], ctx: null,
    messages: [
      { id: 'm1', role: 'bot', text: '<img src=x onerror="window.__xss=1"> [site](https://evil.example) [js](javascript:window.__xss=1) [ok](https://wa.me/5519971310182)', expression: 'idle' },
      { id: 'm2', role: 'user', text: '<script>window.__xss=1</script>' },
      { id: 'm3"]<x', role: 'bot', kind: 'handoff', text: '</textarea><img src=x onerror="window.__xss=1">', state: 'pending' },
    ],
  };
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce', init: (s) => sessionStorage.setItem('lupi:v2:session', s), });
  await page.evaluate((s) => sessionStorage.setItem('lupi:v2:session', s), JSON.stringify(evil));
  await page.reload();
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
  const r = await page.evaluate(() => ({
    xss: window.__xss,
    hrefs: [...document.querySelectorAll('#lupi-chat .lc-log a')].map(a => a.getAttribute('href')),
    imgs: document.querySelectorAll('#lupi-chat .lc-log img:not(.lc-av)').length,
    textarea: document.querySelector('#lupi-chat textarea')?.value || '',
  }));
  assert.equal(r.xss, undefined);
  assert.equal(r.imgs, 0);
  assert.ok(r.hrefs.every(h => OK_WA.test(h) || h.startsWith('#')), `links: ${r.hrefs}`);
  if (r.textarea) assert.match(r.textarea, /<\/textarea>/, 'conteúdo do resumo fica como texto');
  await ctx.close();
});

test('[segurança] formulário: campos maliciosos vão só como texto codificado para o WhatsApp comercial', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await page.evaluate(() => document.getElementById('proposta').scrollIntoView());
  await page.fill('#f-nome', '<img src=x onerror="window.__xss=1"> Ana');
  await page.fill('#f-tel', '(19) 99999-0000');
  await page.fill('#f-msg', 'https://evil.example/?a=<script>');
  await page.click('.btn-form');
  await page.click('.btn-form'); // segundo toque logo em seguida: não abre outra conversa
  const r = await page.evaluate(() => ({ opened: window.__opened, xss: window.__xss, ok: !document.getElementById('form-ok').hidden, link: document.getElementById('form-link').href }));
  assert.equal(r.opened.length, 1, 'uma conversa só');
  assert.match(r.opened[0], OK_WA);
  assert.equal(new URL(r.opened[0]).searchParams.get('text').includes('<img src=x onerror="window.__xss=1"> Ana'), true, 'texto preservado, sem virar HTML');
  assert.equal(r.xss, undefined);
  assert.equal(r.link, r.opened[0]);
  await ctx.close();
});

test('[formulário] validação: obrigatórios, telefone com DDD, mensagens ligadas aos campos', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await page.evaluate(() => document.getElementById('proposta').scrollIntoView());
  await page.click('.btn-form');
  assert.equal(await page.getAttribute('#f-nome', 'aria-invalid'), 'true');
  assert.equal(await page.getAttribute('#f-nome', 'aria-describedby'), 'e-nome');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-nome');
  await page.fill('#f-nome', 'Ana');
  for (const bad of ['1234', '(19) 9', '+55 19 99999-0000 1234']) {
    await page.fill('#f-tel', bad);
    await page.click('.btn-form');
    assert.equal(await page.getAttribute('#f-tel', 'aria-invalid'), 'true', bad);
  }
  assert.deepEqual(await page.evaluate(() => window.__opened), [], 'nada abre com dados inválidos');
  assert.equal(await page.isHidden('#form-ok'), true, 'nenhuma confirmação falsa');
  await ctx.close();
});

for (const [label, opts] of [['desktop', {}], ['celular', { viewport: { width: 390, height: 844 }, isMobile: true }]]) {
  test(`[qualidade] ${label}: página inteira sem erros no console, sem recurso faltando e sem requisições externas`, async () => {
    const failed = [];
    const { page, ctx, errors, requests } = await openPage(env, { ...opts, consent: null });
    page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    page.on('requestfailed', r => failed.push(`falhou ${r.url()}`));
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } });
    await page.waitForLoadState('networkidle');
    await page.click('.lc-launch');
    await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
    await page.waitForTimeout(800);
    const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.getAttribute('src')));
    assert.deepEqual(failed, []);
    assert.deepEqual(broken, [], 'imagens quebradas');
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter(u => !u.startsWith(env.base)), [], 'nada de terceiros');
    await ctx.close();
  });
}

test('[performance] layout estável: imagens com dimensões e deslocamento acumulado baixo ao carregar', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true, init: () => {
    window.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  } });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    cls: window.__cls,
    noSize: [...document.querySelectorAll('img')].filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src')),
    noAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).map(i => i.getAttribute('src')),
  }));
  assert.deepEqual(r.noSize, []);
  assert.deepEqual(r.noAlt, []);
  assert.ok(r.cls < 0.1, `CLS ${r.cls.toFixed(3)}`);
  await ctx.close();
});

test('[contato] destinos reais: WhatsApp comercial, telefone, e-mail e Instagram oficiais; âncoras internas existem', async () => {
  const { page, ctx } = await openPage(env);
  const r = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
    return {
      wa: links.filter(h => h.includes('wa.me')), tel: links.filter(h => h.startsWith('tel:')), mail: [...new Set(links.filter(h => h.startsWith('mailto:')))],
      ig: [...new Set(links.filter(h => h.includes('instagram.com')))],
      other: [...new Set(links.filter(h => /^https?:/.test(h) && !/wa\.me|instagram\.com|gov\.br/.test(h)))],
      missing: links.filter(h => h.startsWith('#') && h.length > 1 && !document.getElementById(h.slice(1))),
    };
  });
  assert.ok(r.wa.length > 10 && r.wa.every(h => /^https:\/\/wa\.me\/(5519971310182|5519997447919)(\?text=|$)/.test(h)), 'WhatsApp');
  assert.ok(r.wa.filter(h => h.includes('5519971310182')).length > r.wa.filter(h => h.includes('5519997447919')).length, 'comercial é o principal');
  assert.deepEqual(r.tel, ['tel:+5519971310182']);
  assert.deepEqual(r.mail, ['mailto:contato@contlup.com.br']);
  assert.deepEqual(r.ig, ['https://www.instagram.com/contlupstudiocontabil/']);
  assert.deepEqual(r.other, [], 'nenhum link externo inesperado');
  assert.deepEqual(r.missing, []);
  await ctx.close();
});

test('[sem JavaScript] conteúdo e contatos continuam acessíveis; nenhum aviso preso na tela', async () => {
  const ctx = await env.browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(env.base + '/');
  const r = await page.evaluate(() => ({
    sections: ['inicio', 'servicos', 'planos', 'contlup', 'numeros', 'contato'].filter(id => { const e = document.getElementById(id); return e && e.getBoundingClientRect().height > 50; }).length,
    navLinks: [...document.querySelectorAll('.nav-list a')].filter(a => a.getBoundingClientRect().width > 0).length,
    ck: !document.querySelector('.js-ck').hidden,
    plans: [...document.querySelectorAll('.plan')].filter(p => getComputedStyle(p).opacity !== '0').length,
  }));
  assert.deepEqual(r, { sections: 6, navLinks: 6, ck: false, plans: 4 });
  await ctx.close();
});

for (const width of [1440, 1920]) {
  test(`[responsivo] ${width}px: barra superior, quatro planos lado a lado, sem rolagem lateral, aviso e Lupi sem se cobrirem`, async () => {
    const { page, ctx, errors } = await openPage(env, { viewport: { width, height: 1000 }, consent: null, reducedMotion: 'reduce' });
    await page.waitForSelector('.js-ck:not([hidden])');
    await page.click('.lc-launch');
    await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
    const r = await page.evaluate(() => {
      const b = (s) => document.querySelector(s).getBoundingClientRect();
      const plans = [...document.querySelectorAll('.plan')].map(p => Math.round(p.getBoundingClientRect().top));
      const ck = b('.js-ck'), lc = b('#lupi-chat');
      return { docW: document.documentElement.scrollWidth, iw: innerWidth, rows: new Set(plans).size, overlap: !(ck.right <= lc.left || lc.right <= ck.left || ck.bottom <= lc.top || lc.bottom <= ck.top), wrapW: b('.nav-in').width };
    });
    assert.ok(r.docW <= r.iw);
    assert.equal(r.rows, 1, 'planos numa linha');
    assert.equal(r.overlap, false);
    assert.ok(r.wrapW <= 1320, 'conteúdo com largura máxima (não estica em telas grandes)');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('[acessibilidade] painel do BPO: o texto rola pelo teclado e mostra o foco', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await page.evaluate(() => document.querySelector('.js-bpo-open').scrollIntoView());
  await page.click('.js-bpo-open');
  await page.waitForSelector('#bpo-painel[open]');
  let onBody = false;
  for (let i = 0; i < 4 && !onBody; i++) { await page.keyboard.press('Tab'); onBody = await page.evaluate(() => document.activeElement.classList.contains('bpo-body')); }
  assert.ok(onBody, 'área do texto recebe foco pelo Tab');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none', 'foco visível');
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('.bpo-body').scrollTop > 0);
  await ctx.close();
});

test('[acessibilidade] tema claro: o verde de "↑ 8,2%" no painel ilustrativo tem contraste AA', async () => {
  const { page, ctx } = await openPage(env, { consent: { prefs: true }, init: () => localStorage.setItem('cl-theme', 'light') });
  const ratio = await page.evaluate(() => {
    const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const el = document.querySelector('.k-d');
    let bgEl = el; while (getComputedStyle(bgEl).backgroundColor === 'rgba(0, 0, 0, 0)') bgEl = bgEl.parentElement;
    const [a, b] = [lum(getComputedStyle(el).color), lum(getComputedStyle(bgEl).backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
  assert.ok(ratio >= 4.5, `contraste ${ratio.toFixed(2)}`);
  await ctx.close();
});

test('[404] página de erro autossuficiente abre sem erros nem requisições extras, com o link de volta', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 375, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (!r.url().endsWith('/404.html')) errors.push('requisição extra: ' + r.url()); });
  await page.goto(env.base + '/404.html');
  const r = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, href: document.querySelector('a').getAttribute('href'), w: document.documentElement.scrollWidth, iw: innerWidth, h: document.querySelector('a').getBoundingClientRect().height }));
  assert.equal(r.h1, 'Página não encontrada.');
  assert.equal(r.href, 'https://lorenzo-or7.github.io/contlup-demo/');
  assert.ok(r.w <= r.iw && r.h >= 44);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[sem JavaScript] celular: as seis seções aparecem como lista no topo; botões que dependem de script somem', async () => {
  const ctx = await env.browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(env.base + '/');
  const r = await page.evaluate(() => ({
    links: [...document.querySelectorAll('.nav-list a')].filter(a => { const b = a.getBoundingClientRect(); return b.height > 30 && getComputedStyle(a).visibility === 'visible'; }).length,
    hidden: ['.lc-launch', '.nav-burger', '.js-bpo-open'].map(s => getComputedStyle(document.querySelector(s)).display),
    docW: document.documentElement.scrollWidth, iw: innerWidth,
  }));
  assert.equal(r.links, 6);
  assert.deepEqual(r.hidden, ['none', 'none', 'none']);
  assert.ok(r.docW <= r.iw);
  await ctx.close();
});

test('[acessibilidade] contraste corrigido: faixa do Contato no tema claro, rótulos do Contato, assinatura do Hero e botões "Ligar"/"Copiar" iguais', async () => {
  const { page, ctx } = await openPage(env, { consent: { prefs: true }, init: () => localStorage.setItem('cl-theme', 'light') });
  const r = await page.evaluate(() => {
    const rgb = (c) => { const m = c.match(/[\d.]+/g).map(Number); return c.startsWith('color(') ? m.slice(0, 3).map(v => v * 255) : m.slice(0, 3); };
    const lum = (c) => rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const NAVY = 'rgb(13, 21, 51)'; // cor mais clara do gradiente da faixa do Contato (pior caso)
    const c = (s) => getComputedStyle(document.querySelector(s)).color;
    const fs = (s) => getComputedStyle(document.querySelector(s)).fontSize;
    return {
      pill: ratio(c('.cta .online-pill'), NAVY), eyebrow: ratio(c('.cta-l .eyebrow'), NAVY), small: ratio(c('.contact small'), 'rgb(26, 32, 80)'),
      call: fs('.contact a.copy.call'), copy: fs('.contact button.copy'),
      sign: getComputedStyle(document.querySelector('.hero-sign')).backgroundColor !== 'rgba(0, 0, 0, 0)',
    };
  });
  assert.ok(r.pill >= 4.5, `pílula ${r.pill.toFixed(2)}`);
  assert.ok(r.eyebrow >= 4.5, `rótulo ${r.eyebrow.toFixed(2)}`);
  assert.ok(r.small >= 4.5, `rótulos do contato ${r.small.toFixed(2)}`);
  assert.equal(r.call, r.copy, '"Ligar" com o mesmo tamanho de "Copiar"');
  assert.ok(r.sign, 'assinatura do Hero com fundo próprio sobre a ilustração');
  await ctx.close();
});
