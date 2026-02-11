/*************************************************
 * Plataforma Pagos — 2 pantallas
 * 1) Métodos (iconos)
 * 2) Registro (nombre/teléfono/etc) + link + pago completado
 * Recibo PDF: jsPDF
 *************************************************/

const $ = (s) => document.querySelector(s);

const STORE_KEY = "PAY_PLATFORM_V2_HISTORY";

/* ===== CONFIG EDITABLE (links, métodos, branding) ===== */
const CONFIG = {
  business: {
    name: "Oasis / Nexus Payments",
    phone: "787-000-0000",
    address: "Puerto Rico",
    receiptTitle: "RECIBO DE PAGO"
  },
  currency: "USD",

  methods: [
    { id:"tap",    name:"Tap to Pay",      desc:"Cobro rápido desde iPhone.", icon:"📲", link:"https://example.com/tap" },
    { id:"stripe", name:"Stripe",          desc:"Tarjeta / checkout / link.",  icon:"💳", link:"https://example.com/stripe" },
    { id:"ath",    name:"ATH Móvil",       desc:"Pago local PR.",              icon:"🟠", link:"https://pagos.athmovilapp.com/pagoPorCodigo.html?id=CAMBIA-ESTE-ID" },
    { id:"cash",   name:"Cash",            desc:"Efectivo.",                   icon:"💵", link:"" },
    { id:"check",  name:"Checks",          desc:"Cheque.",                     icon:"🧾", link:"" }
  ]
};

/* ===== STATE ===== */
const state = {
  history: loadHistory(),
  selectedMethod: null,
  draft: null
};

/* ===== INIT ===== */
renderMethods();
bindUI();
renderHistoryTable();

/* ================= UI ================= */
function bindUI(){
  $("#btnBack").addEventListener("click", () => gotoMethods());
  $("#btnSave").addEventListener("click", saveDraft);
  $("#btnPayLink").addEventListener("click", openSelectedPayLink);
  $("#btnPaid").addEventListener("click", markPaidAndReceipt);

  $("#btnHistory").addEventListener("click", openModal);
  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  $("#btnExportJSON").addEventListener("click", exportJSON);
  $("#btnExportCSV").addEventListener("click", exportCSV);
  $("#btnClear").addEventListener("click", clearAll);
}

/* ===== Screen nav ===== */
function gotoRegister(method){
  state.selectedMethod = method;
  $("#methodBadge").textContent = `Método: ${method.name}`;

  // reset draft/form
  state.draft = null;
  $("#fName").value = "";
  $("#fPhone").value = "";
  $("#fAmount").value = "";
  $("#fNote").value = "";
  $("#regHint").textContent = "Flujo: Guardar → Ir a pagar → Pago completado (manual).";

  $("#screenMethods").classList.add("hidden");
  $("#screenRegister").classList.remove("hidden");
}

function gotoMethods(){
  $("#screenRegister").classList.add("hidden");
  $("#screenMethods").classList.remove("hidden");
}

/* ===== Methods grid ===== */
function renderMethods(){
  const grid = $("#methodsGrid");
  grid.innerHTML = "";

  CONFIG.methods.forEach(m => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `
      <div class="icon">${escapeHTML(m.icon || "💳")}</div>
      <div>
        <div class="tileTitle">${escapeHTML(m.name)}</div>
        <div class="tileDesc">${escapeHTML(m.desc || "")}</div>
      </div>
    `;
    tile.addEventListener("click", () => gotoRegister(m));
    grid.appendChild(tile);
  });
}

/* ================= FLOW ================= */

/* 1) Guardar (draft) */
function saveDraft(){
  const method = state.selectedMethod;
  if (!method) return toast("No hay método seleccionado.");

  const name = ($("#fName").value || "").trim();
  const phone = ($("#fPhone").value || "").trim();
  const amount = parseMoney($("#fAmount").value);
  const note = ($("#fNote").value || "").trim();

  if (!name) return toast("Falta el nombre.");
  if (!phone) return toast("Falta el teléfono.");
  if (!(amount > 0)) return toast("Cantidad inválida.");

  state.draft = {
    id: cryptoId(),
    createdAt: Date.now(),
    status: "PENDING",
    methodId: method.id,
    methodName: method.name,
    methodLink: method.link || "",
    name,
    phone,
    amount,
    note,
    paidAt: null,
    receiptNo: null
  };

  $("#regHint").textContent = "Guardado. Ahora: Ir a pagar → luego Pago completado (manual) para generar recibo.";
  toast("Guardado ✅");
}

/* 2) Abrir enlace del método */
function openSelectedPayLink(){
  const method = state.selectedMethod;
  if (!method) return toast("No hay método seleccionado.");

  if (!state.draft) {
    // permitimos abrir sin guardar, pero lo decimos claro
    toast("Abriendo enlace. Recomendación: guarda primero para tener historial.");
  }

  if (method.link && method.link.trim()) {
    window.open(method.link, "_blank", "noopener,noreferrer");
  } else {
    toast("Este método no tiene enlace (cash/check).");
  }
}

