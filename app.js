const STORAGE_KEY = "travel-finance-v1";

const DEFAULT_CATEGORIES = [
  { name: "Еда", icon: "🍜" },
  { name: "Транспорт", icon: "🚃" },
  { name: "Жильё", icon: "🏨" },
  { name: "Развлечения", icon: "🎫" },
  { name: "Сувениры", icon: "🎁" },
  { name: "Прочее", icon: "•••" },
];

const SYMBOLS = {
  JPY: "¥", USD: "$", EUR: "€", RUB: "₽", THB: "฿", KRW: "₩",
};

const state = {
  trips: [],
  currentTripId: null,
  drag: null, // { accountId, amount }
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state.trips = JSON.parse(raw).trips || [];
  } catch (_) {
    state.trips = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ trips: state.trips }));
}

function money(amount, code) {
  const n = Number(amount) || 0;
  const digits = code === "JPY" || code === "KRW" ? 0 : 2;
  const formatted = n.toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
  return `${SYMBOLS[code] || code} ${formatted}`;
}

function compact(amount, code) {
  const n = Number(amount) || 0;
  const digits = code === "JPY" || code === "KRW" ? 0 : 2;
  return n.toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function currentTrip() {
  return state.trips.find((t) => t.id === state.currentTripId) || null;
}

function totalBalance(trip) {
  return trip.accounts.reduce((s, a) => s + Number(a.balance), 0);
}

function totalSpent(trip) {
  return trip.transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 1800);
}

function showView(name) {
  ["trips", "ledger", "stats"].forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", v !== name);
  });
}

function createTrip({ name, currency, total, withMe }) {
  const totalN = Math.max(0, Number(total) || 0);
  const withMeN = Math.min(Math.max(0, Number(withMe) || 0), totalN);
  const storageN = totalN - withMeN;
  const trip = {
    id: uid(),
    name: name.trim() || "Поездка",
    currency,
    createdAt: Date.now(),
    accounts: [
      { id: uid(), name: "С собой", kind: "withMe", balance: withMeN },
      { id: uid(), name: "В номере", kind: "storage", balance: storageN },
    ],
    categories: DEFAULT_CATEGORIES.map((c, i) => ({
      id: uid(),
      name: c.name,
      icon: c.icon,
      sort: i,
    })),
    transactions: [],
  };
  state.trips.unshift(trip);
  save();
  return trip;
}

function recordExpense(trip, fromId, categoryId, amount) {
  const account = trip.accounts.find((a) => a.id === fromId);
  const category = trip.categories.find((c) => c.id === categoryId);
  if (!account || !category || amount <= 0 || account.balance < amount) return false;
  account.balance -= amount;
  trip.transactions.push({
    id: uid(),
    type: "expense",
    amount,
    fromId,
    categoryId,
    date: Date.now(),
  });
  save();
  return true;
}

function recordTransfer(trip, fromId, toId, amount) {
  if (fromId === toId) return false;
  const from = trip.accounts.find((a) => a.id === fromId);
  const to = trip.accounts.find((a) => a.id === toId);
  if (!from || !to || amount <= 0 || from.balance < amount) return false;
  from.balance -= amount;
  to.balance += amount;
  trip.transactions.push({
    id: uid(),
    type: "transfer",
    amount,
    fromId,
    toId,
    date: Date.now(),
  });
  save();
  return true;
}

/* ---------- Render ---------- */

