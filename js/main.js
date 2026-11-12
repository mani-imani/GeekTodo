// App shell: theming, routing, navigation, banners, service worker.
import * as store from './store.js';
import { getMeta, setMeta } from './db.js';
import { h, icon, toast, sheet, reducedMotion } from './ui.js';
import { exportFile } from './backup.js';
import { unlockAudio } from './feedback.js';
import * as fmt from './fmt.js';
import * as listView from './views/list.js';
import * as archiveView from './views/archive.js';
import * as calendarView from './views/calendar.js';
import * as reportView from './views/report.js';
import * as settingsView from './views/settings.js';
import { ACCENTS } from './views/settings.js';

const ROUTES = {
  '': { view: listView, label: 'فهرست', icon: 'list' },
  archive: { view: archiveView, label: 'آرشیو', icon: 'archive' },
  calendar: { view: calendarView, label: 'تقویم', icon: 'calendar', flag: 'showCalendar' },
  report: { view: reportView, label: 'گزارش', icon: 'chart', flag: 'showReports' },
  settings: { view: settingsView, label: 'تنظیمات', icon: 'settings' },
};

const mounted = new Map();   // route → { el, dirty }
const scrollPos = new Map();
let current = null;
let main, nav, dateEl, deferredInstall = null;
const meta = { installDismissed: false, lastBackupAt: null, backupSnoozeUntil: 0, firstUseAt: null };

