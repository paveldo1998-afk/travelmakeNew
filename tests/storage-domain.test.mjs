import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openStore, LEGACY_KEY, DATABASE_NAME, StorageError, ConflictError, normalizeData } from '../js/storage.js';
import { createTrip, createDemoData, addExpense, transferFunds, financeTotals, toMinor, moneyFromMinor, formatMoney, decimalAdd, decimalSubtract } from '../js/domain.js';

function environment(raw = null) {
  globalThis.indexedDB = new IDBFactory();
  const map = new Map(raw === null ? [] : [[LEGACY_KEY, raw]]);
  globalThis.localStorage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  return map;
}

function legacyFixture() {
  const trip = {
    id: 'owned-trip', title: 'Существующая поездка', start: '', end: '', currency: 'EUR', members: ['Вы'], pins: ['D1'], day: '2026-10-30',
    items: [{ id: 'item', title: 'Адаптер', quantity: 1, status: 'home', taskId: 'task' }],
    tasks: [{ id: 'task', title: 'Купить адаптер', due: '', time: '' }],
    events: [{ id: 'event', title: 'Место', date: '', time: '', documentId: 'D1' }],
    docs: [{ id: 'D1', title: 'Запись', audience: 'Выбранные участники', cached: true, eventId: 'event' }],
    accounts: [{ id: 'with', name: 'С собой', kind: 'withMe', balance: 75.5 }, { id: 'room', name: 'В номере', kind: 'storage', balance: 124.5 }],
    categories: [{ id: 'food', name: 'Еда', sort: 0 }],
    transactions: [{ id: 'old-expense', type: 'expense', amount: 24.5, fromId: 'with', categoryId: 'food', date: 12345 }, { id: 'old-transfer', type: 'transfer', amount: 50, fromId: 'with', toId: 'room', date: 12346 }],
    unknownFutureMetadata: { kept: true },
  };
  // Old nested IDs are not globally unique: D1 appears in each trip.
  const other = structuredClone(trip); other.id = 'second-trip'; other.title = 'Вторая поездка';
  return { version: 1, trips: [trip, other], currentTripId: 'owned-trip', dark: true, unknownTopLevel: 'retained' };
}

const file = () => new Blob(['%PDF-1.4\nSynthetic test bytes\n%%EOF'], { type: 'application/pdf' });

test('decimal arithmetic, currency precision, negative fractions and over-budget values are exact', () => {
  assert.equal(decimalAdd('0.1', '0.2'), '0.3');
  assert.equal(decimalSubtract('0.3', '0.2'), '0.1');
  assert.equal(toMinor('24,50', 'EUR'), '2450');
  assert.equal(toMinor('12.345', 'KWD'), '12345');
  assert.equal(toMinor('1200', 'JPY'), '1200');
  assert.throws(() => toMinor('1.01', 'JPY'), /допустимо 0/);
  assert.throws(() => toMinor('1.001', 'EUR'), /не округлена/);
  assert.equal(moneyFromMinor('-50', 'EUR'), '-0.5');
  assert.match(formatMoney('-0.5', 'EUR'), /^-0,50/);
  assert.match(formatMoney('0.123', 'EUR'), /0,123/);
  const trip = createTrip({ title: 'Тест', currency: 'EUR', total: '1.00', withMe: '1.00', budget: '0.20' });
  addExpense(trip, { amount: '0.10', fromId: trip.accounts[0].id, categoryId: trip.categories[0].id });
  addExpense(trip, { amount: '0.20', fromId: trip.accounts[0].id, categoryId: trip.categories[0].id });
  assert.equal(trip.accounts[0].balanceMinor, '70');
  assert.equal(financeTotals(trip).spentMinor, '30');
  assert.equal(financeTotals(trip).remainingMinor, '-10');
  assert.equal(financeTotals(trip).exceeded, true);
  const oldSpent = financeTotals(trip).spentMinor;
  transferFunds(trip, { amount: '0.30', fromId: trip.accounts[0].id, toId: trip.accounts[1].id });
  assert.equal(financeTotals(trip).accountsMinor, '70');
  assert.equal(financeTotals(trip).spentMinor, oldSpent);
});

