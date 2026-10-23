/* Lupi 2.0: interface do chat (DOM).
   Recebe a Conversation e desenha mensagens, sugestões, status e o cartão do WhatsApp.
   As poses e animações da personagem ficam na camada visual (visual.js, Lupi 3.0).
   Texto de visitante e da IA só entra via textContent / rich-text.js (nunca innerHTML). */

import { renderRich, toPlainText } from './rich-text.js';
import { createLupiVisual, visualStateFor, FIRST_POSES } from './visual.js';
import { MAX_SUMMARY, buildWhatsAppLink } from './whatsapp.js';
import { SENSITIVE_LABELS } from './shared/privacy.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 899px)').matches;
const DEFAULT_PLACEHOLDER = 'Escreva sua dúvida…';
// "digitando…" simulado: curto e previsível (primeira resposta e as seguintes); zero com movimento reduzido
const typingMs = (first) => (reduce() ? 0 : (globalThis.__lupiTypingMs ?? (first ? 450 : 250)));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

export function createUI({ root, conversation, ai, launch }) {
  const $ = (s) => root.querySelector(s);
  const doc = root.ownerDocument;
  const el = {
    log: $('.js-lc-log'), chips: $('.js-lc-chips'), form: $('.js-lc-form'), input: $('#lc-in'), send: $('.js-lc-send'),
    pose: $('.js-lc-pose'), stage: $('.js-lc-stage'), status: $('.js-lc-status'), close: $('.js-lc-close'),
    restart: $('.js-lc-restart'), expand: $('.js-lc-expand'), human: $('.js-lc-human'), sr: $('.js-lc-sr'),
    count: $('.js-lc-count'), title: $('#lc-title'), kicker: $('.lc-k'),
  };
  let opener = null;
  const visual = createLupiVisual({ stage: el.stage, reduce });
  let pendingAnnounce = [];
  let announceTimer = 0;
  let typingEl = null;
  let queue = [];
  let draining = false;
  let queueGen = 0;

  // ---------- abrir / fechar ----------
  function open(from) {
    opener = from || launch;
    root.hidden = false;
    doc.body.classList.add('lc-on');
    launch?.setAttribute('aria-expanded', 'true');
    const modal = isMobile();
    root.setAttribute('aria-modal', String(modal));
    if (modal) { doc.body.style.overflow = 'hidden'; fitViewport(); }
    requestAnimationFrame(() => root.classList.add('is-open'));
    scrollToEnd(false);
    // no celular, focar o campo abre o teclado e esconde a conversa: focamos o título
    (modal ? el.title : el.input).focus({ preventScroll: true });
    // boas-vindas uma vez por abertura; as outras poses carregam quando o navegador estiver livre
    visual.preload(FIRST_POSES);
    visual.set('welcome');
    visual.preloadRest();
  }

  function close() {
    root.classList.remove('is-open', 'is-wide');
    el.expand?.setAttribute('aria-pressed', 'false');
    root.hidden = true;
    doc.body.classList.remove('lc-on');
    doc.body.style.overflow = '';
    root.style.removeProperty('--lc-vh');
    launch?.setAttribute('aria-expanded', 'false');
    visual.reset(); // nenhum estado fica preso depois de fechar
    const back = opener && opener.isConnected && opener.offsetParent !== null ? opener : launch;
    back?.focus({ preventScroll: true });
  }

  function fitViewport() {
    const vv = globalThis.visualViewport;
    if (!vv || !isMobile() || root.hidden) return;
    root.style.setProperty('--lc-vh', `${vv.height}px`);
    root.style.setProperty('--lc-top', `${vv.offsetTop}px`);
  }
  globalThis.visualViewport?.addEventListener('resize', fitViewport);
  globalThis.visualViewport?.addEventListener('scroll', fitViewport);

  // ---------- mensagens ----------
  function renderAll() {
    queue = []; queueGen++; draining = false; hideTyping();
    el.log.textContent = '';
    for (const m of conversation.messages) el.log.appendChild(renderMessage(m));
    const last = conversation.messages.findLast(m => m.role === 'bot');
    if (last) queueAnnounce(last);
    renderChips();
    visual.reset();
    updateStatus();
    scrollToEnd(false);
  }

  function renderMessage(m) {
    const row = doc.createElement('div');
    row.dataset.id = m.id;
    if (m.role === 'notice') {
      row.className = 'lc-msg lc-notice';
      const p = doc.createElement('p'); p.textContent = m.text; row.appendChild(p);
      return row;
    }
    if (m.role === 'user') {
      row.className = 'lc-msg lc-user';
      const b = doc.createElement('div'); b.className = 'lc-b'; b.textContent = m.text;
      row.appendChild(b);
      return row;
    }
    row.className = 'lc-msg lc-bot' + (m.fallback ? ' is-fallback' : '') + (m.kind === 'handoff' ? ' is-handoff' : '');
    const av = doc.createElement('img'); av.className = 'lc-av'; av.src = 'img/lupi/avatar.webp'; av.alt = ''; av.width = 32; av.height = 32;
    row.appendChild(av);
    const b = doc.createElement('div'); b.className = 'lc-b';
    if (m.kind === 'handoff') b.appendChild(renderHandoff(m));
    else {
      renderRich(doc, b, m.text);
      if (m.caveat) {
        const c = doc.createElement('p'); c.className = 'lc-caveat'; c.textContent = m.caveat;
        b.appendChild(c);
      }
      if (m.source === 'ai') {
        const tag = doc.createElement('span'); tag.className = 'lc-tag';
        tag.textContent = m.guarded ? 'Resposta automática de segurança' : 'Resposta gerada por IA · pode conter erros';
        b.appendChild(tag);
      }
    }
    row.appendChild(b);
    return row;
  }

  function renderHandoff(m) {
    const wrap = doc.createElement('div'); wrap.className = 'lc-handoff';
    const h = doc.createElement('p'); h.className = 'lc-handoff-h'; h.textContent = 'Mensagem para o WhatsApp comercial';
    wrap.appendChild(h);
    if (m.state === 'cancelled') {
      const p = doc.createElement('p'); p.className = 'lc-handoff-done'; p.textContent = 'Resumo descartado. Nada foi enviado.';
      wrap.appendChild(p); return wrap;
    }
    const id = `lc-sum-${m.id}`;
    const label = doc.createElement('label'); label.className = 'sr'; label.htmlFor = id; label.textContent = 'Mensagem que será aberta no WhatsApp (pode editar)';
    const ta = doc.createElement('textarea'); ta.id = id; ta.className = 'lc-handoff-text'; ta.maxLength = MAX_SUMMARY; ta.rows = 5; ta.value = m.text;
    const meta = doc.createElement('p'); meta.className = 'lc-handoff-meta'; meta.id = `${id}-meta`;
    const warn = doc.createElement('p'); warn.className = 'lc-handoff-warn'; warn.hidden = true; warn.setAttribute('role', 'alert');
    ta.setAttribute('aria-describedby', meta.id);
    const updateMeta = () => { meta.textContent = `${ta.value.length}/${MAX_SUMMARY} caracteres · nada é enviado sem você confirmar`; };
    updateMeta();
    ta.addEventListener('input', () => { updateMeta(); warn.hidden = true; force = false; confirm.textContent = 'Confirmar e abrir o WhatsApp'; });
    const actions = doc.createElement('div'); actions.className = 'lc-handoff-actions';
    const confirm = doc.createElement('button'); confirm.type = 'button'; confirm.className = 'lc-btn lc-btn-primary'; confirm.textContent = 'Confirmar e abrir o WhatsApp';
    const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.className = 'lc-btn'; cancel.textContent = 'Descartar';
    let force = false;
    confirm.addEventListener('click', () => {
      const r = conversation.confirmHandoff(m.id, ta.value, { force });
      if (!r.ok) {
        warn.hidden = false;
        if (r.error === 'sensitive') {
          warn.textContent = `Seu texto parece ter ${r.sensitive.map(s => SENSITIVE_LABELS[s] || s).join(', ')}. Não é preciso enviar isso. Se quiser enviar mesmo assim, toque de novo.`;
          force = true; confirm.textContent = 'Enviar mesmo assim';
        } else warn.textContent = r.error === 'empty' ? 'Escreva uma mensagem antes de abrir o WhatsApp.' : 'A mensagem ficou longa demais.';
        return;
      }
      globalThis.open(r.link, '_blank', 'noopener,noreferrer');
      replaceMessage(m.id);
      announce('Mensagem pronta. O WhatsApp foi aberto em outra aba para você revisar e enviar.');
    });
    cancel.addEventListener('click', () => { conversation.cancelHandoff(m.id); replaceMessage(m.id); el.input.focus(); });
    if (m.state === 'opened') {
      ta.readOnly = true;
      const ok = doc.createElement('p'); ok.className = 'lc-handoff-done';
      ok.append('WhatsApp aberto em outra aba. ');
      const again = doc.createElement('a'); again.textContent = 'Abrir de novo'; again.target = '_blank'; again.rel = 'noopener noreferrer';
      again.href = buildWhatsAppLink(m.text, conversation.whatsapp);
      ok.appendChild(again);
      wrap.append(label, ta, ok);
      return wrap;
    }
    actions.append(confirm, cancel);
    wrap.append(label, ta, meta, warn, actions);
    return wrap;
  }

  function replaceMessage(id) {
    const m = conversation.messages.find(x => x.id === id);
    const old = el.log.querySelector(`[data-id="${id}"]`);
    if (m && old) old.replaceWith(renderMessage(m));
  }

  function appendMessage(m) {
    const node = renderMessage(m);
    el.log.appendChild(node);
    if (m.role === 'bot' || m.role === 'notice') queueAnnounce(m);
    const vs = visualStateFor(m);
    if (vs) visual.set(vs);
    if (m.role === 'bot' && m.kind === 'handoff') {
      requestAnimationFrame(() => node.querySelector('textarea')?.focus({ preventScroll: true }));
    }
    scrollToMessage(node, m.role);
  }

  // mensagens novas passam por uma fila: as da Lupi aparecem depois de um breve "digitando…"
  function enqueue(m) {
    queue.push(m);
    if (!draining) drain();
  }
  async function drain() {
    draining = true;
    const gen = queueGen;
    let first = true;
    el.chips.hidden = true;
    while (queue.length) {
      const m = queue.shift();
      const ms = m.role === 'bot' ? typingMs(first) : 0;
      if (m.role === 'bot') first = false;
      if (ms) {
        showTyping();
        await wait(ms);
        hideTyping();
        if (gen !== queueGen) return;
      }
      appendMessage(m);
    }
    draining = false;
    renderChips();
  }
  function showTyping() {
    visual.set('thinking');
    if (typingEl) return;
    typingEl = doc.createElement('div');
    typingEl.className = 'lc-msg lc-bot lc-typing';
    typingEl.innerHTML = '<img class="lc-av" src="img/lupi/avatar.webp" alt="" width="32" height="32"><div class="lc-b"><span class="lc-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="sr">A Lupi está escrevendo</span></div>';
    el.log.appendChild(typingEl);
    el.log.setAttribute('aria-busy', 'true');
    scrollToEnd(true);
  }
  function hideTyping() {
    typingEl?.remove(); typingEl = null;
    el.log.setAttribute('aria-busy', 'false');
  }

  function navigate(href) {
    const target = href?.startsWith('#') && doc.getElementById(href.slice(1));
    if (!target) return;
    if (href === '#privacidade') globalThis.dispatchEvent(new Event('contlup:privacy')); // o site abre o texto
    if (isMobile()) close();
    target.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' });
  }

  function scrollToMessage(node, role) {
    requestAnimationFrame(() => {
      const behavior = reduce() ? 'auto' : 'smooth';
      if (role !== 'user' && node.offsetHeight > el.log.clientHeight * 0.7) el.log.scrollTo({ top: node.offsetTop - 12, behavior });
      else el.log.scrollTo({ top: el.log.scrollHeight, behavior });
    });
  }
  function scrollToEnd(smooth) { requestAnimationFrame(() => el.log.scrollTo({ top: el.log.scrollHeight, behavior: smooth && !reduce() ? 'smooth' : 'auto' })); }

  // anúncios para leitores de tela: só o texto final da Lupi, agrupado
  function queueAnnounce(m) {
    if (m.kind === 'handoff') { pendingAnnounce.push('Mensagem para o WhatsApp comercial pronta para revisão.'); }
    else pendingAnnounce.push(toPlainText(m.text).slice(0, 400));
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { announce('Lupi: ' + pendingAnnounce.join(' ')); pendingAnnounce = []; }, 120);
  }
  function announce(text) { el.sr.textContent = ''; setTimeout(() => { el.sr.textContent = text; }, 30); }

  // ---------- sugestões ----------
  function renderChips() {
    el.chips.textContent = '';
    const chips = conversation.chips || [];
    el.chips.hidden = !chips.length;
    for (const c of chips) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'lc-chip' + (c.secondary ? ' is-secondary' : '');
      b.textContent = c.label;
      b.disabled = conversation.busy;
      b.addEventListener('click', () => conversation.act(c.action, c.label));
      el.chips.appendChild(b);
    }
    el.input.placeholder = conversation.placeholder || DEFAULT_PLACEHOLDER;
  }

  // ---------- status / ocupado ----------
  function updateStatus() {
    const configured = !!ai?.configured;
    el.kicker.textContent = configured ? 'Assistente virtual com IA' : 'Assistente virtual';
    let state = 'basic', text = 'Respostas automáticas', title = 'Respostas prontas e atendimentos guiados';
    if (configured && ai.available) { state = 'ai'; text = 'IA ativa · pode errar'; title = 'Perguntas abertas são respondidas por inteligência artificial'; }
    else if (configured && !ai.available) { state = 'off'; text = 'IA indisponível agora'; title = 'Fluxos guiados e respostas prontas continuam funcionando'; }
    el.status.dataset.state = state;
    el.status.title = title;
    el.status.querySelector('span').textContent = text;
  }

  function setBusy(busy) {
    root.classList.toggle('is-busy', busy);
    el.send.disabled = busy;
    el.chips.querySelectorAll('button').forEach(b => { b.disabled = busy; });
    if (busy) showTyping();
    else hideTyping();
  }

  // ---------- eventos ----------
  conversation.on((ev) => {
    if (ev.type === 'message') enqueue(ev.message);
    else if (ev.type === 'busy') setBusy(ev.busy);
    else if (ev.type === 'reset') { queue = []; queueGen++; draining = false; hideTyping(); el.log.textContent = ''; visual.reset(); }
    else if (ev.type === 'navigate') navigate(ev.href);
    else if (ev.type === 'change') {
      if (!draining) renderChips();
      updateStatus();
    }
  });

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = el.input.value;
    if (!v.trim() || conversation.busy || draining) return;
    el.input.value = '';
    updateCount();
    await conversation.send(v);
  });
  const updateCount = () => {
    const n = el.input.value.length;
    el.count.hidden = n < 400;
    el.count.textContent = `${n}/500`;
  };
  el.input.addEventListener('input', updateCount);

  el.close.addEventListener('click', close);
  el.restart.addEventListener('click', () => {
    conversation.restart();
    announce('Conversa reiniciada. O histórico desta sessão foi apagado.');
    el.input.focus({ preventScroll: true });
  });
  el.expand?.addEventListener('click', () => {
    const wide = !root.classList.contains('is-wide');
    root.classList.toggle('is-wide', wide);
    el.expand.setAttribute('aria-pressed', String(wide));
    el.expand.setAttribute('aria-label', wide ? 'Reduzir a janela do chat' : 'Expandir a janela do chat');
    el.expand.title = el.expand.getAttribute('aria-label');
    scrollToEnd(false);
  });
  el.human.addEventListener('click', () => conversation.act({ kind: 'handoff' }, 'Falar com a ContLup'));

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Tab' && root.getAttribute('aria-modal') === 'true') trapFocus(e);
  });
  el.log.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    navigate(a.getAttribute('href'));
  });

  function trapFocus(e) {
    const f = [...root.querySelectorAll('button:not([disabled]), textarea, input, a[href], [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f.at(-1);
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  addEventListener('resize', () => {
    if (root.hidden) return;
    const modal = isMobile();
    root.setAttribute('aria-modal', String(modal));
    doc.body.style.overflow = modal ? 'hidden' : '';
    if (!modal) root.style.removeProperty('--lc-vh');
  });

  return { open, close, renderAll, updateStatus, get isOpen() { return !root.hidden; }, get isTyping() { return draining; } };
}
