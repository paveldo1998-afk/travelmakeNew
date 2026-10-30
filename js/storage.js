import { annotateTripMoney, createDemoData, ITEM_STATES } from './domain.js';

export const LEGACY_KEY = 'travelorganizer.multitool.v1';
export const DATABASE_NAME = 'travelorganizer.pwa.v2';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export class StorageError extends Error {
  constructor(code, message, cause) { super(message, { cause }); this.name = 'StorageError'; this.code = code; }
}
export class ConflictError extends StorageError {
  constructor(latestData) { super('CONFLICT', 'Запись уже изменена в другой вкладке. Сравните изменения перед сохранением.'); this.name = 'ConflictError'; this.latestData = clone(latestData); }
}
const clone = value => structuredClone(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function schemaError(message) { throw new StorageError('INVALID_DATA', message + ' Исходные данные не заменены.'); }
function checkSafe(value, depth = 0) {
  if (depth > 60) schemaError('Слишком глубокая структура данных.');
  if (Array.isArray(value)) { for (const item of value) checkSafe(item, depth + 1); return; }
  if (object(value)) for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) schemaError('Недопустимое поле в импортируемых данных.');
    checkSafe(item, depth + 1);
  }
  else if (typeof value === 'number' && !Number.isFinite(value)) schemaError('Некорректное числовое значение.');
  else if (['function', 'symbol', 'bigint', 'undefined'].includes(typeof value)) schemaError('Неподдерживаемый тип данных.');
}
function checkIds(rows, label) {
  if (!Array.isArray(rows)) schemaError(`Повреждён список «${label}».`);
  const ids = new Set();
  for (const row of rows) {
    if (!object(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)) schemaError(`Отсутствует или повторяется идентификатор в списке «${label}».`);
    ids.add(row.id);
  }
}

export function normalizeData(input, { legacy = false } = {}) {
  checkSafe(input);
  if (!object(input) || ![1, 2].includes(input.version) || !Array.isArray(input.trips)) schemaError('Неизвестная версия или структура сохранённых данных.');
  if (legacy && input.version !== 1) schemaError('Неподдерживаемая версия прежнего хранилища.');
  const data = clone(input);
  checkIds(data.trips, 'Поездки');
  data.version = 2;
  data.revision = Number.isSafeInteger(data.revision) && data.revision >= 0 ? data.revision : 0;
  data.currentTripId ??= null;
  data.templates ??= [];
  data.profile ??= { name: '' };
  data.settings ??= { theme: data.dark ? 'dark' : 'light', language: 'ru' };
  if (!object(data.settings) || !object(data.profile)) schemaError('Повреждены настройки или профиль.');
  checkIds(data.templates, 'Шаблоны');
  for (const template of data.templates) {
    template.items ??= [];
    if (!Array.isArray(template.items)) schemaError('Повреждено содержимое шаблона.');
  }
  for (const trip of data.trips) {
    trip.title ??= 'Поездка'; trip.currency ??= 'RUB'; trip.members ??= []; trip.pins ??= [];
    if (typeof trip.title !== 'string' || !/^[A-Z]{3}$/.test(trip.currency) || !Array.isArray(trip.members) || !Array.isArray(trip.pins)) schemaError('Повреждены реквизиты поездки.');
    for (const field of ['items', 'docs', 'events', 'tasks', 'accounts', 'categories', 'transactions', 'contacts', 'history']) {
      trip[field] ??= [];
      checkIds(trip[field], field);
    }
    for (const item of trip.items) {
      item.status ??= 'missing';
      if (!ITEM_STATES.includes(item.status)) schemaError('Неизвестное состояние вещи.');
      if (item.quantity !== undefined && !(Number(item.quantity) > 0)) schemaError('Некорректное количество вещей.');
    }
    for (const doc of trip.docs) {
      if (legacy) {
        if (own(doc, 'cached')) doc.legacyCached = doc.cached;
        doc.cached = false; doc.filePresent = false; doc.localCopy = false;
        delete doc.file;
      }
    }
    for (const task of trip.tasks) { task.completed ??= false; if (!task.due) task.reminder = false; }
    for (const account of trip.accounts) if (account.balance === undefined || account.balance === null) schemaError('В счёте отсутствует исторический остаток.');
    for (const transaction of trip.transactions) if (transaction.amount === undefined || transaction.amount === null) schemaError('В финансовой операции отсутствует сумма.');
    try { annotateTripMoney(trip); }
    catch (error) { throw new StorageError('INVALID_MONEY', 'Историческая сумма повреждена. Данные и исходная копия сохранены; требуется проверка записи.', error); }
  }
  return data;
}

