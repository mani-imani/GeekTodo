// Main screen: just the open tasks, like a note.
import * as store from '../store.js';
import { h, icon, toast, reducedMotion } from '../ui.js';
import { createStrike } from '../strike.js';
import { playDone, playTick, vibrate, unlockAudio } from '../feedback.js';
import * as fmt from '../fmt.js';

let root, input, listEl, doneWrap, doneList, emptyEl, bannerSlot;
const leaving = new Set();      // ids animating out — render() must not touch them
let editingId = null;
let dragging = null;

export function mount(container, { banners }) {
  bannerSlot = h('div', { class: 'banners' });
  input = h('textarea', {
    class: 'composer-input', rows: 1, placeholder: 'یک کار بنویس…', 'aria-label': 'کار جدید',
    enterkeyhint: 'enter', autocomplete: 'off', maxlength: 2000,
  });
  const addBtn = h('button', { class: 'composer-add', type: 'submit', 'aria-label': 'افزودن', html: icon('plus') });
  const form = h('form', { class: 'composer', onsubmit: (e) => { e.preventDefault(); submit(); } }, input, addBtn);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => { autoGrow(input); form.classList.toggle('has-text', !!input.value.trim()); });

  listEl = h('ul', { class: 'tasks', role: 'list', 'aria-label': 'کارهای باز' });
  emptyEl = h('div', { class: 'empty', hidden: true });
  doneList = h('ul', { class: 'tasks tasks-done', role: 'list', 'aria-label': 'انجام‌شده‌ها' });
  doneWrap = h('section', { class: 'done-wrap', hidden: true },
    h('div', { class: 'done-head' },
      h('span', { class: 'done-title' }),
      h('button', {
        class: 'chip', type: 'button', html: `${icon('broom')}<span>پاک‌سازی به آرشیو</span>`,
        onclick: async () => {
          const n = await store.archiveDone();
          if (n) toast(`${fmt.num(n)} کار به آرشیو رفت`, { icon: 'archive' });
        },
      })),
    doneList);

  root = h('section', { class: 'view view-list' }, form, bannerSlot, listEl, emptyEl, doneWrap);
  container.append(root);
  banners(bannerSlot);

  listEl.addEventListener('pointerdown', onPointerDown);
  listEl.addEventListener('click', onClick);
  listEl.addEventListener('keydown', onKeyDown);
  doneList.addEventListener('click', onClick);
  render();
  return root;
}

export function focusComposer() { input?.focus(); }
export function refreshBanners(banners) { if (bannerSlot) banners(bannerSlot); }

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

