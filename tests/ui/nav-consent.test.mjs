// Navegação nova (barra superior, cabeçalho compacto e menu suspenso), aviso de privacidade e convivência com a Lupi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage, openChat } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const PHONE = { viewport: { width: 375, height: 740 }, isMobile: true };
const noSmooth = (page) => page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
const consent = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('cl-consent') || 'null'));

// ---------------- navegação ----------------
test('[nav] desktop 1440 e 1024: barra superior horizontal, sem barra lateral, item ativo e conteúdo livre', async () => {
  for (const width of [1440, 1024]) {
    const { page, ctx, errors } = await openPage(env, { viewport: { width, height: 800 } });
    await noSmooth(page);
    assert.equal(await page.locator('.sidebar, .sb-nav, .mbar, #mmenu').count(), 0);
    assert.equal(await page.isVisible('.js-burger'), false, `${width}: sem hambúrguer`);
    const tops = await page.$$eval('.nav-list a', as => as.map(a => Math.round(a.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, `${width}: links numa linha só`);
    const fits = await page.evaluate(() => { const n = document.querySelector('.nav-in'); return n.scrollWidth <= n.clientWidth + 1; });
    assert.ok(fits, `${width}: nada espremido ou cortado`);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('main')).paddingLeft), '0px', 'sem margem da barra antiga');
    await page.click('.nav-list a[data-target="planos"]');
    await page.waitForFunction(() => document.querySelector('.nav-list a[data-target="planos"]').getAttribute('aria-current') === 'true');
    const r = await page.evaluate(() => ({ nav: document.querySelector('.nav').getBoundingClientRect().bottom, h: document.querySelector('#planos-h').getBoundingClientRect().top }));
    assert.ok(r.h >= r.nav, `${width}: a barra não cobre o título (${r.h} < ${r.nav})`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('[nav] tema: alternador na barra funciona e indica o estado', async () => {
  const { page, ctx } = await openPage(env);
  await page.click('.nav-theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), 'light');
  assert.equal(await page.getAttribute('.nav-theme', 'aria-pressed'), 'true');
  await page.click('.nav-theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), null);
  await ctx.close();
});

test('[nav] celular: logo à esquerda, tema e hambúrguer à direita; menu suspenso (não tela cheia) com as 6 seções', async () => {
  const { page, ctx } = await openPage(env, PHONE);
  const r = await page.evaluate(() => {
    const b = (s) => document.querySelector(s).getBoundingClientRect();
    return { logo: b('.nav-logo').left, theme: b('.nav-theme').left, burger: b('.nav-burger').left, burgerW: b('.nav-burger').width, iw: innerWidth };
  });
  assert.ok(r.logo < 40 && r.theme > r.iw / 2 && r.burger > r.theme && r.burgerW >= 44);
  await page.tap('.js-burger');
  assert.equal(await page.getAttribute('.js-burger', 'aria-expanded'), 'true');
  await page.waitForTimeout(400); // fim da animação de entrada
  const m = await page.evaluate(() => { const b = document.querySelector('#nav-menu').getBoundingClientRect(); return { top: b.top, h: b.height, vh: innerHeight, nav: document.querySelector('.nav').getBoundingClientRect().bottom }; });
  assert.ok(Math.abs(m.top - m.nav) <= 2, `menu logo abaixo do cabeçalho (${m.top} x ${m.nav})`);
  assert.ok(m.h < m.vh, 'não ocupa a tela inteira');
  assert.deepEqual(await page.$$eval('#nav-menu .lbl', l => l.map(x => x.textContent)), ['Início', 'Serviços', 'Planos', 'Sobre a ContLup', 'Entenda seus números', 'Contato']);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '#inicio', 'foco vai para o primeiro item');
  await ctx.close();
});

test('[nav] celular: fecha pelo hambúrguer, Esc, toque fora e escolha de seção; rolagem travada e restaurada', async () => {
  const { page, ctx } = await openPage(env, PHONE);
  await noSmooth(page);
  await page.evaluate(() => scrollTo(0, 1500));
  await page.mouse.wheel(0, -120); await page.waitForTimeout(600); // rolar para cima mostra o cabeçalho
  const y0 = await page.evaluate(() => scrollY);
  const open = async () => { await page.tap('.js-burger'); assert.equal(await page.evaluate(() => document.body.style.position), 'fixed', 'fundo travado'); };
  const closed = async (how) => {
    assert.equal(await page.getAttribute('.js-burger', 'aria-expanded'), 'false', how);
    assert.equal(await page.evaluate(() => document.body.style.position), '', `${how}: trava removida`);
  };
  await open(); await page.tap('.js-burger'); await closed('hambúrguer');
  assert.equal(await page.evaluate(() => scrollY), y0, 'volta exatamente para onde estava');
  await open(); await page.keyboard.press('Escape'); await closed('Esc');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('js-burger')), true, 'foco volta ao botão');
  assert.equal(await page.evaluate(() => scrollY), y0);
  await open(); await page.mouse.click(180, 700); await closed('toque fora');
  assert.equal(await page.evaluate(() => scrollY), y0);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => document.querySelector('.nav').classList.contains('is-hidden')), false, 'cabeçalho continua visível depois de fechar o menu');
  await open(); await page.tap('#nav-menu a[href="#contato"]'); await closed('seção');
  await page.waitForFunction(() => Math.abs(document.getElementById('contato').getBoundingClientRect().top) < 140);
  await ctx.close();
});

