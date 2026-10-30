// DEFERRED FIGMA BUILD — NOT EXECUTED ON THE CANVAS.
// Figma MCP Starter allowance was exhausted after the eight primary screens.
// Run only after access is restored, then inspect real Figma renders before
// describing these additional screens or variants as created or validated.
// Input: const S = saved ledger; const SPEC = additional-screens.json;
// concatenate 03-screen-helpers.js immediately before this script.
// Plain Plugin API JavaScript: top-level await / return; no async IIFE.

const extraPage = await figma.getNodeByIdAsync(S.pages.extra);
if (!extraPage || extraPage.type !== 'PAGE') throw new Error('Additional-screen page is missing. Read the current Figma file and restore the exact page ID before retrying.');
await figma.setCurrentPageAsync(extraPage); // Exactly one page switch.

const specScreens = Array.isArray(SPEC.screens) ? SPEC.screens : [];
if (specScreens.length !== 40) throw new Error('Expected the reviewed inventory of 40 additional screens. Reconcile the specification before running.');
const duplicateNames = specScreens.map(s => 'EXTRA/' + s.id).filter(name => extraPage.children.some(n => n.name === name));
if (duplicateNames.length) throw new Error('Some additional screens already exist. Read the canvas and resume by returned IDs; do not duplicate or remove them: ' + duplicateNames.join(', '));

const extraFrames = [];
const variantFrames = [];
const controlNodes = [];
const propertyNodes = [];
const integrationPending = [];
const validationPending = ['Actual execution in Figma', 'Visual review of every composed frame', 'Check measured text and control heights after execution', 'Compare additional screens with the approved eight-screen system'];

function hugBox(w, direction = 'VERTICAL', background = null, pad = 0, gap = 8) {
  const n = box(w, 1, direction, background, pad, gap, true);
  n.clipsContent = false;
  if (direction === 'HORIZONTAL') {
    n.primaryAxisSizingMode = 'FIXED';
    n.counterAxisSizingMode = 'AUTO';
  }
  return n;
}

function wrapped(s, style = 'Body', color = 'ink', w = 358) {
  const t = tx(String(s), style, color, w);
  t.textAutoResize = 'HEIGHT';
  return t;
}

function fitInstanceText(n, names, w) {
  const measured = [];
  for (const t of n.findAllWithCriteria({types: ['TEXT']})) {
    if (!names.includes(t.name)) continue;
    t.resize(w, 1);
    t.textAutoResize = 'HEIGHT';
    measured.push({id: t.id, name: t.name, width: t.width, height: t.height});
  }
  return measured;
}

function field(parent, label, value, options = {}) {
  const w = options.width || 358;
  const state = options.state || 'Default';
  const hint = options.hint || '';
  const n = instance('Field/' + state, {Label: label, Value: String(value), Hint: hint});
  n.name = 'Поле · ' + label;
  n.resize(w, 1);
  n.primaryAxisSizingMode = 'AUTO';
  n.counterAxisSizingMode = 'FIXED';
  n.counterAxisAlignItems = 'MIN';
  n.clipsContent = false;
  const directText = n.children.filter(k => k.type === 'TEXT');
  for (const t of directText) {
    t.resize(w, 1);
    t.textAutoResize = 'HEIGHT';
    if (t.name === 'field-hint') t.visible = Boolean(hint);
  }
  const slot = n.children.find(k => k.type === 'FRAME' && k.layoutMode === 'HORIZONTAL');
  if (!slot) throw new Error('Field component structure changed: expected the value slot. Inspect Field before continuing.');
  slot.resize(w, 1);
  slot.primaryAxisSizingMode = 'FIXED';
  slot.counterAxisSizingMode = 'AUTO';
  slot.counterAxisAlignItems = 'CENTER';
  slot.clipsContent = false;
  slot.setBoundVariable('paddingTop', vars['space/12']);
  slot.setBoundVariable('paddingBottom', vars['space/12']);
  slot.minHeight = 48;
  const textNodes = fitInstanceText(n, ['field-value'], w - 24);
  add(parent, n);
  n.layoutSizingVertical = 'HUG';
  const properties = n.findAllWithCriteria({types: ['TEXT']}).map(t => ({id: t.id, name: t.name}));
  propertyNodes.push({kind: 'field', nodeId: n.id, label, state, textNodes: properties, measuredValue: textNodes});
  controlNodes.push({kind: 'field', nodeId: n.id, label, state});
  return n;
}