async function submit() {
  unlockAudio();
  const text = input.value;
  if (!text.trim()) { input.focus(); return; }
  input.value = '';
  autoGrow(input);
  input.form.classList.remove('has-text');
  const t = await store.addTask(text);
  if (t) {
    requestAnimationFrame(() => {
      const li = listEl.querySelector(`[data-id="${t.id}"]`);
      li?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
    requestPersistence();
  }
  input.focus();
}

let askedPersist = false;
function requestPersistence() {
  if (askedPersist || !navigator.storage?.persist) return;
  askedPersist = true;
  navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
}

// ---------- rendering ----------

function fadeLevel(t) {
  const s = store.settings();
  if (!s.fade) return 0;
  const age = (Date.now() - t.created_at) / fmt.DAY;
  const start = s.fadeStartDays, full = Math.max(start + 1, s.fadeFullDays);
  if (age <= start) return 0;
  return Math.min(1, (age - start) / (full - start));
}

function buildRow(t, done = false) {
  const li = h('li', { class: 'task', 'data-id': t.id });
  li.append(
    h('button', {
      class: 'check', type: 'button',
      'aria-label': done ? `برگرداندن «${t.text}»` : `انجام شد: «${t.text}»`,
      html: '<span class="ring"></span>' + icon('check', 'tick'),
    }),
    h('div', { class: 'body' },
      h('span', { class: 'text', dir: 'auto' }),
      h('span', { class: 'meta' })),
  );
  if (!done) {
    li.append(h('button', {
      class: 'grip', type: 'button', 'aria-label': `جابه‌جایی «${t.text}»، با کلیدهای بالا و پایین`,
      html: icon('grip'),
    }));
  }
  updateRow(li, t, done);
  return li;
}

function updateRow(li, t, done) {
  const text = li.querySelector('.text');
  if (text && text.textContent !== t.text) text.textContent = t.text;
  const meta = li.querySelector('.meta');
  if (meta) {
    const m = done ? `انجام‌شده ${fmt.when(t.done_at)}` : fmt.when(t.created_at);
    if (meta.textContent !== m) meta.textContent = m;
    meta.title = fmt.exact(done ? t.done_at : t.created_at);
  }
  li.classList.toggle('is-done', done);
  if (!done) {
    const f = fadeLevel(t);
    li.style.setProperty('--fade', f.toFixed(3));
    const body = li.querySelector('.body');
    let sug = body.querySelector('.suggest');
    const want = f >= 1 && store.settings().fadeSuggest;
    if (want && !sug) {
      sug = h('div', { class: 'suggest' },
        h('span', {}, 'مدت زیادی است این‌جاست؛ انجامش بده یا رهایش کن.'),
        h('button', { class: 'chip chip-small', type: 'button', 'data-act': 'drop' }, 'رهایش کن'));
      body.append(sug);
    } else if (!want && sug) sug.remove();
  }
}

export function render() {
  if (!root || dragging) return;
  const open = store.openTasks();
  const s = store.settings();
  reconcile(listEl, open, false);

  const done = s.autoArchive ? [] : store.doneInList();
  doneWrap.hidden = done.length === 0;
  const dt = doneWrap.querySelector('.done-title');
  dt.innerHTML = '';
  dt.append('انجام‌شده‌ها', h('span', { class: 'count' }, fmt.num(done.length)));
  reconcile(doneList, done, true);

  const visibleOpen = open.length;
  emptyEl.hidden = visibleOpen > 0;
  if (!visibleOpen) {
    const today = store.completedTasks().filter((t) => fmt.daysBetween(t.done_at, Date.now()) === 0).length;
    const total = store.liveTasks().length;
    emptyEl.innerHTML = '';
    emptyEl.append(
      h('div', { class: 'empty-mark', html: icon(total ? 'check' : 'list') }),
      h('p', { class: 'empty-title' }, total ? 'فهرست خالی است.' : 'هنوز کاری ننوشتی.'),
      h('p', { class: 'muted' }, today
        ? `امروز ${fmt.num(today)} کار را خط زدی. آفرین.`
        : total ? 'یک کار تازه بنویس، یا نفسی تازه کن.' : 'بالا بنویس و Enter بزن. برای انجام، روی کار خط بکش یا روی دایره بزن.'),
    );
  }
}

function reconcile(ul, items, done) {
  const existing = new Map();
  for (const li of ul.children) existing.set(li.dataset.id, li);
  const wanted = new Set(items.map((t) => t.id));
  for (const [id, li] of existing) {
    if (!wanted.has(id) && !leaving.has(id)) { li.remove(); existing.delete(id); }
  }
  let prev = null;
  for (const t of items) {
    let li = existing.get(t.id);
    if (!li) {
      li = buildRow(t, done);
      if (!reducedMotion()) li.classList.add('enter');
      li.addEventListener('animationend', () => li.classList.remove('enter'), { once: true });
    } else if (editingId !== t.id) updateRow(li, t, done);
    const anchor = prev ? prev.nextSibling : ul.firstChild;
    if (li !== anchor) ul.insertBefore(li, anchor);
    prev = li;
  }
}

// ---------- completing ----------

async function completeFlow(li, strike) {
  const id = li.dataset.id;
  if (leaving.has(id)) return;
  leaving.add(id);
  li.classList.add('striking');
  const style = store.settings().strike;
  if (!strike && style !== 'none') strike = createStrike(li.querySelector('.text'), li.querySelector('.body'), 'rtl');
  const dur = strike ? Math.round(strike.duration * (1 - strike.progress)) : 0;
  playDone(Math.max(180, dur));
  vibrate([12, 40, 18]);
  li.classList.add('checked');
  if (strike) await strike.animateTo(1, dur);
  li.classList.add('struck');
  await store.complete(id);
  await wait(reducedMotion() ? 0 : 260);
  await collapse(li);
  leaving.delete(id);
  li.remove();
  render();
  const s = store.settings();
  toast(s.autoArchive ? 'انجام شد و به آرشیو رفت' : 'انجام شد', {
    icon: 'check', action: 'برگردان', duration: s.undoSeconds * 1000,
    onAction: async () => { await store.reopen(id, { keepOrder: true }); playTick(); },
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function collapse(li) {
  if (reducedMotion()) return Promise.resolve();
  const hgt = li.offsetHeight;
  li.style.height = hgt + 'px';
  li.style.overflow = 'hidden';
  li.getBoundingClientRect();
  li.classList.add('collapsing');
  li.style.height = '0px';
  return wait(320);
}

async function dropTask(li) {
  const id = li.dataset.id;
  leaving.add(id);
  li.classList.add('dropping');
  await collapse(li);
  leaving.delete(id);
  await store.remove(id);
  li.remove();
  render();
  toast('حذف شد', {
    icon: 'trash', action: 'برگردان', duration: store.settings().undoSeconds * 1000,
    onAction: () => store.undelete(id),
  });
}

// ---------- events ----------

let swipe = null;
let suppressClick = false;

function onPointerDown(e) {
  if (e.button !== 0) return;
  const li = e.target.closest('.task');
  if (!li || leaving.has(li.dataset.id) || editingId) return;
  if (e.target.closest('.grip')) { startDrag(e, li); return; }
  if (e.target.closest('button, textarea')) return;
  unlockAudio();
  swipe = { li, x: e.clientX, y: e.clientY, id: e.pointerId, active: false, strike: null, p: 0, buzzed: false };
  listEl.addEventListener('pointermove', onSwipeMove);
  listEl.addEventListener('pointerup', onSwipeEnd);
  listEl.addEventListener('pointercancel', onSwipeCancel);
}

function onSwipeMove(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.active) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return onSwipeCancel();
    if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    swipe.active = true;
    swipe.li.setPointerCapture(e.pointerId);
    swipe.li.classList.add('swiping');
    const style = store.settings().strike;
    const body = swipe.li.querySelector('.body');
    swipe.width = swipe.li.querySelector('.text').getBoundingClientRect().width || body.offsetWidth;
    swipe.strike = style === 'none' ? null : createStrike(swipe.li.querySelector('.text'), body, dx < 0 ? 'rtl' : 'ltr');
    swipe.dir = Math.sign(dx);
  }
  e.preventDefault();
  const travel = Math.max(0, dx * swipe.dir);
  swipe.p = Math.min(1, travel / Math.max(80, swipe.width * 0.85));
  swipe.strike?.set(swipe.p);
  swipe.li.style.setProperty('--swipe', swipe.p.toFixed(3));
  if (swipe.p > 0.5 && !swipe.buzzed) { swipe.buzzed = true; vibrate(8); }
  if (swipe.p < 0.5) swipe.buzzed = false;
}

function cleanupSwipeListeners() {
  listEl.removeEventListener('pointermove', onSwipeMove);
  listEl.removeEventListener('pointerup', onSwipeEnd);
  listEl.removeEventListener('pointercancel', onSwipeCancel);
}

function onSwipeEnd(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  cleanupSwipeListeners();
  const s = swipe;
  swipe = null;
  if (!s.active) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 50);
  s.li.classList.remove('swiping');
  s.li.style.removeProperty('--swipe');
  if (s.p >= 0.5) completeFlow(s.li, s.strike);
  else if (s.strike) s.strike.animateTo(0, 160).then(() => s.strike.remove());
}

function onSwipeCancel() {
  if (!swipe) return;
  cleanupSwipeListeners();
  const s = swipe;
  swipe = null;
  s.li.classList.remove('swiping');
  s.li.style.removeProperty('--swipe');
  if (s.strike) s.strike.animateTo(0, 160).then(() => s.strike.remove());
}

async function onClick(e) {
  if (suppressClick) return;
  const li = e.target.closest('.task');
  if (!li || leaving.has(li.dataset.id)) return;
  const id = li.dataset.id;
  const t = store.getTask(id);
  if (!t) return;
  if (e.target.closest('.check')) {
    unlockAudio();
    if (t.done_at != null) { await store.reopen(id); playTick(); }
    else completeFlow(li);
    return;
  }
  if (e.target.closest('[data-act="drop"]')) { dropTask(li); return; }
  if (t.done_at == null && e.target.closest('.text, .meta, .body') && !e.target.closest('.suggest')) startEdit(li, t);
}

function onKeyDown(e) {
  const grip = e.target.closest('.grip');
  if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const li = grip.closest('.task');
  const target = e.key === 'ArrowUp' ? li.previousElementSibling : li.nextElementSibling;
  if (!target) return;
  if (e.key === 'ArrowUp') listEl.insertBefore(li, target); else listEl.insertBefore(target, li);
  persistOrder(li);
  grip.focus();
}

// ---------- inline edit ----------

function startEdit(li, t) {
  if (editingId) return;
  editingId = t.id;
  li.classList.add('editing');
  const body = li.querySelector('.body');
  const textEl = body.querySelector('.text');
  const ta = h('textarea', { class: 'edit-input', rows: 1, 'aria-label': 'ویرایش کار', maxlength: 2000 });
  ta.value = t.text;
  textEl.replaceWith(ta);
  const del = h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': 'حذف کار', html: icon('trash') });
  const grip = li.querySelector('.grip');
  grip.hidden = true;
  li.append(del);
  autoGrow(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const val = ta.value.trim();
    ta.replaceWith(textEl);
    del.remove();
    grip.hidden = false;
    li.classList.remove('editing');
    editingId = null;
    if (save && !val) { dropTask(li); return; }
    if (save) await store.updateText(t.id, val);
    render();
  };
  ta.addEventListener('input', () => autoGrow(ta));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  ta.addEventListener('blur', (e) => {
    if (e.relatedTarget === del) return;
    finish(true);
  });
  del.addEventListener('click', () => {
    finished = true;
    ta.replaceWith(textEl);
    del.remove();
    grip.hidden = false;
    li.classList.remove('editing');
    editingId = null;
    dropTask(li);
  });
}

// ---------- drag to reorder ----------

function startDrag(e, li) {
  e.preventDefault();
  const items = [...listEl.children].filter((x) => !leaving.has(x.dataset.id));
  const from = items.indexOf(li);
  if (from < 0) return;
  const rects = items.map((x) => x.getBoundingClientRect());
  const gap = items.length > 1 ? rects[1].top - rects[0].bottom : 0;
  dragging = {
    li, items, from, to: from, rects, gap,
    startY: e.clientY, startScroll: window.scrollY, y: e.clientY, pointerId: e.pointerId, raf: 0,
  };
  li.setPointerCapture(e.pointerId);
  li.classList.add('dragging');
  listEl.classList.add('is-sorting');
  vibrate(10);
  li.addEventListener('pointermove', onDragMove);
  li.addEventListener('pointerup', onDragEnd);
  li.addEventListener('pointercancel', onDragEnd);
  dragging.raf = requestAnimationFrame(autoScroll);
}

function dragOffset() {
  return dragging.y - dragging.startY + (window.scrollY - dragging.startScroll);
}

function layoutDrag() {
  const d = dragging;
  const dy = dragOffset();
  d.li.style.transform = `translateY(${dy}px) scale(1.02)`;
  const r = d.rects[d.from];
  const center = (r.top + r.bottom) / 2 + dy;
  const size = r.height + d.gap;
  let to = d.from;
  d.items.forEach((it, i) => {
    if (i === d.from) return;
    const c = (d.rects[i].top + d.rects[i].bottom) / 2;
    let shift = 0;
    if (i > d.from && center > c) { shift = -size; to = Math.max(to, i); }
    if (i < d.from && center < c) { shift = size; to = Math.min(to, i); }
    it.style.transform = shift ? `translateY(${shift}px)` : '';
  });
  if (to !== d.to) { d.to = to; vibrate(5); }
}

function onDragMove(e) {
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  dragging.y = e.clientY;
  layoutDrag();
}

function autoScroll() {
  if (!dragging) return;
  const edge = 70, y = dragging.y, vh = window.innerHeight;
  let v = 0;
  if (y < edge + 60) v = -Math.ceil((edge + 60 - y) / 6);
  else if (y > vh - edge - 70) v = Math.ceil((y - (vh - edge - 70)) / 6);
  if (v) { window.scrollBy(0, v); layoutDrag(); }
  dragging.raf = requestAnimationFrame(autoScroll);
}

function onDragEnd() {
  const d = dragging;
  if (!d) return;
  cancelAnimationFrame(d.raf);
  d.li.removeEventListener('pointermove', onDragMove);
  d.li.removeEventListener('pointerup', onDragEnd);
  d.li.removeEventListener('pointercancel', onDragEnd);
  // slide the dragged row into its final slot, then commit the DOM order
  const r = d.rects;
  let finalShift = 0;
  if (d.to > d.from) finalShift = r[d.to].bottom - r[d.from].bottom;
  else if (d.to < d.from) finalShift = r[d.to].top - r[d.from].top;
  finalShift -= window.scrollY - d.startScroll;
  d.li.classList.add('settling');
  d.li.style.transform = `translateY(${finalShift + (window.scrollY - d.startScroll)}px)`;
  const commit = () => {
    for (const it of d.items) { it.style.transition = 'none'; it.style.transform = ''; }
    d.li.classList.remove('dragging', 'settling');
    listEl.classList.remove('is-sorting');
    if (d.to !== d.from) {
      const ref = d.items[d.to];
      if (d.to > d.from) ref.after(d.li); else ref.before(d.li);
    }
    listEl.getBoundingClientRect();
    for (const it of d.items) it.style.transition = '';
    dragging = null;
    if (d.to !== d.from) { persistOrder(d.li); playTick(); }
    else render();
  };
  if (reducedMotion()) commit(); else setTimeout(commit, 180);
}

function persistOrder(li) {
  const prev = li.previousElementSibling, next = li.nextElementSibling;
  const order = (el) => store.getTask(el.dataset.id)?.sort_order;
  let value;
  if (!prev && next) value = order(next) - 1;
  else if (prev && !next) value = order(prev) + 1;
  else if (prev && next) value = (order(prev) + order(next)) / 2;
  else return;
  store.setOrder(li.dataset.id, value);
}
