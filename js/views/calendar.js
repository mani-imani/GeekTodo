// Simple Jalali calendar + monthly activity view.
// Built only from created_at / done_at — no extra data.
import * as store from '../store.js';
import { h, icon, sheet, reducedMotion } from '../ui.js';
import * as fmt from '../fmt.js';
import {
  dateToJalali, jalaliToDate, jalaliMonthLength, JALALI_MONTHS, GREGORIAN_MONTHS, WEEKDAYS_SHORT, WEEKDAYS, satIndex,
} from '../jalali.js';

let root, gridWrap, titleEl, subEl, sidePanel;
let cur = null;           // { jy, jm } currently shown month
let selectedKey = null;   // dayKey of the selected day
let index = new Map();    // dayKey → { added: [], done: [] }
let openSheet = null;

const wide = () => window.matchMedia('(min-width: 900px)').matches;

export function mount(container) {
  const t = dateToJalali(new Date());
  cur = { jy: t.jy, jm: t.jm };
  titleEl = h('h1', { class: 'cal-title', 'aria-live': 'polite' });
  subEl = h('span', { class: 'cal-sub muted' });
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ماه قبل', html: icon('chevR'), onclick: () => shift(-1) });
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ماه بعد', html: icon('chevL'), onclick: () => shift(1) });
  const todayBtn = h('button', { class: 'chip', type: 'button', onclick: goToday }, 'امروز');
  gridWrap = h('div', { class: 'cal-grid-wrap' });
  sidePanel = h('aside', { class: 'cal-side', 'aria-live': 'polite' });

  root = h('section', { class: 'view view-calendar' },
    h('div', { class: 'cal-main' },
      h('header', { class: 'cal-head' },
        prev,
        h('div', { class: 'cal-titles' }, titleEl, subEl),
        next,
        todayBtn),
      h('div', { class: 'cal-week', 'aria-hidden': 'true' }, ...WEEKDAYS_SHORT.map((d, i) => h('span', { class: i === 6 ? 'fri' : '' }, d))),
      gridWrap,
      h('div', { class: 'cal-legend muted small' },
        h('span', {}, h('i', { class: 'mk mk-add' }), 'اضافه‌شده'),
        h('span', {}, h('i', { class: 'mk mk-done' }), 'انجام‌شده'))),
    sidePanel);
  container.append(root);

  // swipe between months
  let sx = null, sy = 0;
  gridWrap.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  gridWrap.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      shift(dx < 0 ? 1 : -1);   // RTL: swiping left moves forward in time
      gridWrap.dataset.swiped = '1';
      setTimeout(() => delete gridWrap.dataset.swiped, 50);
    }
  });
  gridWrap.addEventListener('click', (e) => {
    if (gridWrap.dataset.swiped) return;
    const cell = e.target.closest('.cal-day');
    if (cell) selectDay(cell.dataset.key, cell.dataset.ts);
  });
  gridWrap.addEventListener('keydown', onGridKey);
  render();
  return root;
}

function buildIndex() {
  index = new Map();
  const get = (k) => { let v = index.get(k); if (!v) index.set(k, (v = { added: [], done: [] })); return v; };
  for (const t of store.liveTasks()) {
    get(fmt.dayKey(t.created_at)).added.push(t);
    if (t.done_at != null) get(fmt.dayKey(t.done_at)).done.push(t);
  }
}

function shift(delta) {
  let { jy, jm } = cur;
  jm += delta;
  if (jm > 12) { jm = 1; jy++; }
  if (jm < 1) { jm = 12; jy--; }
  cur = { jy, jm };
  render(delta);
}

function goToday() {
  const t = dateToJalali(new Date());
  const delta = (t.jy - cur.jy) * 12 + (t.jm - cur.jm);
  cur = { jy: t.jy, jm: t.jm };
  render(Math.sign(delta));
  const now = Date.now();
  selectDay(fmt.dayKey(now), fmt.startOfDay(now), { fromToday: true });
}

function buildGrid() {
  const { jy, jm } = cur;
  const first = jalaliToDate(jy, jm, 1);
  const offset = satIndex(first);
  const len = jalaliMonthLength(jy, jm);
  const todayKey = fmt.dayKey(Date.now());
  const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': `${JALALI_MONTHS[jm - 1]} ${fmt.num(jy)}` });
  let row = h('div', { class: 'cal-row', role: 'row' });
  for (let i = 0; i < offset; i++) row.append(h('span', { class: 'cal-blank', role: 'gridcell' }));
  for (let d = 1; d <= len; d++) {
    const date = jalaliToDate(jy, jm, d);
    const key = fmt.dayKey(date.getTime());
    const info = index.get(key);
    const added = info?.added.length || 0, done = info?.done.length || 0;
    const label = [`${WEEKDAYS[satIndex(date)]} ${fmt.num(d)} ${JALALI_MONTHS[jm - 1]}`,
      added ? `${fmt.num(added)} اضافه‌شده` : '', done ? `${fmt.num(done)} انجام‌شده` : ''].filter(Boolean).join('، ');
    const cell = h('button', {
      class: `cal-day${key === todayKey ? ' today' : ''}${key === selectedKey ? ' selected' : ''}${satIndex(date) === 6 ? ' fri' : ''}${date.getTime() > Date.now() ? ' future' : ''}`,
      type: 'button', role: 'gridcell', 'data-key': key, 'data-ts': date.getTime(), 'aria-label': label,
      'aria-current': key === todayKey ? 'date' : null, tabindex: key === (selectedKey || todayKey) ? '0' : '-1',
    },
    h('span', { class: 'cal-num' }, fmt.num(d)),
    h('span', { class: 'cal-g' }, fmt.num(date.getDate())),
    h('span', { class: 'cal-marks' },
      added ? h('span', { class: 'mk-wrap' }, h('i', { class: 'mk mk-add' }), h('b', {}, fmt.num(added))) : null,
      done ? h('span', { class: 'mk-wrap' }, h('i', { class: 'mk mk-done' }), h('b', {}, fmt.num(done))) : null));
    if (done) cell.style.setProperty('--heat', Math.min(1, done / 6).toFixed(2));
    row.append(cell);
    if ((offset + d) % 7 === 0 && d !== len) { grid.append(row); row = h('div', { class: 'cal-row', role: 'row' }); }
  }
  const rem = (offset + len) % 7;
  if (rem) for (let i = rem; i < 7; i++) row.append(h('span', { class: 'cal-blank', role: 'gridcell' }));
  grid.append(row);
  // keep at least one focusable cell
  if (!grid.querySelector('[tabindex="0"]')) grid.querySelector('.cal-day')?.setAttribute('tabindex', '0');
  return grid;
}