function adaptiveNotice(parent, title, body, tone = 'neutral', w = 358) {
  const variant = tone === 'error' ? 'Error' : tone === 'success' ? 'Success' : tone === 'offline' ? 'Offline' : 'Info';
  const n = instance('Notice/' + variant, {Title: title, Body: body});
  n.name = 'Сообщение · ' + title;
  n.resize(w, 1);
  n.primaryAxisSizingMode = 'AUTO';
  n.counterAxisSizingMode = 'FIXED';
  n.clipsContent = false;
  fitInstanceText(n, ['notice-title', 'notice-body'], w - 24);
  if (tone === 'warning') {
    n.fills = [paint('accentSoft')];
    for (const t of n.findAllWithCriteria({types: ['TEXT']})) if (t.name === 'notice-title') t.fills = [paint('accent')];
  }
  add(parent, n);
  n.layoutSizingVertical = 'HUG';
  propertyNodes.push({kind: 'notice', nodeId: n.id, tone, textNodes: n.findAllWithCriteria({types: ['TEXT']}).map(t => ({id: t.id, name: t.name}))});
  return n;
}

function action(parent, label, style = 'primary', enabled = true, w = 358) {
  const componentStyle = style === 'primary' || style === 'danger' ? 'Primary' : style === 'secondary' ? 'Secondary' : 'Ghost';
  const n = button(label, componentStyle, w, enabled ? 'Default' : 'Disabled');
  n.name = 'Действие · ' + label;
  n.resize(w, 48);
  n.primaryAxisSizingMode = 'FIXED';
  n.counterAxisSizingMode = 'AUTO';
  n.minHeight = 48;
  n.clipsContent = false;
  for (const t of n.findAllWithCriteria({types: ['TEXT']})) {
    t.resize(w - 24, 1);
    t.textAutoResize = 'HEIGHT';
    t.textAlignHorizontal = 'CENTER';
    if (style === 'danger-text') t.fills = [paint('danger')];
  }
  if (style === 'danger') n.fills = [paint('danger')];
  add(parent, n);
  controlNodes.push({kind: 'button', nodeId: n.id, label, enabled});
  return n;
}

function compactRow(parent, title, meta = '', iconName = 'chevron', w = 358) {
  const r = hugBox(w, 'HORIZONTAL', null, 0, 12);
  r.name = 'Строка · ' + title;
  r.minHeight = 56;
  r.counterAxisAlignItems = 'CENTER';
  const textWidth = iconName ? w - 36 : w;
  const textColumn = hugBox(textWidth, 'VERTICAL', null, 0, 4);
  add(textColumn, wrapped(title, 'Label', 'ink', textWidth));
  if (meta) add(textColumn, wrapped(meta, 'Small', 'muted', textWidth));
  add(r, textColumn);
  if (iconName) add(r, icon(iconName, 'accent', 24));
  add(parent, r);
  return r;
}

