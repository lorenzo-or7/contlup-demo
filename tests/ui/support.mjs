/* Infraestrutura dos testes de interface (Playwright + servidor estático local).
   A API da Lupi é SIMULADA (mockApi) quando o teste precisa de respostas de IA determinísticas;
   cada teste diz explicitamente qual comportamento do servidor está simulando. */
import { chromium } from 'playwright';
import { createStaticServer } from '../support/static-server.mjs';

export const MOCK_API = 'https://lupi-api.mock';

export async function startEnv() {
  const server = createStaticServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  return {
    base, browser,
    async close() { await browser.close(); await new Promise(r => server.close(r)); },
  };
}

/**
 * Abre a página. Opções:
 *  api: undefined (modo básico) ou { health, chat } com funções que devolvem {status, body} ou 'abort'  (MOCK)
 *  viewport, colorScheme, reducedMotion, init (script antes da página)
 *  consent: escolha já feita no aviso de privacidade (padrão: visitante que já recusou os opcionais, para o aviso
 *           não ficar por cima do que o teste examina); null = primeira visita, com o aviso aberto
 */
export async function openPage(env, { api, viewport = { width: 1440, height: 900 }, isMobile = false, colorScheme = 'dark', reducedMotion = 'no-preference', init, path = '/', consent = { prefs: false } } = {}) {
  const ctx = await env.browser.newContext({ viewport, isMobile, hasTouch: isMobile, colorScheme, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => { window.__opened.push(String(url)); return null; };
  });
  if (consent) await page.addInitScript((c) => { try { if (!localStorage.getItem('cl-consent')) localStorage.setItem('cl-consent', JSON.stringify({ v: 1, at: '2026-10-28T00:00:00.000Z', ...c })); } catch { /* armazenamento bloqueado pelo teste */ } }, consent);
  if (init) await page.addInitScript(init);
  if (api) {
    await page.route(env.base + '/', async route => {
      const res = await route.fetch();
      const html = (await res.text()).replace('<meta name="lupi-api" content="">', `<meta name="lupi-api" content="${MOCK_API}">`)
        .replace("connect-src 'self'", `connect-src 'self' ${MOCK_API}`); // como o site deve ficar quando a IA for ligada
      await route.fulfill({ response: res, body: html });
    });
    const handle = (fn) => async route => {
      const out = await fn(route.request());
      if (out === 'abort') return route.abort('failed');
      await route.fulfill({ status: out.status || 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(out.body) });
    };
    await page.route(MOCK_API + '/health', handle(api.health || (() => ({ body: { ok: true, ai: true } }))));
    await page.route(MOCK_API + '/chat', handle(api.chat || (() => ({ body: { ok: true, reply: 'Resposta simulada.', needsHuman: false, topic: '', suggestions: [] } }))));
  }
  await page.goto(env.base + path);
  return { page, ctx, errors, requests };
}

export async function openChat(page) {
  await page.click('.lc-launch');
  await page.waitForSelector('#lupi-chat:not([hidden]) .lc-msg');
}

export const botMessages = (page) => page.$$eval('.lc-bot .lc-b', els => els.map(e => e.textContent));
export const lastBotText = async (page) => (await botMessages(page)).at(-1) || '';