export function render(direction = 0) {
  if (!root) return;
  buildIndex();
  const { jy, jm } = cur;
  titleEl.textContent = `${JALALI_MONTHS[jm - 1]} ${fmt.num(jy)}`;
  const a = jalaliToDate(jy, jm, 1), b = jalaliToDate(jy, jm, jalaliMonthLength(jy, jm));
  const ga = GREGORIAN_MONTHS[a.getMonth()], gb = GREGORIAN_MONTHS[b.getMonth()];
  subEl.textContent = `${ga}${ga !== gb ? ' – ' + gb : ''} ${fmt.num(b.getFullYear())}`;

  const next = buildGrid();
  const old = gridWrap.querySelector('.cal-grid:not(.leaving)');
  if (old && direction && !reducedMotion()) {
    // RTL: going forward slides content toward the right edge… content enters from the left.
    const dir = direction > 0 ? 'fwd' : 'back';
    old.classList.add('leaving', `leave-${dir}`);
    next.classList.add(`enter-${dir}`);
    gridWrap.append(next);
    old.addEventListener('animationend', () => old.remove(), { once: true });
    setTimeout(() => old.remove(), 500);
  } else {
    gridWrap.innerHTML = '';
    gridWrap.append(next);
  }
  if (wide()) renderSide();
  else if (!sidePanel.hidden) sidePanel.innerHTML = '';
}

function selectDay(key, ts, { fromToday = false } = {}) {
  selectedKey = key;
  for (const c of gridWrap.querySelectorAll('.cal-day.selected')) c.classList.remove('selected');
  gridWrap.querySelector(`.cal-day[data-key="${key}"]`)?.classList.add('selected');
  if (wide()) { renderSide(+ts); return; }
  if (fromToday) return;
  openSheet?.close();
  openSheet = sheet(dayContent(+ts), { title: fmt.fullDate(+ts, { withWeekday: true, calendar: 'jalali' }), className: 'sheet-day', onClose: () => { openSheet = null; } });
}

function renderSide(ts) {
  if (!ts) {
    const cell = selectedKey && gridWrap.querySelector(`.cal-day[data-key="${selectedKey}"]`);
    ts = cell ? +cell.dataset.ts : fmt.startOfDay(Date.now());
    if (!selectedKey) selectedKey = fmt.dayKey(ts);
  }
  sidePanel.innerHTML = '';
  const body = h('div', { class: 'side-inner' },
    h('h2', { class: 'side-title' }, fmt.fullDate(ts, { withWeekday: true, calendar: 'jalali' })),
    h('p', { class: 'muted small' }, fmt.fullDate(ts, { calendar: 'gregorian' })),
    dayContent(ts));
  sidePanel.append(body);
}

function dayContent(ts) {
  const info = index.get(fmt.dayKey(ts)) || { added: [], done: [] };
  const section = (title, items, field, cls) => h('section', { class: `day-sec ${cls}` },
    h('h3', {}, h('i', { class: `mk ${cls === 'sec-add' ? 'mk-add' : 'mk-done'}` }), title, h('span', { class: 'count' }, fmt.num(items.length))),
    items.length
      ? h('ul', { class: 'day-list', role: 'list' }, ...items.sort((a, b) => a[field] - b[field]).map((t) =>
        h('li', { class: t.done_at != null && field === 'done_at' ? 'is-done' : '' },
          h('time', { class: 'day-time' }, fmt.time(t[field])),
          h('span', { class: 'day-text', dir: 'auto' }, t.text),
          field === 'created_at' && t.done_at != null ? h('span', { class: 'tag' }, 'انجام شد') : null)))
      : h('p', { class: 'muted small' }, field === 'created_at' ? 'کاری اضافه نشده.' : 'کاری خط نخورده.'));
  return h('div', { class: 'day-content' },
    section('اضافه‌شده', info.added, 'created_at', 'sec-add'),
    section('انجام‌شده', info.done, 'done_at', 'sec-done'));
}

function onGridKey(e) {
  const cell = e.target.closest('.cal-day');
  if (!cell) return;
  const moves = { ArrowRight: -1, ArrowLeft: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  const cells = [...gridWrap.querySelectorAll('.cal-grid:not(.leaving) .cal-day')];
  const i = cells.indexOf(cell) + moves[e.key];
  const target = cells[i];
  if (target) { cell.tabIndex = -1; target.tabIndex = 0; target.focus(); }
}