function option(parent, label, meta, selected, options = {}) {
  const w = options.width || 358;
  const r = hugBox(w, 'HORIZONTAL', selected ? 'accentSoft' : 'card', 12, 8);
  r.name = (options.radio ? 'Радиокнопка · ' : 'Выбор · ') + label;
  round(r, 12);
  r.minHeight = 56;
  r.counterAxisAlignItems = 'CENTER';
  r.strokes = [paint(selected ? 'accent' : 'stroke')];
  r.strokeWeight = 1;
  const selection = instance('Checkbox/' + (selected ? 'True' : 'False'));
  selection.resize(48, 48);
  if (options.radio) {
    for (const k of selection.findAllWithCriteria({types: ['FRAME']})) if (k.width === 20 && k.height === 20) round(k, 999);
  }
  add(r, selection);
  const textColumn = hugBox(w - 80, 'VERTICAL', null, 0, 4);
  add(textColumn, wrapped(label, 'Label', 'ink', w - 80));
  if (meta) add(textColumn, wrapped(meta, 'Small', 'muted', w - 80));
  add(r, textColumn);
  add(parent, r);
  controlNodes.push({kind: options.radio ? 'radio' : 'checkbox', nodeId: r.id, label, selected, enabled: options.enabled !== false});
  if (options.enabled === false) r.opacity = 0.5;
  return r;
}

function switchControl(parent, label, checked, hint = '', disabled = false) {
  const r = hugBox(358, 'HORIZONTAL', null, 0, 12);
  r.name = 'Переключатель · ' + label;
  r.minHeight = 56;
  r.counterAxisAlignItems = 'CENTER';
  const c = hugBox(286, 'VERTICAL', null, 0, 4);
  add(c, wrapped(label, 'Label', 'ink', 286));
  if (hint) add(c, wrapped(hint, 'Small', 'muted', 286));
  add(r, c);
  const target = box(60, 48, 'HORIZONTAL', null, 0, 0);
  target.primaryAxisAlignItems = 'CENTER';
  target.counterAxisAlignItems = 'CENTER';
  const track = box(48, 28, 'HORIZONTAL', checked ? 'success' : 'soft', 4, 0);
  round(track, 999);
  track.primaryAxisAlignItems = checked ? 'MAX' : 'MIN';
  track.counterAxisAlignItems = 'CENTER';
  const thumb = N(figma.createEllipse());
  thumb.resize(20, 20);
  thumb.fills = [paint('card')];
  add(track, thumb);
  add(target, track);
  add(r, target);
  if (disabled) r.opacity = 0.5;
  add(parent, r);
  controlNodes.push({kind: 'switch', nodeId: r.id, label, checked, enabled: !disabled});
  return r;
}

function segmented(parent, options, selected, label, w = 358) {
  const f = hugBox(w, 'HORIZONTAL', 'soft', 4, 4);
  f.name = 'Выбор режима · ' + label;
  round(f, 12);
  const cellWidth = (w - 8 - 4 * (options.length - 1)) / options.length;
  for (const value of options) {
    const cell = chip(value, value === selected, cellWidth);
    cell.name = 'Сегмент · ' + value;
    cell.resize(cellWidth, 48);
    cell.counterAxisSizingMode = 'AUTO';
    cell.minHeight = 48;
    for (const t of cell.findAllWithCriteria({types: ['TEXT']})) {
      t.resize(cellWidth - 12, 1);
      t.textAutoResize = 'HEIGHT';
      t.textAlignHorizontal = 'CENTER';
    }
    add(f, cell);
    controlNodes.push({kind: 'segment', nodeId: cell.id, label: value, selected: value === selected});
  }
  add(parent, f);
  return f;
}

function extraHeader(title, subtitle, back = true) {
  const h = hugBox(390, 'HORIZONTAL', 'bg', 8, 4);
  h.name = 'Шапка · ' + title;
  h.minHeight = 72;
  h.counterAxisAlignItems = 'CENTER';
  if (back) add(h, iconButton('arrow', null, 'ink'));
  const c = hugBox(back ? 262 : 318, 'VERTICAL', null, 0, 4);
  add(c, wrapped(title, 'Heading', 'ink', back ? 262 : 318));
  if (subtitle) add(c, wrapped(subtitle, 'Small', 'muted', back ? 262 : 318));
  add(h, c);
  add(h, iconButton('more', null, 'ink'));
  return h;
}

function activeSection(id) {
  if (/^(item|template)/.test(id)) return 'Сборы';
  if (/^(event|plan|map)/.test(id)) return 'План';
  if (/^document/.test(id)) return 'Документы';
  return 'Поездка';
}

