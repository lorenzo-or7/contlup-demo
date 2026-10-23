// Testes de interface (Playwright) do chat da Lupi 2.0 no navegador real.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, openPage, openChat, lastBotText } from './support.mjs';

let env;
before(async () => { env = await startEnv(); });
after(async () => { await env?.close(); });

test('[performance] o chat completo só é baixado quando o visitante interage', async () => {
  const { page, ctx, requests, errors } = await openPage(env);
  await page.waitForTimeout(800);
  assert.ok(requests.some(u => u.endsWith('/js/lupi/boot.js')));
  assert.ok(!requests.some(u => /js\/lupi\/(app|ui|conversation)\.js|lupi-knowledge\.json/.test(u)), 'baixou o chat antes da interação');
  const t0 = Date.now();
  await openChat(page);
  const openMs = Date.now() - t0;
  assert.ok(openMs < 2500, `abriu em ${openMs}ms`);
  assert.ok(requests.some(u => u.endsWith('/js/lupi/app.js')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[performance] peso do código da Lupi', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  const sizes = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => /\/js\/lupi\/|lupi-(knowledge|flows)\.json|lupi\.css/.test(e.name))
    .map(e => ({ name: e.name.split('/').pop(), size: e.decodedBodySize })));
  const boot = sizes.find(s => s.name === 'boot.js');
  const total = sizes.reduce((a, b) => a + b.size, 0);
  assert.ok(boot.size < 8000, `boot.js com ${boot.size} bytes`);
  // o repertório (74 intenções com exemplos e palavras-chave, em JSON legível) é a maior parte
  assert.ok(total < 320000, `Lupi soma ${total} bytes sem compressão`);
  await ctx.close();
});

test('[acessibilidade] abrir/fechar: foco, aria-expanded, Escape e retorno do foco', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  assert.equal(await page.getAttribute('.lc-launch', 'aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lc-in');
  assert.equal(await page.getAttribute('#lupi-chat', 'role'), 'dialog');
  await page.keyboard.press('Escape');
  assert.equal(await page.isHidden('#lupi-chat'), true);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('lc-launch')), true);
  assert.equal(await page.getAttribute('.lc-launch', 'aria-expanded'), 'false');
  await ctx.close();
});