test('[nav] celular: menu aberto não fica travado ao virar para desktop', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 800, height: 900 } });
  await page.click('.js-burger');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => document.body.style.position === '');
  assert.equal(await page.getAttribute('.js-burger', 'aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.querySelector('.nav').classList.contains('is-open')), false);
  await ctx.close();
});

test('[nav] celular: cabeçalho some ao rolar para baixo, volta ao rolar para cima, ignora movimentos mínimos', async () => {
  const { page, ctx } = await openPage(env, PHONE);
  await noSmooth(page);
  const hidden = () => page.evaluate(() => document.querySelector('.nav').classList.contains('is-hidden'));
  await page.mouse.wheel(0, 600); await page.waitForTimeout(250);
  assert.equal(await hidden(), true, 'some ao descer');
  await page.mouse.wheel(0, -8); await page.waitForTimeout(200);
  assert.equal(await hidden(), true, 'movimento mínimo não mostra');
  await page.mouse.wheel(0, -200); await page.waitForTimeout(250);
  assert.equal(await hidden(), false, 'volta ao subir');
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
  assert.equal(await hidden(), false, 'no topo, sempre visível');
  await ctx.close();
});

// ---------------- aviso de privacidade ----------------
test('[privacidade] primeira visita: aviso aparece na hora, canto inferior esquerdo, com a Lupi segurando o cookie', async () => {
  const { page, ctx, errors } = await openPage(env, { consent: null });
  await page.waitForSelector('.js-ck.is-in');
  const r = await page.evaluate(() => {
    const ck = document.querySelector('.js-ck').getBoundingClientRect();
    const lu = document.querySelector('.lc-launch').getBoundingClientRect();
    const img = document.querySelector('.ck-art img');
    return { left: ck.left, bottom: innerHeight - ck.bottom, luLeft: lu.left, ckRight: ck.right, img: img.complete && img.naturalWidth > 0, prefs: localStorage.getItem('cl-consent') };
  });
  assert.ok(r.left <= 40 && r.bottom <= 40, 'canto inferior esquerdo');
  assert.ok(r.ckRight < r.luLeft, 'não encosta no botão da Lupi');
  assert.ok(r.img, 'ilustração carregada');
  assert.equal(r.prefs, null, 'nada é gravado antes da escolha');
  assert.equal(await page.isChecked('#ck-pref'), false);
  // rolar e navegar não é consentimento
  await page.mouse.wheel(0, 2000); await page.waitForTimeout(300);
  await page.click('.nav-list a[data-target="planos"]'); await page.waitForTimeout(300);
  assert.equal(await page.isVisible('.js-ck'), true);
  assert.equal(await consent(page), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[privacidade] aceitar: grava a escolha, some com fade e o tema passa a ser lembrado', async () => {
  const { page, ctx } = await openPage(env, { consent: null });
  await page.waitForSelector('.js-ck.is-in');
  await page.click('.nav-theme');
  await page.click('.js-ck-accept');
  assert.equal(await page.evaluate(() => document.querySelector('.js-ck').classList.contains('is-closing')), true, 'animação de saída');
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  const c = await consent(page);
  assert.equal(c.v, 1); assert.equal(c.prefs, true);
  assert.equal(await page.evaluate(() => localStorage.getItem('cl-theme')), 'light', 'tema atual gravado');
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-cl'), 'light', 'tema lembrado');
  await page.waitForTimeout(300);
  assert.equal(await page.isVisible('.js-ck'), false, 'aviso não volta');
  await ctx.close();
});

test('[privacidade] recusar: só o essencial; tema não é lembrado e o que existia é apagado', async () => {
  const { page, ctx } = await openPage(env, { consent: null, init: () => { localStorage.setItem('cl-theme', 'light'); } });
  assert.equal(await page.getAttribute('html', 'data-cl'), null, 'antes da escolha, nada lido do armazenamento opcional');
  await page.click('.js-ck-reject');
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  assert.equal((await consent(page)).prefs, false);
  assert.equal(await page.evaluate(() => localStorage.getItem('cl-theme')), null);
  await page.click('.nav-theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), 'light', 'o tema funciona na página');
  assert.equal(await page.evaluate(() => localStorage.getItem('cl-theme')), null, 'mas não é gravado');
  await ctx.close();
});

test('[privacidade] personalizar: abre no próprio cartão (sem modal), Lupi diminui, salvar respeita a chave', async () => {
  const { page, ctx } = await openPage(env, { consent: null });
  await page.waitForSelector('.js-ck.is-in');
  const before = await page.evaluate(() => document.querySelector('.ck-art img').getBoundingClientRect().height);
  await page.click('.js-ck-custom');
  assert.equal(await page.getAttribute('.js-ck-custom', 'aria-expanded'), 'true');
  assert.equal(await page.locator('dialog[open], [aria-modal="true"]:visible').count(), 0, 'nenhum modal');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ck-pref', 'foco na opção');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => document.querySelector('.ck-art img').getBoundingClientRect().height);
  assert.ok(after < before * 0.9, `ilustração diminui (${before} → ${after})`);
  assert.equal(await page.isVisible('.ck-always'), true, 'essenciais descritos como sempre ativos');
  await page.keyboard.press('Space');
  assert.equal(await page.isChecked('#ck-pref'), true);
  await page.click('.js-ck-custom');
  await page.waitForTimeout(600);
  const back = await page.evaluate(() => document.querySelector('.ck-art img').getBoundingClientRect().height);
  assert.ok(Math.abs(back - before) < 2, 'volta ao tamanho original');
  await page.click('.js-ck-custom');
  await page.click('.js-ck-save');
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  assert.equal((await consent(page)).prefs, true);
  // rodapé reabre já com a escolha atual
  await page.click('.js-ck-open');
  await page.waitForSelector('.js-ck.is-in');
  assert.equal(await page.isVisible('#ck-prefs'), true);
  assert.equal(await page.isChecked('#ck-pref'), true);
  await page.click('#ck-pref');
  await page.click('.js-ck-save');
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  assert.equal((await consent(page)).prefs, false);
  await ctx.close();
});

test('[privacidade] teclado: primeiro Tab vai ao "Pular para o conteúdo", depois ao aviso; leitor de tela ouve a confirmação', async () => {
  const { page, ctx } = await openPage(env, { consent: null });
  await page.waitForSelector('.js-ck.is-in');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('js-ck-accept')), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('js-ck-reject')), true, 'recusar tão acessível quanto aceitar');
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('.js-ck-status'), /Somente o essencial/);
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), 'conteudo', 'foco não se perde');
  await ctx.close();
});