function globalScreen(id) {
  return ['trip-editor', 'profile-auth', 'app-settings', 'local-storage', 'data-export', 'pwa-install', 'notification-settings'].includes(id);
}

function fullScreen(spec, x, y) {
  const compact = spec.kind === 'states';
  const f = hugBox(390, 'VERTICAL', 'bg', 0, 0);
  f.name = 'EXTRA/' + spec.id;
  f.x = x;
  f.y = y;
  f.minHeight = compact ? 0 : 844;
  const stamp = hugBox(390, 'VERTICAL', 'soft', 4, 0);
  add(stamp, wrapped(spec.status === 'integration-design' ? 'Макет · интеграция не подключена' : 'Макет · синтетические данные', 'Caption', 'muted', 382));
  add(f, stamp);
  add(f, extraHeader(spec.title, spec.subtitle));
  const body = hugBox(390, 'VERTICAL', null, 16, 12);
  body.name = 'Полное содержимое · Auto Layout · без обрезки';
  add(f, body);
  if (!compact) {
    const global = globalScreen(spec.id);
    add(f, nav(global ? (spec.id === 'trip-editor' ? 'Создать' : 'Профиль') : activeSection(spec.id), global));
    body.minHeight = Math.max(0, 844 - stamp.height - f.children[1].height - 72);
  }
  const entry = {id: spec.id, title: spec.title, nodeId: f.id, bodyId: body.id, width: 390, height: f.height, designedStatus: spec.status, executionStatus: 'Created by this run; visual validation pending'};
  screens.push(entry);
  extraFrames.push(f);
  if (spec.status === 'integration-design') integrationPending.push({id: spec.id, nodeId: f.id, reason: 'Server or external adapter is not connected; this is an editable design only'});
  return {f, body, entry};
}

function sectionContainer(parent, title, card = false) {
  const contentWidth = card ? 334 : 358;
  const f = hugBox(358, 'VERTICAL', card ? 'card' : null, card ? 12 : 0, 8);
  if (card) round(f, 12);
  f.name = 'Секция · ' + (title || 'Поля и действия');
  if (title) add(f, wrapped(title, 'Heading', 'ink', contentWidth));
  add(parent, f);
  return f;
}

function calendarGrid(parent, calendar) {
  const area = hugBox(358, 'VERTICAL', 'card', 8, 4);
  area.name = 'Редактируемая сетка календаря · 7 колонок';
  round(area, 12);
  const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const columns = 7;
  const cw = 48;
  const header = box(342, 32, 'HORIZONTAL', null, 0, 1);
  for (const day of weekdays) {
    const c = box(cw, 32, 'VERTICAL', null, 0, 0);
    c.primaryAxisAlignItems = 'CENTER';
    c.counterAxisAlignItems = 'CENTER';
    add(c, wrapped(day, 'Small', 'muted', 36));
    add(header, c);
  }
  add(area, header);
  const start = calendar.firstWeekday - 1;
  const weeks = Math.ceil((start + calendar.days) / columns);
  for (let week = 0; week < weeks; week++) {
    const row = box(342, 52, 'HORIZONTAL', null, 0, 1);
    row.name = 'Неделя ' + (week + 1);
    for (let col = 0; col < columns; col++) {
      const day = week * columns + col - start + 1;
      const valid = day > 0 && day <= calendar.days;
      const selected = valid && day === calendar.selected;
      const c = box(cw, 52, 'VERTICAL', selected ? 'accent' : null, 4, 4);
      round(c, 8);
      c.primaryAxisAlignItems = 'CENTER';
      c.counterAxisAlignItems = 'CENTER';
      c.name = valid ? 'День · ' + day : 'Пустая ячейка месяца';
      if (valid) {
        const text = wrapped(String(day), 'Label', selected ? 'onAccent' : 'ink', 36);
        text.textAlignHorizontal = 'CENTER';
        add(c, text);
        if (calendar.marked.includes(day)) {
          const marker = N(figma.createEllipse());
          marker.resize(4, 4);
          marker.fills = [paint(selected ? 'onAccent' : 'accent')];
          add(c, marker);
        }
        controlNodes.push({kind: 'calendar-day', nodeId: c.id, day, selected});
      }
      add(row, c);
    }
    add(area, row);
  }
  add(parent, area);
  return area;
}