test('[acessibilidade] todos os controles têm nome acessível; log e região de anúncio existem', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  const unnamed = await page.$$eval('#lupi-chat button, #lupi-chat input, #lupi-chat textarea', els => els
    .filter(e => e.offsetParent !== null)
    .filter(e => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`))))
    .map(e => e.outerHTML.slice(0, 80)));
  assert.deepEqual(unnamed, []);
  assert.equal(await page.getAttribute('.lc-log', 'role'), 'log');
  assert.equal(await page.getAttribute('.js-lc-sr', 'aria-live'), 'polite');
  await page.waitForFunction(() => document.querySelector('.js-lc-sr').textContent.startsWith('Lupi:'));
  await ctx.close();
});

test('[acessibilidade] sugestões funcionam só pelo teclado', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  await page.focus('.lc-chip >> text=Encontrar um plano');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Hoje você é MEI ou tem outro tipo de empresa\?/.test(document.querySelector('.lc-log').textContent));
  await ctx.close();
});

test('[fluxos] "Encontrar um plano" na interface até o WhatsApp, só com confirmação', async () => {
  const { page, ctx, errors } = await openPage(env);
  await openChat(page);
  await page.click('.lc-chip >> text=Encontrar um plano');
  await page.click('.lc-chip >> text=Tenho empresa (ME, EPP ou outra)');
  await page.click('.lc-chip >> text=Simples Nacional');
  await page.click('.lc-chip >> text=Relatórios e acompanhamento');
  await page.waitForSelector('.lc-chip >> text=Ver o Lup Plus');
  assert.match(await page.textContent('.lc-log'), /indicação preliminar/i);
  await page.click('.lc-chip >> text=Falar com a ContLup');
  const ta = page.locator('.lc-handoff-text');
  await ta.waitFor();
  assert.equal(await ta.inputValue(), 'Olá! Gostaria de saber mais sobre o plano Lup Plus.');
  assert.deepEqual(await page.evaluate(() => window.__opened), [], 'nada abre antes de confirmar');
  await ta.fill((await ta.inputValue()) + ' Prefiro contato à tarde.');
  await page.click('text=Confirmar e abrir o WhatsApp');
  const opened = await page.evaluate(() => window.__opened);
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^https:\/\/wa\.me\/5519971310182\?text=/);
  assert.match(decodeURIComponent(opened[0]), /Prefiro contato à tarde\.$/);
  await page.waitForSelector('text=WhatsApp aberto em outra aba');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[whatsapp] CPF digitado no resumo pede confirmação extra', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  await page.click('.js-lc-human');
  await page.fill('.lc-handoff-text', 'Meu CPF é 123.456.789-09');
  await page.click('text=Confirmar e abrir o WhatsApp');
  await page.waitForSelector('.lc-handoff-warn:not([hidden])');
  assert.deepEqual(await page.evaluate(() => window.__opened), []);
  await page.click('.lc-handoff-actions button:has-text("Enviar mesmo assim")');
  assert.equal((await page.evaluate(() => window.__opened)).length, 1);
  await ctx.close();
});

test('[sem IA] site sem API: nenhum módulo de IA é baixado, status honesto, pergunta desconhecida sem inventar', async () => {
  const { page, ctx, requests } = await openPage(env);
  await openChat(page);
  assert.ok(!requests.some(u => /ai-client\.js/.test(u)), 'cliente de IA não é baixado');
  assert.equal(await page.textContent('.lc-status span'), 'Respostas automáticas');
  assert.equal(await page.textContent('.lc-k'), 'Assistente virtual');
  assert.doesNotMatch(await page.textContent('#lupi-chat'), /inteligência artificial|provedor de IA/, 'sem IA configurada, a interface não fala de IA');
  await page.fill('#lc-in', 'qual a melhor marca de café para o escritório?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => /Não encontrei uma orientação específica/.test([...document.querySelectorAll('.lc-bot .lc-b')].at(-1).textContent));
  await page.waitForSelector('.lc-chip >> text=Falar com a ContLup');
  assert.equal(await page.locator('.lc-tag').count(), 0, 'nenhuma mensagem marcada como IA');
  await ctx.close();
});

test('[perguntas livres] IA (servidor SIMULADO) responde com selo de IA e texto seguro', async () => {
  const api = { chat: () => ({ body: { ok: true, reply: 'Margem é a diferença entre preço e custo. <img src=x onerror="window.__xss=1"> **Importante**', needsHuman: false, topic: 'margem', suggestions: ['Como calcular a margem?'] } }) };
  const { page, ctx } = await openPage(env, { api });
  await openChat(page);
  await page.waitForFunction(() => document.querySelector('.lc-status').dataset.state === 'ai');
  await page.fill('#lc-in', 'qual a melhor marca de café para o escritório?');
  await page.press('#lc-in', 'Enter');
  await page.waitForSelector('.lc-tag');
  assert.match(await lastBotText(page), /Margem é a diferença/);
  assert.equal(await page.locator('.lc-bot .lc-b img').count(), 0, 'HTML da IA não vira elemento');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('.lc-bot .lc-b strong >> text=Importante').count(), 1);
  assert.equal(await page.locator('.lc-chip >> text=Como calcular a margem?').count(), 1);
  await ctx.close();
});

for (const [name, chat, expected] of [
  ['servidor fora do ar (503)', () => ({ status: 503, body: { ok: false, error: 'unavailable' } }), /dificuldade temporária/],
  ['rede caiu', () => 'abort', /dificuldade temporária/],
  ['limite de uso (429)', () => ({ status: 429, body: { ok: false, error: 'rate_limited', retryAfter: 30 } }), /muitas mensagens/],
  ['orçamento esgotado', () => ({ status: 503, body: { ok: false, error: 'budget_exhausted' } }), /dificuldade temporária/],
]) {
  test(`[falhas de API] ${name}: aviso discreto, chat destravado e status atualizado (SIMULADO)`, async () => {
    const { page, ctx, errors } = await openPage(env, { api: { chat } });
    await openChat(page);
    await page.fill('#lc-in', 'qual a melhor marca de café para o escritório?');
    await page.press('#lc-in', 'Enter');
    await page.waitForFunction(() => !document.querySelector('#lupi-chat').classList.contains('is-busy') && document.querySelectorAll('.lc-bot').length >= 2 && !document.querySelector('.lc-typing'));
    assert.match(await lastBotText(page), expected);
    assert.equal(await page.isEnabled('.js-lc-send'), true);
    assert.notEqual(await page.getAttribute('.lc-status', 'data-state'), 'ai');
    await page.click('.lc-chip >> text=Encontrar um plano');
    await page.waitForFunction(() => /Hoje você é MEI/.test(document.querySelector('.lc-log').textContent));
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('[histórico] conversa continua depois de fechar, reabrir e recarregar; reiniciar apaga', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  await page.click('.lc-chip >> text=Encontrar um plano');
  await page.click('.lc-chip >> text=Tenho empresa (ME, EPP ou outra)');
  await page.waitForSelector('.lc-chip >> text=Lucro Presumido');
  await page.click('.js-lc-close');
  await page.reload();
  await openChat(page);
  const log = await page.textContent('.lc-log');
  assert.match(log, /Tenho empresa \(ME, EPP ou outra\)/);
  assert.match(log, /Você sabe em qual regime tributário a empresa está\?/);
  await page.click('.lc-chip >> text=Lucro Presumido');
  await page.waitForFunction(() => /O que é mais importante/.test(document.querySelector('.lc-log').textContent));
  await page.click('.js-lc-restart');
  await page.waitForFunction(() => document.querySelectorAll('.lc-msg').length === 2);
  assert.doesNotMatch(await page.textContent('.lc-log'), /Tenho empresa/);
  await ctx.close();
});

test('[responsividade] desktop: janela flutuante e botão de expandir', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  const before = await page.locator('#lupi-chat').boundingBox();
  assert.ok(before.width <= 420 && before.width >= 380);
  await page.click('.js-lc-expand');
  await page.waitForTimeout(500);
  const wide = await page.locator('#lupi-chat').boundingBox();
  assert.ok(wide.width > before.width + 150, `largura ${wide.width}`);
  assert.equal(await page.getAttribute('.js-lc-expand', 'aria-pressed'), 'true');
  await ctx.close();
});

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 360, height: 740 }]) {
  test(`[responsividade] celular ${vp.width}x${vp.height}: tela cheia, sem rolagem lateral, toques confortáveis`, async () => {
    const { page, ctx, errors } = await openPage(env, { viewport: vp, isMobile: true });
    const launch = await page.locator('.lc-launch').boundingBox();
    const fab = await page.locator('.fab').boundingBox();
    assert.ok(launch.y + launch.height <= fab.y, 'botão da Lupi não cobre o do WhatsApp');
    await page.tap('.lc-launch');
    await page.waitForSelector('#lupi-chat.is-open');
    await page.waitForTimeout(400);
    const box = await page.locator('#lupi-chat').boundingBox();
    assert.ok(Math.abs(box.width - vp.width) <= 1 && Math.abs(box.height - vp.height) <= 2, JSON.stringify(box));
    assert.equal(await page.getAttribute('#lupi-chat', 'aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const sel of ['.js-lc-close', '.js-lc-send', '.lc-chip']) {
      const b = await page.locator(sel).first().boundingBox();
      assert.ok(b.height >= 40, `${sel} com ${b.height}px de altura`);
    }
    assert.equal(await page.isVisible('#lc-in'), true);
    assert.equal(await page.isVisible('.js-lc-expand'), false, 'expandir é só no desktop');
    assert.equal(await page.isVisible('.fab'), false, 'botão do WhatsApp some com o chat aberto');
    await page.tap('.lc-chip >> text=Encontrar um plano');
    await page.waitForFunction(() => /Hoje você é MEI/.test(document.querySelector('.lc-log').textContent));
    await page.tap('.js-lc-close');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'rolagem da página liberada');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('[responsividade] celular na horizontal: cabeçalho compacto, campo visível', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 844, height: 390 }, isMobile: true });
  await page.tap('.lc-launch');
  await page.waitForSelector('#lupi-chat.is-open');
  const head = await page.locator('.lc-head').boundingBox();
  assert.ok(head.height < 110, `cabeçalho com ${head.height}px`);
  assert.equal(await page.isVisible('#lc-in'), true);
  const input = await page.locator('.lc-form').boundingBox();
  assert.ok(input.y + input.height <= 390);
  await ctx.close();
});

test('[acessibilidade] celular: foco preso dentro do chat (modal)', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true });
  await page.tap('.lc-launch');
  await page.waitForSelector('#lupi-chat.is-open');
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.getElementById('lupi-chat').contains(document.activeElement)), true);
  await ctx.close();
});

test('[tema] tema claro: fundo claro e contraste de texto adequado', async () => {
  const { page, ctx } = await openPage(env, { init: () => localStorage.setItem('cl-theme', 'light') });
  await openChat(page);
  const r = await page.evaluate(() => {
    const lum = (c) => { const k = c.startsWith('color(') ? 1 : 255; const [r, g, b] = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const chat = getComputedStyle(document.getElementById('lupi-chat')).backgroundColor;
    const bubble = document.querySelector('.lc-bot .lc-b');
    const notice = document.querySelector('.lc-notice p');
    return { chatLum: lum(chat), bubble: ratio(getComputedStyle(bubble).color, getComputedStyle(bubble).backgroundColor), notice: ratio(getComputedStyle(notice).color, getComputedStyle(document.getElementById('lupi-chat')).backgroundColor) };
  });
  assert.ok(r.chatLum > 0.8, 'fundo claro');
  assert.ok(r.bubble >= 4.5, `contraste do balão ${r.bubble.toFixed(2)}`);
  assert.ok(r.notice >= 4.5, `contraste do aviso ${r.notice.toFixed(2)}`);
  await ctx.close();
});

test('[tema] tema escuro: contraste do texto dos balões', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  const ratio = await page.evaluate(() => {
    const lum = (c) => { const k = c.startsWith('color(') ? 1 : 255; const [r, g, b] = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const b = document.querySelector('.lc-bot .lc-b'); const cs = getComputedStyle(b);
    const [x, y] = [lum(cs.color), lum(cs.backgroundColor)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05);
  });
  assert.ok(ratio >= 4.5, ratio.toFixed(2));
  await ctx.close();
});

test('[acessibilidade] movimento reduzido: sem flutuação nem animação de entrada', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  const anim = await page.evaluate(() => [getComputedStyle(document.querySelector('.lc-stage')).animationName, getComputedStyle(document.querySelector('.lc-msg')).animationName]);
  assert.deepEqual(anim, ['none', 'none']);
  await ctx.close();
});

// ---- Lupi 2.0 sem IA: comportamentos novos da interface ----
test('[digitando] resposta aparece depois de um "digitando…" curto; com movimento reduzido, na hora', async () => {
  const { page, ctx } = await openPage(env);
  await openChat(page);
  await page.fill('#lc-in', 'o que é margem?');
  const t0 = Date.now();
  await page.press('#lc-in', 'Enter');
  await page.waitForSelector('.lc-typing', { timeout: 300 });
  assert.equal(await page.isHidden('.js-lc-chips'), true, 'sugestões escondidas enquanto digita');
  await page.waitForFunction(() => /quanto sobra de cada venda/.test(document.querySelector('.lc-log').textContent));
  const ms = Date.now() - t0;
  assert.ok(ms >= 350 && ms < 1500, `resposta em ${ms}ms`);
  assert.equal(await page.locator('.lc-typing').count(), 0);
  await page.waitForSelector('.js-lc-chips:not([hidden])');
  await ctx.close();

  const r = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(r.page);
  await r.page.fill('#lc-in', 'o que é margem?');
  await r.page.press('#lc-in', 'Enter');
  await r.page.waitForFunction(() => /quanto sobra de cada venda/.test(document.querySelector('.lc-log').textContent), null, { timeout: 200 });
  await r.ctx.close();
});

test('[ressalva] conteúdo sujeito a mudança legal mostra a ressalva, com contraste adequado', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await page.fill('#lc-in', 'Quando preciso emitir nota fiscal?');
  await page.press('#lc-in', 'Enter');
  const cav = page.locator('.lc-bot .lc-caveat').last();
  await cav.waitFor();
  assert.match(await cav.textContent(), /regras, valores e prazos podem mudar/);
  const ratio = await cav.evaluate((el) => {
    const lum = (c) => { const k = c.startsWith('color(') ? 1 : 255; const [r, g, b] = c.replace(/^color\(srgb/, '').match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= k; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bg = getComputedStyle(el.closest('.lc-b')).backgroundColor;
    const [x, y] = [lum(getComputedStyle(el).color), lum(bg)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05);
  });
  assert.ok(ratio >= 4.5, `contraste da ressalva ${ratio.toFixed(2)}`);
  await ctx.close();
});

test('[contexto] acompanhamento na interface: plano → "E quanto custa?" → "Esse plano inclui folha?"', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  for (const q of ['o que é o lup start?', 'E quanto custa?', 'Esse plano inclui folha?']) {
    await page.fill('#lc-in', q);
    await page.press('#lc-in', 'Enter');
  }
  await page.waitForFunction(() => /inclui:/.test([...document.querySelectorAll('.lc-bot .lc-b')].at(-1).textContent));
  const log = await page.textContent('.lc-log');
  assert.match(log, /valores do Lup Start são definidos em proposta/);
  assert.doesNotMatch(log, /R\$/);
  assert.match(await lastBotText(page), /Folha de pagamento/);
  await ctx.close();
});

test('[comandos] "recomeçar" digitado limpa a conversa', async () => {
  const { page, ctx } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await page.fill('#lc-in', 'saldo em conta é lucro?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => /dinheiro disponível/.test(document.querySelector('.lc-log').textContent));
  await page.fill('#lc-in', 'recomeçar');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => /Conversa reiniciada/.test(document.querySelector('.lc-log').textContent));
  assert.doesNotMatch(await page.textContent('.lc-log'), /dinheiro disponível/);
  await ctx.close();
});

test('[página] botões "A Lupi explica" abrem o chat já com a pergunta', async () => {
  const { page, ctx, errors } = await openPage(env, { reducedMotion: 'reduce' });
  await page.locator('#lupi-explica').scrollIntoViewIfNeeded();
  await page.click('[data-lupi-ask="Saldo em conta é lucro?"]');
  await page.waitForSelector('#lupi-chat:not([hidden])');
  await page.waitForFunction(() => [...document.querySelectorAll('.lc-user .lc-b')].some(e => e.textContent === 'Saldo em conta é lucro?'));
  await page.waitForFunction(() => document.querySelectorAll('.lc-bot').length >= 2);
  assert.doesNotMatch(await lastBotText(page), /Não encontrei/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('[navegação] link da Lupi para uma seção rola até ela e, no celular, fecha o chat', async () => {
  const { page, ctx } = await openPage(env, { viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: 'reduce' });
  await page.tap('.lc-launch');
  await page.waitForSelector('#lupi-chat.is-open');
  await page.fill('#lc-in', 'quais são os planos?');
  await page.press('#lc-in', 'Enter');
  const chip = page.locator('.lc-chip >> text=/no site/i').first();
  await chip.waitFor();
  await chip.tap();
  await page.waitForFunction(() => document.getElementById('lupi-chat').hidden);
  await page.waitForFunction(() => Math.abs(document.getElementById('planos').getBoundingClientRect().top) < 120);
  await ctx.close();
});

test('[revisão] assunto em revisão na interface: só o aviso e o contato, sem texto nem sugestão da resposta pendente', async () => {
  const { page, ctx, errors } = await openPage(env, { reducedMotion: 'reduce' });
  await openChat(page);
  await page.fill('#lc-in', 'como pagar o DAS?');
  await page.press('#lc-in', 'Enter');
  await page.waitForFunction(() => /em revisão pela equipe da ContLup/.test(document.querySelector('.lc-log').textContent));
  assert.doesNotMatch(await page.textContent('.lc-log'), /guia mensal do MEI/);
  assert.deepEqual(await page.$$eval('.lc-chip', b => b.map(x => x.textContent)), ['Falar com a ContLup', 'Dúvidas gerais', 'Ver menu']);
  await page.fill('#lc-in', 'e quanto custa?');
  await page.press('#lc-in', 'Enter');
  await page.waitForSelector('.lc-chip >> text=Preço do plano Lup MEI');
  assert.match(await lastBotText(page), /Só para confirmar/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
