/* Lupi 3.0: camada visual (poses, estados e animações), separada do motor de conversa.
   A conversa não sabe de imagens: ela só marca as mensagens (expressão, id da intenção, dicas como "etapa concluída").
   Aqui essas marcas viram um estado visual, e cada estado escolhe uma pose e um movimento curto.
   Poses: img/lupi/poses/<nome>.webp (2x) e <nome>-1x.webp, recortadas da arte enviada pela ContLup. */

export const POSE_DIR = 'img/lupi/poses/';

/** Poses disponíveis (largura × altura da versão 2x). */
export const POSES = {
  acenando: [323, 300], pensando: [305, 318], apontando: [312, 307], tablet: [344, 313],
  carinho: [325, 309], checklist: [372, 294], grafico: [367, 300], ideia: [313, 299],
  notebook: [399, 316], headset: [321, 310], ok: [336, 303], comemorando: [335, 307],
};

/**
 * Estados visuais. pose: qual ilustração; motion: movimento curto ao entrar (CSS);
 * then/after: para qual estado volta e depois de quantos ms (só o desenho muda, a conversa não espera).
 */
export const STATES = {
  idle: { pose: 'tablet' },
  welcome: { pose: 'acenando', motion: 'wave', then: 'idle', after: 2600 },
  thinking: { pose: 'pensando', motion: 'think' },
  explaining: { pose: 'apontando', motion: 'nudge', then: 'idle', after: 7000 },
  finance: { pose: 'grafico', motion: 'nudge', then: 'idle', after: 7000 },
  organize: { pose: 'checklist', motion: 'nudge', then: 'idle', after: 7000 },
  idea: { pose: 'ideia', motion: 'pop', then: 'idle', after: 6000 },
  notes: { pose: 'notebook' },
  stepDone: { pose: 'ok', motion: 'pop', then: 'notes', after: 1300 },
  handoff: { pose: 'headset', motion: 'nudge' },
  doubt: { pose: 'pensando', motion: 'think' },
  celebrate: { pose: 'comemorando', motion: 'cheer', then: 'idle', after: 3200 },
  thanks: { pose: 'carinho', motion: 'pop', then: 'idle', after: 4000 },
  goodbye: { pose: 'acenando', motion: 'wave', then: 'idle', after: 3000 },
};

export const DEFAULT_STATE = 'idle';
// poses do primeiro contato: carregadas ao abrir o chat; as outras, quando o navegador estiver livre
export const FIRST_POSES = ['tablet', 'acenando', 'pensando'];

// assuntos financeiros: BPO e rotinas de caixa (ids do repertório, não reclassifica nada)
const FINANCE = /^(serv-bpo|bpo-|rot-(fluxo-caixa|sobra-caixa|saldo-lucro|margem|precificacao|receita-despesa|faturamento-lucro)|duv-organizar-financas)/;

/**
 * Estado visual de uma mensagem da Lupi (função pura: usa só as marcas que a conversa já colocou).
 * @param {{role?: string, kind?: string, expression?: string, visual?: string, intent?: string, category?: string, fallback?: string}} m
 */
export function visualStateFor(m) {
  if (!m || m.role !== 'bot') return null;
  if (m.visual && STATES[m.visual]) return m.visual;
  if (m.kind === 'handoff') return 'handoff';
  if (m.fallback) return 'doubt';                       // não sei / em revisão / falha: pensativa, nunca "erro"
  if (m.intent && FINANCE.test(m.intent)) return 'finance';
  if (m.category === 'planos') return 'organize';
  switch (m.expression) {
    case 'welcome': return 'welcome';
    case 'thinking': return 'doubt';
    case 'success': return 'celebrate';
    case 'idle': return 'idle';
    default: return 'explaining';
  }
}

/** Caminho da pose para a densidade da tela (1x para telas comuns, 2x para retina). */
export function poseSrc(name, dpr = 1) {
  return `${POSE_DIR}${name}${dpr > 1.25 ? '' : '-1x'}.webp`;
}