test('legacy migration keeps identifiers, relationships, current balances and original JSON; repeat is idempotent', async () => {
  const original = legacyFixture(), raw = JSON.stringify(original), map = environment(raw);
  const store = await openStore();
  assert.equal(store.data.version, 2);
  assert.equal(store.data.trips.length, 2);
  assert.equal(store.data.unknownTopLevel, 'retained');
  for (let i = 0; i < original.trips.length; i++) {
    const before = original.trips[i], after = store.data.trips[i];
    for (const type of ['items', 'tasks', 'events', 'docs', 'accounts', 'categories', 'transactions']) assert.deepEqual(after[type].map(x => x.id), before[type].map(x => x.id));
    assert.deepEqual(after.accounts.map(x => x.balance), [75.5, 124.5]);
    assert.deepEqual(after.transactions.map(x => x.amount), [24.5, 50]);
    assert.equal(after.items[0].taskId, 'task');
    assert.equal(after.docs[0].eventId, 'event');
    assert.equal(after.events[0].documentId, 'D1');
    assert.deepEqual(after.pins, ['D1']);
    assert.deepEqual(after.unknownFutureMetadata, { kept: true });
    assert.equal(after.tasks[0].due, '');
    assert.equal(after.events[0].date, '');
    assert.equal(after.docs[0].legacyCached, true);
    assert.equal(after.docs[0].filePresent, false);
    assert.equal(after.docs[0].cached, false);
  }
  assert.equal(map.get(LEGACY_KEY), raw);
  assert.equal((await store.storageInfo()).migration.counts[0].transactions, 2);
  const revision = store.data.revision; store.close();
  const reopened = await openStore();
  assert.equal(reopened.data.revision, revision);
  assert.equal(reopened.data.trips.length, 2);
  assert.equal(reopened.data.trips[0].accounts[0].balance, 75.5);
  reopened.close();
});

test('legacy finer-than-minor amounts survive without rounding', async () => {
  const original = legacyFixture(); original.trips[0].accounts[0].balance = 0.123;
  environment(JSON.stringify(original)); const store = await openStore();
  assert.equal(store.data.trips[0].accounts[0].balance, 0.123);
  assert.equal(store.data.trips[0].accounts[0].balanceDecimal, '0.123');
  assert.equal(store.data.trips[0].accounts[0].balanceMinor, undefined);
  await store.commit(d => { transferFunds(d.trips[0], { amount: '0.01', fromId: 'with', toId: 'room' }); });
  assert.equal(store.data.trips[0].accounts[0].balanceDecimal, '0.113');
  store.close();
});

test('corrupt or future legacy data fails explicitly and never seeds demo or overwrites raw', async () => {
  let map = environment('{broken');
  await assert.rejects(openStore(), e => e instanceof StorageError && e.code === 'LEGACY_JSON');
  assert.equal(map.get(LEGACY_KEY), '{broken');
  map = environment(JSON.stringify({ version: 99, trips: [] }));
  await assert.rejects(openStore(), /версия|структура/);
  assert.equal(JSON.parse(map.get(LEGACY_KEY)).version, 99);
});

test('denied legacy reads fail, real empty state stays empty, demo uses another database', async () => {
  environment(); const store = await openStore();
  assert.equal(store.data.trips.length, 0); assert.equal(store.name, DATABASE_NAME);
  const demo = await openStore({ demo: true });
  assert.equal(demo.data.trips[0].id, 'demo-japan'); assert.notEqual(demo.name, store.name);
  assert.equal((await demo.getFile('demo-japan', 'demo-doc-sample')).type, 'application/pdf');
  assert.equal(store.data.trips.length, 0);
  store.close(); demo.close();
  environment(); globalThis.localStorage.getItem = () => { throw new DOMException('denied', 'SecurityError'); };
  await assert.rejects(openStore(), e => e.code === 'ACCESS');
});

test('failed saves and rejected files leave in-memory and persisted data unchanged', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore(); const before = store.data;
  await assert.rejects(store.commit(d => { d.trips[0].title = 'Will not save'; throw new Error('simulated write validation failure'); }), /simulated/);
  assert.deepEqual(store.data, before);
  await assert.rejects(store.commit(d => { d.trips[0].title = 'Invalid file'; }, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: new Blob(['not pdf'], { type: 'application/pdf' }), name: 'bad.pdf', type: 'application/pdf' } }), /не соответствует/);
  assert.deepEqual(store.data, before);
  assert.equal(await store.getFile('owned-trip', 'D1'), null);
  await assert.rejects(store.commit(d => { d.trips[0].title = 'Too big'; }, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: new Blob(['%PDF-' + 'a'.repeat(10 * 1024 * 1024)], { type: 'application/pdf' }), name: 'large.pdf', type: 'application/pdf' } }), /10 МБ/);
  assert.deepEqual(store.data, before);
  store.close(); const reopened = await openStore(); assert.deepEqual(reopened.data, before); reopened.close();
});

