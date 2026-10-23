// Testes de interface: convite discreto da Lupi e não-regressão do restante do site.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

// Ganchos de teste: encurtam o tempo mínimo do convite (padrão: 12s e 80% da tela rolada).
const fastTeaser = () => { window.__lupiTeaserDelay = 300; window.__lupiTeaserScroll = 0.3; };

test('[convite] não aparece sem interação e não abre o chat sozinho', async () => {
  const { page, ctx } = await openPage(env, { init: fastTeaser });
  await page.waitForTimeout(5000);
  assert.equal(await page.isHidden('.lc-teaser'), true);
  assert.equal(await page.isHidden('#lupi-chat'), true);
  await ctx.close();
});

test('[convite] aparece depois de rolar, uma vez por sessão, e pode ser dispensado', async () => {
  const { page, ctx } = await openPage(env, { init: fastTeaser });
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 700);
  await page.waitForSelector('.lc-teaser:not([hidden])', { timeout: 6000 });
  assert.match(await page.textContent('.lc-teaser'), /Posso te ajudar a entender nossos serviços/);
  assert.equal(await page.isHidden('#lupi-chat'), true, 'convite não abre o chat');
  await page.click('.js-lc-teaser-x');
  assert.equal(await page.isHidden('.lc-teaser'), true);
  await page.reload();
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(5000);
  assert.equal(await page.isHidden('.lc-teaser'), true, 'não reaparece na mesma sessão');
  await ctx.close();
});

test('[convite] não aparece com o formulário de contato na tela', async () => {
  const { page, ctx } = await openPage(env, { init: fastTeaser });
  await page.evaluate(() => document.getElementById('proposta').scrollIntoView());
  await page.waitForTimeout(5000);
  assert.equal(await page.isHidden('.lc-teaser'), true);
  await ctx.close();
});

test('[convite] clicar no convite abre o chat', async () => {
  const { page, ctx } = await openPage(env, { init: fastTeaser });
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 700);
  await page.waitForSelector('.lc-teaser:not([hidden])', { timeout: 6000 });
  await page.click('.js-lc-teaser-go');
  await page.waitForSelector('#lupi-chat.is-open');
  await ctx.close();
});

test('[regressão] restante do site continua funcionando (tema, menu, formulário, animação, seções)', async () => {
  const { page, ctx, errors } = await openPage(env);
  for (const id of ['inicio', 'contlup', 'priscila', 'servicos', 'svc-bpo', 'planos', 'numeros', 'historia', 'situacoes', 'assuntos', 'lupi-explica', 'contato', 'fale-conosco', 'proposta']) {
    assert.equal(await page.locator('#' + id).count(), 1, `seção #${id}`);
  }
  await page.click('.sb-btn.theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), 'light');
  await page.click('.sb-btn.theme');
  assert.equal(await page.getAttribute('html', 'data-cl'), null);
  // animação controlada pelo scroll da seção "Seus números contam uma história"
  await page.evaluate(() => { const s = document.getElementById('historia'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY + 600, behavior: 'instant' }); });
  await page.waitForTimeout(600);
  const t = await page.evaluate(() => getComputedStyle(document.querySelector('.js-story')).getPropertyValue('--t'));
  assert.ok(Number(t) > 0, `--t = ${t}`);
  // formulário de proposta segue validando
  await page.evaluate(() => document.getElementById('proposta').scrollIntoView());
  await page.click('.btn-form');
  assert.equal(await page.isVisible('#e-nome'), true);
  // botões das seções abrem a Lupi
  await page.evaluate(() => document.querySelector('.lupi-ask').scrollIntoView());
  await page.click('.lupi-ask');
  await page.waitForSelector('#lupi-chat.is-open');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[regressão] celular: menu abre e cobre a Lupi; perguntas prontas da seção "A Lupi explica" funcionam', async () => {
  const { page, ctx, errors } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true });
  await page.tap('.mbar-btn');
  assert.equal(await page.isVisible('#mmenu'), true);
  const covered = await page.evaluate(() => {
    const b = document.querySelector('.lc-launch').getBoundingClientRect();
    const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
    return !document.querySelector('.lc-launch').contains(top);
  });
  assert.equal(covered, true, 'menu fica por cima do botão da Lupi');
  await page.tap('.mbar-btn');
  await page.evaluate(() => document.getElementById('lupi-explica').scrollIntoView());
  await page.tap('[data-lupi-ask="Quando preciso emitir nota fiscal?"]');
  await page.waitForSelector('#lupi-chat.is-open');
  await page.waitForFunction(() => document.querySelectorAll('.lc-bot').length >= 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});