/**
 * Controlador no DOM. Duas camadas de imagem fazem o crossfade; a pose nova só entra depois de carregada
 * (sem piscar e sem mudar o layout: o palco tem tamanho fixo). Se uma pose falhar, usa a padrão; se a padrão
 * falhar, o avatar.
 * @param {{stage: HTMLElement, doc?: Document, reduce?: () => boolean, dpr?: number, fallbackSrc?: string}} o
 */
export function createLupiVisual({ stage, doc = stage.ownerDocument, reduce = () => false, dpr = globalThis.devicePixelRatio || 1, fallbackSrc = 'img/lupi/avatar.webp' }) {
  const layers = [...stage.querySelectorAll('.lc-pose')];
  if (layers.length < 2) {
    const b = layers[0].cloneNode(false);
    b.removeAttribute('src');
    b.classList.remove('js-lc-pose');
    b.classList.add('is-back');
    layers[0].after(b);
    layers.push(b);
  }
  layers[0].classList.add('is-front');
  let front = 0, current = null, timer = 0, token = 0;
  const loaded = new Map();      // nome -> Promise<boolean>

  function load(name) {
    if (!loaded.has(name)) {
      loaded.set(name, new Promise(res => {
        const i = new Image();
        i.decoding = 'async';
        i.onload = () => res(true);
        i.onerror = () => res(false);
        i.src = poseSrc(name, dpr);
      }));
    }
    return loaded.get(name);
  }

  function preload(names) { names.forEach(load); }
  /** Poses secundárias quando o navegador estiver livre (não disputa com a abertura do chat). */
  function preloadRest() {
    const rest = Object.keys(POSES).filter(n => !FIRST_POSES.includes(n));
    const go = () => preload(rest);
    if (globalThis.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1200);
  }

  async function show(state) {
    const def = STATES[state] || STATES[DEFAULT_STATE];
    const my = ++token;
    let pose = POSES[def.pose] ? def.pose : STATES[DEFAULT_STATE].pose;
    let src = poseSrc(pose, dpr), w = POSES[pose][0], h = POSES[pose][1];
    if (!(await load(pose))) {
      pose = STATES[DEFAULT_STATE].pose;
      if (await load(pose)) { src = poseSrc(pose, dpr); [w, h] = POSES[pose]; }
      else { src = fallbackSrc; w = h = 192; pose = 'avatar'; }
    }
    if (my !== token) return;              // outro estado chegou enquanto carregava
    stage.dataset.pose = pose;
    const cur = layers[front];
    if (cur.getAttribute('src') !== src) {
      const next = layers[1 - front];
      next.src = src; next.width = w; next.height = h;
      next.classList.add('is-front'); next.classList.remove('is-back');
      cur.classList.remove('is-front'); cur.classList.add('is-back');
      front = 1 - front;
    }
    playMotion(def.motion);
  }

  function playMotion(motion) {
    stage.classList.remove('m-wave', 'm-think', 'm-nudge', 'm-pop', 'm-cheer');
    if (!motion || reduce()) return;
    void stage.offsetWidth;                // reinicia a animação se o mesmo movimento repetir
    stage.classList.add('m-' + motion);
  }

  /** Muda o estado visual. Estados passageiros voltam sozinhos (then/after), sem atrasar a conversa. */
  function set(state) {
    if (!STATES[state]) state = DEFAULT_STATE;
    clearTimeout(timer);
    current = state;
    stage.dataset.state = state;
    show(state);
    const def = STATES[state];
    if (def.then) timer = setTimeout(() => { if (current === state) set(def.then); }, def.after);
  }

  /** Volta ao estado inicial sem animação (fechar, reiniciar). */
  function reset() {
    clearTimeout(timer);
    current = DEFAULT_STATE;
    stage.dataset.state = DEFAULT_STATE;
    stage.classList.remove('m-wave', 'm-think', 'm-nudge', 'm-pop', 'm-cheer');
    show(DEFAULT_STATE);
  }

  return { set, reset, preload, preloadRest, get state() { return current; } };
}