test('[privacidade] armazenamento bloqueado: a escolha vale na página, o site segue funcionando', async () => {
  const { page, ctx, errors } = await openPage(env, {
    consent: null,
    init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('bloqueado'); } }); Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('bloqueado'); } }); },
  });
  await page.waitForSelector('.js-ck.is-in');
  await page.click('.js-ck-accept');
  await page.waitForSelector('.js-ck', { state: 'hidden' });
  await page.click('.nav-theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), 'light');
  await openChat(page);
  assert.ok((await page.locator('.lc-bot').count()) > 0, 'chat funciona sem armazenamento');
  await page.reload();
  await page.waitForSelector('.js-ck.is-in'); // sem como lembrar, pergunta de novo numa próxima visita
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[privacidade] movimento reduzido: saída imediata', async () => {
  const { page, ctx } = await openPage(env, { consent: null, reducedMotion: 'reduce' });
  await page.waitForSelector('.js-ck:not([hidden])');
  await page.click('.js-ck-reject');
  assert.equal(await page.evaluate(() => document.querySelector('.js-ck').hidden), true);
  await ctx.close();
});

test('[privacidade] Star Border no "Aceitar": canvas animado; sem o script, borda roxa estática e botão funcionando', async () => {
  const { page, ctx } = await openPage(env, { consent: null });
  await page.waitForSelector('.js-ck-accept canvas.star-border__light');
  const lit = await page.evaluate(() => {
    const c = document.querySelector('.js-ck-accept canvas');
    const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n++;
    return { n, aria: c.getAttribute('aria-hidden') };
  });
  assert.ok(lit.n > 50, 'luz desenhada no contorno');
  assert.equal(lit.aria, 'true');
  await ctx.close();

  const fb = await openPage(env, { consent: null, init: () => {} });
  await fb.ctx.route(/js\/star-border\.js/, r => r.fulfill({ status: 404, body: '' }));
  await fb.page.reload();
  await fb.page.waitForSelector('.js-ck.is-in');
  await fb.page.waitForTimeout(300);
  assert.equal(await fb.page.locator('.js-ck-accept canvas').count(), 0);
  const border = await fb.page.evaluate(() => getComputedStyle(document.querySelector('.js-ck-accept'), '::before').boxShadow);
  assert.match(border, /rgb\(117, 73, 232\)/, 'borda roxa estática');
  await fb.page.click('.js-ck-accept');
  await fb.page.waitForSelector('.js-ck', { state: 'hidden' });
  assert.equal((await consent(fb.page)).prefs, true);
  await fb.ctx.close();
});

