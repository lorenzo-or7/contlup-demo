/* Aviso de privacidade e preferências de armazenamento.

   O que o site guarda no navegador (auditoria de 28/10/2026; não há cookies, analytics nem scripts de terceiros):
   - Essencial: esta escolha (localStorage "cl-consent") e a conversa da Lupi enquanto a aba estiver aberta
     (sessionStorage "lupi:v2:session", pedida pelo próprio visitante ao abrir o chat).
   - Preferências (opcional): o tema claro/escuro entre visitas (localStorage "cl-theme") e o controle do convite da
     Lupi (sessionStorage "lupi:v2:teaser"). Sem permissão, o tema vale só para a página aberta e nada disso é gravado.
   Rolar, ficar em silêncio ou navegar não conta como escolha. Não há botão de fechar sem decidir.
   Se a política mudar de forma relevante, aumente VERSION: quem escolheu numa versão anterior vê o aviso de novo.

   Convivência com a Lupi: os dois podem ficar abertos. Quando o chat está em uso e ocupa o mesmo espaço (celular, ou
   janela larga no desktop), o aviso vira uma pílula "Privacidade · escolha pendente"; tocar nela traz o aviso de volta
   por cima do chat. Nada é fechado nem perdido (a escolha ainda não salva continua marcada). */

export const STORAGE_KEY = 'cl-consent';
export const VERSION = 1; // mesmo valor em js/main.js
const CLOSE_MS = 300;

const doc = document;
const root = doc.documentElement;
const $ = (s, c = doc) => c.querySelector(s);
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 899px)').matches;

let memory = null; // escolha desta página quando o navegador bloqueia o armazenamento

export function readConsent() {
  try {
    const c = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (c && c.v === VERSION && typeof c.prefs === 'boolean') return c;
  } catch { /* armazenamento bloqueado */ }
  return memory;
}

function saveConsent(prefs) {
  const c = { v: VERSION, prefs, at: new Date().toISOString() };
  memory = c;
  let stored = false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); stored = true; } catch { /* fica só nesta página */ }
  if (!prefs) {
    // recusar apaga o que a categoria guardaria
    try { localStorage.removeItem('cl-theme'); } catch { /* nada a apagar */ }
    try { sessionStorage.removeItem('lupi:v2:teaser'); } catch { /* nada a apagar */ }
  }
  dispatchEvent(new CustomEvent('contlup:consent', { detail: { prefs, stored } }));
  return c;
}

const card = $('.js-ck');
if (card) init(card);