function blankData(demo) {
  return { version: 2, revision: 0, trips: [], currentTripId: null, templates: [], settings: { theme: 'light', language: 'ru' }, profile: { name: '' }, demo };
}

function storageError(error) {
  if (error instanceof StorageError) return error;
  const name = error?.name || '';
  if (name === 'QuotaExceededError') return new StorageError('QUOTA', 'Недостаточно места в хранилище. Экспортируйте данные или освободите локальные копии. Ввод не потерян.', error);
  if (name === 'SecurityError' || name === 'NotAllowedError') return new StorageError('ACCESS', 'Браузер запретил доступ к хранилищу. Разрешите хранение данных для этого сайта. Ввод не потерян.', error);
  if (name === 'VersionError') return new StorageError('VERSION', 'Эта версия приложения старее локальной базы. Обновите приложение; данные не удалены.', error);
  return new StorageError('WRITE', 'Не удалось сохранить данные на устройстве. Повторите попытку; введённые значения остаются в форме.', error);
}

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new StorageError('UNAVAILABLE', 'IndexedDB недоступна. Приложение не может надёжно сохранять записи в этом браузере.')); return; }
    let request;
    try { request = indexedDB.open(name, 1); }
    catch (e) { reject(storageError(e)); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('state', { keyPath: 'key' });
      db.createObjectStore('files', { keyPath: ['tripId', 'docId'] });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () => reject(new StorageError('BLOCKED', 'База данных открыта в другой версии приложения. Закройте старые вкладки и повторите попытку.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function read(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = key === undefined ? tx.objectStore(store).getAll() : tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError(request.error));
  });
}

function readSnapshot(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['state', 'files'], 'readonly');
    const state = tx.objectStore('state').get('main'), files = tx.objectStore('files').getAll();
    tx.oncomplete = () => resolve({ data: state.result?.value, files: files.result });
    tx.onerror = () => reject(storageError(tx.error));
    tx.onabort = () => reject(storageError(tx.error));
  });
}

async function validateFile(file) {
  if (!file || typeof file.tripId !== 'string' || typeof file.docId !== 'string' || !(file.blob instanceof Blob)) throw new StorageError('FILE', 'Выберите настоящий файл для сохранения на устройстве.');
  if (file.blob.size === 0 || file.blob.size > MAX_FILE_BYTES) throw new StorageError('FILE_SIZE', 'Файл должен быть непустым и не больше 10 МБ.');
  const type = file.type || file.blob.type;
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) throw new StorageError('FILE_TYPE', 'Поддерживаются PDF, PNG, JPEG, WebP и GIF. SVG и исполняемые файлы не сохраняются.');
  const bytes = new Uint8Array(await file.blob.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const good = type === 'application/pdf' ? ascii.startsWith('%PDF-')
    : type === 'image/png' ? bytes[0] === 137 && ascii.slice(1, 4) === 'PNG'
      : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === 'image/gif' ? /^GIF8[79]a/.test(ascii)
          : ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  if (!good) throw new StorageError('FILE_TYPE', 'Содержимое файла не соответствует выбранному типу. Проверьте файл; поля формы сохранены.');
  return { tripId: file.tripId, docId: file.docId, blob: file.blob, name: String(file.name || 'document').slice(0, 255), type, size: file.blob.size, storedAt: new Date().toISOString() };
}

function applyFileMetadata(data, file, deleted = false) {
  const trip = data.trips.find(t => t.id === file.tripId);
  const doc = trip?.docs.find(d => d.id === file.docId);
  if (!doc && !deleted) throw new StorageError('FILE_RECORD', 'Запись документа не найдена. Сначала сохраните его название.');
  if (!doc) return;
  doc.cached = false; doc.filePresent = !deleted; doc.localCopy = !deleted;
  if (deleted) { delete doc.file; delete doc.fileName; delete doc.fileType; delete doc.fileSize; }
  else {
    doc.fileName = file.name; doc.fileType = file.type; doc.fileSize = file.size;
    doc.file = { name: file.name, type: file.type, size: file.size, storedAt: file.storedAt };
  }
}