function renderTrips() {
  const list = document.getElementById("trips-list");
  const empty = document.getElementById("trips-empty");
  if (!state.trips.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = state.trips
    .map((t) => {
      const bal = totalBalance(t);
      const spent = totalSpent(t);
      return `
        <article class="trip-card" data-id="${t.id}">
          <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
            <h3>${escapeHtml(t.name)}</h3>
            <span class="badge">${t.currency}</span>
          </div>
          <p>Остаток ${money(bal, t.currency)}</p>
          <div class="meta">
            <span>Потрачено ${money(spent, t.currency)}</span>
            <span>Открыть →</span>
          </div>
        </article>`;
    })
    .join("");

  list.querySelectorAll(".trip-card").forEach((card) => {
    card.addEventListener("click", () => openTrip(card.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openTrip(id) {
  state.currentTripId = id;
  clearDrag();
  renderLedger();
  showView("ledger");
}

function renderLedger() {
  const trip = currentTrip();
  if (!trip) return showView("trips");

  document.getElementById("trip-title").textContent = trip.name;
  document.getElementById("sum-balance").textContent = money(totalBalance(trip), trip.currency);
  document.getElementById("sum-spent").textContent = money(totalSpent(trip), trip.currency);
  document.getElementById("sum-currency").textContent = SYMBOLS[trip.currency] || trip.currency;

  const hint = document.getElementById("drag-hint");
  hint.textContent = state.drag
    ? "Перетащите монету на категорию или другой счёт (можно нажать на цель)"
    : "Удерживайте счёт → сумма → перетащите на категорию или другой счёт";

  const accounts = document.getElementById("accounts-row");
  accounts.innerHTML = trip.accounts
    .map((a) => {
      const isSource = state.drag && state.drag.accountId === a.id;
      const cls = [
        "circle-item",
        isSource ? "dim" : "",
      ].join(" ");
      return `
        <div class="${cls}" data-account="${a.id}">
          <div class="bubble account">
            <span class="icon">👛</span>
            ${compact(a.balance, trip.currency)}
          </div>
          <div class="name">${escapeHtml(a.name)}</div>
        </div>`;
    })
    .join("");

  const cats = document.getElementById("categories-grid");
  cats.innerHTML = trip.categories
    .map((c) => {
      const spent = trip.transactions
        .filter((t) => t.type === "expense" && t.categoryId === c.id)
        .reduce((s, t) => s + Number(t.amount), 0);
      return `
        <div class="circle-item" data-category="${c.id}">
          <div class="bubble category">
            <span class="icon">${c.icon}</span>
            ${spent > 0 ? compact(spent, trip.currency) : ""}
          </div>
          <div class="name">${escapeHtml(c.name)}</div>
        </div>`;
    })
    .join("");

  bindCircleInteractions();
}

function renderStats() {
  const trip = currentTrip();
  if (!trip) return showView("trips");

  document.getElementById("stats-balance").textContent = money(totalBalance(trip), trip.currency);
  document.getElementById("stats-spent").textContent = money(totalSpent(trip), trip.currency);

  document.getElementById("stats-accounts").innerHTML = trip.accounts
    .map(
      (a) => `
      <div class="stats-row">
        <span class="dot" style="background:#f59e0b"></span>
        <span class="grow">${escapeHtml(a.name)}</span>
        <span class="amt">${money(a.balance, trip.currency)}</span>
      </div>`
    )
    .join("");

  const byCat = trip.categories
    .map((c) => ({
      ...c,
      total: trip.transactions
        .filter((t) => t.type === "expense" && t.categoryId === c.id)
        .reduce((s, t) => s + Number(t.amount), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const spent = totalSpent(trip) || 1;
  const colors = ["#16a34a", "#3b82f6", "#f59e0b", "#a855f7", "#e85d5d", "#14b8a6"];

  const chart = document.getElementById("stats-chart");
  if (!byCat.length) {
    chart.innerHTML = "";
    document.getElementById("stats-categories").innerHTML =
      `<div class="stats-row"><span class="grow" style="color:var(--muted)">Пока нет расходов</span></div>`;
    return;
  }

  chart.innerHTML = byCat
    .map((c, i) => `<span style="width:${(c.total / spent) * 100}%;background:${colors[i % colors.length]}"></span>`)
    .join("");

  document.getElementById("stats-categories").innerHTML = byCat
    .map((c, i) => {
      const pct = Math.round((c.total / spent) * 100);
      return `
        <div class="stats-row" style="display:block">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="dot" style="background:${colors[i % colors.length]}"></span>
            <span class="grow">${c.icon} ${escapeHtml(c.name)}</span>
            <span class="amt">${money(c.total, trip.currency)}</span>
          </div>
          <div class="bar"><i style="width:${pct}%;background:${colors[i % colors.length]}"></i></div>
        </div>`;
    })
    .join("");
}

/* ---------- Drag / amount pad ---------- */

let padDigits = "";
let padAccount = null;

function openAmountPad(account) {
  const trip = currentTrip();
  padAccount = account;
  padDigits = "";
  document.getElementById("pad-title").textContent = `Сколько взять с «${account.name}»?`;
  document.getElementById("pad-avail").textContent =
    `Доступно ${money(account.balance, trip.currency)}`;
  updatePadValue();
  document.getElementById("modal-amount").showModal();
}

function updatePadValue() {
  const trip = currentTrip();
  const amount = Number(padDigits || "0");
  document.getElementById("pad-value").textContent = money(amount, trip.currency);
}

function setupPad() {
  const grid = document.getElementById("pad-grid");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "00"];
  grid.innerHTML = keys.map((k) => `<button type="button" data-k="${k}">${k}</button>`).join("");
  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const k = btn.dataset.k;
    if (k === "⌫") padDigits = padDigits.slice(0, -1);
    else if (k === "00") {
      if (padDigits && padDigits.length < 10) padDigits += "00";
    } else if (padDigits.length < 12) {
      padDigits = padDigits === "0" ? k : padDigits + k;
    }
    updatePadValue();
  });

  document.getElementById("pad-cancel").addEventListener("click", () => {
    document.getElementById("modal-amount").close();
    padAccount = null;
  });

  document.getElementById("pad-ok").addEventListener("click", () => {
    const amount = Number(padDigits || "0");
    if (!padAccount || amount <= 0) return toast("Введите сумму");
    if (amount > padAccount.balance) return toast("Недостаточно средств");
    state.drag = { accountId: padAccount.id, amount };
    document.getElementById("modal-amount").close();
    document.getElementById("coin-amount").textContent = compact(amount, currentTrip().currency);
    document.getElementById("coin").classList.remove("hidden");
    // place coin near top center initially
    moveCoin(window.innerWidth / 2, 180);
    renderLedger();
    toast("Монета готова — перетащите или нажмите цель");
  });
}

function moveCoin(x, y) {
  const coin = document.getElementById("coin");
  coin.style.left = `${x}px`;
  coin.style.top = `${y}px`;
}

function clearDrag() {
  state.drag = null;
  document.getElementById("coin").classList.add("hidden");
  document.querySelectorAll(".circle-item.hot").forEach((el) => el.classList.remove("hot"));
}

function bindCircleInteractions() {
  document.querySelectorAll("[data-account]").forEach((el) => {
    let pressTimer = null;
    const start = (e) => {
      if (state.drag) return;
      pressTimer = setTimeout(() => {
        const trip = currentTrip();
        const account = trip.accounts.find((a) => a.id === el.dataset.account);
        if (account) openAmountPad(account);
      }, 320);
    };
    const cancel = () => clearTimeout(pressTimer);
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);

    el.addEventListener("click", () => {
      if (!state.drag) return;
      const trip = currentTrip();
      const ok = recordTransfer(trip, state.drag.accountId, el.dataset.account, state.drag.amount);
      if (ok) toast("Перевод выполнен");
      else toast("Нельзя перевести");
      clearDrag();
      renderLedger();
    });
  });

  document.querySelectorAll("[data-category]").forEach((el) => {
    el.addEventListener("click", () => {
      if (!state.drag) return;
      const trip = currentTrip();
      const ok = recordExpense(trip, state.drag.accountId, el.dataset.category, state.drag.amount);
      if (ok) toast("Расход записан");
      else toast("Недостаточно средств");
      clearDrag();
      renderLedger();
    });
  });
}

function setupGlobalDrag() {
  let dragging = false;

  window.addEventListener("pointerdown", (e) => {
    if (!state.drag) return;
    if (e.target.closest("dialog, button, a, input, select")) return;
    dragging = true;
    moveCoin(e.clientX, e.clientY);
    highlightAt(e.clientX, e.clientY);
  });

  window.addEventListener("pointermove", (e) => {
    if (!state.drag || !dragging) return;
    moveCoin(e.clientX, e.clientY);
    highlightAt(e.clientX, e.clientY);
  });

  window.addEventListener("pointerup", (e) => {
    if (!state.drag || !dragging) return;
    dragging = false;
    dropAt(e.clientX, e.clientY);
  });
}

function elementAtPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  for (const el of els) {
    const account = el.closest("[data-account]");
    if (account) return { type: "account", id: account.dataset.account, el: account };
    const category = el.closest("[data-category]");
    if (category) return { type: "category", id: category.dataset.category, el: category };
  }
  return null;
}

function highlightAt(x, y) {
  document.querySelectorAll(".circle-item.hot").forEach((el) => el.classList.remove("hot"));
  const hit = elementAtPoint(x, y);
  if (!hit) return;
  if (hit.type === "account" && hit.id === state.drag.accountId) return;
  hit.el.classList.add("hot");
}

function dropAt(x, y) {
  const hit = elementAtPoint(x, y);
  document.querySelectorAll(".circle-item.hot").forEach((el) => el.classList.remove("hot"));
  if (!hit || !state.drag) return;
  const trip = currentTrip();
  if (hit.type === "category") {
    const ok = recordExpense(trip, state.drag.accountId, hit.id, state.drag.amount);
    toast(ok ? "Расход записан" : "Недостаточно средств");
    clearDrag();
    renderLedger();
  } else if (hit.type === "account" && hit.id !== state.drag.accountId) {
    const ok = recordTransfer(trip, state.drag.accountId, hit.id, state.drag.amount);
    toast(ok ? "Перевод выполнен" : "Нельзя перевести");
    clearDrag();
    renderLedger();
  }
}

/* ---------- Wire UI ---------- */

function setupUI() {
  const modal = document.getElementById("modal-trip");
  const openCreate = () => modal.showModal();

  document.getElementById("btn-new-trip").addEventListener("click", openCreate);
  document.getElementById("btn-empty-create").addEventListener("click", openCreate);

  document.getElementById("form-trip").addEventListener("submit", (e) => {
    // native dialog form may close before we read — handle via button instead
  });

  document.getElementById("btn-create-trip").addEventListener("click", (e) => {
    e.preventDefault();
    const form = document.getElementById("form-trip");
    const data = new FormData(form);
    const trip = createTrip({
      name: data.get("name"),
      currency: data.get("currency"),
      total: data.get("total"),
      withMe: data.get("withMe"),
    });
    modal.close();
    renderTrips();
    openTrip(trip.id);
  });

  document.getElementById("btn-back").addEventListener("click", () => {
    clearDrag();
    state.currentTripId = null;
    renderTrips();
    showView("trips");
  });

  document.getElementById("btn-stats").addEventListener("click", () => {
    clearDrag();
    renderStats();
    showView("stats");
  });

  document.getElementById("btn-stats-back").addEventListener("click", () => {
    renderLedger();
    showView("ledger");
  });

  document.getElementById("btn-add-category").addEventListener("click", () => {
    const trip = currentTrip();
    if (!trip) return;
    const name = prompt("Название категории", "Кофе");
    if (!name || !name.trim()) return;
    trip.categories.push({
      id: uid(),
      name: name.trim(),
      icon: "☕",
      sort: trip.categories.length,
    });
    save();
    renderLedger();
  });

  // Escape cancels drag
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.drag) {
      clearDrag();
      renderLedger();
    }
  });
}

function boot() {
  load();
  setupPad();
  setupUI();
  setupGlobalDrag();
  renderTrips();
  showView("trips");

  // Demo seed if empty — helps first visit on Pages
  if (!state.trips.length) {
    // leave empty; user creates Japan trip via form defaults
  }
}

boot();
