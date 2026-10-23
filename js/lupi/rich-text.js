/* Formatação segura das mensagens.
   Nunca usamos innerHTML com texto da IA ou do visitante: o texto vira uma árvore simples
   (parágrafos, listas, negrito, links permitidos) que a interface monta com createElement/textContent. */

const ALLOWED_LINK = [
  /^#[a-z0-9-]+$/i,
  /^mailto:contato@contlup\.com\.br$/i,
  /^https:\/\/wa\.me\/(5519971310182|5519997447919)(\?.*)?$/,
  /^https:\/\/(www\.)?instagram\.com\/contlupstudiocontabil\/?$/,
  /^https:\/\/([a-z0-9-]+\.)*gov\.br(\/[^\s]*)?$/i,
];

export function isAllowedLink(href) {
  const h = String(href || '').trim();
  return ALLOWED_LINK.some(re => re.test(h));
}

/** Texto inline -> [{t:'text'|'b'|'a', v, href}] */
export function parseInline(s) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,120})\]\(([^)\s]{1,300})\)|(https?:\/\/[^\s)]+)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1] != null) out.push({ t: 'b', v: m[1] });
    else if (m[2] != null) out.push(isAllowedLink(m[3]) ? { t: 'a', v: m[2], href: m[3] } : { t: 'text', v: m[2] });
    else if (m[4] != null) {
      const url = m[4].replace(/[.,;:!?]+$/, '');
      const tail = m[4].slice(url.length);
      out.push(isAllowedLink(url) ? { t: 'a', v: url, href: url } : { t: 'text', v: '[link removido]' });
      if (tail) out.push({ t: 'text', v: tail });
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

/** Bloco de texto -> [{type:'p', inline}|{type:'ul', items:[inline]}] */
export function parseRich(text) {
  const blocks = [];
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let para = [], list = null;
  const flushP = () => { if (para.length) { blocks.push({ type: 'p', inline: parseInline(para.join('\n')) }); para = []; } };
  const flushL = () => { if (list) { blocks.push({ type: 'ul', items: list }); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const li = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) { flushP(); (list ||= []).push(parseInline(li[1])); continue; }
    if (!line.trim()) { flushP(); flushL(); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return blocks;
}

/** Converte para texto puro (usado no anúncio para leitores de tela). */
export function toPlainText(text) {
  return parseRich(text).map(b => b.type === 'p'
    ? b.inline.map(i => i.v).join('')
    : b.items.map(it => '• ' + it.map(i => i.v).join('')).join('\n')).join('\n');
}

/** Monta os nós no DOM (só no navegador). */
export function renderRich(doc, container, text) {
  for (const b of parseRich(text)) {
    if (b.type === 'p') {
      const p = doc.createElement('p');
      appendInline(doc, p, b.inline);
      container.appendChild(p);
    } else {
      const ul = doc.createElement('ul');
      for (const it of b.items) { const li = doc.createElement('li'); appendInline(doc, li, it); ul.appendChild(li); }
      container.appendChild(ul);
    }
  }
}

function appendInline(doc, el, parts) {
  for (const part of parts) {
    if (part.t === 'b') { const b = doc.createElement('strong'); b.textContent = part.v; el.appendChild(b); }
    else if (part.t === 'a') {
      const a = doc.createElement('a');
      a.textContent = part.v; a.href = part.href;
      if (!part.href.startsWith('#') && !part.href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      el.appendChild(a);
    } else {
      const chunks = part.v.split('\n');
      chunks.forEach((c, i) => { if (i) el.appendChild(doc.createElement('br')); if (c) el.appendChild(doc.createTextNode(c)); });
    }
  }
}