function init(card) {
  const body = $('.ck-body', card);
  const prefsBox = $('#ck-prefs', card);
  const pref = $('#ck-pref', card);
  const accept = $('.js-ck-accept', card);
  const reject = $('.js-ck-reject', card);
  const custom = $('.js-ck-custom', card);
  const save = $('.js-ck-save', card);
  const pill = $('.js-ck-pill', card);
  const status = $('.js-ck-status', card);
  const chat = doc.getElementById('lupi-chat');
  let tClose = 0;
  let opener = null; // botão do rodapé que reabriu o aviso (o foco volta para ele)

  // efeito do botão "Aceitar": carregado à parte; se falhar, fica a borda roxa estática
  import('./star-border.js')
    .then(m => m.starBorder(accept, { color: '#B99BFF', trailColor: '#7549E8', duration: 4, direction: 'clockwise', stars: 1, trailLength: 0.3, thickness: 1, radius: 12, glow: 0.6, clickPulse: true, reduce }))
    .catch(() => {});

  // ---------- abrir / fechar ----------
  function show({ prefsOpen = false, focus = false, from = null } = {}) {
    clearTimeout(tClose);
    opener = from;
    const c = readConsent();
    pref.checked = !!c?.prefs; // nada pré-marcado na primeira visita
    setPrefs(prefsOpen);
    card.hidden = false;
    card.classList.remove('is-closing', 'is-collapsed');
    doc.body.classList.add('ck-on');
    doc.body.classList.remove('ck-collapsed');
    pill.hidden = true;
    requestAnimationFrame(() => { card.classList.add('is-in'); measure(); });
    if (focus) (prefsOpen ? pref : accept).focus({ preventScroll: true });
    if (chatInUse()) layer('ck');
  }

  function close() {
    const hadFocus = card.contains(doc.activeElement);
    card.classList.remove('is-in');
    card.classList.add('is-closing');
    doc.body.classList.remove('ck-on', 'ck-collapsed');
    root.style.removeProperty('--ck-h');
    const done = () => {
      card.hidden = true; card.classList.remove('is-closing', 'is-collapsed', 'ck-top');
      if (hadFocus) {
        // o foco volta para o chat se ele estiver aberto; se não, para o conteúdo
        const back = chat && !chat.hidden ? ($('#lc-in', chat) || chat) : (opener?.isConnected ? opener : doc.getElementById('conteudo'));
        back?.focus({ preventScroll: true });
      }
    };
    if (reduce()) done(); else tClose = setTimeout(done, CLOSE_MS);
  }

  function decide(prefs) {
    saveConsent(prefs);
    status.textContent = prefs ? 'Preferências permitidas. Escolha salva.' : 'Somente o essencial. Escolha salva.';
    close();
  }

  function setPrefs(open) {
    prefsBox.hidden = !open;
    card.classList.toggle('is-custom', open);
    custom.setAttribute('aria-expanded', String(open));
    custom.textContent = open ? 'Ocultar preferências' : 'Personalizar preferências';
    save.hidden = !open;
    measure();
  }

  accept.addEventListener('click', () => { pref.checked = true; decide(true); });
  reject.addEventListener('click', () => { pref.checked = false; decide(false); });
  save.addEventListener('click', () => decide(pref.checked));
  custom.addEventListener('click', () => { setPrefs(prefsBox.hidden); if (!prefsBox.hidden) pref.focus({ preventScroll: true }); });

  // rodapé: "Preferências de privacidade" reabre o aviso, já com as categorias
  doc.querySelectorAll('.js-ck-open').forEach(b => b.addEventListener('click', () => show({ prefsOpen: true, focus: true, from: b })));

  // ---------- altura ocupada (o celular sobe os botões flutuantes para não ficarem por baixo) ----------
  function measure() {
    if (card.hidden || card.classList.contains('is-collapsed')) { root.style.removeProperty('--ck-h'); return; }
    root.style.setProperty('--ck-h', `${Math.round(card.getBoundingClientRect().height)}px`);
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(card);
  addEventListener('resize', () => { measure(); arrange(); });

  // ---------- convivência com o chat da Lupi ----------
  const chatOpen = () => !!chat && !chat.hidden;
  function overlaps() {
    if (!chatOpen()) return false;
    if (mobile()) return true;
    const r = card.getBoundingClientRect(), b = chat.getBoundingClientRect();
    return !(r.right <= b.left || b.right <= r.left || r.bottom <= b.top || b.bottom <= r.top);
  }
  function chatInUse() { return chatOpen() && overlaps(); }

  function collapse() {
    if (card.hidden || card.classList.contains('is-closing')) return;
    card.classList.add('is-collapsed');
    card.classList.remove('ck-top');
    doc.body.classList.add('ck-collapsed');
    pill.hidden = false;
    measure();
  }
  function expand() {
    card.classList.remove('is-collapsed');
    doc.body.classList.remove('ck-collapsed');
    pill.hidden = true;
    layer('ck');
    measure();
    accept.focus({ preventScroll: true });
  }
  function layer(top) { card.classList.toggle('ck-top', top === 'ck'); }

  /** Chat abriu, mudou de tamanho ou recebeu atenção: o aviso dá passagem se estiver no caminho. */
  function arrange() {
    if (card.hidden) return;
    if (!chatOpen()) {
      // chat fechado: o aviso volta inteiro, no mesmo estado em que estava
      if (card.classList.contains('is-collapsed')) { card.classList.remove('is-collapsed'); doc.body.classList.remove('ck-collapsed'); pill.hidden = true; measure(); }
      layer('');
      return;
    }
    if (card.classList.contains('ck-top')) return; // o visitante trouxe o aviso para a frente
    if (overlaps()) collapse();
  }
  pill.addEventListener('click', expand);

  if (chat) {
    new MutationObserver(() => requestAnimationFrame(arrange)).observe(chat, { attributes: true, attributeFilter: ['hidden', 'class'] });
    // usar o chat devolve a prioridade a ele
    const chatFirst = () => { if (card.classList.contains('ck-top') && overlaps()) { layer(''); collapse(); } };
    chat.addEventListener('pointerdown', chatFirst);
    chat.addEventListener('focusin', chatFirst);
    // digitando no celular: o teclado ocupa a tela, a pílula sai do caminho
    chat.addEventListener('focusin', e => { if (e.target.matches('input, textarea')) doc.body.classList.add('lc-keyboard'); });
    chat.addEventListener('focusout', () => doc.body.classList.remove('lc-keyboard'));
  }

  // Escape no aviso com o chat aberto: devolve a frente ao chat (o aviso continua pendente)
  card.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !chatOpen() || card.classList.contains('is-collapsed')) return;
    e.stopPropagation();
    layer(''); collapse();
    ($('#lc-in', chat) || chat).focus({ preventScroll: true });
  });

  // primeira visita (ou versão nova da política): o aviso aparece assim que a página está pronta
  if (!readConsent()) show();
}