// ---------- theme / appearance ----------
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyAppearance() {
  const s = store.settings();
  const root = document.documentElement;
  const dark = s.theme === 'dark' || (s.theme === 'system' && mqDark.matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.font = s.font;
  const acc = ACCENTS[s.accent] || ACCENTS.navy;
  root.style.setProperty('--accent-l', acc.color);
  root.style.setProperty('--accent-d', acc.dark || acc.color);
  root.style.setProperty('--fs', s.fontSize + 'px');
  root.dataset.strike = s.strike;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0E1217' : '#F4F4F0');
}
mqDark.addEventListener?.('change', () => store.settings().theme === 'system' && applyAppearance());

// ---------- routing ----------
function routeFromHash() {
  const r = location.hash.replace(/^#\/?/, '').split('?')[0];
  const def = ROUTES[r];
  if (!def) return '';
  if (def.flag && !store.settings()[def.flag]) return '';
  return r;
}

function show(route) {
  if (current === route) return;
  if (current != null) scrollPos.set(current, window.scrollY);
  const prev = current != null ? mounted.get(current) : null;
  current = route;
  let m = mounted.get(route);
  if (!m) {
    const wrap = h('div', { class: 'view-wrap', 'data-route': route || 'list' });
    main.append(wrap);
    const opts = route === '' ? { banners: renderBanners } : {};
    ROUTES[route].view.mount(wrap, opts);
    m = { el: wrap, dirty: false };
    mounted.set(route, m);
  } else if (m.dirty) {
    ROUTES[route].view.render();
    m.dirty = false;
  }
  if (prev) prev.el.hidden = true;
  m.el.hidden = false;
  if (!reducedMotion()) {
    m.el.classList.remove('view-in');
    void m.el.offsetWidth;
    m.el.classList.add('view-in');
  }
  window.scrollTo(0, scrollPos.get(route) || 0);
  for (const b of nav.querySelectorAll('[data-route]')) {
    if (b.dataset.route === route) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  document.title = route ? `${ROUTES[route].label} · GeekTodo` : 'GeekTodo';
}

function buildNav() {
  nav.innerHTML = '';
  const s = store.settings();
  for (const [route, def] of Object.entries(ROUTES)) {
    if (def.flag && !s[def.flag]) continue;
    nav.append(h('a', {
      href: `#/${route}`, class: 'tab', 'data-route': route,
      html: `${icon(def.icon)}<span class="tab-label">${def.label}</span>`,
      'aria-current': route === current ? 'page' : null,
    }));
  }
}

function renderAll(kind) {
  for (const [route, m] of mounted) {
    if (route === current) ROUTES[route].view.render();
    else m.dirty = true;
  }
  if (kind === 'settings') {
    buildNav();
    const r = routeFromHash();
    if (r !== current) { history.replaceState(null, '', `#/${r}`); show(r); }
  }
  updateDate();
  if (mounted.has('')) renderBanners(document.querySelector('.banners'));
}

function updateDate() {
  const now = Date.now();
  dateEl.textContent = fmt.fullDate(now, { withWeekday: true, withYear: false });
  dateEl.title = `${fmt.fullDate(now, { calendar: 'jalali' })} · ${fmt.fullDate(now, { calendar: 'gregorian' })}`;
}

// ---------- banners (install + backup reminder) ----------
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(navigator.userAgent);
const isFirefoxDesktop = () => /firefox/i.test(navigator.userAgent) && !isAndroid();
const isMacSafari = () => !isIOS() && /macintosh/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/chrome|chromium|edg/i.test(navigator.userAgent);
/** Can this browser install the app at all (with its own prompt or by hand)? Firefox on desktop cannot. */
const canInstall = () => !isStandalone() && (deferredInstall || isIOS() || isAndroid() || !isFirefoxDesktop());

function renderBanners(slot) {
  if (!slot) return;
  slot.innerHTML = '';
  const s = store.settings();
  const taskCount = store.liveTasks().length;

  // backup reminder
  if (s.backupReminder && taskCount >= 3) {
    const since = meta.lastBackupAt || meta.firstUseAt || Date.now();
    const days = fmt.daysBetween(since, Date.now());
    if (days >= s.backupDays && Date.now() > meta.backupSnoozeUntil) {
      slot.append(banner({
        icon: 'download',
        text: meta.lastBackupAt ? `${fmt.num(days)} روز است که پشتیبان نگرفته‌ای.` : 'هنوز از کارهایت پشتیبان نگرفته‌ای.',
        actions: [
          { label: 'خروجی بگیر', primary: true, run: () => exportFile() },
          { label: 'بعداً', run: async () => { meta.backupSnoozeUntil = Date.now() + 3 * fmt.DAY; await setMeta('backupSnoozeUntil', meta.backupSnoozeUntil); renderBanners(slot); } },
        ],
      }));
    }
  }

  // install suggestion: from the first visit, on every browser that can install (only when no other banner is showing)
  if (!slot.childElementCount && s.installPrompt && !meta.installDismissed && canInstall()) {
    const dismiss = async () => { meta.installDismissed = true; await setMeta('installDismissed', true); renderBanners(slot); };
    slot.append(banner({
      icon: 'phone',
      text: 'GeekTodo را می‌شود مثل یک اپ نصب کرد: تمام‌صفحه باز می‌شود و بدون اینترنت هم کار می‌کند.',
      actions: [
        { label: deferredInstall ? 'نصب' : 'چطور؟', primary: true, run: async () => { if (await runInstall()) await dismiss(); else renderBanners(slot); } },
      ],
      onClose: dismiss,
    }));
  }
}

/** Install: the browser's own prompt when it offers one, otherwise the steps for this device. Returns true when installed. */
async function runInstall() {
  if (deferredInstall) {
    const p = deferredInstall;
    deferredInstall = null;
    p.prompt();
    const { outcome } = await p.userChoice.catch(() => ({}));
    return outcome === 'accepted';
  }
  installGuide();
  return false;
}

function banner({ icon: ic, text, actions, onClose }) {
  return h('div', { class: 'banner', role: 'region', 'aria-label': text },
    h('span', { class: 'banner-ic', html: icon(ic) }),
    h('p', { class: 'banner-text' }, text),
    h('div', { class: 'banner-actions' },
      ...actions.map((a) => h('button', { type: 'button', class: `chip${a.primary ? ' chip-primary' : ''}`, onclick: a.run }, a.label)),
      onClose ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'بستن', html: icon('x'), onclick: onClose }) : null));
}

function installGuide() {
  const done = h('li', {}, 'حالا GeekTodo مثل یک اپ روی صفحه‌ی اصلی است و بدون اینترنت هم کار می‌کند.');
  let title, steps;
  if (isIOS()) {
    title = 'نصب روی آیفون و آیپد';
    steps = [
      h('li', { html: `در نوار مرورگر (Safari یا Chrome) دکمه‌ی اشتراک‌گذاری ${icon('share', 'inline')} را بزن.` }),
      h('li', { html: `گزینه‌ی «<bdi>Add to Home Screen</bdi>» ${icon('addSquare', 'inline')} را انتخاب کن.` }),
      h('li', { html: 'بالای صفحه «<bdi>Add</bdi>» را بزن.' }), done];
  } else if (isAndroid()) {
    title = 'نصب روی اندروید';
    steps = [
      h('li', { html: 'منوی مرورگر (سه نقطه‌ی بالا یا پایین صفحه) را باز کن.' }),
      h('li', { html: 'گزینه‌ی «<bdi>Install app</bdi>» یا «<bdi>Add to Home screen</bdi>» را بزن.' }),
      h('li', { html: 'تأیید کن.' }), done];
  } else if (isMacSafari()) {
    title = 'نصب روی مک';
    steps = [
      h('li', { html: 'از منوی <bdi>File</bdi> گزینه‌ی «<bdi>Add to Dock</bdi>» را بزن.' }),
      h('li', { html: '«<bdi>Add</bdi>» را بزن. GeekTodo در Dock و Launchpad می‌آید.' })];
  } else {
    title = 'نصب روی کامپیوتر';
    steps = [
      h('li', { html: 'در Chrome یا Edge، آیکون نصب را در انتهای نوار آدرس بزن.' }),
      h('li', { html: 'اگر آیکون نبود، از منوی مرورگر گزینه‌ی «<bdi>Install GeekTodo</bdi>» را بزن.' }),
      h('li', {}, 'GeekTodo در پنجره‌ی خودش باز می‌شود و میان برنامه‌های سیستم هم پیدا می‌شود.')];
  }
  sheet(h('ol', { class: 'guide' }, ...steps), { title, className: 'sheet-small' });
}

document.addEventListener('geektodo:install', () => { runInstall(); });
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  renderBanners(document.querySelector('.banners'));
});
window.addEventListener('appinstalled', async () => {
  deferredInstall = null;
  meta.installDismissed = true;
  await setMeta('installDismissed', true);
  renderBanners(document.querySelector('.banners'));
});
document.addEventListener('geektodo:backup', async () => {
  meta.lastBackupAt = await getMeta('lastBackupAt');
  renderBanners(document.querySelector('.banners'));
});

