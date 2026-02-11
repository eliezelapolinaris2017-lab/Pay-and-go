/*************************************************
 * Plataforma de Pagos — HTML/CSS/JS (GitHub)
 * - Enlaces editables (CONFIG.methods)
 * - Historial: nombre, método, cantidad, fecha, nota
 * - localStorage + export JSON/CSV
 *************************************************/

const $ = (s) => document.querySelector(s);

const STORE_KEY = "PAY_PLATFORM_HISTORY_V1";
const KPI_KEY   = "PAY_PLATFORM_KPI_V1";

/* =========================
   CONFIG (EDITA AQUÍ)
   ========================= */
const CONFIG = {
  currency: "USD",

  // Totales tipo POS (opcional). Puedes cambiarlo desde aquí o usar Reset.
  totals: {
    total: 75.00,
    paid:  0.00
  },

  // Métodos (tiles). Edita labels, iconos y links aquí.
  // icon: puedes usar emojis o imágenes propias en assets/...
  methods: [
    {
      id: "tap",
      name: "Tap to Pay",
      desc: "Cobro rápido desde iPhone.",
      iconType: "emoji",
      icon: "📲",
      // link puede ser: URL web, deep link, etc.
      link: "https://example.com/tap"
    },
    {
      id: "stripe",
      name: "Stripe Manual Entry",
      desc: "Tarjeta / enlace / checkout.",
      iconType: "emoji",
      icon: "💳",
      link: "https://example.com/stripe"
    },
    {
      id: "ath",
      name: "ATH Móvil",
      desc: "Pago local PR, directo.",
      iconType: "emoji",
      icon: "🟠",
      // Ejemplo: tu enlace de ATH Móvil Business (cámbialo)
      link: "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=CAMBIA-ESTE-ID"
    },
    {
      id: "cash",
      name: "Cash",
      desc: "Efectivo, sin fricción.",
      iconType: "emoji",
      icon: "💵",
      link: "" // vacío = no abre nada, solo registra
    },
    {
      id: "checks",
      name: "Checks",
      desc: "Cheque / recibo manual.",
      iconType: "emoji",
      icon: "🧾",
      link: ""
    }
  ]
};

/* =========================
   STATE
   ========================= */
const state = {
  history: loadHistory(),
  kpi: loadKPI()
};

/* =========================
   INIT
   ========================= */
renderMethods();
hydrateFilters();
renderHistory();
renderKPI();

$("#btnExportJSON").addEventListener("click", exportJSON);
$("#btnExportCSV").addEventListener("click", exportCSV);
$("#btnClearHistory").addEventListener("click", clearHistory);
$("#btnResetDemo").addEventListener("click", resetKPI);

$("#q").addEventListener("input", renderHistory);
$("#methodFilter").addEventListener("change", renderHistory);
$("#sortBy").addEventListener("change", renderHistory);

/* =========================
   UI: METHODS GRID
   ========================= */
function renderMethods(){
  const grid = $("#methodsGrid");
  grid.innerHTML = "";

  CONFIG.methods.forEach(m => {
    const tile = document.createElement("div");
    tile.className = "tile";

    const icon = document.createElement("div");
    icon.className = "icon";

    if (m.iconType === "img") {
      const img = document.createElement("img");
      img.src = m.icon;
      img.alt = m.name;
      icon.appendChild(img);
    } else {
      icon.innerHTML = `<div style="font-size:26px; font-weight:900">${escapeHTML(m.icon || "💳")}</div>`;
    }

    const txt = document.createElement("div");
    txt.className = "tile__txt";
    txt.innerHTML = `
      <div class="tile__name">${escapeHTML(m.name)}</div>
      <div class="tile__desc">${escapeHTML(m.desc || "")}</div>
    `;

    const btns = document.createElement("div");
    btns.className = "tile__btns";

    const openBtn = document.createElement("button");
    openBtn.className = "btn btn--ghost";
    openBtn.textContent = "Abrir";
    openBtn.addEventListener("click", () => openMethod(m));

    const saveOpenBtn = document.createElement("button");
    saveOpenBtn.className = "btn btn--primary";
    saveOpenBtn.textContent = "Registrar + Abrir";
    saveOpenBtn.addEventListener("click", () => registerAndOpen(m));

    btns.appendChild(saveOpenBtn);
    btns.appendChild(openBtn);

    tile.appendChild(icon);
    tile.appendChild(txt);
    tile.appendChild(btns);
    grid.appendChild(tile);
  });
}

function openMethod(method){
  if (method.link && method.link.trim().length > 0) {
    window.open(method.link, "_blank", "noopener,noreferrer");
  } else {
    toast("Este método no tiene enlace. Se usa para registro interno.");
  }
}

function registerAndOpen(method){
  const name = ($("#payName").value || "").trim();
  const note = ($("#payNote").value || "").trim();
  const amount = parseMoney($("#payAmount").value);

  if (!name) return toast("Falta el nombre del cliente.");
  if (!(amount > 0)) return toast("La cantidad debe ser mayor a 0.");

  const item = {
    id: cryptoId(),
    ts: Date.now(),
    name,
    methodId: method.id,
    methodName: method.name,
    amount,
    note
  };

  state.history.unshift(item);
  saveHistory();

  // KPI: suma a pagado y recalcula pendiente
  state.kpi.paid = round2(state.kpi.paid + amount);
  saveKPI();

  renderKPI();
  renderHistory();

  // opcional: limpiar monto/nota (nombre se queda por conveniencia)
  $("#payAmount").value = "";
  $("#payNote").value = "";

  openMethod(method);
}

/* =========================
   HISTORY
   ========================= */
