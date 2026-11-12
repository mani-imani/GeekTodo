// App state: tasks + settings, kept in memory and persisted to IndexedDB.
//
// Task record:
//   id          UUID
//   text        string
//   created_at  ms epoch
//   done_at     ms epoch | null      (null → open)
//   archived_at ms epoch | null      (set when it leaves the main list)
//   sort_order  number               (manual order in the main list)
//   updated_at  ms epoch             (last change — used for import merge / future sync)
//   deleted     boolean              (soft delete)
//
// Derived:
//   open      = !deleted && done_at == null
//   doneInList= !deleted && done_at != null && archived_at == null   (only when auto-archive is off)
//   archived  = !deleted && done_at != null && archived_at != null

import * as db from './db.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS = {
  theme: 'system',          // system | light | dark
  accent: 'navy',           // see ACCENTS in settings view (navy = brand)
  font: 'vazirmatn',        // vazirmatn | rounded | system
  fontSize: 17,             // px, 14–22
  digits: 'fa',             // fa | en
  calendar: 'jalali',       // jalali | gregorian (for date labels)
  dateStyle: 'relative',    // relative | full
  strike: 'pen',            // pen | straight | marker | none
  sound: true,
  soundType: 'scratch',     // scratch | pop | chime
  vibrate: true,
  fade: true,
  fadeStartDays: 7,
  fadeFullDays: 30,
  fadeSuggest: true,
  autoArchive: true,
  undoSeconds: 5,
  showReports: true,
  showCalendar: true,
  installPrompt: true,
  backupReminder: true,
  backupDays: 30,
  updated_at: 0,
};

const state = {
  tasks: [],
  settings: { ...DEFAULT_SETTINGS },
};
const listeners = new Set();

export const now = () => Date.now();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(kind) { for (const fn of listeners) fn(kind); }

export async function init() {
  const [tasks, settingsRec] = await Promise.all([db.getAll('tasks'), db.get('settings', 'settings')]);
  state.tasks = tasks.map(normalizeTask).filter(Boolean);
  if (settingsRec) {
    const { key, ...rest } = settingsRec;
    state.settings = { ...DEFAULT_SETTINGS, ...rest };
  }
}

export const settings = () => state.settings;
export const allTasks = () => state.tasks;
export const getTask = (id) => state.tasks.find((t) => t.id === id);

export function openTasks() {
  return state.tasks.filter((t) => !t.deleted && t.done_at == null)
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at);
}
export function doneInList() {
  return state.tasks.filter((t) => !t.deleted && t.done_at != null && t.archived_at == null)
    .sort((a, b) => a.done_at - b.done_at);
}
export function archivedTasks() {
  return state.tasks.filter((t) => !t.deleted && t.done_at != null && t.archived_at != null)
    .sort((a, b) => b.done_at - a.done_at);
}
/** Every non-deleted task that has been completed (archived or not) — for reports/calendar */
export function completedTasks() {
  return state.tasks.filter((t) => !t.deleted && t.done_at != null);
}
export function liveTasks() { return state.tasks.filter((t) => !t.deleted); }

function maxOrder() {
  let m = 0;
  for (const t of state.tasks) if (!t.deleted && t.done_at == null && t.sort_order > m) m = t.sort_order;
  return m;
}

async function save(task, kind = 'tasks') {
  task.updated_at = Math.max(now(), (task.updated_at || 0) + 1);
  await db.put('tasks', task);
  emit(kind);
  return task;
}

export async function addTask(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const t = {
    id: uuid(), text: clean, created_at: now(), done_at: null, archived_at: null,
    sort_order: maxOrder() + 1, updated_at: 0, deleted: false,
  };
  state.tasks.push(t);
  return save(t);
}

export async function updateText(id, text) {
  const t = getTask(id);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!t || !clean || clean === t.text) return t;
  t.text = clean;
  return save(t);
}

export async function complete(id) {
  const t = getTask(id);
  if (!t || t.done_at != null) return t;
  t.done_at = now();
  t.archived_at = state.settings.autoArchive ? t.done_at : null;
  return save(t);
}

/** Back to open. keepOrder=true for an immediate undo (returns to its old place). */
export async function reopen(id, { keepOrder = false } = {}) {
  const t = getTask(id);
  if (!t) return t;
  t.done_at = null;
  t.archived_at = null;
  if (!keepOrder) t.sort_order = maxOrder() + 1;
  return save(t);
}

export async function remove(id) {
  const t = getTask(id);
  if (!t) return t;
  t.deleted = true;
  return save(t);
}
export async function undelete(id) {
  const t = getTask(id);
  if (!t) return t;
  t.deleted = false;
  return save(t);
}

/** Restore specific fields (used by undo). */
export async function patch(id, fields) {
  const t = getTask(id);
  if (!t) return;
  Object.assign(t, fields);
  return save(t);
}

export async function setOrder(id, sortOrder) {
  const t = getTask(id);
  if (!t) return;
  t.sort_order = sortOrder;
  return save(t);
}

/** Manual clean-up: move done items still in the list to the archive. */
export async function archiveDone() {
  const items = doneInList();
  const ts = now();
  for (const t of items) { t.archived_at = ts; t.updated_at = ts; }
  await db.putMany('tasks', items);
  emit('tasks');
  return items.length;
}

export async function updateSettings(patch) {
  Object.assign(state.settings, patch, { updated_at: now() });
  await db.put('settings', { key: 'settings', ...state.settings });
  emit('settings');
}

// ---------- backup ----------

export function exportData() {
  return {
    app: 'GeekTodo',
    schema_version: SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    tasks: state.tasks.map((t) => ({ ...t })),
    settings: { ...state.settings },
  };
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.text !== 'string') return null;
  const num = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : Date.parse(v) || null);
  const created = num(raw.created_at) ?? now();
  const doneAt = num(raw.done_at);
  return {
    id: raw.id,
    text: String(raw.text).slice(0, 2000),
    created_at: created,
    done_at: doneAt,
    archived_at: doneAt == null ? null : (num(raw.archived_at) ?? doneAt),
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : created,
    updated_at: num(raw.updated_at) ?? created,
    deleted: !!raw.deleted,
  };
}

/**
 * Merge an exported file. Duplicates are matched by id; the record with the newer
 * updated_at wins (same rule future sync will use). Returns counts.
 */
export async function importData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
    throw new Error('فایل معتبر GeekTodo نیست.');
  }
  if ((data.schema_version || 1) > SCHEMA_VERSION) {
    throw new Error('این فایل با نسخه‌ی جدیدتری از اپ ساخته شده.');
  }
  let added = 0, updated = 0, skipped = 0;
  const changed = [];
  for (const raw of data.tasks) {
    const t = normalizeTask(raw);
    if (!t) { skipped++; continue; }
    const existing = getTask(t.id);
    if (!existing) { state.tasks.push(t); changed.push(t); added++; }
    else if (t.updated_at > existing.updated_at) { Object.assign(existing, t); changed.push(existing); updated++; }
    else skipped++;
  }
  if (changed.length) await db.putMany('tasks', changed);
  let settingsApplied = false;
  if (data.settings && typeof data.settings === 'object' && (data.settings.updated_at || 0) > (state.settings.updated_at || 0)) {
    const clean = {};
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in data.settings && typeof data.settings[k] === typeof DEFAULT_SETTINGS[k]) clean[k] = data.settings[k];
    Object.assign(state.settings, clean);
    await db.put('settings', { key: 'settings', ...state.settings });
    settingsApplied = true;
  }
  emit('tasks');
  if (settingsApplied) emit('settings');
  return { added, updated, skipped, settingsApplied };
}