function documentPreview(parent) {
  const preview = hugBox(358, 'VERTICAL', 'soft', 16, 12);
  preview.name = 'Просмотр PDF · нативные редактируемые слои';
  round(preview, 12);
  const page = hugBox(326, 'VERTICAL', 'card', 16, 12);
  page.name = 'Тестовый PDF · страница 1 · синтетический макет';
  add(page, wrapped('ТЕСТОВЫЙ МАРШРУТ', 'Heading', 'ink', 294));
  add(page, wrapped('Синтетический документ для проверки просмотра. Не билет и не персональные данные.', 'Small', 'muted', 294));
  add(page, line(294));
  for (const [time, title] of [['10:00', 'Осенняя прогулка'], ['13:00', 'Обед и свободное время'], ['16:00', 'Возвращение к месту встречи']]) {
    const r = hugBox(294, 'HORIZONTAL', null, 0, 8);
    add(r, wrapped(time, 'Small', 'accent', 48));
    add(r, wrapped(title, 'Small', 'ink', 238));
    add(page, r);
  }
  add(preview, page);
  add(preview, wrapped('1 / 1 · пример отображения локального файла', 'Caption', 'muted', 326));
  add(parent, preview);
  controlNodes.push({kind: 'document-preview', nodeId: preview.id, synthetic: true});
}

function indeterminateProgress(parent, title = 'Сохраняем на устройство…') {
  add(parent, wrapped(title, 'Label', 'ink', 358));
  const track = box(358, 8, 'HORIZONTAL', 'soft', 0, 0);
  track.name = 'Неопределённый прогресс · не выдуманный процент';
  round(track, 999);
  const segment = box(112, 8, 'VERTICAL', 'accent');
  round(segment, 999);
  add(track, segment);
  add(parent, track);
}

function specialControls(parent, spec, section, index) {
  if (spec.id === 'item-move' && index === 0) {
    for (const [label, meta] of [['Ещё нет', 'Выбрано сейчас'], ['Дома', 'Вещь есть, но ещё не в багаже'], ['Упаковано', 'Вещь уже лежит в багаже']]) option(parent, label, meta, label === 'Ещё нет', {radio: true});
    return {skipRows: true};
  }
  if (spec.id === 'document-viewer' && index === 0) {
    documentPreview(parent);
    return {skipRows: true};
  }
  if (spec.id === 'document-upload' && index === 0) {
    const drop = hugBox(358, 'VERTICAL', 'card', 16, 8);
    drop.name = 'Выбор настоящего файла · макет загрузчика';
    round(drop, 12);
    drop.strokes = [paint('stroke')];
    drop.strokeWeight = 1;
    add(drop, icon('upload', 'accent', 24));
    add(drop, wrapped('test-itinerary.pdf', 'Label', 'ink', 326));
    add(drop, wrapped('Синтетический файл · PDF · 18 КБ', 'Small', 'muted', 326));
    add(parent, drop);
    return {skipRows: true};
  }
  if (spec.id === 'task-detail' && index === 0) {
    option(parent, 'Купить адаптер', 'Не выполнено · без срока', false);
    return {skipRows: false};
  }
  if (spec.id === 'task-editor' && index === 1) switchControl(parent, 'Одно напоминание', false, 'Сначала назначьте срок', true);
  if (spec.id === 'expense-split' && index === 0) segmented(parent, ['Поровну', 'Заданные доли'], 'Поровну', 'Разделение расхода');
  if (spec.id === 'app-settings' && index === 0) {
    segmented(parent, ['Система', 'Светлая', 'Тёмная'], 'Система', 'Тема');
    return {skipFields: ['Тема']};
  }
  if (spec.id === 'data-export' && index === 0) {
    option(parent, 'Предметные записи', 'Поездки, вещи, задачи, события и записи документов', true);
    option(parent, 'Финансовая история', 'ID, счета, расходы, переводы и точные суммы', true);
    option(parent, 'Локальные файлы', 'Не включены · выберите отдельно', false);
    return {skipRows: true};
  }
  if (spec.id === 'sync-conflict-access' && index === 1) {
    const table = hugBox(358, 'VERTICAL', 'card', 12, 8);
    table.name = 'Сравнение изменённого поля';
    round(table, 12);
    add(table, wrapped('Изменено поле «Количество»', 'Label', 'ink', 334));
    const columns = hugBox(334, 'HORIZONTAL', null, 0, 12);
    for (const [name, value, meta] of [['Моя версия', '2', 'На устройстве'], ['Серверная версия', '1', 'После ответа сервера']]) {
      const c = hugBox(161, 'VERTICAL', null, 0, 4);
      add(c, wrapped(name, 'Small', 'muted', 161));
      add(c, wrapped(value, 'Title', 'ink', 161));
      add(c, wrapped(meta, 'Caption', 'muted', 161));
      add(columns, c);
    }
    add(table, columns);
    add(parent, table);
    return {skipRows: true};
  }
  return {};
}