test('file and document metadata save atomically, compound keys isolate duplicate document IDs', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore();
  await store.commit(d => { d.trips[0].docs[0].title = 'Real local PDF'; }, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: file(), name: 'sample.pdf', type: 'application/pdf' } });
  assert.equal(store.data.trips[0].docs[0].filePresent, true);
  assert.equal(store.data.trips[0].docs[0].fileName, 'sample.pdf');
  assert.equal(store.data.trips[1].docs[0].filePresent, false);
  assert.equal(await store.getFile('second-trip', 'D1'), null);
  assert.match(await (await store.getFile('owned-trip', 'D1')).blob.text(), /Synthetic/);
  store.close(); const reopened = await openStore();
  assert.equal(reopened.data.trips[0].docs[0].filePresent, true);
  assert.equal((await reopened.getFile('owned-trip', 'D1')).name, 'sample.pdf');
  await reopened.commit(() => {}, { fileDelete: { tripId: 'owned-trip', docId: 'D1' } });
  assert.equal(reopened.data.trips[0].docs[0].filePresent, false);
  assert.equal(reopened.data.trips[0].docs[0].id, 'D1');
  assert.equal(await reopened.getFile('owned-trip', 'D1'), null);
  reopened.close();
});

test('a real IndexedDB transaction abort rolls back records and bytes together and reports quota failure', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore(); const before = store.data;
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'files') throw new DOMException('Synthetic quota refusal', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try {
    await assert.rejects(store.commit(d => { d.trips[0].title = 'Must roll back'; }, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: file(), name: 'sample.pdf', type: 'application/pdf' } }), e => e.code === 'QUOTA');
    assert.deepEqual(store.data, before);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.equal(await store.getFile('owned-trip', 'D1'), null);
  store.close(); const reopened = await openStore(); assert.deepEqual(reopened.data, before); reopened.close();
});

test('deleting a trip atomically deletes all its files while retaining same document IDs in another trip', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore();
  await store.commit(() => {}, { filePut: [
    { tripId: 'owned-trip', docId: 'D1', blob: file(), name: 'first.pdf', type: 'application/pdf' },
    { tripId: 'second-trip', docId: 'D1', blob: file(), name: 'second.pdf', type: 'application/pdf' },
  ] });
  await store.commit(d => { d.trips = d.trips.filter(t => t.id !== 'owned-trip'); }, { deleteTripId: 'owned-trip' });
  assert.equal(store.data.trips.length, 1);
  assert.equal(await store.getFile('owned-trip', 'D1'), null);
  assert.equal((await store.getFile('second-trip', 'D1')).name, 'second.pdf');
  assert.equal(store.data.trips[0].docs[0].filePresent, true);
  assert.equal((await store.storageInfo()).fileCount, 1);
  store.close();
});

test('account reconciliation refreshes exact derived values and removing planned budget clears derived metadata', async () => {
  environment(); const store = await openStore();
  const trip = createTrip({ title: 'Сверка', currency: 'EUR', total: '10', withMe: '10', budget: '50' });
  await store.commit(d => d.trips.push(trip));
  await store.commit(d => { d.trips[0].accounts[0].balance = '12.34'; d.trips[0].accounts[0].balanceMinor = '1234'; d.trips[0].budget = ''; delete d.trips[0].budgetMinor; });
  assert.equal(store.data.trips[0].accounts[0].balanceDecimal, '12.34');
  assert.equal(store.data.trips[0].accounts[0].balanceMinor, '1234');
  assert.equal(store.data.trips[0].budgetDecimal, undefined);
  assert.equal(store.data.trips[0].budgetMinor, undefined);
  assert.equal(financeTotals(store.data.trips[0]).hasBudget, false);
  store.close();
});

