/* Domain values use decimal strings/BigInt, never binary floating point math. */
export const ITEM_STATES = ['missing', 'home', 'packed'];
export const DEFAULT_CATEGORIES = [
  ['Еда и напитки', 'food'], ['Транспорт', 'train'], ['Проживание', 'building'],
  ['Развлечения', 'ticket'], ['Покупки', 'bag'], ['Перелёты', 'plane'], ['Прочее', 'more'],
];

export function uid() {
  return globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function currencyDigits(currency = 'RUB') {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Укажите валюту из трёх латинских букв.');
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

function expandNumber(value) {
  const source = String(value);
  if (!/e/i.test(source)) return source;
  const [mantissa, e] = source.toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const digits = mantissa.replace('-', '').replace('.', '');
  const point = mantissa.replace('-', '').split('.')[0].length + Number(e);
  const number = point <= 0 ? `0.${'0'.repeat(-point)}${digits}`
    : point >= digits.length ? digits + '0'.repeat(point - digits.length)
      : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (negative ? '-' : '') + number;
}

export function decimal(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Сумма должна быть конечным числом.');
  const source = (typeof value === 'number' ? expandNumber(value) : String(value ?? '')).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(source) || source.length > 400) throw new Error('Введите сумму числом, например 24,50.');
  const [whole, fraction = ''] = source.replace(/^[+-]/, '').split('.');
  const sign = source.startsWith('-') ? '-' : '';
  const w = whole.replace(/^0+(?=\d)/, '');
  const f = fraction.replace(/0+$/, '');
  return /^0$/.test(w) && !f ? '0' : `${sign}${w}${f ? '.' + f : ''}`;
}

function parts(value) {
  const s = decimal(value);
  const [whole, f = ''] = s.split('.');
  return { n: BigInt(whole + f), scale: f.length };
}

function fromParts(n, scale) {
  const negative = n < 0n;
  const digits = (negative ? -n : n).toString().padStart(scale + 1, '0');
  return decimal((negative ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits));
}

export function decimalAdd(a, b) {
  const x = parts(a), y = parts(b), scale = Math.max(x.scale, y.scale);
  return fromParts(x.n * 10n ** BigInt(scale - x.scale) + y.n * 10n ** BigInt(scale - y.scale), scale);
}

export function decimalSubtract(a, b) {
  const y = decimal(b);
  return decimalAdd(a, y.startsWith('-') ? y.slice(1) : '-' + y);
}

export function decimalCompare(a, b) {
  const result = parts(decimalSubtract(a, b)).n;
  return result < 0n ? -1 : result > 0n ? 1 : 0;
}

export function toMinor(value, currency = 'RUB') {
  const digits = currencyDigits(currency), p = parts(value);
  if (p.scale > digits) throw new Error(`Для ${currency} допустимо ${digits} знаков после запятой. Историческая сумма не округлена.`);
  return (p.n * 10n ** BigInt(digits - p.scale)).toString();
}

export function moneyFromMinor(minor, currency = 'RUB') {
  if (!/^-?\d+$/.test(String(minor))) throw new Error('Некорректная сумма в минимальных единицах.');
  return fromParts(BigInt(minor), currencyDigits(currency));
}

export function formatMoney(value, currency = 'RUB') {
  let source;
  try { source = decimal(value ?? 0); } catch { return 'Некорректная сумма'; }
  const [whole, fraction = ''] = source.split('.');
  const precision = Math.max(currencyDigits(currency), fraction.length);
  const grouped = (whole.startsWith('-') && BigInt(whole) === 0n ? '-' : '') + BigInt(whole).toLocaleString('ru-RU');
  const symbol = { RUB: '₽', EUR: '€', USD: '$', JPY: '¥', KRW: '₩', THB: '฿', GBP: '£' }[currency] || currency;
  return `${grouped}${precision ? ',' + fraction.padEnd(precision, '0') : ''}\u00a0${symbol}`;
}

function compatibleUnits(value) {
  const canonical = decimal(value), numeric = Number(canonical);
  return Number.isFinite(numeric) && decimal(numeric) === canonical ? numeric : canonical;
}

function annotateMoney(object, field, currency) {
  const canonical = decimal(object[field] ?? 0);
  object[field + 'Decimal'] = canonical;
  try { object[field + 'Minor'] = toMinor(canonical, currency); }
  catch { delete object[field + 'Minor']; }
  return canonical;
}

export function annotateTripMoney(trip) {
  for (const account of trip.accounts || []) annotateMoney(account, 'balance', trip.currency);
  for (const tx of trip.transactions || []) annotateMoney(tx, 'amount', tx.currency || trip.currency);
  if (trip.budget !== undefined && trip.budget !== '') annotateMoney(trip, 'budget', trip.currency);
  else { delete trip.budgetDecimal; delete trip.budgetMinor; }
  return trip;
}

function setBalance(account, canonical, currency) {
  account.balance = compatibleUnits(canonical);
  annotateMoney(account, 'balance', currency);
}

function validDate(value, name) {
  if (!value) return '';
  const parsed = new Date(value + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Проверьте ${name}.`);
  return value;
}

export function createTrip(fields = {}) {
  const title = String(fields.title || '').trim();
  if (!title) throw new Error('Укажите название поездки.');
  const start = validDate(fields.start || '', 'дату начала'), end = validDate(fields.end || '', 'дату окончания');
  if (start && end && end < start) throw new Error('Дата окончания раньше даты начала.');
  const currency = fields.currency || 'RUB'; currencyDigits(currency);
  const total = decimal(fields.total || fields.initialBalance || 0), withMe = decimal(fields.withMe || 0);
  if (decimalCompare(total, 0) < 0 || decimalCompare(withMe, 0) < 0 || decimalCompare(withMe, total) > 0) throw new Error('Проверьте начальные остатки на счетах.');
  toMinor(total, currency); toMinor(withMe, currency);
  const result = {
    id: uid(), title, start, end, currency, destinations: String(fields.destinations || ''),
    description: String(fields.description || ''), cover: String(fields.cover || ''), archived: false,
    members: ['Вы'], pins: [], day: start, items: [], docs: [], events: [], tasks: [], contacts: [], history: [],
    accounts: [
      { id: uid(), name: 'С собой', kind: 'withMe', balance: compatibleUnits(withMe) },
      { id: uid(), name: 'В номере', kind: 'storage', balance: compatibleUnits(decimalSubtract(total, withMe)) },
    ],
    categories: DEFAULT_CATEGORIES.map(([name, icon], sort) => ({ id: uid(), name, icon, sort })), transactions: [],
  };
  if (fields.budget !== undefined && fields.budget !== '') {
    if (decimalCompare(fields.budget, 0) < 0) throw new Error('Бюджет не может быть отрицательным.');
    toMinor(fields.budget, currency); result.budget = compatibleUnits(fields.budget);
  }
  return annotateTripMoney(result);
}

function operationAmount(trip, fields) {
  const amount = decimal(fields.amount);
  if (decimalCompare(amount, 0) <= 0) throw new Error('Сумма должна быть больше нуля.');
  const currency = fields.currency || trip.currency;
  const amountMinor = toMinor(amount, currency);
  let accountAmount = amount;
  let rate = null;
  if (currency !== trip.currency) {
    if (!fields.rate || !fields.rateDate) throw new Error('Для другой валюты нужен введённый курс и дата курса.');
    const r = parts(fields.rate);
    if (r.n <= 0n) throw new Error('Курс должен быть больше нуля.');
    validDate(fields.rateDate, 'дату курса');
    const a = parts(amount);
    accountAmount = fromParts(a.n * r.n, a.scale + r.scale);
    // Do not silently round exchanged amounts to the destination currency.
    toMinor(accountAmount, trip.currency);
    rate = decimal(fields.rate);
  }
  return { amount, amountMinor, currency, accountAmount, rate };
}

export function addExpense(trip, fields) {
  const value = operationAmount(trip, fields);
  const account = trip.accounts.find(a => a.id === fields.fromId);
  const category = trip.categories.find(c => c.id === fields.categoryId);
  if (!account) throw new Error('Выберите существующий счёт.');
  if (!category) throw new Error('Выберите категорию расхода.');
  if (decimalCompare(account.balance, value.accountAmount) < 0) throw new Error('Недостаточно средств на выбранном счёте.');
  const tx = {
    id: fields.id || uid(), type: 'expense', amount: compatibleUnits(value.amount), amountDecimal: value.amount,
    amountMinor: value.amountMinor, currency: value.currency, fromId: account.id, categoryId: category.id,
    date: fields.date || Date.now(), note: String(fields.note || ''), payer: String(fields.payer || ''),
    participants: Array.isArray(fields.participants) ? fields.participants : [], documentId: fields.documentId || '',
  };
  if (value.rate) Object.assign(tx, { rate: value.rate, rateDate: fields.rateDate, baseAmount: value.accountAmount, baseCurrency: trip.currency });
  setBalance(account, decimalSubtract(account.balance, value.accountAmount), trip.currency);
  trip.transactions.push(tx);
  return tx;
}

export function transferFunds(trip, fields) {
  if (fields.currency && fields.currency !== trip.currency) throw new Error('Перевод между этими счетами выполняется в основной валюте поездки.');
  const value = operationAmount(trip, fields);
  if (fields.fromId === fields.toId) throw new Error('Выберите разные счета перевода.');
  const from = trip.accounts.find(a => a.id === fields.fromId), to = trip.accounts.find(a => a.id === fields.toId);
  if (!from || !to) throw new Error('Выберите существующие счета.');
  if (decimalCompare(from.balance, value.amount) < 0) throw new Error('Недостаточно средств на выбранном счёте.');
  const tx = { id: fields.id || uid(), type: 'transfer', amount: compatibleUnits(value.amount), amountDecimal: value.amount, amountMinor: value.amountMinor, currency: trip.currency, fromId: from.id, toId: to.id, date: fields.date || Date.now(), note: String(fields.note || '') };
  setBalance(from, decimalSubtract(from.balance, value.amount), trip.currency);
  setBalance(to, decimalAdd(to.balance, value.amount), trip.currency);
  trip.transactions.push(tx);
  return tx;
}

export function financeTotals(trip) {
  let spent = '0', balance = '0';
  const byCategory = {}, unsupportedCurrencies = new Set();
  for (const account of trip.accounts || []) balance = decimalAdd(balance, account.balance || 0);
  for (const tx of trip.transactions || []) {
    if (tx.type !== 'expense') continue;
    const code = tx.currency || trip.currency;
    let amount;
    if (code === trip.currency) amount = tx.amount;
    else if (tx.baseCurrency === trip.currency && tx.baseAmount !== undefined) amount = tx.baseAmount;
    else { unsupportedCurrencies.add(code); continue; }
    spent = decimalAdd(spent, amount);
    byCategory[tx.categoryId] = decimalAdd(byCategory[tx.categoryId] || 0, amount);
  }
  const hasBudget = trip.budget !== undefined && trip.budget !== '';
  const planned = hasBudget ? decimal(trip.budget) : '0';
  const remaining = hasBudget ? decimalSubtract(planned, spent) : null;
  const minorOrNull = value => { try { return value === null ? null : toMinor(value, trip.currency); } catch { return null; } };
  const percent = decimalCompare(planned, 0) > 0 ? Number(spent) / Number(planned) * 100 : 0;
  return { planned: Number(planned), budget: Number(planned), spent: Number(spent), remaining: remaining === null ? null : Number(remaining), balance: Number(balance), accountTotal: Number(balance),
    plannedDecimal: planned, budgetDecimal: planned, spentDecimal: spent, remainingDecimal: remaining, balanceDecimal: balance, accountTotalDecimal: balance,
    hasBudget, exceeded: remaining !== null && decimalCompare(remaining, 0) < 0,
    plannedMinor: minorOrNull(planned), budgetMinor: minorOrNull(planned), spentMinor: minorOrNull(spent), remainingMinor: minorOrNull(remaining), balanceMinor: minorOrNull(balance), accountsMinor: minorOrNull(balance), accountTotalMinor: minorOrNull(balance),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([id,value])=>[id,Number(value)])), byCategoryDecimal: byCategory, byCategoryMinor: Object.fromEntries(Object.entries(byCategory).map(([id,value])=>[id,minorOrNull(value)])),
    percent: Number.isFinite(percent) ? percent : null, unsupportedCurrencies: [...unsupportedCurrencies], complete: unsupportedCurrencies.size === 0 };
}

export function deleteFinancialTransaction(trip, id) {
  const tx = trip.transactions.find(x => x.id === id);
  if (!tx) throw new Error('Операция не найдена.');
  if (tx.currency && tx.currency !== trip.currency && !(tx.baseCurrency === trip.currency && tx.baseAmount !== undefined)) throw new Error('Для отмены этой валютной операции нужен подтверждённый исходный курс. Остатки не изменены.');
  const from = trip.accounts.find(a => a.id === tx.fromId);
  if (!from) throw new Error('Исходный счёт операции не найден.');
  const amount = tx.baseAmount ?? tx.amount;
  if (tx.type === 'transfer') {
    const to = trip.accounts.find(a => a.id === tx.toId);
    if (!to || decimalCompare(to.balance, amount) < 0) throw new Error('Отмена перевода невозможна: на счёте получателя недостаточно средств.');
    setBalance(to, decimalSubtract(to.balance, amount), trip.currency);
  } else if (tx.type !== 'expense') throw new Error('Неизвестный тип финансовой операции.');
  setBalance(from, decimalAdd(from.balance, amount), trip.currency);
  trip.transactions = trip.transactions.filter(x => x.id !== id);
  return tx;
}

export function createDemoData() {
  const japan = createTrip({ title: 'Япония · Токио и Киото', start: '2027-10-12', end: '2027-10-20', currency: 'EUR', total: '2420', withMe: '1920', budget: '2450', destinations: 'Токио, Киото', cover: 'kyoto', description: 'Храмы, осенние прогулки и местная кухня.' });
  japan.id = 'demo-japan'; japan.members = ['Анна', 'Михаил']; japan.day = '2027-10-13';
  const cat = name => japan.categories.find(c => c.name === name).id;
  const expenseRows = [['Перелёты', '620'], ['Проживание', '540'], ['Еда и напитки', '320'], ['Развлечения', '80'], ['Транспорт', '40'], ['Покупки', '20']];
  for (const [name, amount] of expenseRows) addExpense(japan, { amount, fromId: japan.accounts[0].id, categoryId: cat(name), date: Date.UTC(2026, 9, 28, 12) });
  const items = [['Дорожный адаптер', 'Техника'], ['Бальзам для губ', 'Необходимое'], ['Бутылка для воды', 'Необходимое'], ['Дорожный зонт', 'Необходимое'], ['Чехол для документов', 'Необходимое'], ['Лёгкая куртка', 'Одежда'], ['Удобная обувь', 'Одежда'], ['Шляпа / кепка', 'Одежда'], ['Крем SPF 50', 'Необходимое'], ['Зарядное устройство', 'Техника'], ['Футболки', 'Одежда'], ['Носки', 'Одежда'], ['Брюки', 'Одежда'], ['Пауэрбанк', 'Техника'], ['Наушники', 'Техника'], ['Рюкзак', 'Личное'], ['Аптечка', 'Здоровье'], ['Зубная щётка', 'Гигиена'], ['Зубная паста', 'Гигиена'], ['Полотенце', 'Гигиена'], ['Расчёска', 'Гигиена'], ['Солнцезащитные очки', 'Личное'], ['Пижама', 'Одежда'], ['Рубашка', 'Одежда'], ['Документы в дорогу', 'Личное'], ['Салфетки', 'Гигиена'], ['Сандалии', 'Одежда'], ['Купальник', 'Одежда'], ['Книга', 'Личное'], ['Маска для сна', 'Личное'], ['Беруши', 'Личное'], ['Пакет для белья', 'Личное'], ['Ремень', 'Одежда'], ['Шарф', 'Одежда'], ['Перчатки', 'Одежда'], ['Дождевик', 'Одежда']];
  japan.items = items.map(([title, category], i) => ({ id: `demo-item-${i}`, title, quantity: title === 'Футболки' ? 4 : 1, category, status: i < 8 ? 'missing' : i < 24 ? 'home' : 'packed', assignee: i % 2 ? 'Анна' : 'Михаил', note: '', url: '' }));
  japan.tasks = [
    { id: 'demo-task-visa', title: 'Проверить условия въезда', due: '2026-11-01', time: '10:00', zone: 'Europe/Moscow', phase: 'before', assignee: 'Анна', completed: false, reminder: false },
    { id: 'demo-task-adapter', title: 'Купить дорожный адаптер', due: '', time: '', zone: 'Europe/Moscow', phase: 'before', assignee: 'Михаил', completed: false, reminder: false },
    { id: 'demo-task-hotel', title: 'Выбрать жильё в Киото', due: '2026-11-15', time: '', phase: 'before', assignee: 'Анна', completed: false },
    { id: 'demo-task-pack', title: 'Собрать аптечку', due: '', time: '', phase: 'before', assignee: 'Анна', completed: false },
    { id: 'demo-task-souvenir', title: 'Выбрать сувениры', due: '', time: '', phase: 'during', completed: false },
    { id: 'demo-task-flight', title: 'Забронировать перелёт', due: '2026-10-28', time: '', phase: 'before', completed: true },
    { id: 'demo-task-list', title: 'Составить список вещей', due: '2026-10-29', time: '', phase: 'before', completed: true },
  ];
  japan.items[0].taskId = 'demo-task-adapter';
  japan.events = [
    { id: 'demo-event-food', title: 'Японский завтрак', date: '2027-10-13', time: '08:00', category: 'Еда', address: 'Место уточним', note: 'Пробуем местную кухню. Фото иллюстрирует блюдо.', photo: 'assets/photos/japanese-breakfast.jpg', documentId: '' },
    { id: 'demo-event-temple', title: 'Храм Киёмидзу-дэра', date: '2027-10-13', time: '10:00', category: 'Место', address: '1-294 Kiyomizu, Kyoto', note: 'Прогулка по храмовому комплексу', photo: 'assets/photos/kiyomizu-dera.jpg', documentId: '' },
    { id: 'demo-event-city', title: 'Прогулка по Киото', date: '2027-10-13', time: '13:00', category: 'Прогулка', address: 'Центр Киото', note: 'Выбрать место для обеда', photo: 'assets/photos/kyoto-alley.jpg', documentId: '' },
    { id: 'demo-event-evening', title: 'Вечер в Хигасияме', date: '2027-10-13', time: '15:30', category: 'Прогулка', address: 'Киото · Higashiyama', note: 'Улицы, чайные и маленькие магазины', photo: 'assets/photos/candidate-36664010.jpg', documentId: '' },
    { id: 'demo-event-idea', title: 'Прогулка по Арасияме', date: '', time: '', category: 'Идея', address: 'Киото · Arashiyama', note: '', documentId: '' },
  ];
  japan.docs = [
    { id: 'demo-doc-flight', title: 'Перелёт в Токио', category: 'Билеты', note: 'JL 408 · 12 октября, 08:45 · синтетическая запись', audience: 'Только мне', owner: 'Анна', cached: false, eventId: '' },
    { id: 'demo-doc-tokyo', title: 'Отель · Токио', category: 'Брони', note: 'Sakura View · синтетическая запись', audience: 'Только мне', owner: 'Михаил', cached: false, eventId: '' },
    { id: 'demo-doc-kyoto', title: 'Отель · Киото', category: 'Брони', note: 'Riverside Inn · синтетическая запись', audience: 'Только мне', owner: 'Михаил', cached: false, eventId: '' },
    { id: 'demo-doc-sample', title: 'Тестовый маршрут', category: 'Другое', note: 'Синтетический PDF для проверки', audience: 'Только мне', owner: 'Вы', cached: false, eventId: 'demo-event-temple' },
    { id: 'demo-doc-insurance', title: 'Страхование поездки', category: 'Личное', note: 'Демо · настоящего полиса нет', audience: 'Только мне', owner: 'Анна', cached: false, eventId: '' },
    { id: 'demo-doc-esim', title: 'Japan eSIM', category: 'Другое', note: 'Памятка по подключению · запись без файла', audience: 'Только мне', owner: 'Вы', cached: false, eventId: '' },
  ];
  japan.events[1].documentId = 'demo-doc-sample'; japan.pins = ['demo-doc-sample'];
  japan.contacts = [{ id: 'demo-contact', name: 'Отель · тестовая запись', address: 'Учебный адрес, Киото', phone: '', note: 'Синтетический контакт. Настоящее бронирование отсутствует.' }];
  japan.messages = [{ id: 'demo-message-1', author: 'Анна', text: 'Давайте погуляем по вечернему Киото на третий день?', date: Date.UTC(2026, 9, 30, 7, 24), eventId: 'demo-event-idea' }, { id: 'demo-message-2', author: 'Михаил', text: 'Отличная идея! Я за.', date: Date.UTC(2026, 9, 30, 7, 28) }];
  japan.polls = [{ id: 'demo-poll', title: 'Пойдём гулять на третий день?', options: [{ id: 'yes', title: 'Да, идём!', votes: 2 }, { id: 'other', title: 'Посмотрим другие варианты', votes: 0 }], selected: '' }];
  for(const event of japan.events)if(event.photo)event.photo=({'assets/photos/japanese-breakfast.jpg':'breakfast','assets/photos/kiyomizu-dera.jpg':'temple','assets/photos/kyoto-alley.jpg':'kyoto-alley','assets/photos/candidate-36664010.jpg':'kyoto'})[event.photo]||event.photo;
  for(const message of japan.messages){message.time=new Date(message.date).toISOString();if(message.eventId)message.card={title:'Вечерняя прогулка по Киото',photo:'kyoto-alley'};}
  japan.poll={...japan.polls[0],options:japan.polls[0].options.map(option=>({...option,text:option.title})),myVote:''};
  const italy = createTrip({ title: 'Италия · Рим и Амальфи', start: '2028-04-04', end: '2028-04-16', currency: 'EUR', cover: 'amalfi', destinations: 'Рим, Позитано' }); italy.id = 'demo-italy'; italy.members = ['Анна', 'Михаил', 'Ольга'];
  const archive = createTrip({ title: 'Барселона', start: '2026-05-04', end: '2026-05-08', currency: 'EUR', cover: 'barcelona' }); archive.id = 'demo-barcelona'; archive.archived = true;
  return { version: 2, revision: 0, trips: [japan, italy, archive], currentTripId: null, templates: [{ id: 'demo-template', title: 'Мой ручной багаж', items: [{ id: 'demo-tpl-1', title: 'Зарядное устройство', quantity: 1, category: 'Техника' }, { id: 'demo-tpl-2', title: 'Бутылка для воды', quantity: 1, category: 'Личное' }] }], settings: { theme: 'light', language: 'ru' }, profile: { name: '' }, demo: true };
}
