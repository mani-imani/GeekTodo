// Archive: completed tasks, newest first, grouped by day, with offline search.
import * as store from '../store.js';
import { h, icon, toast } from '../ui.js';
import { playTick } from '../feedback.js';
import * as fmt from '../fmt.js';

let root, listEl, search, countEl, query = '', limit = 150;

/** Make Persian/Arabic variants and digits comparable. */
export function normalize(s) {
  return fmt.toLatinDigits(String(s))
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا')
    .replace(/[ً-ْٰ]/g, '')   // harakat
    .replace(/[‌‏‎]/g, ' ')   // ZWNJ / marks → space
    .replace(/\s+/g, ' ')
    .toLowerCase().trim();
}

export function mount(container) {
  search = h('input', {
    type: 'search', role: 'searchbox', class: 'search-input', placeholder: 'جست‌وجو در آرشیو…', 'aria-label': 'جست‌وجو در آرشیو',
    enterkeyhint: 'search', autocomplete: 'off', dir: 'rtl',
  });
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = search.value; limit = 150; render(); }, 80);
  });
  const clearBtn = h('button', {
    class: 'icon-btn search-clear', type: 'button', 'aria-label': 'پاک کردن جست‌وجو', html: icon('x'), hidden: true,
    onclick: () => { search.value = ''; query = ''; clearBtn.hidden = true; render(); search.focus(); },
  });
  search.addEventListener('input', () => { clearBtn.hidden = !search.value; });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.preventDefault(); clearBtn.click(); } });
  countEl = h('p', { class: 'muted small count-line', 'aria-live': 'polite' });
  listEl = h('div', { class: 'archive-list' });
  root = h('section', { class: 'view view-archive' },
    h('header', { class: 'view-head' }, h('h1', {}, 'آرشیو')),
    h('div', { class: 'search' }, h('span', { class: 'search-ic', html: icon('search') }), search, clearBtn),
    countEl, listEl);
  container.append(root);
  listEl.addEventListener('click', onClick);
  render();
  return root;
}

function highlight(text, q) {
  const span = h('span', { class: 'text', dir: 'auto' });
  if (!q) { span.textContent = text; return span; }
  // map normalized positions back to the original string (same length except collapsed spaces → do char-by-char)
  const nq = normalize(q);
  const chars = [...text];
  const normChars = chars.map((c) => normalize(c) || ' ');
  const joined = normChars.join('').toLowerCase();
  const idx = joined.indexOf(nq);
  if (idx < 0 || normChars.some((c) => c.length !== 1)) { span.textContent = text; return span; }
  span.append(chars.slice(0, idx).join(''), h('mark', {}, chars.slice(idx, idx + nq.length).join('')), chars.slice(idx + nq.length).join(''));
  return span;
}

export function render() {
  if (!root) return;
  const all = store.archivedTasks();
  const nq = normalize(query);
  const tokens = nq.split(' ').filter(Boolean);
  const items = tokens.length ? all.filter((t) => { const n = normalize(t.text); return tokens.every((tk) => n.includes(tk)); }) : all;

  countEl.textContent = tokens.length
    ? (items.length ? `${fmt.num(items.length)} نتیجه` : 'چیزی پیدا نشد.')
    : (all.length ? `${fmt.num(all.length)} کار انجام‌شده` : '');
  listEl.innerHTML = '';
  if (!all.length) {
    listEl.append(h('div', { class: 'empty' },
      h('div', { class: 'empty-mark', html: icon('archive') }),
      h('p', { class: 'empty-title' }, 'آرشیو خالی است'),
      h('p', { class: 'muted' }, 'کارهایی که خط بزنی، این‌جا جمع می‌شوند.')));
    return;
  }
  let lastKey = null, group = null;
  for (const t of items.slice(0, limit)) {
    const key = fmt.dayKey(t.done_at);
    if (key !== lastKey) {
      lastKey = key;
      group = h('ul', { class: 'arch-group', role: 'list' });
      listEl.append(h('h2', { class: 'day-head' }, fmt.dayHeading(t.done_at)), group);
    }
    group.append(h('li', { class: 'arch-item', 'data-id': t.id },
      h('div', { class: 'arch-body' },
        highlight(t.text, tokens.length ? query.trim() : ''),
        h('span', { class: 'meta' },
          h('span', { title: fmt.exact(t.created_at) }, `اضافه: ${fmt.shortDate(t.created_at)}`),
          h('span', { class: 'sep', 'aria-hidden': 'true' }),
          h('span', { title: fmt.exact(t.done_at) }, `انجام: ${fmt.shortDate(t.done_at)}، ${fmt.time(t.done_at)}`))),
      h('div', { class: 'arch-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'data-act': 'restore', 'aria-label': `بازگرداندن «${t.text}» به فهرست`, title: 'برگردون به فهرست', html: icon('undo') }),
        h('button', { class: 'icon-btn danger', type: 'button', 'data-act': 'delete', 'aria-label': `حذف «${t.text}»`, title: 'حذف', html: icon('trash') }))));
  }
  if (items.length > limit) {
    listEl.append(h('button', { class: 'btn btn-wide', type: 'button', onclick: () => { limit += 300; render(); } },
      `نمایش بیشتر (${fmt.num(items.length - limit)})`));
  }
}

async function onClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.arch-item');
  const id = li.dataset.id;
  if (btn.dataset.act === 'restore') {
    const t = store.getTask(id);
    const prev = { done_at: t.done_at, archived_at: t.archived_at };
    await store.reopen(id);
    playTick();
    toast('برگشت به فهرست', {
      icon: 'undo', action: 'لغو', duration: store.settings().undoSeconds * 1000,
      onAction: () => store.patch(id, prev),
    });
  } else {
    await store.remove(id);
    toast('حذف شد', { icon: 'trash', action: 'برگردان', duration: store.settings().undoSeconds * 1000, onAction: () => store.undelete(id) });
  }
}
