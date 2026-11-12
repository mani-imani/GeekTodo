// Reports: simple numbers + a light SVG chart. Based on done_at (and created_at for "added").
import * as store from '../store.js';
import { h } from '../ui.js';
import * as fmt from '../fmt.js';
import { WEEKDAYS, WEEKDAYS_SHORT, satIndex, dateToJalali } from '../jalali.js';

let root, kpis, chartBox, insights, range = 'days', ro;

export function mount(container) {
  kpis = h('div', { class: 'kpis' });
  chartBox = h('div', { class: 'chart-box' });
  insights = h('div', { class: 'insights' });
  const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'بازه‌ی نمودار' },
    ...[['days', '۱۴ روز اخیر'], ['weeks', '۱۲ هفته‌ی اخیر']].map(([v, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(v === range), 'data-v': v, onclick: () => { range = v; render(); } }, label)));
  root = h('section', { class: 'view view-report' },
    h('header', { class: 'view-head' }, h('h1', {}, 'گزارش')),
    kpis,
    h('div', { class: 'card chart-card' },
      h('div', { class: 'chart-top' }, h('h2', { class: 'card-title' }, 'روند'), seg),
      chartBox,
      h('div', { class: 'chart-legend small muted' },
        h('span', {}, h('i', { class: 'lg lg-done' }), 'انجام‌شده'),
        h('span', {}, h('i', { class: 'lg lg-add' }), 'اضافه‌شده'))),
    insights);
  container.append(root);
  ro = new ResizeObserver(() => drawChart());
  ro.observe(chartBox);
  render();
  return root;
}

function streaks(doneDays) {
  const has = (ts) => doneDays.has(fmt.dayKey(ts));
  let cursor = fmt.startOfDay(Date.now());
  if (!has(cursor)) cursor -= fmt.DAY;
  let current = 0;
  // step by calendar days safely across DST by using noon
  let d = new Date(cursor); d.setHours(12);
  while (doneDays.has(fmt.dayKey(d.getTime()))) { current++; d.setDate(d.getDate() - 1); }
  const sorted = [...doneDays].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const [y, m, dd] = k.split('-').map(Number);
    const t = new Date(y, m - 1, dd, 12).getTime();
    run = prev != null && fmt.daysBetween(prev, t) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { current, best };
}

function weekStart(ts) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - satIndex(d));
  return d.getTime();
}

function tile(label, value, sub, accent = false) {
  return h('div', { class: `kpi${accent ? ' kpi-accent' : ''}` },
    h('span', { class: 'kpi-label' }, label),
    h('span', { class: 'kpi-value' }, value),
    sub ? h('span', { class: 'kpi-sub muted' }, sub) : null);
}

let series = null;

