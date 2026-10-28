/* Star Border em JavaScript puro: adaptação do componente "Star Border" do React Bits (reactbits.dev), sem React.
   Uma luz percorre o contorno do botão deixando um rastro; ao passar o mouse (ou focar pelo teclado) ela dá uma volta
   rápida, e o clique solta um pulso que corre pelas duas direções. Desenhado num <canvas> atrás do texto.
   - Movimento reduzido: a luz fica parada (sem voltas e sem pulso animado).
   - Fora da tela: o desenho para (IntersectionObserver).
   - Sem canvas ou com erro: o botão continua igual, com a borda roxa estática do CSS (.star-border::before).
   Parte do tema escuro do original (o aviso de privacidade é sempre azul-marinho); sem as faíscas (sparkle={false}). */

const BLEED = 48;
const LAP = 0.9;
const WHITE = [255, 255, 255];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const wrap = (v, total) => ((v % total) + total) % total;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (2 - 2 * t) ** 3 / 2);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (rgb, alpha) => `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${clamp(alpha, 0, 1).toFixed(3)})`;
const hex = (h) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Contorno de um retângulo arredondado como 8 segmentos (4 retas e 4 arcos). */
function outline(width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const arc = (Math.PI * r) / 2;
  const across = Math.max(0, width - 2 * r);
  const down = Math.max(0, height - 2 * r);
  const segments = [
    { length: across, x: r, y: 0, dx: 1, dy: 0, angle: null },
    { length: arc, x: width - r, y: r, angle: -Math.PI / 2 },
    { length: down, x: width, y: r, dx: 0, dy: 1, angle: null },
    { length: arc, x: width - r, y: height - r, angle: 0 },
    { length: across, x: width - r, y: height, dx: -1, dy: 0, angle: null },
    { length: arc, x: r, y: height - r, angle: Math.PI / 2 },
    { length: down, x: 0, y: height - r, dx: 0, dy: -1, angle: null },
    { length: arc, x: r, y: r, angle: Math.PI },
  ];
  return { r, segments, total: Math.max(1, segments.reduce((sum, s) => sum + s.length, 0)) };
}

/** Ponto (e normal) a uma distância do início do contorno. */
function pointAt(shape, distance, point) {
  let s = wrap(distance, shape.total);
  for (const seg of shape.segments) {
    if (seg.length > 0 && s <= seg.length) {
      if (seg.angle === null) {
        point.x = seg.x + seg.dx * s; point.y = seg.y + seg.dy * s;
      } else {
        const a = seg.angle + s / shape.r;
        point.x = seg.x + Math.cos(a) * shape.r; point.y = seg.y + Math.sin(a) * shape.r;
      }
      return point;
    }
    s -= seg.length;
  }
  return point;
}

/** Distância ao longo do contorno do ponto mais próximo de (px, py): de onde sai o pulso do clique. */
function project(shape, px, py) {
  let best = Infinity, found = 0, offset = 0;
  for (const seg of shape.segments) {
    if (seg.length > 0) {
      let s, x, y;
      if (seg.angle === null) {
        s = clamp((px - seg.x) * seg.dx + (py - seg.y) * seg.dy, 0, seg.length);
        x = seg.x + seg.dx * s; y = seg.y + seg.dy * s;
      } else {
        let a = wrap(Math.atan2(py - seg.y, px - seg.x) - seg.angle, Math.PI * 2);
        if (a > Math.PI / 2) a = a > Math.PI * 1.25 ? 0 : Math.PI / 2;
        s = a * shape.r;
        x = seg.x + Math.cos(seg.angle + a) * shape.r; y = seg.y + Math.sin(seg.angle + a) * shape.r;
      }
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) { best = d; found = offset + s; }
    }
    offset += seg.length;
  }
  return found;
}

/**
 * Liga o efeito num botão (que precisa da classe .star-border).
 * @returns {{destroy: Function} | null} null quando o navegador não tem canvas 2D (fica a borda estática)
 */
