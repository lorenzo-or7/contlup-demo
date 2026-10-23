// Lupi 3.0 no navegador: poses por estado, animações, carregamento sob demanda, fallback e movimento reduzido.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage, openChat } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

const pose = (page) => page.evaluate(() => {
  const st = document.querySelector('.js-lc-stage');
  const front = st.querySelector('.lc-pose.is-front');
  return { state: st.dataset.state, pose: st.dataset.pose, src: front?.getAttribute('src') || '', motion: [...st.classList].find(c => c.startsWith('m-')) || null };
});
const waitPose = (page, name, timeout = 4000) => page.waitForFunction((n) => document.querySelector('.js-lc-stage').dataset.pose === n, name, { timeout });
async function ask(page, q) {
  await page.fill('#lc-in', q);
  await page.press('#lc-in', 'Enter');
}

test('[visual] nada da personagem é baixado antes de abrir o chat; ao abrir, só as poses iniciais', async () => {
  const { page, ctx, requests } = await openPage(env);
  await page.waitForTimeout(800);
  assert.equal(requests.filter(u => /img\/lupi\/poses\//.test(u)).length, 0, 'nenhuma pose antes de abrir');
  await page.evaluate(() => { window.requestIdleCallback = () => 0; }); // segura as poses secundárias para medir
  await openChat(page);
  await waitPose(page, 'acenando');
  const got = [...new Set(requests.filter(u => /img\/lupi\/poses\//.test(u)).map(u => u.split('/').pop()))].sort();
  assert.deepEqual(got, ['acenando-1x.webp', 'pensando-1x.webp', 'tablet-1x.webp'], 'só as 3 poses iniciais, em 1x');
  await ctx.close();
});

test('[visual] boas-vindas ao abrir (aceno), volta ao idle; fechar e reabrir repete uma vez', async () => {
  const { page, ctx, errors } = await openPage(env);
  await openChat(page);
  await waitPose(page, 'acenando');
  assert.equal((await pose(page)).motion, 'm-wave');
  await waitPose(page, 'tablet', 5000);
  assert.equal((await pose(page)).state, 'idle');
  await page.click('.js-lc-close');
  assert.equal((await pose(page)).state, 'idle', 'fechar volta ao estado inicial');
  await page.click('.lc-launch');
  await waitPose(page, 'acenando');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[visual] pose muda com o tipo de resposta: pensando, finanças, planos, ideia, encaminhamento, carinho', async () => {
  const { page, ctx, errors } = await openPage(env);
  await page.evaluate(() => { window.__lupiTypingMs = 600; });
  await openChat(page);
  await ask(page, 'O que é BPO financeiro?');
  await waitPose(page, 'pensando', 500);                         // enquanto "digita"
  await waitPose(page, 'grafico');
  assert.equal((await pose(page)).state, 'finance');
  for (const [q, p, s] of [
    ['o que é o lup start?', 'checklist', 'organize'],
    ['menu', 'ideia', 'idea'],
    ['trocar de contador e abrir empresa', 'pensando', 'doubt'],
    ['qual o CNPJ de vocês?', 'apontando', 'explaining'],
    ['quero falar com a ContLup', 'headset', 'handoff'],
    ['obrigada!', 'carinho', 'thanks'],
  ]) {
    await ask(page, q);
    await page.waitForFunction((st) => document.querySelector('.js-lc-stage').dataset.state === st, s, { timeout: 4000 });
    await waitPose(page, p);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[visual] fluxo guiado: anotando → ok a cada etapa → comemoração no fim', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await page.click('.lc-chip >> text=Encontrar um plano');
  await waitPose(page, 'notebook');
  await page.click('.lc-chip >> text=Tenho empresa (ME, EPP ou outra)');
  await waitPose(page, 'ok');
  assert.equal((await pose(page)).state, 'stepDone');
  await waitPose(page, 'notebook', 3000);                       // volta a "anotando" para a próxima pergunta
  await page.click('.lc-chip >> text=Simples Nacional');
  await page.click('.lc-chip >> text=Relatórios e acompanhamento');
  await waitPose(page, 'comemorando');
  await waitPose(page, 'tablet', 5000);                         // a celebração é curta
  await ctx.close();
});

test('[visual] reiniciar a conversa não deixa estado preso', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await ask(page, 'quero falar com a ContLup');
  await waitPose(page, 'headset');
  await page.click('.js-lc-restart');
  await waitPose(page, 'acenando');                             // nova saudação
  await ctx.close();
});

test('[visual] pose indisponível usa a padrão; sem nenhuma pose, usa o avatar', async () => {
  const one = await openPage(env, { reducedMotion: 'reduce', init: () => { window.__lupiTypingMs = 0; } });
  await one.ctx.route(/img\/lupi\/poses\/grafico/, r => r.fulfill({ status: 404, body: '' }));
  await openChat(one.page);
  await ask(one.page, 'O que é BPO financeiro?');
  await one.page.waitForFunction(() => document.querySelector('.js-lc-stage').dataset.state === 'finance');
  await waitPose(one.page, 'tablet');
  assert.match((await pose(one.page)).src, /tablet/);
  await one.ctx.close();

  const all = await openPage(env, { reducedMotion: 'reduce' });
  await all.ctx.route(/img\/lupi\/poses\//, r => r.fulfill({ status: 404, body: '' }));
  await openChat(all.page);
  await waitPose(all.page, 'avatar');
  assert.match((await pose(all.page)).src, /avatar\.webp$/);
  const box = await all.page.locator('.js-lc-stage').boundingBox();
  assert.ok(box.height > 100, 'palco continua com o mesmo tamanho');
  assert.deepEqual(all.errors, []);
  await all.ctx.close();
});

test('[visual] movimento reduzido: sem flutuação, sem animação de entrada e troca instantânea', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await waitPose(page, 'acenando');
  const r = await page.evaluate(() => {
    const st = document.querySelector('.js-lc-stage');
    const f = st.querySelector('.lc-pose.is-front');
    const av = document.querySelector('.lc-launch-av img');
    return { stage: getComputedStyle(st).animationName, pose: getComputedStyle(f).animationName, fade: getComputedStyle(f).transitionDuration, motion: [...st.classList].some(c => c.startsWith('m-')), av: getComputedStyle(av).animationName };
  });
  assert.deepEqual(r, { stage: 'none', pose: 'none', fade: '0s', motion: false, av: 'none' });
  await ctx.close();
});

test('[visual] acessibilidade: personagem decorativa, sem anúncios repetidos; foco do chat intacto', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  const a11y = await page.evaluate(() => {
    const st = document.querySelector('.js-lc-stage');
    return { hidden: st.getAttribute('aria-hidden'), alts: [...st.querySelectorAll('img')].map(i => i.getAttribute('alt')), live: !!st.closest('[aria-live]') };
  });
  assert.deepEqual(a11y, { hidden: 'true', alts: ['', ''], live: false });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lc-in', 'foco continua no campo');
  await ask(page, 'O que é BPO financeiro?');
  await waitPose(page, 'grafico');
  const sr = await page.textContent('.js-lc-sr');
  assert.doesNotMatch(sr, /pose|gráfico|tablet|acenando/i, 'troca de pose não é anunciada');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('lc-launch')), true);
  await ctx.close();
});

test('[visual] botão flutuante: reage ao passar o mouse e volta suavemente ao fechar o chat', async () => {
  const { page, ctx } = await openPage(env);
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.lc-launch-av img')).animationName);
  assert.equal(before, 'lcAvIdle', 'pequeno movimento de espera');
  await page.hover('.lc-launch');
  await page.waitForTimeout(600);
  const hov = await page.evaluate(() => getComputedStyle(document.querySelector('.lc-launch-av img')).transform);
  assert.notEqual(hov, 'none', 'avatar inclina e cresce no hover');
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat.is-open');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.lc-launch')).opacity === '0');
  const hidden = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.lc-launch')); return [s.opacity, s.pointerEvents]; });
  assert.deepEqual(hidden, ['0', 'none']);
  await page.click('.js-lc-close');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.lc-launch')).opacity === '1');
  // sem indicadores falsos de mensagem não lida
  assert.equal(await page.locator('.lc-launch [class*="badge"], .lc-launch [class*="unread"], .lc-launch [class*="count"]').count(), 0);
  await ctx.close();
});