function renderSection(parent, spec, section, index) {
  const container = sectionContainer(parent, section.title || null);
  const special = specialControls(container, spec, section, index);
  if (section.calendar) calendarGrid(container, section.calendar);
  for (const entry of section.fields || []) {
    if ((special.skipFields || []).includes(entry.label)) continue;
    const isSaveError = spec.id === 'save-error';
    const isChoice = /Категория|Состояние|Валюта|валюта|Ответственный|Счёт|Откуда|Куда|Плательщик|Период|Способ|Тема|Язык|событием|участники/i.test(entry.label);
    const hint = isChoice ? 'Выбрать значение' : entry.label.includes('ссылка') ? 'Допускается корректный URL' : '';
    field(container, entry.label, entry.value, {state: isSaveError && entry.label === 'Название *' ? 'Focus' : 'Default', hint});
  }
  if (!special.skipRows) for (const row of section.rows || []) compactRow(container, row.title, row.meta || '', /недоступ|не добавлен|не измерен|не настроен|не выполнено|Текущее состояние|После/.test(row.title) ? null : 'chevron');
  if (section.notice) {
    const titles = {error: 'Изменения не сохранены', warning: 'Обратите внимание', success: 'Записано на устройстве', neutral: 'Полезно знать'};
    adaptiveNotice(container, titles[section.notice.tone] || 'Состояние', section.notice.text, section.notice.tone);
  }
  for (const a of section.actions || []) action(container, a.label, a.style, a.enabled);
}