export function render() {
  if (!root) return;
  for (const b of root.querySelectorAll('.seg button')) b.setAttribute('aria-selected', String(b.dataset.v === range));
  const completed = store.completedTasks();
  const live = store.liveTasks();
  const now = Date.now();
  const doneDays = new Set(completed.map((t) => fmt.dayKey(t.done_at)));
  const today = completed.filter((t) => fmt.daysBetween(t.done_at, now) === 0).length;
  const ws = weekStart(now);
  const week = completed.filter((t) => t.done_at >= ws).length;
  const { current, best } = streaks(doneDays);
  const open = store.openTasks().length;

  kpis.innerHTML = '';
  kpis.append(
    tile('امروز', fmt.num(today), 'کار انجام‌شده', true),
    tile('این هفته', fmt.num(week), 'از شنبه تا امروز'),
    tile('روزهای پیاپی', `${fmt.num(current)} روز`, best > current ? `بهترین: ${fmt.num(best)} روز` : (current ? 'بهترین رکوردت' : 'امروز شروعش کن')),
    tile('کل انجام‌شده', fmt.num(completed.length), `${fmt.num(open)} کار باز`),
  );

  // series
  const buckets = [];
  if (range === 'days') {
    const d = new Date(now); d.setHours(12, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const x = new Date(d); x.setDate(d.getDate() - i);
      const j = dateToJalali(x);
      buckets.push({ key: fmt.dayKey(x.getTime()), label: fmt.num(j.jd), sub: WEEKDAYS_SHORT[satIndex(x)], title: fmt.fullDate(x.getTime(), { withWeekday: true }), done: 0, add: 0, current: i === 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const t of completed) { const b = byKey.get(fmt.dayKey(t.done_at)); if (b) b.done++; }
    for (const t of live) { const b = byKey.get(fmt.dayKey(t.created_at)); if (b) b.add++; }
  } else {
    for (let i = 11; i >= 0; i--) {
      const start = weekStart(now - i * 7 * fmt.DAY);
      const j = dateToJalali(new Date(start));
      buckets.push({ start, end: start + 7 * fmt.DAY, label: fmt.num(j.jd), sub: '', title: `هفته‌ی ${fmt.fullDate(start)}`, done: 0, add: 0, current: i === 0 });
    }
    // month label under the first week of each month
    let lastM = null;
    for (const b of buckets) { const m = dateToJalali(new Date(b.start)).jm; b.sub = m !== lastM ? JALALI_SHORT[m - 1] : ''; lastM = m; }
    for (const t of completed) { const b = buckets.find((x) => t.done_at >= x.start && t.done_at < x.end); if (b) b.done++; }
    for (const t of live) { const b = buckets.find((x) => t.created_at >= x.start && t.created_at < x.end); if (b) b.add++; }
  }
  series = buckets;
  drawChart();

  // insights
  insights.innerHTML = '';
  if (!completed.length) {
    insights.append(h('div', { class: 'card empty-card muted' }, 'هنوز کاری خط نخورده. اولین کار را که انجام بدهی، این‌جا جان می‌گیرد.'));
    return;
  }
  const durations = completed.map((t) => t.done_at - t.created_at).sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const byWd = Array(7).fill(0);
  for (const t of completed) byWd[satIndex(new Date(t.done_at))]++;
  const topWd = byWd.indexOf(Math.max(...byWd));
  const activeDays = doneDays.size;
  const first = Math.min(...completed.map((t) => t.done_at));
  const span = Math.max(1, fmt.daysBetween(first, now) + 1);
  insights.append(h('div', { class: 'card insight-list' },
    row('معمولاً هر کار بعد از', humanDuration(median), 'انجام می‌شود (میانه)'),
    row('پرکارترین روز هفته', WEEKDAYS[topWd], `${fmt.num(byWd[topWd])} کار`),
    row('روزهای فعال', `${fmt.num(activeDays)} از ${fmt.num(span)} روز`, ''),
    row('میانگین روزانه', fmt.num((completed.length / span).toFixed(1)), 'کار در روز')));
}

const JALALI_SHORT = ['فرو', 'ارد', 'خرد', 'تیر', 'مرد', 'شهر', 'مهر', 'آبا', 'آذر', 'دی', 'بهم', 'اسف'];

function row(label, value, sub) {
  return h('div', { class: 'insight' }, h('span', { class: 'muted' }, label), h('strong', {}, value), sub ? h('span', { class: 'muted small' }, sub) : null);
}

function humanDuration(ms) {
  const min = ms / 60000;
  if (min < 60) return `${fmt.num(Math.max(1, Math.round(min)))} دقیقه`;
  const hours = min / 60;
  if (hours < 24) return `${fmt.num(Math.round(hours))} ساعت`;
  const days = hours / 24;
  if (days < 30) return `${fmt.num(Math.round(days))} روز`;
  return `${fmt.num(Math.round(days / 30))} ماه`;
}

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function drawChart() {
  if (!series || !chartBox.isConnected) return;
  const W = Math.max(260, chartBox.clientWidth);
  const H = 190, top = 22, bottom = 40, n = series.length;
  const max = Math.max(1, ...series.map((b) => Math.max(b.done, b.add)));
  const slot = W / n;
  const bw = Math.min(26, slot * 0.46);
  const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'chart' });
  const total = series.reduce((a, b) => a + b.done, 0);
  svg.append(s('title', {}, `نمودار ${range === 'days' ? '۱۴ روز' : '۱۲ هفته'} اخیر: ${fmt.num(total)} کار انجام‌شده`));
  const plotH = H - top - bottom;
  // gridlines
  for (let g = 0; g <= 2; g++) {
    const y = top + plotH - (plotH * g) / 2;
    svg.append(s('line', { x1: 0, x2: W, y1: y, y2: y, class: 'grid' }));
  }
  series.forEach((b, i) => {
    // RTL: oldest on the right, newest on the left
    const cx = W - slot * (i + 0.5);
    const g = s('g', { class: `bar-g${b.current ? ' current' : ''}` });
    g.append(s('title', {}, `${b.title}: ${fmt.num(b.done)} انجام‌شده، ${fmt.num(b.add)} اضافه‌شده`));
    const ah = (b.add / max) * plotH;
    if (b.add) g.append(s('rect', { x: cx - bw / 2 - 3, y: top + plotH - ah, width: bw + 6, height: Math.max(2, ah), rx: 5, class: 'bar-add' }));
    const dh = (b.done / max) * plotH;
    const rect = s('rect', { x: cx - bw / 2, y: top + plotH - dh, width: bw, height: Math.max(b.done ? 3 : 0, dh), rx: Math.min(6, bw / 2), class: 'bar-done' });
    rect.style.setProperty('--d', `${i * 25}ms`);
    g.append(rect);
    if (b.done) g.append(s('text', { x: cx, y: top + plotH - dh - 6, class: 'bar-val', 'text-anchor': 'middle' }, fmt.num(b.done)));
    g.append(s('text', { x: cx, y: H - bottom + 16, class: 'bar-lbl', 'text-anchor': 'middle' }, b.label));
    if (b.sub) g.append(s('text', { x: cx, y: H - bottom + 31, class: 'bar-sub', 'text-anchor': 'middle' }, b.sub));
    svg.append(g);
  });
  chartBox.innerHTML = '';
  chartBox.append(svg);
}
