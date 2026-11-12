// Settings: every option is a toggle or a choice; defaults keep the app minimal.
import * as store from '../store.js';
import { h, icon, toast } from '../ui.js';
import { canVibrate, playDone, vibrate, unlockAudio } from '../feedback.js';
import { createStrike } from '../strike.js';
import { exportFile, pickAndImport } from '../backup.js';
import { getMeta } from '../db.js';
import * as fmt from '../fmt.js';
import { APP_VERSION } from '../version.js';

// navy is the GeekMani brand color and the default; dark = the same hue made readable on the dark theme
export const ACCENTS = {
  navy: { name: 'سرمه‌ای', color: '#1F3A5F', dark: '#8DB1E0' },
  coral: { name: 'مرجانی', color: '#e5533d' },
  indigo: { name: 'نیلی', color: '#5b5bd6' },
  green: { name: 'سبز', color: '#2a9d68' },
  amber: { name: 'کهربایی', color: '#d4860f' },
  pink: { name: 'صورتی', color: '#d23f8a' },
  teal: { name: 'فیروزه‌ای', color: '#11939f' },
  graphite: { name: 'گرافیتی', color: '#6b6875' },
};

let root, body;

export function mount(container) {
  body = h('div', { class: 'settings' });
  root = h('section', { class: 'view view-settings' },
    h('header', { class: 'view-head' }, h('h1', {}, 'تنظیمات')),
    body);
  container.append(root);
  render();
  return root;
}

const set = (patch) => store.updateSettings(patch);

function group(title, ...rows) {
  return h('section', { class: 'card set-group' }, h('h2', { class: 'card-title' }, title), ...rows.filter(Boolean));
}

function rowEl(label, control, hint) {
  return h('div', { class: 'set-row' },
    h('div', { class: 'set-label' }, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null),
    h('div', { class: 'set-control' }, control));
}

function toggle(key, label, hint, { disabled = false } = {}) {
  const id = `t-${key}`;
  const input = h('input', { type: 'checkbox', id, class: 'switch', role: 'switch', disabled });
  input.checked = !!store.settings()[key];
  input.addEventListener('change', () => set({ [key]: input.checked }));
  return h('label', { class: `set-row toggle-row${disabled ? ' is-disabled' : ''}`, for: id },
    h('div', { class: 'set-label' }, h('span', {}, label), hint ? h('span', { class: 'muted small' }, hint) : null),
    input);
}

function seg(key, options, label, hint) {
  const cur = store.settings()[key];
  const ctl = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    ...options.map(([v, text]) => h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(v === cur), 'data-fk': `${key}:${v}`,
      onclick: () => set({ [key]: v }),
    }, text)));
  return rowEl(label, ctl, hint);
}

function stepper(key, label, { min, max, step = 1, unit = '' }, hint) {
  const v = store.settings()[key];
  const out = h('output', {}, `${fmt.num(v)} ${unit}`);
  const ctl = h('div', { class: 'stepper' },
    h('button', { type: 'button', class: 'icon-btn', 'data-fk': `${key}:+`, 'aria-label': `بیشتر: ${label}`, html: icon('plus'), onclick: () => set({ [key]: Math.min(max, v + step) }), disabled: v >= max }),
    out,
    h('button', { type: 'button', class: 'icon-btn', 'data-fk': `${key}:-`, 'aria-label': `کمتر: ${label}`, html: icon('minus'), onclick: () => set({ [key]: Math.max(min, v - step) }), disabled: v <= min }));
  return rowEl(label, ctl, hint);
}

