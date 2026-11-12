// Number and date formatting, driven by user settings.
import { settings } from './store.js';
import { dateToJalali, JALALI_MONTHS, GREGORIAN_MONTHS, WEEKDAYS, satIndex } from './jalali.js';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const DAY = 86400000;

/** Convert western digits to the user's chosen digit set. */
export function num(value) {
  const s = String(value);
  if (settings().digits !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[d]).replace(/\./g, '٫');
}
/** Normalise any Persian/Arabic digits typed by the user to western ones. */
export function toLatinDigits(s) {
  return String(s).replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Local calendar-day key, e.g. 2026-11-12 */
export function dayKey(ts) { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
/** Whole calendar days between two timestamps (local). */
export function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / DAY); }

export function time(ts) {
  const d = new Date(ts);
  return num(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

/** "۲۱ آبان ۱۴۰۵" or "۱۲ نوامبر ۲۰۲۶" depending on the calendar setting. */
export function fullDate(ts, { withYear = true, withWeekday = false, calendar } = {}) {
  const d = new Date(ts);
  const cal = calendar || settings().calendar;
  let s;
  if (cal === 'jalali') {
    const j = dateToJalali(d);
    s = `${num(j.jd)} ${JALALI_MONTHS[j.jm - 1]}${withYear ? ' ' + num(j.jy) : ''}`;
  } else {
    s = `${num(d.getDate())} ${GREGORIAN_MONTHS[d.getMonth()]}${withYear ? ' ' + num(d.getFullYear()) : ''}`;
  }
  return withWeekday ? `${WEEKDAYS[satIndex(d)]} ${s}` : s;
}

/** Short date, drops the year when it's the current year. */
export function shortDate(ts) {
  const d = new Date(ts), n = new Date();
  const cal = settings().calendar;
  const sameYear = cal === 'jalali' ? dateToJalali(d).jy === dateToJalali(n).jy : d.getFullYear() === n.getFullYear();
  return fullDate(ts, { withYear: !sameYear });
}

export function relative(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'همین الان';
  if (min < 60) return `${num(min)} دقیقه پیش`;
  const days = daysBetween(ts, Date.now());
  if (days === 0) return `${num(Math.floor(min / 60))} ساعت پیش`;
  if (days === 1) return 'دیروز';
  if (days < 7) return `${num(days)} روز پیش`;
  if (days < 30) return `${num(Math.floor(days / 7))} هفته پیش`;
  if (days < 365) return `${num(Math.floor(days / 30))} ماه پیش`;
  return shortDate(ts);
}

/** The label shown next to a task — follows the dateStyle setting. */
export function when(ts) {
  return settings().dateStyle === 'relative' ? relative(ts) : `${shortDate(ts)}، ${time(ts)}`;
}
/** Always-precise tooltip text. */
export function exact(ts) { return `${fullDate(ts, { withWeekday: true })}، ساعت ${time(ts)}`; }

/** Day heading used in grouped lists: امروز / دیروز / full date */
export function dayHeading(ts) {
  const d = daysBetween(ts, Date.now());
  if (d === 0) return 'امروز';
  if (d === 1) return 'دیروز';
  return fullDate(ts, { withWeekday: true, withYear: d > 300 });
}
