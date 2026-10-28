/* Lupi 2.0: carregamento leve.
   Este arquivo é o único que roda junto com a página: cuida do botão flutuante e do convite discreto.
   O chat completo (app.js e módulos) só é baixado quando o visitante demonstra interesse. */

const $ = (s, c = document) => c.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const launch = $('.js-lc-open');
const teaser = $('.js-lc-teaser');
const chat = $('#lupi-chat');

let appPromise = null;
function loadApp() {
  appPromise ||= import('./app.js').then(m => m.start()).catch(err => {
    appPromise = null;
    console.error('Lupi: falha ao carregar o chat', err);
    throw err;
  });
  return appPromise;
}

async function open(from) {
  hideTeaser(true);
  try {
    const app = await loadApp();
    app.open(from);
  } catch {
    // sem o módulo (ex.: arquivo aberto direto do disco, sem servidor), cai no WhatsApp
    if (location.protocol === 'file:') alert('Para usar o chat da Lupi, abra o site por um servidor (veja o README).');
  }
}

if (launch && chat) {
  document.querySelectorAll('.js-lc-open').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault();
    if (!chat.hidden) { loadApp().then(app => app.close()); return; }
    open(b);
  }));
  // pré-carrega quando o visitante se aproxima do botão
  const warm = () => { loadApp().catch(() => {}); };
  ['pointerenter', 'focus', 'touchstart'].forEach(ev => launch.addEventListener(ev, warm, { once: true, passive: true }));
  launch.classList.add('is-ready');
  // perguntas prontas espalhadas pela página: abrem o chat já com a pergunta
  document.querySelectorAll('[data-lupi-ask]').forEach(b => b.addEventListener('click', async () => {
    hideTeaser(true);
    try { (await loadApp()).ask(b.dataset.lupiAsk, b); } catch { /* sem o chat, o botão não faz nada */ }
  }));
}

/* ---- convite discreto ----
   Regras: no máximo uma vez por sessão; só depois de o visitante interagir (rolar a página) e
   de algum tempo no site; nunca com o chat aberto, com um campo em foco ou com o formulário/contato visível. */
const TEASER_KEY = 'lupi:v2:teaser';
// lembrar o convite na aba é uma "Preferência" do aviso de privacidade (js/consent.js); sem permissão, vale só nesta página
let seenHere = false;
function prefsAllowed() { try { const c = JSON.parse(localStorage.getItem('cl-consent') || 'null'); return !!(c && c.v === 1 && c.prefs); } catch { return false; } }
function seen() { if (seenHere) return true; try { return prefsAllowed() && sessionStorage.getItem(TEASER_KEY) === '1'; } catch { return false; } }
function markSeen() { seenHere = true; if (!prefsAllowed()) return; try { sessionStorage.setItem(TEASER_KEY, '1'); } catch { /* ok sem armazenamento */ } }
function hideTeaser(remember) {
  if (!teaser) return;
  teaser.hidden = true;
  if (remember) markSeen();
}

if (teaser && !seen()) {
  const start = performance.now();
  let scrolled = 0, lastY = scrollY, shown = false, critical = false, timer = 0;
  const criticalEls = [document.getElementById('proposta'), document.getElementById('contato')].filter(Boolean);
  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const io = new IntersectionObserver(es => {
      es.forEach(e => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
      critical = visible.size > 0;
      if (critical && shown) hideTeaser(false);
    }, { threshold: 0.15 });
    criticalEls.forEach(el => io.observe(el));
  }
  const ready = () => !shown && !seen() && chat?.hidden && scrolled > innerHeight * (globalThis.__lupiTeaserScroll ?? 0.8) && performance.now() - start > (globalThis.__lupiTeaserDelay ?? 12000)
    && !critical && !document.body.classList.contains('lc-on') && !document.body.classList.contains('ck-on') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))
    && !document.querySelector('.js-nav.is-open');
  const tryShow = () => {
    if (!ready()) return;
    shown = true;
    markSeen();
    teaser.hidden = false;
    if (reduce) teaser.classList.add('no-anim');
    timer = setTimeout(() => hideTeaser(false), 14000);
  };
  addEventListener('scroll', () => { scrolled += Math.abs(scrollY - lastY); lastY = scrollY; if (!shown) requestAnimationFrame(tryShow); }, { passive: true });
  setInterval(() => { if (!shown) tryShow(); }, 4000);
  $('.js-lc-teaser-x', teaser)?.addEventListener('click', () => { clearTimeout(timer); hideTeaser(true); launch?.focus(); });
  $('.js-lc-teaser-go', teaser)?.addEventListener('click', () => { clearTimeout(timer); open(launch); });
  teaser.addEventListener('keydown', e => { if (e.key === 'Escape') { hideTeaser(true); launch?.focus(); } });
}