// ---------- service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => toast('نسخه‌ی تازه‌ی GeekTodo آماده است', {
      action: 'به‌روزرسانی', duration: 15000, icon: 'download',
      onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    // check for updates when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

// ---------- boot ----------
async function boot() {
  await store.init();
  applyAppearance();
  [meta.installDismissed, meta.lastBackupAt, meta.backupSnoozeUntil, meta.firstUseAt] = await Promise.all([
    getMeta('installDismissed', false), getMeta('lastBackupAt'), getMeta('backupSnoozeUntil', 0), getMeta('firstUseAt'),
  ]);
  if (!meta.firstUseAt) { meta.firstUseAt = Date.now(); await setMeta('firstUseAt', meta.firstUseAt); }

  main = document.getElementById('main');
  nav = document.getElementById('nav');
  dateEl = document.getElementById('today');
  buildNav();
  updateDate();

  store.subscribe((kind) => {
    if (kind === 'settings') applyAppearance();
    renderAll(kind);
  });
  window.addEventListener('hashchange', () => show(routeFromHash()));
  show(routeFromHash());
  document.body.classList.add('ready');

  // relative dates + fading change over time
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    updateDate();
    if (current !== 'settings') ROUTES[current]?.view.render();
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', tick);

  // shortcuts: "n" or "/" → new task
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest('input, textarea, [contenteditable]') || document.body.classList.contains('has-sheet')) return;
    if (e.key === 'n' || e.key === '/' || e.key === 'د') {
      e.preventDefault();
      if (current !== '') location.hash = '#/';
      setTimeout(() => listView.focusComposer(), 30);
    }
  });
  // keep audio alive: browsers (iOS above all) suspend it when the app goes to the background,
  // and only a user gesture may start it again
  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlockAudio, { passive: true });
  // no pinch or double-tap zoom inside the app (text size lives in Settings)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  registerSW();
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('main').innerHTML = '<div class="empty"><p class="empty-title">GeekTodo باز نشد.</p><p class="muted">اگر در حالت ناشناس (Private) هستی، ممکن است مرورگر اجازه‌ی ذخیره‌سازی ندهد.</p></div>';
});