test('cross-tab write conflicts reject stale edits; explicit refresh allows the user to retry', async () => {
  environment(JSON.stringify(legacyFixture())); const first = await openStore(), second = await openStore();
  await first.commit(d => { d.trips[0].title = 'First tab'; });
  const before = second.data;
  await assert.rejects(second.commit(d => { d.trips[0].title = 'Stale tab'; }), error => error instanceof ConflictError && error.latestData.trips[0].title === 'First tab');
  assert.deepEqual(second.data, before);
  await second.refresh(); await second.commit(d => { d.trips[0].description = 'Explicitly retried'; });
  assert.equal(second.data.trips[0].title, 'First tab');
  first.close(); second.close();
});

test('export/import includes actual file bytes, is idempotent, and conflicts do not replace data', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore();
  await store.commit(() => {}, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: file(), name: 'test.pdf', type: 'application/pdf' } });
  const backup = await store.exportData();
  assert.equal(backup.files.length, 1); assert.equal(backup.files[0].docId, 'D1');
  await store.importData(backup); await store.importData(backup); assert.equal(store.data.trips.length, 2);
  const conflicting = structuredClone(backup); conflicting.data.trips[0].title = 'Overwrite';
  await assert.rejects(store.importData(conflicting), e => e.code === 'IMPORT_CONFLICT');
  assert.notEqual(store.data.trips[0].title, 'Overwrite');
  await store.clearOwnData(); assert.equal(store.data.trips.length, 0); assert.equal(await store.getFile('owned-trip', 'D1'), null);
  await store.importData(JSON.stringify(backup));
  await store.importData(backup);
  assert.equal(store.data.trips.length, 2); assert.equal(store.data.trips[0].id, 'owned-trip');
  assert.match(await (await store.getFile('owned-trip', 'D1')).blob.text(), /Synthetic/);
  store.close(); const reopened = await openStore(); assert.equal(reopened.data.trips.length, 2); reopened.close();
});

test('import never overwrites an existing private file by merely supplying its IDs', async () => {
  environment(JSON.stringify(legacyFixture())); const store = await openStore();
  await store.commit(() => {}, { filePut: { tripId: 'owned-trip', docId: 'D1', blob: file(), name: 'original.pdf', type: 'application/pdf' } });
  const backup = await store.exportData();
  const orphan = structuredClone(backup); orphan.data.trips = [];
  await assert.rejects(store.importData(orphan), e => e.code === 'IMPORT_FILE');
  const different = structuredClone(backup); different.files[0].base64 = btoa('%PDF-1.4\nDifferent synthetic bytes\n%%EOF');
  await assert.rejects(store.importData(different), e => e.code === 'IMPORT_CONFLICT');
  assert.equal((await store.getFile('owned-trip', 'D1')).name, 'original.pdf');
  assert.match(await (await store.getFile('owned-trip', 'D1')).blob.text(), /Synthetic test bytes/);
  store.close();
});

test('clearing only this app retains legacy backup and does not remigrate it on reopen', async () => {
  const map = environment(JSON.stringify(legacyFixture())); const store = await openStore();
  const demo = await openStore({ demo: true });
  await store.clearOwnData(); store.close();
  assert.ok(map.get(LEGACY_KEY));
  const reopened = await openStore(); assert.equal(reopened.data.trips.length, 0);
  assert.equal(demo.data.trips.length, 3);
  reopened.close(); demo.close();
});

test('new data rejects prototype payloads, and foreign-currency expenses require an explicit dated exact rate', () => {
  assert.throws(() => normalizeData(JSON.parse('{"version":2,"trips":[],"__proto__":{"bad":true}}')), /Недопустимое поле/);
  const trip = createTrip({ title: 'Multi', currency: 'EUR', total: '100', withMe: '100' });
  const fields = { amount: '10', currency: 'USD', fromId: trip.accounts[0].id, categoryId: trip.categories[0].id };
  assert.throws(() => addExpense(trip, fields), /курс и дата/);
  addExpense(trip, { ...fields, rate: '0.9', rateDate: '2026-10-30' });
  assert.equal(trip.accounts[0].balanceMinor, '9100');
  assert.equal(financeTotals(trip).spentMinor, '900');
  assert.equal(financeTotals(trip).unsupportedCurrencies.length, 0);
  const seed = createDemoData(); assert.equal(financeTotals(seed.trips[0]).spentMinor, '162000');
});