// ---------------- Lupi + aviso ----------------
test('[convivência] celular: abrir a Lupi recolhe o aviso numa pílula; tocar na pílula traz o aviso por cima; nada se perde', async () => {
  const { page, ctx } = await openPage(env, { ...PHONE, consent: null, reducedMotion: 'reduce' });
  await page.waitForSelector('.js-ck:not([hidden])');
  await page.tap('.js-ck-custom');
  await page.tap('#ck-pref'); // escolha ainda não salva
  await page.tap('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
  await page.waitForSelector('.js-ck-pill:not([hidden])');
  const r = await page.evaluate(() => {
    const pill = document.querySelector('.js-ck-pill').getBoundingClientRect();
    const chat = document.querySelector('#lupi-chat').getBoundingClientRect();
    const send = document.querySelector('.js-lc-send').getBoundingClientRect();
    return { pillTop: pill.top, chatBottom: chat.bottom, send: send.bottom, ih: innerHeight };
  });
  assert.ok(r.pillTop >= r.chatBottom - 1, 'pílula abaixo do chat, sem cobrir');
  assert.ok(r.send <= r.ih, 'campo e envio da Lupi acessíveis');
  await page.fill('#lc-in', 'O que é BPO financeiro?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.lc-bot').length >= 2);
  const msgs = await page.locator('.lc-msg').count();
  assert.equal(await page.isVisible('.js-ck-pill'), false, 'digitando (teclado aberto), a pílula sai do caminho');
  await page.evaluate(() => document.activeElement.blur()); // fechar o teclado
  await page.waitForSelector('.js-ck-pill', { state: 'visible' });
  await page.tap('.js-ck-pill');
  assert.equal(await page.evaluate(() => document.querySelector('.js-ck').classList.contains('ck-top')), true, 'aviso na frente');
  assert.equal(await page.isChecked('#ck-pref'), true, 'escolha não salva preservada');
  assert.equal(await page.isVisible('#lupi-chat'), true, 'chat continua aberto');
  assert.equal(await page.locator('.lc-msg').count(), msgs, 'nenhuma mensagem perdida');
  await page.tap('.js-ck-save');
  await page.waitForFunction(() => document.querySelector('.js-ck').hidden);
  assert.equal((await consent(page)).prefs, true);
  assert.equal(await page.isVisible('#lupi-chat'), true);
  await ctx.close();
});

