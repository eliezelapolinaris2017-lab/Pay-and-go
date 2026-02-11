/* app.js */
/*************************************************
 * Plataforma Pagos — 2 pantallas (botones grandes)
 * + Recibo tipo ticket (POS) angosto con jsPDF
 *************************************************/

const $ = (s) => document.querySelector(s);

const STORE_KEY = "PAY_PLATFORM_V4_HISTORY";

/* ===== CONFIG EDITABLE ===== */
const CONFIG = {
  business: {
    name: "Oasis / Nexus Payments",
    phone: "787-664-3079",
    address: "Puerto Rico",
    receiptTitle: "RECIBO DE PAGO",

    // Tamaño ticket (en puntos). 1in=72pt. 58mm ≈ 164pt, 80mm ≈ 227pt
    ticket: {
      widthPt: 227,     // 80mm aprox (recomendado)
      marginPt: 14,
      lineHeight: 12,
      fontSize: 10,
      footer: "Gracias por su pago."
    }
  },
  currency: "USD",

  methods: [
    { id:"tap", name:"Tap to Pay", desc:"iPhone", icon:"📲", link:"https://example.com/tap",
      bg:"linear-gradient(135deg, rgba(47,122,246,.80), rgba(0,0,0,.22))" },
    { id:"stripe", name:"Stripe", desc:"Tarjeta / Link", icon:"💳", link:"https://example.com/stripe",
      bg:"linear-gradient(135deg, rgba(140,92,255,.80), rgba(0,0,0,.22))" },
    { id:"ath", name:"ATH Móvil", desc:"PR", icon:"🟠",
      link:"https://pagos.athmovilapp.com/pagoPorCodigo.html?id=CAMBIA-ESTE-ID",
      bg:"linear-gradient(135deg, rgba(255,153,0,.85), rgba(0,0,0,.22))" },
    { id:"cash", name:"Cash", desc:"Efectivo", icon:"💵", link:"",
      bg:"linear-gradient(135deg, rgba(40,199,111,.78), rgba(0,0,0,.22))" },
    { id:"check", name:"Checks", desc:"Cheque", icon:"🧾", link:"",
      bg:"linear-gradient(135deg, rgba(214,178,94,.82), rgba(0,0,0,.22))" }
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
  $("#btnBack").addEventListener("click", gotoMethods);
  $("#btnSave").addEventListener("click", saveDraft);
  $("#btnPayLink").addEventListener("click", openSelectedPayLink);
  $("#btnPaid").addEventListener("click", markPaidAndReceipt);

  $("#btnHistory").addEventListener("click", openModal);
  $("#btnCloseModal").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  $("#btnExportJSON").addEventListener("click", exportJSON);
  $("#btnExportCSV").addEventListener("click", exportCSV);
  $("#btnClear").addEventListener("click", clearAll);

  ["fName","fPhone","fAmount","fNote"].forEach(id=>{
    const el = $("#"+id);
    el.addEventListener("keydown",(e)=>{
      if(e.key==="Enter") saveDraft();
    });
  });
}

/* ===== Screen nav ===== */
function gotoRegister(method){
  state.selectedMethod = method;
  $("#methodBadge").textContent = `Método: ${method.name}`;

  state.draft = null;
  $("#fName").value = "";
  $("#fPhone").value = "";
  $("#fAmount").value = "";
  $("#fNote").value = "";
  $("#regHint").textContent = "Flujo: Guardar → Ir a pagar → Pago completado (manual) para recibo.";

  $("#screenMethods").classList.add("hidden");
  $("#screenRegister").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
}

function gotoMethods(){
  $("#screenRegister").classList.add("hidden");
  $("#screenMethods").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
}

/* ===== Methods grid (botones gigantes) ===== */
function renderMethods(){
  const grid = $("#methodsGrid");
  grid.innerHTML = "";

  CONFIG.methods.forEach(m => {
    const btn = document.createElement("button");
    btn.className = "tileBtn";
    btn.type = "button";
    btn.style.background = m.bg || "linear-gradient(135deg, rgba(47,122,246,.70), rgba(0,0,0,.25))";
    btn.innerHTML = `
      <div class="tileIcon">${escapeHTML(m.icon || "💳")}</div>
      <div class="tileTitle">${escapeHTML(m.name)}</div>
      <div class="tileSmall">${escapeHTML(m.desc || "")}</div>
    `;
    btn.addEventListener("click", () => gotoRegister(m));
    grid.appendChild(btn);
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

  $("#regHint").textContent = "Guardado ✅ Ahora: Ir a pagar → Pago completado (manual) para generar recibo ticket.";
  toast("Guardado ✅");
}

/* 2) Abrir enlace del método */
function openSelectedPayLink(){
  const method = state.selectedMethod;
  if (!method) return toast("No hay método seleccionado.");

  if (!state.draft) toast("Abriendo enlace. Mejor guarda primero para historial.");

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
  record.status = "PAID";
  record.paidAt = Date.now();
  record.receiptNo = makeReceiptNo(record.paidAt);

  state.history.unshift(record);
  saveHistory();

  generateTicketPDF(record);

  state.draft = null;
  renderHistoryTable();

  $("#regHint").textContent = "Pago registrado + recibo ticket generado.";
  toast("Pago completado + Recibo ✅");
}

/* ================= RECIBO TIPO TICKET (jsPDF) =================
   - Papel angosto (80mm aprox)
   - Alto dinámico (según contenido)
   - Fuente monospace para look POS
=============================================================== */
function generateTicketPDF(r){
  const { jsPDF } = window.jspdf;

  const W = CONFIG.business.ticket.widthPt;
  const M = CONFIG.business.ticket.marginPt;
  const LH = CONFIG.business.ticket.lineHeight;
  const FS = CONFIG.business.ticket.fontSize;

  // Construimos líneas para calcular alto real
  const lines = buildTicketLines(r, W - (M*2), FS);

  const topPad = 14;
  const bottomPad = 16;
  const H = topPad + bottomPad + (lines.length * LH);

  const doc = new jsPDF({ unit:"pt", format:[W, H] });

  // Estilo POS
  doc.setFont("courier", "normal"); // monospace
  doc.setFontSize(FS);

  let y = topPad;

  // print lines
  lines.forEach(line=>{
    doc.text(line, M, y);
    y += LH;
  });

  doc.save(`Recibo_${r.receiptNo}.pdf`);
}

function buildTicketLines(r, maxTextWidthPt, fontSize){
  // helper para centrar y cortar
  const title = CONFIG.business.receiptTitle;
  const biz = CONFIG.business.name;
  const tel = `Tel: ${CONFIG.business.phone}`;
  const addr = `${CONFIG.business.address}`;

  const receipt = `Recibo #: ${r.receiptNo}`;
  const date = `Fecha: ${fmtDateTime(r.paidAt)}`;

  const clientH = "CLIENTE";
  const c1 = `Nombre: ${r.name}`;
  const c2 = `Tel: ${r.phone}`;

  const payH = "PAGO";
  const p1 = `Metodo: ${r.methodName}`;
  const p2 = `Estado: PAGADO`;

  const totalLine = `TOTAL: ${fmtMoney(r.amount)}`;

  const noteH = r.note && r.note.trim() ? "NOTA" : "";
  const noteLines = r.note && r.note.trim() ? wrapText(`- ${r.note.trim()}`, maxTextWidthPt, fontSize) : [];

  const sep = "-".repeat(32);

  const out = [];
  out.push(centerText(title, 32));
  out.push(centerText(biz, 32));
  out.push(centerText(tel, 32));
  out.push(centerText(addr, 32));
  out.push(sep);

  out.push(receipt);
  out.push(date);
  out.push(sep);

  out.push(clientH);
  out.push(...wrapText(c1, maxTextWidthPt, fontSize));
  out.push(...wrapText(c2, maxTextWidthPt, fontSize));
  out.push(sep);

  out.push(payH);
  out.push(p1);
  out.push(p2);
  out.push(sep);

  out.push(totalLine);
  out.push(sep);

  if (noteH){
    out.push(noteH);
    out.push(...noteLines);
    out.push(sep);
  }

  out.push(centerText(CONFIG.business.ticket.footer, 32));

  return out;
}

/* Wrap basado en ancho real aproximado: usamos jsPDF splitTextToSize con un doc dummy */
function wrapText(text, maxWidthPt, fontSize){
  const { jsPDF } = window.jspdf;
  const d = new jsPDF({ unit:"pt", format:[300,300] });
  d.setFont("courier","normal");
  d.setFontSize(fontSize);
  return d.splitTextToSize(text, maxWidthPt);
}

/* centrado por caracteres (look POS). 32 chars ~ ticket 80mm a FS10 courier */
function centerText(t, widthChars){
  const s = String(t || "");
  if (s.length >= widthChars) return s.slice(0, widthChars);
  const pad = Math.floor((widthChars - s.length)/2);
  return " ".repeat(pad) + s;
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
  return d.toLocaleString("es-PR", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit"
  });
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
  t.style.fontWeight="1000";
  t.style.zIndex="9999";
  t.style.backdropFilter="blur(10px)";
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .18s ease"; }, 1400);
  setTimeout(()=> t.remove(), 1700);
}