function write(db, current, candidate, { filePuts = [], fileDeletes = [], metadata = [] } = {}) {
  return new Promise((resolve, reject) => {
    let failure;
    const tx = db.transaction(['state', 'files', 'meta'], 'readwrite');
    tx.oncomplete = () => resolve(candidate);
    tx.onerror = () => { failure ||= storageError(tx.error); };
    tx.onabort = () => reject(failure || storageError(tx.error));
    const stateStore = tx.objectStore('state');
    const request = stateStore.get('main');
    request.onsuccess = () => {
      try {
        const latest = request.result;
        const revision = latest?.value?.revision ?? 0;
        if (current === null ? Boolean(latest) : revision !== current.revision) {
          failure = new ConflictError(latest?.value || blankData(false)); tx.abort(); return;
        }
        stateStore.put({ key: 'main', value: candidate });
        const files = tx.objectStore('files');
        for (const file of filePuts) files.put(file);
        for (const file of fileDeletes) files.delete([file.tripId, file.docId]);
        for (const entry of metadata) tx.objectStore('meta').put(entry);
      } catch (error) { failure = storageError(error); tx.abort(); }
    };
    request.onerror = () => { failure = storageError(request.error); };
  });
}

function samplePDF() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 22 Tf 50 760 Td (TravelOrganizer - Synthetic test document) Tj 0 -36 Td /F1 13 Tf (No tickets, passport or personal data. Local PDF preview test.) Tj ET';
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let source = '%PDF-1.4\n', offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(source.length); source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([source], { type: 'application/pdf' });
}

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
function fromBase64(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) throw new StorageError('IMPORT_FILE', 'Некорректный размер файла в резервной копии.');
  let decoded;
  try { decoded = atob(value); } catch (e) { throw new StorageError('IMPORT_FILE', 'Повреждено содержимое файла в резервной копии.', e); }
  return Uint8Array.from(decoded, c => c.charCodeAt(0));
}

function comparableTrip(trip) {
  const result = clone(trip);
  // A backup can legitimately be imported after a local copy was removed.
  // Device-specific Blob metadata does not determine business-record identity.
  for (const doc of result.docs) for (const key of ['file', 'filePresent', 'localCopy', 'fileName', 'fileType', 'fileSize', 'cached']) delete doc[key];
  return JSON.stringify(result);
}

async function equalFileBytes(a, b) {
  if (a.size !== b.size) return false;
  for (let i = 0; i < a.size; i += 65536) {
    const x = new Uint8Array(await a.slice(i, i + 65536).arrayBuffer());
    const y = new Uint8Array(await b.slice(i, i + 65536).arrayBuffer());
    if (x.some((byte, index) => byte !== y[index])) return false;
  }
  return true;
}

