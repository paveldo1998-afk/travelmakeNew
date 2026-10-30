(() => {
  "use strict";

  const STORAGE_KEY = "travelorganizer.multitool.v1";
  const SYMBOLS = { JPY: "¥", USD: "$", EUR: "€", RUB: "₽", THB: "฿", KRW: "₩" };
  const ST_NAMES = { missing: "Ещё нет", home: "Дома", packed: "Упаковано" };
  const ST_ORDER = ["missing", "home", "packed"];
  const DEFAULT_CATEGORIES = [
    { name: "Еда", icon: "🍜" },
    { name: "Транспорт", icon: "🚃" },
    { name: "Жильё", icon: "🏨" },
    { name: "Развлечения", icon: "🎫" },
    { name: "Сувениры", icon: "🎁" },
    { name: "Прочее", icon: "•••" },
  ];

  const seedTrip = () => ({
    id: uid(),
    title: "Казань · январь",
    start: "2027-01-10",
    end: "2027-01-14",
    currency: "RUB",
    members: ["Анна", "Борис", "Вера"],
    pins: ["D1"],
    day: "2027-01-12",
    items: [
      { id: "i-aptechka", title: "Аптечка для прогулок и поездки за город", quantity: 2, status: "missing", assignee: "Вера", category: "Здоровье", taskId: "t-buy" },
      { id: "i-rain", title: "Дождевик", quantity: 1, status: "missing", assignee: "Вера", category: "Одежда" },
      { id: "i-charge", title: "Зарядное устройство", quantity: 1, status: "home", assignee: "Борис", category: "Техника" },
      { id: "i-bag", title: "Рюкзак", quantity: 1, status: "home", assignee: "Анна", category: "Личное" },
      { id: "i-water", title: "Бутылка воды", quantity: 1, status: "packed", assignee: "Вера", category: "Личное" },
      { id: "i-socks", title: "Носки", quantity: 3, status: "packed", assignee: "Вера", category: "Одежда" },
    ],
    docs: [
      { id: "D1", title: "Подтверждение проживания", owner: "Борис", audience: "Выбранные участники", cached: true, eventId: "e-hotel" },
      { id: "D2", title: "Билет в музей", owner: "Вера", audience: "Только мне", cached: false, eventId: "e-museum" },
    ],
    events: [
      { id: "e-museum", title: "Музей городской истории", date: "2027-01-12", time: "10:30", address: "Учебная набережная, 4", documentId: "D2" },
      { id: "e-hotel", title: "Заселение в гостевой дом", date: "2027-01-12", time: "15:00", address: "Учебная улица, 10", documentId: "D1" },
      { id: "e-undated", title: "Прогулка по вечернему центру", date: "", time: "", address: "", documentId: "" },
    ],
    tasks: [
      { id: "t-buy", title: "Купить аптечку", due: "2026-11-15", time: "18:00" },
      { id: "t-day", title: "Уточнить вход в гостевой дом", due: "2027-01-12", time: "" },
      { id: "t-undated", title: "Выбрать сувенир", due: "", time: "" },
    ],
    accounts: [
      { id: "a-with", name: "С собой", kind: "withMe", balance: 15000 },
      { id: "a-room", name: "В номере", kind: "storage", balance: 35000 },
    ],
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: "c-" + i, name: c.name, icon: c.icon, sort: i })),
    transactions: [],
  });

  let state = load();
  let view = "trips";
  let search = "";
  let itemFilter = "all";
  let docSearch = "";
  let moneySub = "ledger";
  let drag = null;

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function deep(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (raw && raw.version === 1 && Array.isArray(raw.trips)) {
        return {
          trips: raw.trips,
          currentTripId: raw.currentTripId || null,
          dark: !!raw.dark,
        };
      }
    } catch (_) {}
    const demo = seedTrip();
    return { trips: [demo], currentTripId: null, dark: false };
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          trips: state.trips,
          currentTripId: state.currentTripId,
          dark: state.dark,
        })
      );
    } catch (_) {
      toast("Локальное сохранение заблокировано браузером");
    }
  }

  function trip() {
    return state.trips.find((t) => t.id === state.currentTripId) || null;
  }

  function h(v) {
    return String(v ?? "").replace(/[&<>"']/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
  }

  function attr(v) {
    return h(v);
  }

  function fmt(v) {
    if (!v) return "Без даты";
    return new Date(v + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }

  function displayDay(v) {
    const d = new Date((v || "2027-01-12") + "T12:00:00");
    return {
      n: d.getDate(),
      month: d.toLocaleDateString("ru-RU", { month: "long" }),
      weekday: d.toLocaleDateString("ru-RU", { weekday: "long" }),
      text: d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" }),
    };
  }

  function rangeText(t) {
    if (!t.start && !t.end) return "Даты не заданы";
    if (t.start && t.end) {
      const a = new Date(t.start + "T12:00:00");
      const b = new Date(t.end + "T12:00:00");
      const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
      if (sameMonth) {
        return `${a.getDate()}–${b.getDate()} ${a.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}`;
      }
      return `${fmt(t.start)} — ${fmt(t.end)}`;
    }
    return fmt(t.start || t.end);
  }

  function money(amount, code) {
    const n = Number(amount) || 0;
    const digits = code === "JPY" || code === "KRW" ? 0 : 0;
    const formatted = n.toLocaleString("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    return `${SYMBOLS[code] || code} ${formatted}`;
  }

  function compact(amount, code) {
    const n = Number(amount) || 0;
    const digits = code === "JPY" || code === "KRW" ? 0 : 0;
    return `${SYMBOLS[code] || ""}${n.toLocaleString("ru-RU", { maximumFractionDigits: digits })}`;
  }

  function packCount(t) {
    const p = t.items.filter((x) => x.status === "packed").length;
    const total = t.items.length;
    return { p, t: total, percent: total ? Math.round((p / total) * 100) : null };
  }

  function totalBalance(t) {
    return (t.accounts || []).reduce((s, a) => s + Number(a.balance), 0);
  }

  function totalSpent(t) {
    return (t.transactions || [])
      .filter((x) => x.type === "expense")
      .reduce((s, x) => s + Number(x.amount), 0);
  }

  function btn(label, act, id = "", cls = "") {
    return `<button type="button" class="btn ${cls}" data-act="${act}" data-id="${attr(id)}">${label}</button>`;
  }

  function link(label, page, cls = "") {
    return btn(label, "nav", page, cls);
  }

  function group(title, body, clazz = "") {
    return `<section class="segment ${clazz}"><h2 class="segment-title">${h(title)}</h2>${body}</section>`;
  }

  function emptyText(s) {
    return `<div class="empty">${h(s)}</div>`;
  }

  function progress(t) {
    const c = packCount(t);
    return `<p style="font-size:16px;margin:7px 0 3px">${c.t ? `${c.p} из ${c.t} позиций упаковано · ${c.percent}%` : "Вещей пока нет"}</p>${
      c.t ? `<div class="bar"><div class="done" style="width:${c.percent}%"></div></div>` : ""
    }`;
  }

  function icons(name) {
    const a = {
      home: '<circle cx="12" cy="12" r="9"/><path d="m9 15 2-5 5-2-2 5-5 2Z"/>',
      packing: '<rect x="6" y="5" width="12" height="16" rx="3"/><path d="M9 5V4a3 3 0 0 1 6 0v1M9 10h6M10 15h4"/>',
      plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M8 14h.01M13 14h.01"/>',
      docs: '<path d="M7 3h7l4 4v14H7zM14 3v5h4M9 12h7M9 16h7"/>',
      money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c.8-1 2.2-1.5 3.5-1 1.8.7 1.8 2.5 0 3.2-1.8.7-1.8 2.5 0 3.2 1.3.5 2.7 0 3.5-1"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${a[name] || a.home}</svg>`;
  }

  function isActive(tab) {
    const p = tab || view;
    if (["item", "tasks", "templates"].includes(p) || p.startsWith("item:")) return "packing";
    if (p === "event" || p.startsWith("event:")) return "plan";
    if (p === "doc" || p.startsWith("doc:")) return "docs";
    if (p === "money" || p === "stats") return "money";
    if (p === "about") return "home";
    return p;
  }

  function sub(title, back = "home") {
    return `<div class="back-row"><button data-act="nav" data-id="${back}" aria-label="Назад">‹</button><b>${h(title)}</b></div>`;
  }

  function daysEvents(t) {
    return t.events.filter((e) => e.date === t.day);
  }

  function docRow(d) {
    return `<button class="row-btn" data-act="doc" data-id="${attr(d.id)}"><div class="doc-row"><div class="doc-icon">▤</div><div><p class="doc-title">${h(d.title)}</p><p>Доступ: ${h(d.audience)}</p><p>${d.cached ? "↧ Сохранён на телефоне" : "☁ Нет локальной копии"}</p></div></div></button>`;
  }

  /* ---------- Views ---------- */

  function viewTrips() {
    if (!state.trips.length) {
      return `<p class="cap">TravelOrganizer</p><h1 class="heading">Пока нет поездок</h1><p class="muted">Соберите сборы, план дня, документы и учёт денег в одном месте.</p><div class="vspace"></div>${btn("Создать поездку", "new-trip", "", "primary full")}${btn("Загрузить учебный пример", "load-demo", "", "full")}`;
    }
    return `<p class="cap">TravelOrganizer</p><h1 class="heading">Поездки</h1><p class="muted small">Сборы · план · документы · финансы</p><div class="toolbar">${btn("Новая поездка", "new-trip", "", "primary full")}</div><div class="trip-list">${state.trips
      .map((t) => {
        const c = packCount(t);
        return `<button class="trip-card-btn" data-act="open-trip" data-id="${attr(t.id)}"><h3>${h(t.title)}</h3><p>${h(rangeText(t))} · ${t.members.length} уч.</p><p>${c.t ? `Сборы ${c.percent}%` : "Сборы не начаты"} · остаток ${h(money(totalBalance(t), t.currency))}</p></button>`;
      })
      .join("")}</div>`;
  }

  function viewHome(t) {
    const d = daysEvents(t);
    const pd = t.docs.filter((x) => t.pins.includes(x.id));
    const pins = pd.length
      ? pd.map((x) => `<button class="row-btn" data-act="doc" data-id="${attr(x.id)}"><div class="pinned-line"><span class="pin">⚑</span>${h(x.title)}</div></button>`).join("")
      : '<div class="pinned-line muted small">Под рукой · пока без закреплений</div>';
    const next = d.length ? `${h(d[0].time)} · ${h(d[0].title)}` : "Можно сохранить материал, даже если плана пока нет.";
    const day = displayDay(t.day);
    return `${pins}<section class="day-card"><div class="date-layout"><div class="date-header">${h(day.month)} · ${h(day.weekday)}</div><div class="day-title">${d.length ? `${d.length} события на выбранный день` : "День ещё не спланирован"}</div></div><p class="day-next">${next}</p>${link(d.length ? "Открыть план дня" : "Добавить событие", "plan", "full primary")}</section>${group("Сборы", `${progress(t)}${link("Открыть вещи", "packing", "full")}`, "work")}<div class="divider"></div>${group(
      "Материалы поездки",
      `${t.docs.length ? (pd.length ? pd.map(docRow).join("") : t.docs.slice(0, 2).map(docRow).join("")) : emptyText("Пока нет материалов.")}<button class="link-row" data-act="nav" data-id="docs"><div><strong>Все документы</strong><span>${t.docs.length} доступных документа</span></div><span class="arr">›</span></button>`
    )}${group(
      "Деньги в поездке",
      `<p style="font-size:16px;margin:7px 0 10px">Остаток ${h(money(totalBalance(t), t.currency))} · потрачено ${h(money(totalSpent(t), t.currency))}</p>${link("Открыть учёт денег", "money", "full")}`
    )}`;
  }

  function itemCard(x) {
    const task = trip()?.tasks.find((t) => t.id === x.taskId);
    return `<article class="item-card"><button class="row-btn" data-act="item" data-id="${attr(x.id)}"><h3>${h(x.title)}</h3><p class="sub">${h(x.quantity)} шт. · ${h(x.assignee || "Не назначен")}</p><p class="sub">${h(x.category || "Без категории")}</p>${
      task ? `<div class="related"><span><b>Связанная задача</b>${h(task.title)}${task.due ? " · " + fmt(task.due) : ""}</span><span style="color:var(--accent)">›</span></div>` : ""
    }</button><div class="item-actions">${btn("Состояние: " + ST_NAMES[x.status], "status", x.id, "full")}</div></article>`;
  }

  function viewPacking(t) {
    const c = packCount(t);
    const q = search.toLowerCase();
    const ls = t.items.filter((i) => (i.title + " " + i.category).toLowerCase().includes(q) && (itemFilter === "all" || i.assignee === (t.members[0] || "Вера")));
    return `<p class="cap">Сборы · общий список</p><h1 class="heading">Вещи</h1><p style="font-weight:650">${c.t ? `${c.p} из ${c.t} позиций упаковано · ${c.percent}%` : "Вещей пока нет"}</p><p class="small muted">Считаются позиции, не количество штук.</p><div class="toolbar">${btn("Добавить вещь", "add-item", "", "primary full")}<div class="search-box"><label for="find-item">Найти вещь</label><input id="find-item" type="search" placeholder="Название или категория" value="${attr(search)}" autocomplete="off"></div></div><button class="link-row" data-act="nav" data-id="templates"><div><strong>Мои шаблоны</strong><span>Создать, применить или скопировать</span></div><span class="arr">›</span></button><button class="link-row" data-act="nav" data-id="tasks"><div><strong>Задачи</strong><span>${t.tasks.length} задач</span></div><span class="arr">›</span></button><div class="filter-row"><label for="assignee-filter"><b>Ответственные</b></label><select id="assignee-filter"><option value="all" ${itemFilter === "all" ? "selected" : ""}>Все · ${ls.length}</option><option value="me" ${itemFilter === "me" ? "selected" : ""}>Только мои</option></select></div>${ST_ORDER.map(
      (k) => `<section class="state-group"><h2 class="group-title">${h(ST_NAMES[k])}<span class="count">${ls.filter((x) => x.status === k).length}</span></h2>${ls.filter((x) => x.status === k).map(itemCard).join("") || emptyText("В этой группе пока пусто.")}</section>`
    ).join("")}`;
  }

  function viewTasks(t) {
    return (
      sub("Задачи", "packing") +
      '<h1 class="heading">Задачи</h1>' +
      btn("Добавить задачу", "add-task", "", "full primary") +
      t.tasks.map((task) => `<div class="info-card" style="margin-top:12px"><b>${h(task.title)}</b><small>${task.due ? "Срок: " + fmt(task.due) : "Без срока"}</small></div>`).join("")
    );
  }

  function viewTemplates() {
    return (
      sub("Мои шаблоны", "packing") +
      '<h1 class="heading">Личные шаблоны</h1><div class="info-card"><h3 style="margin-top:0">Выходные</h3><p>Аптечка · Зарядное устройство · Дождевик · Бутылка воды</p><p class="muted small">При применении создаётся новый набор вещей «Ещё нет».</p>' +
      btn("Применить шаблон", "apply-template", "", "full primary") +
      "</div>"
    );
  }

  function viewItem(t, id) {
    const x = t.items.find((z) => z.id === id);
    if (!x) return emptyText("Вещь не найдена.");
    const task = t.tasks.find((z) => z.id === x.taskId);
    return (
      sub("Детали вещи", "packing") +
      `<h1 class="heading">${h(x.title)}</h1><p class="chip">${h(ST_NAMES[x.status])}</p><p class="detail-p">${h(x.quantity)} шт. · ${h(x.category)} · ${h(x.assignee || "Не назначен")}</p>` +
      btn("Изменить состояние", "status", x.id, "full primary") +
      (task ? `<div class="section-line"></div><h2 class="subheading">Связанная задача</h2><div class="info-card"><b>${h(task.title)}</b><small>${task.due ? fmt(task.due) : "Без срока"}</small></div>` : "")
    );
  }

  function eventCard(t, e) {
    const d = t.docs.find((x) => x.id === e.documentId);
    return `<article class="event"><div class="when">${h(e.time || "Без времени")} · Europe/Moscow</div><button class="row-btn" data-act="event" data-id="${attr(e.id)}"><h3 class="event-title">${h(e.title)}</h3><p class="address">${h(e.address || "Адрес не указан")}</p>${
      d ? `<p class="assoc"><b>${h(d.title)}</b><br>${d.cached ? "Сохранён на телефоне" : "Нет локальной копии"}</p>` : ""
    }</button></article>`;
  }

  function viewPlan(t) {
    const date = displayDay(t.day);
    return `<p class="cap">Ручной план</p><h1 class="heading">План дня</h1><section class="date-picker"><h3>${h(date.text)}</h3><div class="field-row"><label for="selected-date">Выбрать день</label><input id="selected-date" type="date" value="${h(t.day || "")}"></div></section>${btn("Добавить событие", "add-event", "", "full primary")}<div class="timeline">${
      daysEvents(t).length ? daysEvents(t).map((e) => eventCard(t, e)).join("") : emptyText("В выбранный день событий нет.")
    }</div>${group(
      "Задачи на " + fmt(t.day),
      t.tasks.filter((task) => task.due === t.day).map((task) => `<div class="link-row"><div><strong>${h(task.title)}</strong><span>Без напоминания</span></div></div>`).join("") || emptyText("На эту дату задач нет.")
    )}<div class="section-line"></div>${group(
      "События без дня",
      t.events.filter((e) => !e.date).map((e) => `<button class="link-row" data-act="event" data-id="${attr(e.id)}"><div><strong>${h(e.title)}</strong><span>День не назначен</span></div><span class="arr">›</span></button>`).join("") || emptyText("Событий без даты нет.")
    )}${group("Задачи без срока", t.tasks.filter((task) => !task.due).map((task) => `<p>${h(task.title)}</p>`).join("") || emptyText("Таких задач нет."))}`;
  }

  function viewEvent(t, id) {
    const e = t.events.find((x) => x.id === id);
    if (!e) return emptyText("Событие не найдено");
    const d = t.docs.find((x) => x.id === e.documentId);
    return (
      sub("Событие", "plan") +
      `<h1 class="heading">${h(e.title)}</h1><p>${e.date ? fmt(e.date) : "Без дня"} · ${h(e.time || "Без времени")}</p><div class="info-card"><b>Адрес</b><p>${h(e.address || "Не указан")}</p>${e.address ? btn("Скопировать адрес", "copy-address", e.id, "tiny") : ""}</div><h2 class="subheading">Документ</h2>` +
      (d ? docRow(d) : emptyText("Документ не привязан"))
    );
  }

  function viewDocs(t) {
    return `<h1 class="heading">Документы</h1>${btn("Добавить документ", "add-doc", "", "full primary")}<div class="search-box" style="margin:15px 0"><label for="find-doc">Найти документ</label><input id="find-doc" type="search" placeholder="Название" value="${attr(docSearch)}"></div>${
      t.docs.filter((d) => d.title.toLowerCase().includes(docSearch.toLowerCase())).map(docRow).join("") || emptyText("Документов по запросу нет.")
    }<p class="small muted">Закрепить — не значит скачать или открыть доступ другим участникам.</p>`;
  }

  function viewDoc(t, id) {
    const d = t.docs.find((x) => x.id === id);
    if (!d) return emptyText("Документ не найден");
    const p = t.pins.includes(d.id);
    return (
      sub("Документ", "docs") +
      `<h1 class="heading">${h(d.title)}</h1><div class="info-grid"><div class="info-card"><b>Аудитория</b><small>${h(d.audience)}</small></div><div class="info-card"><b>Локальная копия</b><small>${d.cached ? "Сохранён на телефоне" : "Нет локальной копии"}</small></div><div class="info-card"><b>Закрепление</b><small>${p ? "Под рукой лично у вас" : "Не закреплено"}</small></div></div><div class="actions-stack">${btn(d.cached ? "Открыть учебную запись" : "Просмотреть учебный документ", "open-doc", d.id, "full primary")}${btn(d.cached ? "Удалить локальную копию" : "Сохранить на телефон", "toggle-copy", d.id, "full")}${btn(p ? "Убрать из «Под рукой»" : "Закрепить под рукой", "toggle-pin", d.id, "full")}</div><p class="muted small">В этом прототипе нет настоящего файла — только локальная запись.</p>`
    );
  }

  function viewAbout(t) {
    return (
      sub("О поездке", "home") +
      '<h1 class="heading">Организация поездки</h1>' +
      [
        ["Участники", t.members.join(", ") || "Пока никого"],
        ["Даты", rangeText(t)],
        ["Валюта", `${t.currency} (${SYMBOLS[t.currency] || t.currency})`],
      ]
        .map(([k, v]) => `<div class="info-card" style="margin-bottom:10px"><b>${h(k)}</b><small>${h(v)}</small></div>`)
        .join("") +
      `<button class="link-row" data-act="nav" data-id="money"><div><strong>Расходы и счета</strong><span>Учёт наличных в поездке</span></div><span class="arr">›</span></button>` +
      btn(state.dark ? "Светлая тема" : "Тёмная тема", "toggle-theme", "", "full") +
      btn("Выйти к списку поездок", "leave-trip", "", "full") +
      btn("Удалить поездку", "delete-trip", "", "full")
    );
  }

  function viewMoney(t) {
    if (moneySub === "stats") return viewStats(t);
    const bal = totalBalance(t);
    const spent = totalSpent(t);
    return `<p class="cap">Финансы поездки</p><h1 class="heading">Деньги</h1><div class="money-summary"><div><span>Баланс</span><strong>${h(money(bal, t.currency))}</strong></div><div><span>Расходы</span><strong>${h(money(spent, t.currency))}</strong></div><div><span>Валюта</span><strong>${h(SYMBOLS[t.currency] || t.currency)}</strong></div></div><p class="hint">Удерживайте счёт → введите сумму → перетащите на категорию или другой счёт</p><div class="section-label">Счета</div><div id="accounts-row" class="circles-row">${t.accounts
      .map(
        (a) => `<button type="button" class="circle-item" data-role="account" data-id="${attr(a.id)}"><div class="circle">${h(compact(a.balance, t.currency))}</div><small>${h(a.name)}</small></button>`
      )
      .join("")}</div><div class="section-label row-between" style="display:flex;justify-content:space-between;align-items:center"><span>Расходы</span>${btn("+ категория", "add-category", "", "tiny")}</div><div id="categories-grid" class="circles-grid">${t.categories
      .map(
        (c) => `<button type="button" class="circle-item" data-role="category" data-id="${attr(c.id)}"><div class="circle">${h(c.icon)}</div><small>${h(c.name)}</small></button>`
      )
      .join("")}</div>${btn("Статистика", "nav", "stats", "full")}`;
  }

  function viewStats(t) {
    const bal = totalBalance(t);
    const spent = totalSpent(t);
    const byCat = {};
    t.transactions.filter((x) => x.type === "expense").forEach((x) => {
      byCat[x.categoryId] = (byCat[x.categoryId] || 0) + Number(x.amount);
    });
    const rows = t.categories
      .map((c) => ({ c, amount: byCat[c.id] || 0 }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const max = rows[0]?.amount || 1;
    return (
      sub("Статистика", "money") +
      `<h1 class="heading">Статистика</h1><div class="stats-cards"><div class="stat-card"><span>Остаток</span><strong>${h(money(bal, t.currency))}</strong></div><div class="stat-card"><span>Потрачено</span><strong>${h(money(spent, t.currency))}</strong></div></div><h2 class="subheading">По категориям</h2>${
        rows.length
          ? `<div class="cat-bars">${rows
              .map(
                (r) => `<div class="cat-bar-row"><span>${h(r.c.icon)}</span><div class="cat-bar-track"><div class="cat-bar-fill" style="width:${Math.round((r.amount / max) * 100)}%"></div></div><span>${h(money(r.amount, t.currency))}</span></div>`
              )
              .join("")}</div>`
          : emptyText("Расходов пока нет.")
      }<h2 class="subheading">История</h2><div class="tx-list">${
        t.transactions.length
          ? [...t.transactions]
              .reverse()
              .slice(0, 20)
              .map((x) => {
                if (x.type === "expense") {
                  const cat = t.categories.find((c) => c.id === x.categoryId);
                  const from = t.accounts.find((a) => a.id === x.fromId);
                  return `<div class="tx-row"><div><b>${h(cat?.icon || "")} ${h(cat?.name || "Расход")}</b><div class="muted">${h(from?.name || "")}</div></div><div>−${h(money(x.amount, t.currency))}</div></div>`;
                }
                const from = t.accounts.find((a) => a.id === x.fromId);
                const to = t.accounts.find((a) => a.id === x.toId);
                return `<div class="tx-row"><div><b>Перевод</b><div class="muted">${h(from?.name || "")} → ${h(to?.name || "")}</div></div><div>${h(money(x.amount, t.currency))}</div></div>`;
              })
              .join("")
          : emptyText("Операций пока нет.")
      }</div>`
    );
  }

  function pageHtml() {
    if (view === "trips") return viewTrips();
    const t = trip();
    if (!t) return viewTrips();
    if (view === "home") return viewHome(t);
    if (view === "packing") return viewPacking(t);
    if (view === "plan") return viewPlan(t);
    if (view === "docs") return viewDocs(t);
    if (view === "money") return viewMoney(t);
    if (view === "stats") return viewStats(t);
    if (view === "about") return viewAbout(t);
    if (view === "tasks") return viewTasks(t);
    if (view === "templates") return viewTemplates();
    if (view.startsWith("item:")) return viewItem(t, view.split(":")[1]);
    if (view.startsWith("event:")) return viewEvent(t, view.split(":")[1]);
    if (view.startsWith("doc:")) return viewDoc(t, view.split(":")[1]);
    return viewHome(t);
  }

  function render() {
    const t = trip();
    const inTrip = !!t && view !== "trips";
    document.body.classList.toggle("dark", !!state.dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.dark ? "#101D2B" : "#EFF4F8");

    const heading = document.getElementById("trip-heading");
    const meta = document.getElementById("trip-meta");
    const actions = document.getElementById("header-actions");
    const nav = document.getElementById("nav");

    if (!inTrip) {
      heading.textContent = "TravelOrganizer";
      meta.textContent = "Мультитул для путешественников";
      actions.innerHTML = btn(state.dark ? "Светлая" : "Тёмная", "toggle-theme", "", "tiny");
      nav.classList.add("hidden");
      nav.innerHTML = "";
    } else {
      heading.textContent = t.title;
      meta.textContent = `${rangeText(t)} · ${t.members.length} ${t.members.length === 1 ? "участник" : "участника"}`;
      actions.innerHTML = `<button class="header-about" data-act="nav" data-id="about">О поездке</button>`;
      nav.classList.remove("hidden");
      nav.innerHTML = [
        ["home", "Поездка"],
        ["packing", "Сборы"],
        ["plan", "План"],
        ["docs", "Документы"],
        ["money", "Деньги"],
      ]
        .map(
          ([name, label]) =>
            `<button class="nav-btn ${isActive(view) === name ? "active" : ""}" data-act="nav" data-id="${name}" aria-label="${label}" aria-current="${isActive(view) === name ? "page" : "false"}">${icons(name)}<span>${label}</span></button>`
        )
        .join("");
    }

    document.getElementById("content").innerHTML = `<div class="page-inner">${pageHtml()}</div>`;
    if (view === "money") bindMoneyInteractions();
  }

  function navTo(page) {
    if (page === "stats") {
      view = "stats";
      moneySub = "stats";
    } else if (page === "money") {
      view = "money";
      moneySub = "ledger";
    } else {
      view = page || "home";
      if (view === "money") moneySub = "ledger";
    }
    save();
    render();
    document.getElementById("content").scrollTop = 0;
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), 2800);
  }

  function modal(title, body, buttons = "") {
    document.getElementById("dialog-body").innerHTML = `<h2 id="dialog-head">${h(title)}</h2>${body}${buttons ? `<div class="dialog-actions">${buttons}</div>` : ""}`;
    document.getElementById("dialog").showModal();
  }

  function closeModal() {
    document.getElementById("dialog").close();
  }

  function formButtons() {
    return `<button class="btn" type="button" data-act="close">Отмена</button><button class="btn primary" type="submit">Сохранить</button>`;
  }

  /* ---------- Forms ---------- */

  function formNewTrip() {
    modal(
      "Новая поездка",
      `<form id="trip-form"><div class="field-row"><label for="trip-title">Название</label><input id="trip-title" name="title" required maxlength="80" placeholder="Например, Казань · январь"></div><div class="field-row"><label for="trip-start">Начало</label><input id="trip-start" type="date" name="start"></div><div class="field-row"><label for="trip-end">Конец</label><input id="trip-end" type="date" name="end"></div><div class="field-row"><label for="trip-currency">Валюта</label><select id="trip-currency" name="currency">${Object.keys(SYMBOLS)
        .map((c) => `<option value="${c}" ${c === "RUB" ? "selected" : ""}>${c} ${SYMBOLS[c]}</option>`)
        .join("")}</select></div><div class="field-row"><label for="trip-total">Наличные всего</label><input id="trip-total" type="number" name="total" value="50000" min="0" step="1"></div><div class="field-row"><label for="trip-with">С собой</label><input id="trip-with" type="number" name="withMe" value="10000" min="0" step="1"></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function chooseStatus(id) {
    const t = trip();
    const x = t?.items.find((i) => i.id === id);
    if (!x) return;
    modal(
      "Состояние вещи",
      `<p class="small">${h(x.title)}</p><form id="status-form" data-id="${attr(id)}"><div class="field-row"><label for="new-status">Новое состояние</label><select id="new-status" name="status">${ST_ORDER.map((s) => `<option value="${s}" ${s === x.status ? "selected" : ""}>${h(ST_NAMES[s])}</option>`).join("")}</select></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formItem() {
    modal(
      "Добавить вещь",
      `<form id="item-form"><div class="field-row"><label for="item-title">Название</label><input id="item-title" name="title" required maxlength="120" placeholder="Например, переходник"></div><div class="field-row"><label for="item-qty">Количество</label><input id="item-qty" type="number" name="quantity" value="1" min="1" max="999" required></div><div class="field-row"><label for="item-cat">Категория</label><select id="item-cat" name="category">${["Личное", "Одежда", "Техника", "Здоровье", "Документы"].map((s) => `<option>${s}</option>`).join("")}</select></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formEvent() {
    const t = trip();
    modal(
      "Добавить событие",
      `<form id="event-form"><div class="field-row"><label for="event-title">Название</label><input id="event-title" name="title" required maxlength="120" placeholder="Новое место"></div><div class="field-row"><label for="event-date">День (необязательно)</label><input type="date" name="date" id="event-date" value="${h(t?.day || "")}"></div><div class="field-row"><label for="event-time">Время (необязательно)</label><input type="time" name="time" id="event-time"></div><div class="field-row"><label for="event-address">Адрес</label><input name="address" id="event-address"></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formTask() {
    modal(
      "Добавить задачу",
      `<form id="task-form"><div class="field-row"><label for="task-title">Название</label><input id="task-title" name="title" required maxlength="120"></div><div class="field-row"><label for="task-due">Срок (необязательно)</label><input type="date" id="task-due" name="due"></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formDoc() {
    modal(
      "Добавить документ",
      `<form id="doc-form"><div class="field-row"><label for="doc-title">Название</label><input id="doc-title" name="title" required maxlength="120"></div><div class="field-row"><label for="doc-audience">Кому виден</label><select id="doc-audience" name="audience"><option>Только мне</option><option>Выбранные участники</option><option>Все участники поездки</option></select></div><p class="small muted">Настоящий файл не загружается — создаётся локальная запись.</p><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formAmount(accountId) {
    const t = trip();
    const a = t?.accounts.find((x) => x.id === accountId);
    if (!a) return;
    modal(
      "Сумма",
      `<p class="small">Со счёта «${h(a.name)}» · доступно ${h(money(a.balance, t.currency))}</p><form id="amount-form" data-id="${attr(accountId)}"><div class="field-row"><label for="amount-value">Сколько взять</label><input id="amount-value" name="amount" type="number" min="1" max="${Math.floor(a.balance)}" step="1" required autofocus></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  function formCategory() {
    modal(
      "Новая категория",
      `<form id="category-form"><div class="field-row"><label for="cat-name">Название</label><input id="cat-name" name="name" required maxlength="40"></div><div class="field-row"><label for="cat-icon">Иконка</label><input id="cat-icon" name="icon" maxlength="4" value="✦"></div><div class="dialog-actions">${formButtons()}</div></form>`
    );
  }

  /* ---------- Money drag ---------- */

  function clearDrag() {
    drag = null;
    document.getElementById("coin-ghost").classList.add("hidden");
    document.querySelectorAll(".circle-item").forEach((el) => el.classList.remove("drag-source", "drop-target"));
  }

  function bindMoneyInteractions() {
    const t = trip();
    if (!t) return;
    const accounts = document.querySelectorAll('[data-role="account"]');
    accounts.forEach((el) => {
      let pressTimer = null;
      const startPress = (ev) => {
        if (drag) return;
        pressTimer = setTimeout(() => {
          formAmount(el.dataset.id);
        }, 420);
      };
      const cancelPress = () => clearTimeout(pressTimer);
      el.addEventListener("pointerdown", startPress);
      el.addEventListener("pointerup", cancelPress);
      el.addEventListener("pointerleave", cancelPress);
      el.addEventListener("pointercancel", cancelPress);
      el.addEventListener("click", (ev) => {
        if (drag && drag.accountId !== el.dataset.id) {
          ev.preventDefault();
          doTransfer(drag.accountId, el.dataset.id, drag.amount);
          clearDrag();
          render();
        }
      });
    });

    document.querySelectorAll('[data-role="category"]').forEach((el) => {
      el.addEventListener("click", () => {
        if (!drag) {
          toast("Сначала удерживайте счёт и введите сумму");
          return;
        }
        doExpense(drag.accountId, el.dataset.id, drag.amount);
        clearDrag();
        render();
      });
    });

    if (drag) {
      const src = document.querySelector(`[data-role="account"][data-id="${drag.accountId}"]`);
      src?.classList.add("drag-source");
      const ghost = document.getElementById("coin-ghost");
      ghost.textContent = compact(drag.amount, t.currency);
      ghost.classList.remove("hidden");
    }
  }

  function doExpense(fromId, categoryId, amount) {
    const t = trip();
    const account = t.accounts.find((a) => a.id === fromId);
    const category = t.categories.find((c) => c.id === categoryId);
    if (!account || !category || amount <= 0 || account.balance < amount) {
      toast("Недостаточно средств");
      return false;
    }
    account.balance -= amount;
    t.transactions.push({ id: uid(), type: "expense", amount, fromId, categoryId, date: Date.now() });
    save();
    toast(`−${money(amount, t.currency)} · ${category.name}`);
    return true;
  }

  function doTransfer(fromId, toId, amount) {
    const t = trip();
    if (fromId === toId) return false;
    const from = t.accounts.find((a) => a.id === fromId);
    const to = t.accounts.find((a) => a.id === toId);
    if (!from || !to || amount <= 0 || from.balance < amount) {
      toast("Недостаточно средств");
      return false;
    }
    from.balance -= amount;
    to.balance += amount;
    t.transactions.push({ id: uid(), type: "transfer", amount, fromId, toId, date: Date.now() });
    save();
    toast(`Перевод ${money(amount, t.currency)}`);
    return true;
  }

  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const ghost = document.getElementById("coin-ghost");
    ghost.style.left = e.clientX + "px";
    ghost.style.top = e.clientY + "px";
    document.querySelectorAll(".circle-item").forEach((el) => {
      const r = el.getBoundingClientRect();
      const hit = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      el.classList.toggle("drop-target", hit && el.dataset.id !== drag.accountId);
    });
  });

  document.addEventListener("pointerup", (e) => {
    if (!drag || view !== "money") return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(".circle-item");
    if (el && el.dataset.id !== drag.accountId) {
      if (el.dataset.role === "category") doExpense(drag.accountId, el.dataset.id, drag.amount);
      if (el.dataset.role === "account") doTransfer(drag.accountId, el.dataset.id, drag.amount);
      clearDrag();
      render();
    }
  });

  /* ---------- Actions ---------- */

  function doAction(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const id = b.dataset.id;

    if (act === "nav") {
      if (!trip() && id !== "trips") {
        view = "trips";
        render();
        return;
      }
      navTo(id);
      return;
    }
    if (act === "close") {
      closeModal();
      return;
    }
    if (act === "toggle-theme") {
      state.dark = !state.dark;
      save();
      render();
      return;
    }
    if (act === "new-trip") {
      formNewTrip();
      return;
    }
    if (act === "load-demo") {
      const demo = seedTrip();
      state.trips.unshift(demo);
      save();
      render();
      toast("Учебный пример добавлен");
      return;
    }
    if (act === "open-trip") {
      state.currentTripId = id;
      view = "home";
      save();
      render();
      return;
    }
    if (act === "leave-trip") {
      state.currentTripId = null;
      view = "trips";
      clearDrag();
      save();
      render();
      return;
    }
    if (act === "delete-trip") {
      modal("Удалить поездку", "<p>Удалить текущую поездку и все локальные данные по ней?</p>", `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="confirm-delete">Удалить</button>`);
      return;
    }
    if (act === "confirm-delete") {
      state.trips = state.trips.filter((x) => x.id !== state.currentTripId);
      state.currentTripId = null;
      view = "trips";
      save();
      closeModal();
      render();
      toast("Поездка удалена");
      return;
    }
    if (act === "item") {
      navTo("item:" + id);
      return;
    }
    if (act === "doc") {
      navTo("doc:" + id);
      return;
    }
    if (act === "event") {
      navTo("event:" + id);
      return;
    }
    if (act === "status") {
      chooseStatus(id);
      return;
    }
    if (act === "add-item") {
      formItem();
      return;
    }
    if (act === "add-event") {
      formEvent();
      return;
    }
    if (act === "add-task") {
      formTask();
      return;
    }
    if (act === "add-doc") {
      formDoc();
      return;
    }
    if (act === "add-category") {
      formCategory();
      return;
    }
    if (act === "apply-template") {
      modal("Применить шаблон", "<p>Добавить 4 позиции в состоянии «Ещё нет»?</p>", `<button class="btn" data-act="close">Отмена</button><button class="btn primary" data-act="confirm-template">Добавить вещи</button>`);
      return;
    }
    if (act === "confirm-template") {
      const t = trip();
      ["Аптечка", "Зарядное устройство", "Дождевик", "Бутылка воды"].forEach((title, i) =>
        t.items.push({ id: "tpl-" + Date.now() + "-" + i, title, quantity: 1, status: "missing", assignee: "", category: "Личное" })
      );
      save();
      closeModal();
      navTo("packing");
      toast("Вещи из шаблона добавлены");
      return;
    }
    if (act === "toggle-pin") {
      const t = trip();
      if (t.pins.includes(id)) t.pins = t.pins.filter((x) => x !== id);
      else t.pins.push(id);
      save();
      render();
      return;
    }
    if (act === "toggle-copy") {
      const d = trip().docs.find((x) => x.id === id);
      if (!d) return;
      d.cached = !d.cached;
      save();
      render();
      toast(d.cached ? "Локальная копия отмечена" : "Локальная копия удалена");
      return;
    }
    if (act === "open-doc") {
      const d = trip().docs.find((x) => x.id === id);
      if (d) toast("Открыта учебная запись: " + d.title);
      return;
    }
    if (act === "copy-address") {
      const ev = trip().events.find((x) => x.id === id);
      if (ev?.address && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(ev.address).then(() => toast("Адрес скопирован"), () => toast(ev.address));
      } else toast(ev?.address || "Адрес не указан");
      return;
    }
  }

  document.addEventListener("click", doAction);

  document.addEventListener("change", (e) => {
    const t = trip();
    if (!t) return;
    if (e.target.id === "selected-date") {
      t.day = e.target.value || t.day;
      save();
      render();
    }
    if (e.target.id === "assignee-filter") {
      itemFilter = e.target.value;
      render();
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "find-item") {
      search = e.target.value;
      const cursor = e.target.selectionStart;
      render();
      const x = document.getElementById("find-item");
      if (x) {
        x.focus();
        x.setSelectionRange(cursor, cursor);
      }
    }
    if (e.target.id === "find-doc") {
      docSearch = e.target.value;
      const cursor = e.target.selectionStart;
      render();
      const x = document.getElementById("find-doc");
      if (x) {
        x.focus();
        x.setSelectionRange(cursor, cursor);
      }
    }
  });

  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (!["trip-form", "status-form", "item-form", "event-form", "task-form", "doc-form", "amount-form", "category-form"].includes(f.id)) return;
    e.preventDefault();
    const d = new FormData(f);
    const t = trip();

    if (f.id === "trip-form") {
      const totalN = Math.max(0, Number(d.get("total")) || 0);
      const withMeN = Math.min(Math.max(0, Number(d.get("withMe")) || 0), totalN);
      const start = d.get("start") || "";
      const newTrip = {
        id: uid(),
        title: String(d.get("title") || "").trim() || "Поездка",
        start,
        end: d.get("end") || start,
        currency: d.get("currency") || "RUB",
        members: ["Вы"],
        pins: [],
        day: start || new Date().toISOString().slice(0, 10),
        items: [],
        docs: [],
        events: [],
        tasks: [],
        accounts: [
          { id: uid(), name: "С собой", kind: "withMe", balance: withMeN },
          { id: uid(), name: "В номере", kind: "storage", balance: totalN - withMeN },
        ],
        categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: uid(), name: c.name, icon: c.icon, sort: i })),
        transactions: [],
      };
      state.trips.unshift(newTrip);
      state.currentTripId = newTrip.id;
      view = "home";
      save();
      closeModal();
      render();
      toast("Поездка создана");
      return;
    }

    if (!t) return;

    if (f.id === "status-form") {
      const x = t.items.find((x) => x.id === f.dataset.id);
      if (x) x.status = d.get("status");
    } else if (f.id === "item-form") {
      t.items.push({ id: uid(), title: String(d.get("title")).trim(), quantity: Number(d.get("quantity")), category: d.get("category"), status: "missing", assignee: "", taskId: "" });
    } else if (f.id === "event-form") {
      t.events.push({ id: uid(), title: String(d.get("title")).trim(), date: d.get("date"), time: d.get("time"), address: d.get("address"), documentId: "" });
    } else if (f.id === "task-form") {
      t.tasks.push({ id: uid(), title: String(d.get("title")).trim(), due: d.get("due"), time: "" });
    } else if (f.id === "doc-form") {
      t.docs.push({ id: "D-" + Date.now(), title: String(d.get("title")).trim(), audience: d.get("audience"), owner: "Вы", cached: false, eventId: "" });
    } else if (f.id === "amount-form") {
      const amount = Number(d.get("amount"));
      const account = t.accounts.find((a) => a.id === f.dataset.id);
      if (!account || !(amount > 0) || amount > account.balance) {
        toast("Проверьте сумму");
        return;
      }
      drag = { accountId: account.id, amount };
      closeModal();
      render();
      toast("Перетащите на категорию или другой счёт");
      return;
    } else if (f.id === "category-form") {
      t.categories.push({ id: uid(), name: String(d.get("name")).trim(), icon: String(d.get("icon") || "✦").trim().slice(0, 4), sort: t.categories.length });
    }

    save();
    closeModal();
    render();
    toast("Сохранено");
  });

  document.getElementById("dialog").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  if (state.currentTripId && trip()) view = "home";
  else view = "trips";
  render();
})();