function renderHistory(){
  const body = $("#historyBody");
  const q = ($("#q").value || "").trim().toLowerCase();
  const mf = $("#methodFilter").value;
  const sortBy = $("#sortBy").value;

  let rows = [...state.history];

  if (mf !== "ALL") {
    rows = rows.filter(r => r.methodId === mf);
  }

  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.name} ${r.methodName} ${r.note || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  rows.sort((a,b) => {
    if (sortBy === "newest") return b.ts - a.ts;
    if (sortBy === "oldest") return a.ts - b.ts;
    if (sortBy === "amount_desc") return b.amount - a.amount;
    if (sortBy === "amount_asc") return a.amount - b.amount;
    return 0;
  });

  body.innerHTML = rows.length ? "" : `<tr><td colspan="6" class="muted">Sin pagos registrados todavía.</td></tr>`;

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDateTime(r.ts)}</td>
      <td>${escapeHTML(r.name)}</td>
      <td>
        <span class="pill">
          <span class="pillDot"></span>
          ${escapeHTML(r.methodName)}
        </span>
      </td>
      <td class="right"><b>${fmtMoney(r.amount)}</b></td>
      <td class="muted">${escapeHTML(r.note || "")}</td>
      <td class="right">
        <button class="btn btn--tiny btn--ghost" data-del="${r.id}">Eliminar</button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteRow(btn.getAttribute("data-del")));
  });

  $("#countInfo").textContent = `${rows.length} registro(s)`;
}

function deleteRow(id){
  const idx = state.history.findIndex(x => x.id === id);
  if (idx < 0) return;

  const removed = state.history.splice(idx, 1)[0];
  saveHistory();

  // KPI: revierte pagado (si quieres que no se toque KPI al borrar, comenta estas líneas)
  state.kpi.paid = round2(Math.max(0, state.kpi.paid - (removed.amount || 0)));
  saveKPI();

  renderKPI();
  renderHistory();
}

function clearHistory(){
  if (!confirm("¿Borrar TODO el historial? Esto no se puede deshacer.")) return;
  state.history = [];
  saveHistory();

  // KPI: opcional, también resetea pagado
  state.kpi.paid = 0;
  saveKPI();

  renderKPI();
  renderHistory();
}

/* =========================
   KPI
   ========================= */
function renderKPI(){
  const total = round2(state.kpi.total);
  const paid  = round2(state.kpi.paid);
  const due   = round2(Math.max(0, total - paid));

  $("#kpiTotal").textContent = fmtMoney(total);
  $("#kpiPaid").textContent  = fmtMoney(paid);
  $("#kpiDue").textContent   = fmtMoney(due);
  $("#dueBig").textContent   = fmtMoney(due);
}

function resetKPI(){
  state.kpi = {
    total: round2(CONFIG.totals.total || 0),
    paid:  round2(CONFIG.totals.paid || 0)
  };
  saveKPI();
  renderKPI();
  toast("Totales reseteados.");
}

/* =========================
   FILTERS
   ========================= */
function hydrateFilters(){
  const sel = $("#methodFilter");
  const used = CONFIG.methods.map(m => ({id:m.id, name:m.name}));

  // limpia y reconstruye
  sel.innerHTML = `<option value="ALL">Todos los métodos</option>`;
  used.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
}

/* =========================
   EXPORT
   ========================= */
function exportJSON(){
  const payload = {
    exportedAt: new Date().toISOString(),
    currency: CONFIG.currency,
    kpi: state.kpi,
    history: state.history
  };
  downloadFile(`pagos_${todayStamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportCSV(){
  const headers = ["Fecha","Cliente","Metodo","Cantidad","Nota"];
  const lines = [headers.join(",")];

  state.history.forEach(r => {
    lines.push([
      csvCell(fmtDateTime(r.ts)),
      csvCell(r.name),
      csvCell(r.methodName),
      csvCell(String(r.amount)),
      csvCell(r.note || "")
    ].join(","));
  });

  downloadFile(`pagos_${todayStamp()}.csv`, lines.join("\n"), "text/csv");
}

/* =========================
   STORAGE
   ========================= */
function loadHistory(){
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state.history));
}

function loadKPI(){
  try {
    const raw = JSON.parse(localStorage.getItem(KPI_KEY) || "null");
    if (raw && typeof raw.total === "number" && typeof raw.paid === "number") return raw;
  } catch {}
  return {
    total: round2(CONFIG.totals.total || 0),
    paid:  round2(CONFIG.totals.paid || 0)
  };
}
function saveKPI(){
  localStorage.setItem(KPI_KEY, JSON.stringify(state.kpi));
}

/* =========================
   HELPERS
   ========================= */
function fmtMoney(n){
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { style:"currency", currency: CONFIG.currency });
}
function fmtDateTime(ts){
  const d = new Date(ts);
  return d.toLocaleString("es-PR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}
function parseMoney(v){
  const n = Number(String(v || "").replace(",", "."));
  return isFinite(n) ? round2(n) : 0;
}
function round2(n){ return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100; }
function cryptoId(){
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now();
}
function escapeHTML(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function csvCell(s){
  const t = String(s ?? "");
  if (/[",\n]/.test(t)) return `"${t.replaceAll('"','""')}"`;
  return t;
}
function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function todayStamp(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function toast(msg){
  // mini-toast sin librerías
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position = "fixed";
  t.style.left = "50%";
  t.style.bottom = "18px";
  t.style.transform = "translateX(-50%)";
  t.style.padding = "10px 12px";
  t.style.borderRadius = "12px";
  t.style.background = "rgba(0,0,0,.75)";
  t.style.border = "1px solid rgba(255,255,255,.15)";
  t.style.color = "white";
  t.style.fontWeight = "800";
  t.style.zIndex = "9999";
  t.style.backdropFilter = "blur(10px)";
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .18s ease"; }, 1400);
  setTimeout(()=> t.remove(), 1700);
}