// Variants are compact control boards, not a prose list pretending to be screens.
// Only concrete, specified state changes are built. The connected-map variant
// remains explicitly pending until there is a real map provider/asset contract.
function variantBoard(spec, variant, x, y) {
  const key = spec.id + '/' + variant.name;
  if (spec.id === 'map-unavailable') {
    integrationPending.push({id: key, reason: 'Connected map composition needs actual provider, coordinates, and asset rights. No invented map or tracking is generated.'});
    return null;
  }
  const f = hugBox(390, 'VERTICAL', 'bg', 16, 12);
  f.name = 'VARIANT/' + key;
  f.x = x;
  f.y = y;
  round(f, 16);
  add(f, wrapped(spec.title + ' · ' + variant.name, 'Heading', 'ink', 358));
  add(f, wrapped('Макет состояния · синтетический пример', 'Caption', 'muted', 358));

  if (spec.id === 'trip-editor' && variant.name === 'Редактирование') {
    field(f, 'Название *', 'Япония — Токио и Киото');
    field(f, 'Даты', '12–20 октября 2027');
    action(f, 'Сохранить изменения');
    action(f, 'Отмена', 'secondary');
  } else if (spec.id === 'trip-editor') {
    field(f, 'Название *', 'Япония — Токио и Киото');
    field(f, 'Начало', '20 октября 2027');
    field(f, 'Окончание', '12 октября 2027', {state: 'Error', hint: 'Дата окончания раньше даты начала'});
    action(f, 'Сохранить', 'primary', false);
  } else if (spec.id === 'event-detail') {
    compactRow(f, 'День не назначен', 'Храм Киёмидзу-дэра · прежний ID и связи', null);
    action(f, 'Назначить день');
    action(f, 'Редактировать', 'secondary');
  } else if (spec.id === 'document-upload' && variant.name === 'Сохранение') {
    field(f, 'Файл', 'test-itinerary.pdf · 18 КБ', {state: 'Disabled'});
    field(f, 'Название', 'Тестовый маршрут', {state: 'Disabled'});
    indeterminateProgress(f);
    action(f, 'Сохраняем…', 'primary', false);
  } else if (spec.id === 'document-upload') {
    field(f, 'Файл', 'test-script.txt', {state: 'Error', hint: 'Этот тип не поддерживается. Выберите PDF или изображение.'});
    field(f, 'Название', 'Тестовый маршрут');
    field(f, 'Категория', 'Другое');
    action(f, 'Выбрать другой файл', 'secondary');
    action(f, 'Сохранить файл', 'primary', false);
  } else if (spec.id === 'document-viewer') {
    compactRow(f, 'Тестовый маршрут', 'Только запись документа · содержимого нет', null);
    adaptiveNotice(f, 'Файл не добавлен', 'Название и связи сохранены отдельно. Эту запись нельзя открыть или скачать как PDF.');
    action(f, 'Добавить файл');
    action(f, 'Открыть PDF', 'secondary', false);
  } else if (spec.id === 'task-editor') {
    field(f, 'Название *', 'Купить адаптер');
    field(f, 'Срок', '10 ноября 2026');
    field(f, 'Время', '18:00');
    field(f, 'Часовой пояс', 'Europe/Moscow');
    switchControl(f, 'Одно напоминание', false, 'Фоновая доставка не подключена', true);
    action(f, 'Сохранить');
    action(f, 'Убрать срок', 'text');
  } else if (spec.id === 'notification-settings' && variant.name === 'Не запрошено') {
    adaptiveNotice(f, 'Разрешение ещё не запрошено', 'После нажатия браузер может запросить разрешение. Это не включает отсутствующую серверную доставку.');
    action(f, 'Разрешить уведомления');
    action(f, 'Не сейчас', 'secondary');
  } else if (spec.id === 'notification-settings') {
    adaptiveNotice(f, 'Этот браузер не поддерживается', 'Системные уведомления здесь недоступны. Даты и задачи по-прежнему доступны локально.');
    action(f, 'Запросить разрешение', 'primary', false);
    action(f, 'Назад к задачам', 'secondary');
  } else if (spec.id === 'expense-editor') {
    field(f, 'Сумма *', '-24,50', {state: 'Error', hint: 'Введите сумму больше нуля с допустимой точностью для валюты'});
    field(f, 'Категория', 'Еда и напитки');
    field(f, 'Счёт', 'С собой');
    field(f, 'Заметка', 'Обед · введённый текст сохранён');
    action(f, 'Сохранить расход', 'primary', false);
  } else if (spec.id === 'expense-split') {
    segmented(f, ['Поровну', 'Заданные доли'], 'Заданные доли', 'Способ распределения');
    field(f, 'Анна · доля', '14,00 EUR');
    field(f, 'Михаил · доля', '10,50 EUR');
    compactRow(f, 'Итого · 24,50 EUR', 'Точно совпадает с расходом', null);
    adaptiveNotice(f, 'Совместные расчёты не подключены', 'Макет показывает контроль суммы. Серверного сохранения и уведомления участников нет.');
    action(f, 'Сохранить распределение', 'primary', false);
  } else if (spec.id === 'data-export' && variant.name === 'Готово') {
    option(f, 'Записи и финансовая история', 'Состав должен вычисляться из реальных данных', true);
    option(f, 'Локальные файлы', 'В этом варианте не включены', false);
    adaptiveNotice(f, 'Пример готового экспорта', 'В PWA кнопка появится после успешного чтения данных. Размер и состав показываются из созданного файла.');
    action(f, 'Скачать копию');
  } else if (spec.id === 'data-export') {
    adaptiveNotice(f, 'Не удалось прочитать данные', 'Исходные записи сохранены. Повреждённые данные не заменяются синтетикой.', 'error');
    action(f, 'Повторить');
    action(f, 'Скачать исходную копию', 'secondary');
  } else if (spec.id === 'save-error') {
    adaptiveNotice(f, variant.name === 'Отказ доступа' ? 'Доступ к хранилищу запрещён' : 'Запись повреждена', variant.name === 'Отказ доступа' ? 'Браузер запретил запись. Изменения не сохранены; форма и введённые значения остаются.' : 'Прочитать исходную запись не удалось. Не заменяйте её демоданными; сохраните исходную копию перед восстановлением.', 'error');
    field(f, 'Название *', 'Дорожный адаптер');
    field(f, 'Количество *', '2');
    field(f, 'Заметка', 'Введённый текст остаётся видимым');
    action(f, 'Повторить сохранение');
    action(f, 'Экспорт исходных данных', 'secondary');
  } else {
    // No generic prose-only fallback: a new variant must define concrete controls.
    integrationPending.push({id: key, reason: 'No dedicated control composition. Needs scoped design work before claiming completion.'});
    f.remove();
    return null;
  }
  variantFrames.push(f);
  return {id: key, nodeId: f.id, title: variant.name, width: 390, height: f.height};
}