test('[visual] celular 320/375: palco não cobre os botões do cabeçalho e nada passa da tela', async () => {
  for (const width of [320, 375]) {
    const { page, ctx } = await openPage(env, { viewport: { width, height: 700 }, isMobile: true, reducedMotion: 'reduce' });
    await page.tap('.lc-launch');
    await page.waitForSelector('#lupi-chat.is-open');
    await waitPose(page, 'acenando');
    const r = await page.evaluate(() => {
      const img = document.querySelector('.lc-pose.is-front').getBoundingClientRect();
      const tools = document.querySelector('.lc-tools').getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(document.querySelector('#lc-title'));
      const title = rg.getBoundingClientRect();   // o texto "Lupi", não o bloco inteiro
      return { imgRight: img.right, toolsLeft: tools.left, imgLeft: img.left, titleRight: title.right, docW: document.documentElement.scrollWidth, iw: innerWidth };
    });
    assert.ok(r.imgRight <= r.toolsLeft + 6, `${width}px: pose encosta nos botões (${r.imgRight} > ${r.toolsLeft})`);
    assert.ok(r.imgLeft >= r.titleRight - 4, `${width}px: pose sobre o título`);
    assert.ok(r.docW <= r.iw);
    await ctx.close();
  }
});

test('[visual] fechar no meio de um estado ativo volta ao inicial na hora', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await ask(page, 'quero falar com a ContLup');
  await waitPose(page, 'headset');
  await page.click('.js-lc-close');
  assert.equal((await pose(page)).state, 'idle', 'estado reiniciado ao fechar');
  await waitPose(page, 'tablet');
  await ctx.close();
});

test('[visual] pose que demora a carregar não passa por cima de um estado mais novo', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await ctx.route(/img\/lupi\/poses\/grafico/, async r => { await new Promise(res => setTimeout(res, 1200)); await r.continue(); });
  await openChat(page);
  await page.evaluate(() => { window.requestIdleCallback = () => 0; }); // o gráfico só carrega quando for pedido
  await ask(page, 'O que é BPO financeiro?');                        // pede o gráfico (lento)
  await ask(page, 'menu');                                            // logo depois, a ideia
  await waitPose(page, 'ideia');
  await page.waitForTimeout(1600);                                    // o gráfico termina de carregar
  assert.equal((await pose(page)).pose, 'ideia', 'continua no estado mais novo');
  await ctx.close();
});