export async function openStore({ demo = false } = {}) {
  const db = await openDatabase(DATABASE_NAME + (demo ? '.demo' : ''));
  let closed = false, queue = Promise.resolve();
  db.onversionchange = () => { db.close(); closed = true; };
  let row = await read(db, 'state', 'main'), data;
  if (row) data = normalizeData(row.value);
  else {
    let legacyRaw = null;
    if (!demo) {
      try { legacyRaw = globalThis.localStorage?.getItem(LEGACY_KEY) ?? null; }
      catch (e) { db.close(); throw new StorageError('ACCESS', 'Не удалось прочитать прежнее хранилище. Данные не заменены демопримером.', e); }
    }
    const meta = [];
    if (legacyRaw !== null) {
      let legacy;
      try { legacy = JSON.parse(legacyRaw); }
      catch (e) { db.close(); throw new StorageError('LEGACY_JSON', 'Прежние данные повреждены: JSON не читается. Экспортируйте исходную запись перед восстановлением.', e); }
      try { data = normalizeData(legacy, { legacy: true }); }
      catch (e) { db.close(); throw e; }
      meta.push({ key: 'legacy-backup', raw: legacyRaw, migratedAt: new Date().toISOString(), sourceKey: LEGACY_KEY });
      meta.push({ key: 'migration', source: LEGACY_KEY, version: 1, tripIds: data.trips.map(t => t.id), counts: data.trips.map(t => ({ id: t.id, items: t.items.length, tasks: t.tasks.length, events: t.events.length, docs: t.docs.length, accounts: t.accounts.length, transactions: t.transactions.length })) });
    } else data = demo ? createDemoData() : blankData(false);
    data.demo = demo; data.revision = 1;
    const filePuts = [];
    if (demo) {
      const file = await validateFile({ tripId: 'demo-japan', docId: 'demo-doc-sample', blob: samplePDF(), name: 'test-itinerary.pdf', type: 'application/pdf' });
      applyFileMetadata(data, file); filePuts.push(file);
    }
    try { await write(db, null, data, { filePuts, metadata: meta }); }
    catch (e) {
      if (e instanceof ConflictError) data = normalizeData((await read(db, 'state', 'main')).value);
      else { db.close(); throw e; }
    }
  }
  const ready = () => { if (closed) throw new StorageError('CLOSED', 'Хранилище закрыто после обновления. Перезагрузите приложение после сохранения или экспорта ввода.'); };
  const enqueue = work => { const task = queue.then(work); queue = task.catch(() => {}); return task; };
  const commit = (mutator, options = {}) => enqueue(async () => {
    ready(); const next = clone(data);
    await mutator(next);
    const candidate = normalizeData(next); candidate.revision = data.revision + 1;
    const filePuts = options.filePut ? await Promise.all((Array.isArray(options.filePut) ? options.filePut : [options.filePut]).map(validateFile)) : [];
    const fileDeletes = options.fileDelete ? (Array.isArray(options.fileDelete) ? options.fileDelete : [options.fileDelete]) : [];
    const existingFiles = await read(db, 'files');
    if (options.deleteTripId && candidate.trips.some(t => t.id === options.deleteTripId)) throw new StorageError('DELETE_TRIP', 'Поездка ещё присутствует в записях. Локальные файлы не удалены.');
    for (const file of existingFiles) {
      if (!candidate.trips.find(t => t.id === file.tripId)?.docs.some(doc => doc.id === file.docId)) fileDeletes.push({ tripId: file.tripId, docId: file.docId });
    }
    for (const trip of candidate.trips) for (const doc of trip.docs) {
      const actual = existingFiles.find(f => f.tripId === trip.id && f.docId === doc.id);
      if (actual) applyFileMetadata(candidate, actual);
      else applyFileMetadata(candidate, { tripId: trip.id, docId: doc.id }, true);
    }
    for (const file of filePuts) applyFileMetadata(candidate, file);
    for (const file of fileDeletes) applyFileMetadata(candidate, file, true);
    // Deleting a trip/document also deletes only its matching private Blob keys.
    for (const oldTrip of data.trips) for (const oldDoc of oldTrip.docs) {
      if (!candidate.trips.find(t => t.id === oldTrip.id)?.docs.some(d => d.id === oldDoc.id)) fileDeletes.push({ tripId: oldTrip.id, docId: oldDoc.id });
    }
    await write(db, data, candidate, { filePuts, fileDeletes });
    data = candidate;
    return clone(data);
  });
  return {
    get data() { return clone(data); },
    name: db.name, demo, commit,
    async getFile(tripId, docId) { ready(); return (await read(db, 'files', [tripId, docId])) || null; },
    async exportData({ includeFiles = true } = {}) {
      ready(); await queue;
      const snapshot = await readSnapshot(db);
      const payload = { format: 'travelorganizer-backup', backupVersion: 1, exportedAt: new Date().toISOString(), filesIncluded: includeFiles, data: clone(snapshot.data), files: [] };
      if (includeFiles) for (const file of snapshot.files) payload.files.push({ tripId: file.tripId, docId: file.docId, name: file.name, type: file.type, size: file.size, base64: toBase64(new Uint8Array(await file.blob.arrayBuffer())) });
      return payload;
    },
    async importData(payload) {
      ready();
      if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (e) { throw new StorageError('IMPORT_JSON', 'Резервная копия не является корректным JSON.', e); } }
      checkSafe(payload);
      if (!object(payload) || payload.format !== 'travelorganizer-backup' || payload.backupVersion !== 1 || !Array.isArray(payload.files)) throw new StorageError('IMPORT_FORMAT', 'Неподдерживаемый формат резервной копии.');
      const imported = normalizeData(payload.data);
      const validatedFiles = await Promise.all(payload.files.map(f => validateFile({ ...f, blob: new Blob([fromBase64(f.base64)], { type: f.type }) })));
      const existingFiles = await read(db, 'files'), filePuts = [], keys = new Set();
      for (const incomingFile of validatedFiles) {
        const key = JSON.stringify([incomingFile.tripId, incomingFile.docId]);
        if (keys.has(key)) throw new StorageError('IMPORT_FILE', 'В резервной копии повторяется содержимое одного документа. Импорт отменён.');
        keys.add(key);
        if (!imported.trips.find(t => t.id === incomingFile.tripId)?.docs.some(doc => doc.id === incomingFile.docId)) throw new StorageError('IMPORT_FILE', 'В резервной копии файл не связан с собственной записью документа. Импорт отменён.');
        const existing = existingFiles.find(f => f.tripId === incomingFile.tripId && f.docId === incomingFile.docId);
        if (existing) {
          if (existing.type !== incomingFile.type || !await equalFileBytes(existing.blob, incomingFile.blob)) throw new StorageError('IMPORT_CONFLICT', 'На устройстве уже есть другое содержимое файла с тем же ID. Импорт не заменяет его.');
          // Keeping the original Blob preserves its stable storedAt metadata on
          // repeated import, rather than generating a false record conflict.
        } else filePuts.push(incomingFile);
      }
      return commit(next => {
        for (const incoming of imported.trips) {
          const existing = next.trips.find(t => t.id === incoming.id);
          if (existing && comparableTrip(existing) !== comparableTrip(incoming)) throw new StorageError('IMPORT_CONFLICT', `Поездка «${incoming.title}» уже существует с другими изменениями. Импорт не перезаписывает существующие записи.`);
          if (!existing) next.trips.push(incoming);
        }
        for (const incoming of imported.templates) {
          const existing = next.templates.find(t => t.id === incoming.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(incoming)) throw new StorageError('IMPORT_CONFLICT', 'Шаблон с таким ID содержит другие данные. Импорт отменён.');
          if (!existing) next.templates.push(incoming);
        }
        // Imported file flags are trusted only for bytes included in this backup,
        // or actual local files that already belong to the retained record.
        for (const trip of next.trips) for (const doc of trip.docs) {
          if (!data.trips.some(t => t.id === trip.id)) { doc.filePresent = false; doc.localCopy = false; doc.cached = false; delete doc.file; delete doc.fileName; delete doc.fileType; delete doc.fileSize; }
        }
      }, { filePut: filePuts });
    },
    clearOwnData() {
      return enqueue(async () => {
        ready(); const next = blankData(demo); next.revision = data.revision + 1;
        const fileDeletes = (await read(db, 'files')).map(({ tripId, docId }) => ({ tripId, docId }));
        await write(db, data, next, { fileDeletes, metadata: [{ key: 'cleared', at: new Date().toISOString(), originalLegacyKeyRetained: true }] });
        data = next; return clone(data);
      });
    },
    async storageInfo() {
      ready(); const files = await read(db, 'files');
      const estimate = await globalThis.navigator?.storage?.estimate?.().catch(() => null);
      return { database: db.name, fileCount: files.length, fileBytes: files.reduce((sum, f) => sum + f.size, 0), recordBytes: new Blob([JSON.stringify(data)]).size, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, revision: data.revision, migration: await read(db, 'meta', 'migration') || null };
    },
    async refresh() { ready(); await queue; const latest = await read(db, 'state', 'main'); if (!latest) throw new StorageError('MISSING', 'Запись хранилища отсутствует.'); data = normalizeData(latest.value); return clone(data); },
    close() { closed = true; db.close(); },
  };
}