export function starBorder(root, {
  color = '#B99BFF', trailColor = '#7549E8', duration = 4, thickness = 1, radius = 12, trailLength = 0.3,
  stars = 1, glow = 0.6, direction = 'clockwise', clickPulse = true,
  reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
} = {}) {
  const canvas = root.ownerDocument.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof ResizeObserver === 'undefined') return null;
  canvas.className = 'star-border__light';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);
  root.classList.add('is-lit');
  root.style.setProperty('--star-border-radius', `${radius}px`);
  root.style.setProperty('--star-border-thickness', `${thickness}px`);

  const s = {
    duration: Math.max(0.3, duration), thickness: Math.max(0.5, thickness), radius: Math.max(0, radius),
    trailLength: clamp(trailLength, 0, 1), stars: clamp(Math.round(stars), 1, 6), glow: clamp(glow, 0, 1),
    direction: direction === 'counterclockwise' ? -1 : 1,
  };
  const head = hex(color), tail = hex(trailColor);
  const point = { x: 0, y: 0 };
  const st = { width: 0, height: 0, dpr: 1, phase: 0, velocity: 0, motion: 0, lap: -1, time: 0, flash: 0, hovered: false, visible: true };
  const pulses = [];
  let raf = 0, last = performance.now(), alive = true;

  const shapeFor = () => outline(Math.max(1, st.width - s.thickness), Math.max(1, st.height - s.thickness), s.radius - s.thickness / 2);

  function measure() {
    st.width = root.offsetWidth; st.height = root.offsetHeight;
    st.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round((st.width + BLEED * 2) * st.dpr));
    canvas.height = Math.max(1, Math.round((st.height + BLEED * 2) * st.dpr));
    wake();
  }
  function local(e) {
    const r = root.getBoundingClientRect();
    return [(e.clientX - r.left) * (r.width ? st.width / r.width : 1), (e.clientY - r.top) * (r.height ? st.height / r.height : 1)];
  }
  function stroke(x1, y1, x2, y2, width, style) {
    ctx.lineWidth = width; ctx.strokeStyle = style;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function drawTrail(shape, at, length, sign, intensity, tip = true) {
    if (length < 0.5 || intensity <= 0) return;
    const steps = clamp(Math.ceil(length / 2), 2, 90);
    pointAt(shape, at, point);
    let px = point.x, py = point.y;
    for (let i = 1; i <= steps; i++) {
      pointAt(shape, at - sign * length * (i / steps), point);
      const u = 1 - (i - 0.5) / steps;
      const fade = u * u * intensity;
      const tone = mix(mix(tail, head, u), WHITE, u ** 6 * 0.65);
      ctx.lineCap = tip && i === 1 ? 'round' : 'butt';
      stroke(px, py, point.x, point.y, 2 + 6 * s.glow, rgba(tone, fade * 0.2 * s.glow));
      stroke(px, py, point.x, point.y, s.thickness, rgba(tone, fade));
      px = point.x; py = point.y;
    }
  }
  function drawHead(x, y, intensity) {
    if (intensity <= 0) return;
    const reach = 12 + 40 * s.glow;
    const g = ctx.createRadialGradient(x, y, 0, x, y, reach);
    const k = 0.4 * s.glow * intensity;
    g.addColorStop(0, rgba(head, k)); g.addColorStop(0.2, rgba(head, k * 0.4)); g.addColorStop(0.5, rgba(head, k * 0.1)); g.addColorStop(1, rgba(head, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - reach, y - reach, reach * 2, reach * 2);
  }

  function draw(shape) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (st.width < 2 || st.height < 2) return;
    const off = (BLEED + s.thickness / 2) * st.dpr;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, off, off);
    ctx.globalCompositeOperation = 'lighter';
    const total = shape.total, spacing = total / s.stars;
    const speed = Math.abs(st.motion), sign = st.motion >= 0 ? 1 : -1;
    const length = Math.min(speed * s.trailLength * s.duration, spacing * 0.92, total * 0.6);
    const intensity = 1 + 0.6 * st.flash;
    const ring = st.flash * 0.32;
    if (ring > 0.005 && ctx.roundRect) {
      ctx.lineWidth = s.thickness + 2 * s.glow; ctx.strokeStyle = rgba(head, ring);
      ctx.beginPath(); ctx.roundRect(0, 0, Math.max(1, st.width - s.thickness), Math.max(1, st.height - s.thickness), Math.max(0, shape.r)); ctx.stroke();
    }
    // parada (movimento reduzido): um brilho curto para os dois lados da luz
    const still = clamp(1 - speed / Math.max(1, (total / s.duration) * 0.6), 0, 1);
    const rest = (10 + 14 * s.glow + s.thickness * 2) * still;
    for (let i = 0; i < s.stars; i++) {
      const at = st.phase + i * spacing;
      drawTrail(shape, at, length, sign, 1);
      if (still > 0.01) { drawTrail(shape, at, rest, 1, still, false); drawTrail(shape, at, rest, -1, still, false); }
    }
    for (const p of pulses) {
      const fade = (1 - p.age / 0.65) ** 2;
      const travel = (total / 2) * (1 - (1 - Math.min(1, p.age / 0.5)) ** 2);
      const tailLen = Math.min(travel, total * 0.16);
      for (const way of [1, -1]) {
        const front = p.origin + way * travel;
        drawTrail(shape, front, tailLen, way, fade);
        pointAt(shape, front, point); drawHead(point.x, point.y, fade * 0.8);
      }
    }
    for (let i = 0; i < s.stars; i++) { pointAt(shape, st.phase + i * spacing, point); drawHead(point.x, point.y, Math.min(1.3, intensity)); }
  }

  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now; st.time += dt;
    const shape = shapeFor(), total = shape.total;
    const still = reduce();
    const cruise = still ? 0 : (s.direction * total) / s.duration;
    st.flash *= Math.exp(-dt / 0.22);
    st.velocity += (cruise - st.velocity) * (1 - Math.exp(-dt / 0.45));
    let extra = 0;
    if (st.lap >= 0) {
      const before = ease(Math.min(1, st.lap / LAP));
      st.lap += dt;
      extra = (ease(Math.min(1, st.lap / LAP)) - before) * total * s.direction;
      if (st.lap >= LAP) st.lap = -1;
    }
    st.motion = st.velocity + extra / dt;
    st.phase = wrap(st.phase + st.velocity * dt + extra, total);
    for (let i = pulses.length - 1; i >= 0; i--) { pulses[i].age += dt; if (pulses[i].age >= 0.65) pulses.splice(i, 1); }
    draw(shape);
    const settling = st.flash > 0.01 || pulses.length > 0;
    const moving = Math.abs(st.motion) > 0.05 || cruise !== 0 || st.lap >= 0;
    if (st.visible && (settling || moving || st.hovered)) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf || !alive || !st.visible) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const lap = () => { if (st.lap < 0 && !reduce()) st.lap = 0; wake(); };
  const pulse = (origin) => {
    if (!clickPulse || reduce()) return;
    pulses.push({ origin, age: 0 }); if (pulses.length > 4) pulses.shift();
    st.flash = 1; wake();
  };
  const on = {
    pointerenter: () => { st.hovered = true; lap(); },
    pointerleave: () => { st.hovered = false; wake(); },
    pointerdown: (e) => { if (e.button !== 0 && e.pointerType === 'mouse') return; const [x, y] = local(e); pulse(project(shapeFor(), x - s.thickness / 2, y - s.thickness / 2)); },
    click: (e) => { if (e.detail === 0) pulse(st.phase); }, // teclado (Enter/Espaço)
    focus: () => { if (root.matches(':focus-visible')) lap(); },
  };
  for (const [k, fn] of Object.entries(on)) root.addEventListener(k, fn);
  const ro = new ResizeObserver(measure);
  ro.observe(root);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(es => { st.visible = es.some(e => e.isIntersecting); if (st.visible) wake(); })
    : null;
  io?.observe(root);
  measure();

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); io?.disconnect();
      for (const [k, fn] of Object.entries(on)) root.removeEventListener(k, fn);
      canvas.remove(); root.classList.remove('is-lit');
    },
  };
}