// Five columns; row pitch is measured from actual Auto Layout frame heights.
const columns = 5;
const xStart = 160;
const xPitch = 470;
let yCursor = 120;
for (let start = 0; start < specScreens.length; start += columns) {
  let rowHeight = 0;
  for (let col = 0; col < columns && start + col < specScreens.length; col++) {
    const spec = specScreens[start + col];
    const built = fullScreen(spec, xStart + col * xPitch, yCursor);
    for (let i = 0; i < spec.sections.length; i++) renderSection(built.body, spec, spec.sections[i], i);
    built.entry.height = built.f.height;
    rowHeight = Math.max(rowHeight, built.f.height);
  }
  yCursor += rowHeight + 120;
}

const variants = [];
let vColumn = 0;
let vRowHeight = 0;
for (const spec of specScreens) for (const variant of spec.variants || []) {
  const entry = variantBoard(spec, variant, xStart + vColumn * xPitch, yCursor);
  if (!entry) continue;
  variants.push(entry);
  vRowHeight = Math.max(vRowHeight, entry.height);
  vColumn++;
  if (vColumn === columns) {
    yCursor += vRowHeight + 100;
    vColumn = 0;
    vRowHeight = 0;
  }
}

// Include every instantiated descendant ID, not just instance root IDs.
// Fields and notices expose nested text IDs in propertyNodes as well.
const allCreated = new Set(createdNodeIds);
const frameEvidence = [];
for (const f of [...extraFrames, ...variantFrames]) {
  allCreated.add(f.id);
  const nodes = f.findAll(() => true);
  for (const n of nodes) allCreated.add(n.id);
  const byType = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  frameEvidence.push({id: f.id, name: f.name, width: f.width, height: f.height, clipsContent: f.clipsContent, descendantCount: nodes.length, byType});
}

return {
  createdNodeIds: [...allCreated],
  mutatedNodeIds,
  pageId: extraPage.id,
  screens,
  variants,
  propertyNodes,
  controlNodes,
  frameEvidence,
  imageNodes,
  integrationPending,
  validationPending,
  source: 'additional-screens.json; component instances and shared tokens from the saved design-system ledger',
  count: screens.length,
  variantCount: variants.length,
  executionNote: 'This result exists only after real execution. A saved script alone is not evidence that these screens exist in Figma or that PWA features work.'
};
