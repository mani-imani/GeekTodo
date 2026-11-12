// Small UI toolkit: element builder, icons, toast, bottom sheet, confirm dialog.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const P = {
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/>',
  addSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  broom: '<path d="M19 3 11 11M8 12l4 4M3 21c1-4 3-7 5-9l4 4c-2 2-5 4-9 5z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  dot: '<circle cx="12" cy="12" r="4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
export const iconEl = (name, cls) => h('span', { class: 'ic-wrap', html: icon(name, cls) }).firstChild;

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- toast ----------
let toastTimer = null;
let currentToast = null;

export function toast(message, { action, onAction, duration = 3500, icon: ic } = {}) {
  const region = document.getElementById('toasts');
  dismissToast();
  const el = h('div', { class: 'toast', role: 'status' },
    ic ? h('span', { class: 'toast-ic', html: icon(ic) }) : null,
    h('span', { class: 'toast-msg' }, message));
  let progress = null;
  if (action) {
    const btn = h('button', { class: 'toast-btn', type: 'button' }, action);
    btn.addEventListener('click', () => { onAction?.(); dismissToast(); });
    el.append(btn);
    progress = h('span', { class: 'toast-progress' });
    progress.style.animationDuration = duration + 'ms';
    el.append(progress);
  }
  region.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  currentToast = el;
  toastTimer = setTimeout(dismissToast, duration);
  return { dismiss: dismissToast, el };
}

export function dismissToast() {
  clearTimeout(toastTimer);
  const el = currentToast;
  if (!el) return;
  currentToast = null;
  el.classList.remove('in');
  el.classList.add('out');
  setTimeout(() => el.remove(), 260);
}

// ---------- bottom sheet / dialog ----------
let openSheets = 0;

export function sheet(content, { title, onClose, className = '' } = {}) {
  const prevFocus = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    title ? h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بستن', html: icon('x'), onclick: () => close() })) : null,
    h('div', { class: 'sheet-body' }, content));
  const root = h('div', { class: 'sheet-root' }, backdrop, panel);
  document.body.append(root);
  openSheets++;
  document.body.classList.add('has-sheet');
  requestAnimationFrame(() => root.classList.add('in'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.remove('in');
    root.classList.add('out');
    document.removeEventListener('keydown', onKey);
    const finish = () => {
      root.remove();
      if (--openSheets === 0) document.body.classList.remove('has-sheet');
      prevFocus?.focus?.({ preventScroll: true });
      onClose?.();
    };
    if (reducedMotion()) finish(); else setTimeout(finish, 300);
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // simple focus trap
      const f = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);

  // drag the handle/head down to dismiss (touch)
  let startY = null, dy = 0;
  const grab = panel.querySelector('.sheet-handle');
  const head = panel.querySelector('.sheet-head');
  for (const g of [grab, head].filter(Boolean)) {
    g.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY; dy = 0; panel.style.transition = 'none'; g.setPointerCapture(e.pointerId);
    });
    g.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY == null) return;
      startY = null; panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) close();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }
  setTimeout(() => panel.querySelector('[autofocus], .sheet-head button, button')?.focus({ preventScroll: true }), 50);
  return { close, panel };
}

export function confirmDialog({ title, message, ok = 'تأیید', cancel = 'انصراف', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const body = h('div', { class: 'confirm' },
      message ? h('p', { class: 'muted' }, message) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', autofocus: true, onclick: () => { answered = true; resolve(true); s.close(); } }, ok),
        h('button', { class: 'btn', type: 'button', onclick: () => { answered = true; resolve(false); s.close(); } }, cancel)));
    const s = sheet(body, { title, className: 'sheet-small', onClose: () => { if (!answered) resolve(false); } });
  });
}