function strikePreview() {
  const text = h('span', { class: 'text' }, 'یک کار نمونه برای امتحان');
  const bodyEl = h('div', { class: 'body' }, text);
  const li = h('div', { class: 'task preview-task' },
    h('span', { class: 'check', 'aria-hidden': 'true', html: '<span class="ring"></span>' + icon('check', 'tick') }), bodyEl);
  let busy = false;
  const btn = h('button', {
    class: 'btn btn-small', type: 'button',
    onclick: async () => {
      if (busy) return;
      busy = true;
      unlockAudio();
      li.classList.remove('checked', 'struck');
      bodyEl.querySelector('svg.strike')?.remove();
      const st = store.settings().strike;
      const s = st === 'none' ? null : createStrike(text, bodyEl, 'rtl');
      playDone(s ? s.duration : 200);
      vibrate([12, 40, 18]);
      li.classList.add('checked');
      if (s) await s.animateTo(1, s.duration);
      li.classList.add('struck');
      setTimeout(() => { li.classList.remove('checked', 'struck'); s?.remove(); busy = false; }, 1100);
    },
  }, 'امتحان کن');
  return h('div', { class: 'preview' }, li, btn);
}

export async function render() {
  if (!root) return;
  const s = store.settings();
  const lastBackup = await getMeta('lastBackupAt');
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const scrollY = window.scrollY;
  const ae = document.activeElement;
  const focusKey = ae && body.contains(ae) ? (ae.dataset.fk || (ae.id ? '#' + ae.id : null)) : null;
  body.innerHTML = '';

  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'رنگ تأکید' },
    ...Object.entries(ACCENTS).map(([k, a]) => h('button', {
      type: 'button', role: 'radio', class: 'swatch', 'data-fk': `accent:${k}`, 'aria-checked': String(k === s.accent), 'aria-label': a.name, title: a.name,
      style: { '--sw': a.color }, onclick: () => set({ accent: k }),
    })));

  const sizeInput = h('input', { type: 'range', min: 14, max: 22, step: 1, value: s.fontSize, 'aria-label': 'اندازه‌ی متن', class: 'range' });
  sizeInput.addEventListener('input', () => document.documentElement.style.setProperty('--fs', sizeInput.value + 'px'));
  sizeInput.addEventListener('change', () => set({ fontSize: +sizeInput.value }));

  body.append(
    group('ظاهر',
      seg('theme', [['system', 'سیستم'], ['light', 'روشن'], ['dark', 'تاریک']], 'تم'),
      rowEl('رنگ تأکید', swatches),
      seg('font', [['vazirmatn', 'وزیرمتن'], ['rounded', 'نقطه‌گرد'], ['system', 'سیستم']], 'فونت'),
      rowEl('اندازه‌ی متن', h('div', { class: 'range-wrap' }, h('span', { class: 'aa small' }, 'آ'), sizeInput, h('span', { class: 'aa big' }, 'آ'))),
      seg('digits', [['fa', '۱۲۳'], ['en', '123']], 'ارقام')),

    group('حس خط‌کشیدن',
      seg('strike', [['pen', 'قلم'], ['straight', 'صاف'], ['marker', 'ماژیک'], ['none', 'بی‌خط']], 'انیمیشن'),
      strikePreview(),
      toggle('sound', 'صدا'),
      s.sound ? seg('soundType', [['scratch', 'قلم'], ['pop', 'پاپ'], ['chime', 'زنگ']], 'نوع صدا') : null,
      toggle('vibrate', 'لرزش', canVibrate() ? 'فقط روی اندروید' : 'این دستگاه یا مرورگر از لرزش پشتیبانی نمی‌کند', { disabled: !canVibrate() })),

    group('تاریخ',
      seg('calendar', [['jalali', 'شمسی'], ['gregorian', 'میلادی']], 'تقویم'),
      seg('dateStyle', [['relative', 'نسبی'], ['full', 'کامل']], 'نمایش', s.dateStyle === 'relative' ? 'مثل «۳ روز پیش»' : `مثل «${fmt.shortDate(Date.now())}، ${fmt.time(Date.now())}»`)),

    group('فهرست',
      toggle('autoArchive', 'رفتن خودکار به آرشیو', s.autoArchive ? 'کار خط‌خورده بی‌درنگ از فهرست می‌رود' : 'کارهای خط‌خورده پایین فهرست می‌مانند تا خودت پاک‌سازی کنی'),
      seg('undoSeconds', [[3, fmt.num(3) + ' ثانیه'], [5, fmt.num(5) + ' ثانیه'], [10, fmt.num(10) + ' ثانیه']], 'مهلت «برگردان»'),
      toggle('fade', 'کمرنگ‌شدن کارهای قدیمی', 'بدون مهلت؛ فقط کم‌کم کمرنگ می‌شوند'),
      s.fade ? stepper('fadeStartDays', 'شروع کمرنگی بعد از', { min: 1, max: 60, unit: 'روز' }) : null,
      s.fade ? stepper('fadeFullDays', 'کمرنگ کامل بعد از', { min: s.fadeStartDays + 1, max: 365, step: 5, unit: 'روز' }) : null,
      s.fade ? toggle('fadeSuggest', 'پیشنهاد «انجامش بده یا رهایش کن»') : null),

    group('بخش‌ها',
      toggle('showCalendar', 'تقویم'),
      toggle('showReports', 'گزارش')),

    group('داده و پشتیبان',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', type: 'button', html: `${icon('download')}<span>خروجی JSON</span>`, onclick: async () => { await exportFile(); render(); } }),
        h('button', { class: 'btn', type: 'button', html: `${icon('upload')}<span>ورودی JSON</span>`, onclick: async () => { await pickAndImport(); render(); } })),
      h('p', { class: 'muted small' }, lastBackup ? `آخرین پشتیبان: ${fmt.relative(lastBackup)}` : 'هنوز پشتیبانی نگرفتی.',
        ' داده‌ها فقط روی همین دستگاه‌اند؛ خروجی بگیر تا اگر مرورگر پاکشان کرد، از دست نروند.'),
      toggle('backupReminder', 'یادآوری پشتیبان‌گیری'),
      s.backupReminder ? stepper('backupDays', 'یادآوری بعد از', { min: 7, max: 120, step: 7, unit: 'روز' }) : null,
      rowEl('ذخیره‌ی پایدار', persisted
        ? h('span', { class: 'badge ok', html: `${icon('shield')}<span>فعال</span>` })
        : h('button', {
          class: 'btn btn-small', type: 'button',
          onclick: async () => {
            const ok = await navigator.storage?.persist?.().catch(() => false);
            toast(ok ? 'مرورگر قول داد داده‌ها را پاک نکند' : 'مرورگر اجازه نداد؛ پشتیبان‌گیری مهم‌تر می‌شود', { icon: 'shield' });
            render();
          },
        }, 'درخواست'), 'جلوی پاک شدن خودکار داده‌ها به دست مرورگر را می‌گیرد'),
      toggle('installPrompt', 'پیشنهاد نصب روی صفحه'),
      (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)
        ? null
        : h('button', { class: 'btn btn-small', type: 'button', onclick: () => document.dispatchEvent(new CustomEvent('geektodo:install')) }, 'نصب GeekTodo روی این دستگاه')),

    h('footer', { class: 'about muted small' },
      h('p', {}, `GeekTodo · نسخه‌ی ${APP_VERSION}`),
      h('p', {}, 'از ', h('a', { href: 'https://maniimani.ir', target: '_blank', rel: 'noopener' }, 'گیک‌مانی'), ' · ',
        h('a', { href: 'https://github.com/mani-imani/GeekTodo', target: '_blank', rel: 'noopener' }, 'کد منبع'), ' · مجوز MIT'),
      h('p', {}, 'بدون سرور، بدون ردیابی. همه‌چیز روی دستگاه خودت.')),
  );
  window.scrollTo(0, scrollY);
  if (focusKey) {
    const el = focusKey.startsWith('#') ? body.querySelector(focusKey) : body.querySelector(`[data-fk="${focusKey}"]`);
    el?.focus({ preventScroll: true });
  }
}