/* 3) Pago completado (manual) + recibo PDF + guardar en historial */
function markPaidAndReceipt(){
  if (!state.draft) return toast("Primero: Guardar el registro.");

  const record = { ...state.draft };

  // marca pagado
  record.status = "PAID";
  record.paidAt = Date.now();
  record.receiptNo = makeReceiptNo(record.paidAt);

  // guarda historial
  state.history.unshift(record);
  saveHistory();

  // genera PDF
  generateReceiptPDF(record);

  // UI
  state.draft = null;
  renderHistoryTable();
  $("#regHint").textContent = "Pago registrado y recibo generado. Puedes volver y procesar otro pago.";
  toast("Pago completado + Recibo ✅");
}

/* ================= RECEIPT (jsPDF) ================= */
function generateReceiptPDF(r){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"letter" });

  const left = 44;
  let y = 52;

  // header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(CONFIG.business.receiptTitle, left, y);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  y += 18;
  doc.text(CONFIG.business.name, left, y);
  y += 14;
  doc.text(`Tel: ${CONFIG.business.phone}`, left, y);
  y += 14;
  doc.text(`${CONFIG.business.address}`, left, y);

  // line
  y += 18;
  doc.setDrawColor(180);
  doc.line(left, y, 568, y);

  // receipt meta
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.text(`Recibo #: ${r.receiptNo}`, left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(`Fecha: ${fmtDateTime(r.paidAt)}`, left, y);

  // client
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(`Nombre: ${r.name}`, left, y);
  y += 14;
  doc.text(`Teléfono: ${r.phone}`, left, y);

  // payment
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.text("Pago", left, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(`Método: ${r.methodName}`, left, y);
  y += 14;
  doc.text(`Estado: PAGADO`, left, y);

  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Total: ${fmtMoney(r.amount)}`, left, y);

  // note
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  if (r.note && r.note.trim()){
    y += 18;
    doc.setFont("helvetica", "bold");
    doc.text("Nota", left, y);
    doc.setFont("helvetica", "normal");
    y += 14;
    doc.text(doc.splitTextToSize(r.note, 520), left, y);
  }

  // footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text("Gracias por su pago.", left, 742);

  // auto open print dialog? (no siempre funciona en iOS)
  // doc.autoPrint();

  const fileName = `Recibo_${r.receiptNo}.pdf`;
  doc.save(fileName);
}

/* ================= HISTORIAL ================= */
function openModal(){
  $("#modal").classList.remove("hidden");
  renderHistoryTable();
}
function closeModal(){
  $("#modal").classList.add("hidden");
}

function renderHistoryTable(){
  const body = $("#historyBody");
  body.innerHTML = "";

  if (!state.history.length){
    body.innerHTML = `<tr><td colspan="7" style="color:rgba(255,255,255,.65)">Sin registros todavía.</td></tr>`;
    return;
  }

  state.history.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtDateTime(r.paidAt || r.createdAt)}</td>
      <td>${escapeHTML(r.name)}</td>
      <td>${escapeHTML(r.phone)}</td>
      <td>${escapeHTML(r.methodName)}</td>
      <td class="r"><b>${fmtMoney(r.amount)}</b></td>
      <td>${r.status === "PAID" ? "PAGADO" : "PENDIENTE"}</td>
      <td class="r">${r.receiptNo ? escapeHTML(r.receiptNo) : "—"}</td>
    `;
    body.appendChild(tr);
  });
}

function clearAll(){
  if (!confirm("¿Borrar todo el historial?")) return;
  state.history = [];
  saveHistory();
  renderHistoryTable();
  toast("Historial borrado.");
}

/* ================= EXPORT ================= */
function exportJSON(){
  const payload = { exportedAt: new Date().toISOString(), currency: CONFIG.currency, history: state.history };
  downloadFile(`historial_pagos_${todayStamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}
function exportCSV(){
  const headers = ["Fecha","Cliente","Telefono","Metodo","Cantidad","Estado","Recibo"];
  const lines = [headers.join(",")];

  state.history.forEach(r => {
    lines.push([
      csvCell(fmtDateTime(r.paidAt || r.createdAt)),
      csvCell(r.name),
      csvCell(r.phone),
      csvCell(r.methodName),
      csvCell(String(r.amount)),
      csvCell(r.status),
      csvCell(r.receiptNo || "")
    ].join(","));
  });

  downloadFile(`historial_pagos_${todayStamp()}.csv`, lines.join("\n"), "text/csv");
}

/* ================= STORAGE ================= */
function loadHistory(){
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(){
  localStorage.setItem(STORE_KEY, JSON.stringify(state.history));
}

/* ================= HELPERS ================= */
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
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
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
  a.href = url; a.download = filename;
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
function makeReceiptNo(ts){
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  const ss = String(d.getSeconds()).padStart(2,"0");
  return `R-${y}${m}${day}-${hh}${mm}${ss}`;
}
function toast(msg){
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.position="fixed";
  t.style.left="50%";
  t.style.bottom="18px";
  t.style.transform="translateX(-50%)";
  t.style.padding="10px 12px";
  t.style.borderRadius="12px";
  t.style.background="rgba(0,0,0,.75)";
  t.style.border="1px solid rgba(255,255,255,.15)";
  t.style.color="white";
  t.style.fontWeight="900";
  t.style.zIndex="9999";
  t.style.backdropFilter="blur(10px)";
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .18s ease"; }, 1400);
  setTimeout(()=> t.remove(), 1700);
}