test('[convivência] celular: fechar a Lupi devolve o aviso inteiro; Tab circula entre chat e pílula', async () => {
  const { page, ctx } = await openPage(env, { ...PHONE, consent: null, reducedMotion: 'reduce' });
  await page.waitForSelector('.js-ck:not([hidden])');
  await page.tap('.lc-launch');
  await page.waitForSelector('.js-ck-pill:not([hidden])');
  // teclado: a pílula faz parte do ciclo de foco do chat (que é modal no celular)
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement?.classList.contains('js-ck-pill')); }
  assert.ok(reached, 'pílula alcançável pelo teclado');
  await page.tap('.js-lc-close');
  await page.waitForFunction(() => !document.querySelector('.js-ck').classList.contains('is-collapsed'));
  assert.equal(await page.isVisible('.js-ck-accept'), true);
  await ctx.close();
});

test('[convivência] desktop: Lupi e aviso abertos lado a lado, sem se cobrirem', async () => {
  const { page, ctx } = await openPage(env, { consent: null, reducedMotion: 'reduce' });
  await page.waitForSelector('.js-ck:not([hidden])');
  await openChat(page);
  const r = await page.evaluate(() => {
    const a = document.querySelector('.js-ck').getBoundingClientRect(), b = document.querySelector('#lupi-chat').getBoundingClientRect();
    return { overlap: !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top), collapsed: document.querySelector('.js-ck').classList.contains('is-collapsed') };
  });
  assert.deepEqual(r, { overlap: false, collapsed: false });
  await ctx.close();
});

for (const [label, size, custom] of [['fechado', PHONE.viewport, false], ['com as preferências abertas', PHONE.viewport, true], ['tela pequena 320×568, preferências abertas', { width: 320, height: 568 }, true]]) test(`[convivência] celular (${label}): botões flutuantes acima do aviso e abaixo do cabeçalho, tocáveis`, async () => {
  const { page, ctx } = await openPage(env, { viewport: size, isMobile: true, consent: null, reducedMotion: 'reduce' });
  await page.waitForSelector('.js-ck:not([hidden])');
  if (custom) await page.tap('.js-ck-custom');
  const r = await page.evaluate(() => {
    const ck = document.querySelector('.js-ck').getBoundingClientRect();
    const hit = (s) => { const b = document.querySelector(s).getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { bottom: b.bottom, ok: !!el?.closest(s) }; };
    const nav = document.querySelector('.nav').getBoundingClientRect().bottom;
    const body = document.querySelector('.ck-body');
    return { ck: ck.top, nav, fabShown: getComputedStyle(document.querySelector('.fab')).display !== 'none', fab: hit('.fab'), lupi: hit('.lc-launch'), lupiTop: document.querySelector('.lc-launch').getBoundingClientRect().top, scrolls: body.scrollHeight > body.clientHeight, oy: getComputedStyle(body).overflowY };
  });
  if (size.height > 600) assert.ok(r.fabShown && r.fab.bottom <= r.ck && r.fab.ok, 'WhatsApp acima do aviso');
  else assert.equal(r.fabShown, false, 'tela baixa: WhatsApp flutuante sai (continua no menu e no Contato)');
  assert.ok(r.lupi.bottom <= r.ck && r.lupi.ok, 'Lupi acima do aviso');
  assert.ok(r.lupiTop >= r.nav, 'Lupi abaixo do cabeçalho');
  if (r.scrolls) assert.equal(r.oy, 'auto', 'conteúdo do aviso rola por dentro');
  await ctx.close();
});
