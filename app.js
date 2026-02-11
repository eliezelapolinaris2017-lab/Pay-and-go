/*************************************************
 * Nexus POS Express — app.js (FINAL)
 * - Firebase (Firestore + Auth anon) + cache local
 * - PIN Lock
 * - Métodos + Stripe/ATH Links (sin enseñar URL feo)
 * - Recibo en jsPDF + Share Sheet (Mensajes)
 *************************************************/

const $ = (id)=>document.getElementById(id);

/* =======================
   CONFIG LINKS (TU DATA)
======================= */
const PAYMENT_LINKS = {
  stripe: "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h",
  ath:    "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660"
};

/* =======================
   FIREBASE CONFIG (PEGA AQUÍ)
   Si lo dejas vacío => modo local
======================= */
const firebaseConfig = {
   apiKey: "AIzaSyAabJd7_zxocAktRlERRv3BHCYpfyiF4ig",
  authDomain: "nexus-payment-platform.firebaseapp.com",
  projectId: "nexus-payment-platform",
  storageBucket: "nexus-payment-platform.firebasestorage.app",
  messagingSenderId: "482375789187",
  appId: "1:482375789187:web:e13839db6d644e215009b6"
};


Termina el proyecto completo tal cual hasta ahora 

const FIREBASE_ENABLED = !!firebaseConfig && !!firebaseConfig.projectId;

let fb = { app:null, auth:null, db:null, user:null };

/* =======================
   LOCAL STORE
======================= */
const LS = {
  pin: "nexus_pos_pin",
  cache: "nexus_pos_cache_receipts",
  device: "nexus_pos_device_id"
};

function getDeviceId(){
  let id = localStorage.getItem(LS.device);
  if(!id){
    id = "dev_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    localStorage.setItem(LS.device, id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

function getPin(){ return localStorage.getItem(LS.pin) || "1234"; }
function setPin(v){ localStorage.setItem(LS.pin, String(v || "").trim()); }

function loadCache(){
  try{ return JSON.parse(localStorage.getItem(LS.cache) || "[]"); }
  catch(e){ return []; }
}
function saveCache(list){
  localStorage.setItem(LS.cache, JSON.stringify(list || []));
}

/* =======================
   UI STATE
======================= */
const state = {
  method: null,
  record: null
};

const METHODS = [
  { id:"stripe",   label:"Stripe",   icon:"assets/icons/stripe.png", type:"qr",   qrImage:"assets/icons/stripe.png" }, // (si tienes QR real, cambia qrImage)
  { id:"ath",      label:"ATH Móvil", icon:"assets/icons/ath.png",    type:"qr",   qrImage:"assets/icons/ath.png" },   // (si tienes QR real, cambia qrImage)
  { id:"tap",      label:"Tap to Pay",icon:"assets/icons/tap.png",    type:"info" },
  { id:"cash",     label:"Cash",     icon:"assets/icons/cash.png",   type:"info" },
  { id:"checks",   label:"Checks",   icon:"assets/icons/checks.png", type:"info" },
  { id:"stripeLink",label:"Stripe Link", icon:"assets/icons/stripe.png", type:"link", link: PAYMENT_LINKS.stripe },
  { id:"athLink",  label:"ATH Link", icon:"assets/icons/ath.png",    type:"link", link: PAYMENT_LINKS.ath }
];

/* =======================
   INIT
======================= */
document.addEventListener("DOMContentLoaded", async ()=> {
  mountMethods();
  bindUI();
  await initFirebaseSafe();
  await showPinLock();
});

/* =======================
   FIREBASE INIT
======================= */
async function initFirebaseSafe(){
  if(!FIREBASE_ENABLED){
    console.warn("Firebase OFF (config vacío). Modo local activo.");
    return;
  }
  try{
    fb.app = firebase.initializeApp(firebaseConfig);
    fb.auth = firebase.auth();
    fb.db = firebase.firestore();

    // Cache offline de Firestore (iOS a veces limita, pero intentamos)
    try{ await fb.db.enablePersistence({ synchronizeTabs: true }); } catch(e){}

    // Auth anónimo (simple, rápido)
    const userCred = await fb.auth.signInAnonymously();
    fb.user = userCred.user;

    console.log("Firebase ON:", fb.user.uid);
  }catch(err){
    console.warn("Firebase falló, se queda local:", err);
  }
}

/* =======================
   PIN LOCK
======================= */
async function showPinLock(){
  const lock = $("pinLock");
  const input = $("pinInput");
  const btn = $("pinUnlockBtn");
  const msg = $("pinMsg");

  lock.classList.remove("hidden");
  msg.textContent = "";
  setTimeout(()=>input.focus(), 150);

  const unlock = ()=>{
    const v = (input.value || "").trim();
    if(v === getPin()){
      lock.classList.add("hidden");
      input.value = "";
      msg.textContent = "";
      return;
    }
    msg.textContent = "PIN incorrecto.";
    input.value = "";
    input.focus();
  };

  btn.onclick = unlock;
  input.onkeydown = (e)=>{ if(e.key === "Enter") unlock(); };
}

/* =======================
   UI BINDINGS
======================= */
function bindUI(){
  $("openHistoryBtn").onclick = ()=> openHistory();
  $("closeHistoryBtn").onclick = ()=> closeHistory();

  $("btnBack").onclick = ()=> goMethods();
  $("btnEdit").onclick = ()=> goRegister();

  $("btnContinue").onclick = ()=> {
    const rec = collectRecord();
    if(!rec) return;
    state.record = rec;
    goPay();
  };

  $("btnPaid").onclick = async ()=> {
    if(!state.record || !state.method) return;

    // Marca pagado + genera recibo + guarda (Firebase + local)
    const receipt = await createReceiptAndStore();
    // Share PDF (Mensajes)
    await shareReceiptPDF(receipt);
    // Vuelve al home
    goMethods();
  };

  $("btnSendLink").onclick = async ()=> {
    if(!state.method || state.method.type !== "link") return;
    const rec = state.record || collectRecord(true) || { name:"Cliente", amount:0, phone:"", note:"" };
    await sharePaymentLink(state.method, rec);
  };

  $("btnOpenLink").onclick = ()=> {
    if(!state.method || state.method.type !== "link") return;
    window.open(state.method.link, "_blank", "noopener,noreferrer");
  };

  $("btnRefreshHist").onclick = ()=> renderHistory();
  $("btnClearLocal").onclick = ()=> {
    if(confirm("¿Borrar cache local?")){
      saveCache([]);
      renderHistory();
    }
  };

  $("btnChangePin").onclick = ()=> changePinFlow();

  $("btnSyncGoogle").onclick = async ()=> {
    // “Sync Google” = exporta CSV + lo comparte (lo pegas donde quieras: Sheets, WhatsApp, Email)
    const all = await getReceiptsMerged();
    const csv = receiptsToCSV(all);
    await shareText("Nexus POS — Export CSV", csv);
  };
}

/* =======================
   VIEWS
======================= */
function goMethods(){
  $("pageTitle").textContent = "Select Payment Method";
  $("pageSub").textContent = "Selecciona el método. Luego registras el cliente y cobras.";

  $("viewMethods").classList.remove("hidden");
  $("viewRegister").classList.add("hidden");
  $("viewPay").classList.add("hidden");

  state.method = null;
  state.record = null;
}

function goRegister(){
  $("pageTitle").textContent = "Registro";
  $("pageSub").textContent = "Completa los datos para ticket e historial.";

  $("viewMethods").classList.add("hidden");
  $("viewRegister").classList.remove("hidden");
  $("viewPay").classList.add("hidden");

  $("methodPill").textContent = `Método: ${state.method?.label || "—"}`;
}

function goPay(){
  $("pageTitle").textContent = "Cobro";
  $("pageSub").textContent = "Muestra QR o abre enlace. Luego marca “Pago completado”.";

  $("viewMethods").classList.add("hidden");
  $("viewRegister").classList.add("hidden");
  $("viewPay").classList.remove("hidden");

  const total = money(state.record.amount);
  $("payPill").textContent = `Método: ${state.method.label} — Total $${total}`;

  // QR
  const qrBlock = $("qrBlock");
  const linkBlock = $("linkBlock");
  qrBlock.classList.add("hidden");
  linkBlock.classList.add("hidden");

  if(state.method.type === "qr" && state.method.qrImage){
    $("qrImg").src = state.method.qrImage;
    qrBlock.classList.remove("hidden");
  }

  if(state.method.type === "link"){
    linkBlock.classList.remove("hidden");
  }

  $("payHint").textContent = "El cliente paga. Luego marca “Pago completado (manual)”.";
}

/* =======================
   METHODS GRID (ICONO SOLO + NOMBRE AFUERA)
======================= */
function mountMethods(){
  const grid = $("payGrid");
  grid.innerHTML = "";

  METHODS.forEach(m=>{
    const btn = document.createElement("button");
    btn.className = "pay-icon-btn";
    btn.type = "button";
    btn.innerHTML = `
      <img src="${m.icon}" alt="${escapeHtml(m.label)}"/>
      <span>${escapeHtml(m.label)}</span>
    `;
    btn.onclick = ()=>{
      state.method = m;
      goRegister();
    };
    grid.appendChild(btn);
  });
}

/* =======================
   RECORD
======================= */
function collectRecord(soft=false){
  const name = ($("inpName").value || "").trim();
  const phone = ($("inpPhone").value || "").trim();
  const amountRaw = ($("inpAmount").value || "").trim();
  const note = ($("inpNote").value || "").trim();

  const amount = parseFloat(amountRaw.replace(/,/g,""));
  if(!soft){
    if(!name) return alert("Falta el nombre."), null;
    if(!amountRaw || isNaN(amount) || amount <= 0) return alert("Monto inválido."), null;
  }

  return {
    name: name || "Cliente",
    phone,
    amount: isNaN(amount) ? 0 : amount,
    note
  };
}

/* =======================
   RECEIPT ID
======================= */
function makeReceiptId(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  const ss = String(d.getSeconds()).padStart(2,"0");
  return `R-${y}${m}${day}-${hh}${mm}${ss}`;
}

/* =======================
   CREATE + STORE (Firebase + local)
======================= */
async function createReceiptAndStore(){
  const now = new Date();
  const receiptId = makeReceiptId();

  const receipt = {
    receiptId,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    deviceId: DEVICE_ID,

    methodId: state.method.id,
    methodLabel: state.method.label,
    isLink: state.method.type === "link",
    link: state.method.type === "link" ? state.method.link : null,

    customerName: state.record.name,
    customerPhone: state.record.phone,
    amount: Number(state.record.amount || 0),
    note: state.record.note || "",

    status: "PAGADO"
  };

  // 1) Local cache (siempre)
  const cache = loadCache();
  cache.unshift(receipt);
  saveCache(cache.slice(0, 300)); // límite razonable

  // 2) Firebase (si está activo)
  if(fb.db && fb.user){
    try{
      await fb.db.collection("receipts").add({
        ...receipt,
        uid: fb.user.uid,
        created: firebase.firestore.FieldValue.serverTimestamp()
      });
    }catch(e){
      console.warn("Firestore write fail, se queda local:", e);
    }
  }
  return receipt;
}

/* =======================
   HISTORY (merge Firebase + local)
======================= */
async function getReceiptsMerged(){
  const local = loadCache();
  let remote = [];

  if(fb.db){
    try{
      const snap = await fb.db
        .collection("receipts")
        .orderBy("createdAtMs","desc")
        .limit(50)
        .get();

      remote = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    }catch(e){
      console.warn("Firestore read fail:", e);
    }
  }

  // Merge por receiptId (evita duplicados)
  const map = new Map();
  [...remote, ...local].forEach(r=>{
    if(r && r.receiptId && !map.has(r.receiptId)) map.set(r.receiptId, r);
  });

  const merged = Array.from(map.values()).sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0));
  return merged;
}

async function renderHistory(){
  const body = $("histBody");
  body.innerHTML = "";

  const items = await getReceiptsMerged();

  if(!items.length){
    body.innerHTML = `
      <div class="row">
        <div class="muted">$0.00</div>
        <div class="muted">Sin registros</div>
        <div></div>
      </div>
    `;
    return;
  }

  items.slice(0, 50).forEach(r=>{
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="muted">$${money(r.amount || 0)}</div>
      <div class="muted">${escapeHtml(r.receiptId || "")}</div>
      <div>
        <button class="btn" data-share="${escapeHtml(r.receiptId)}">Compartir</button>
      </div>
    `;
    body.appendChild(row);

    row.querySelector("button[data-share]").onclick = async ()=>{
      const receipt = r;
      await shareReceiptPDF(receipt);
    };
  });
}

function openHistory(){
  $("historyModal").classList.remove("hidden");
  renderHistory();
}
function closeHistory(){
  $("historyModal").classList.add("hidden");
}

/* =======================
   PIN CHANGE
======================= */
function changePinFlow(){
  const current = prompt("PIN actual:");
  if(current === null) return;
  if(String(current).trim() !== getPin()){
    alert("PIN incorrecto.");
    return;
  }
  const n1 = prompt("Nuevo PIN (4 dígitos):");
  if(n1 === null) return;
  const clean = String(n1).trim();
  if(clean.length < 4) return alert("PIN demasiado corto.");
  setPin(clean);
  alert("PIN actualizado.");
}

/* =======================
   PAYMENT LINK SHARE
======================= */
async function sharePaymentLink(method, rec){
  const total = money(rec.amount || 0);
  const title = "Link de pago — Nexus POS";
  const msg =
`Hola ${rec.name || "Cliente"}.
Aquí está tu link de pago (${method.label}).
Total: $${total}
${rec.note ? "Nota: " + rec.note + "\n" : ""}${method.link}`;

  await shareText(title, msg);
}

/* =======================
   jsPDF RECEIPT + SHARE
======================= */
function buildReceiptPDF(receipt){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"pt", format:"a4" });

  const left = 52;
  let y = 70;

  doc.setFont("courier","bold");
  doc.setFontSize(18);
  doc.text("RECIBO DE PAGO", left, y);

  y += 26;
  doc.setFont("courier","normal");
  doc.setFontSize(12);
  doc.text("Nexus Payments", left, y);

  y += 18;
  doc.text("Tel: 787-664-3079", left, y);

  y += 18;
  doc.text("Puerto Rico", left, y);

  y += 22;
  doc.text("------------------------------------------------", left, y);

  y += 20;
  doc.setFont("courier","bold");
  doc.text(`Recibo: ${receipt.receiptId}`, left, y);

  y += 18;
  doc.setFont("courier","normal");
  doc.text(`Fecha: ${formatDate(receipt.createdAt)}`, left, y);

  y += 18;
  doc.text("------------------------------------------------", left, y);

  y += 22;
  doc.setFont("courier","bold");
  doc.text("CLIENTE", left, y);

  y += 18;
  doc.setFont("courier","normal");
  doc.text(`Nombre: ${safeText(receipt.customerName)}`, left, y);

  y += 18;
  doc.text(`Telefono: ${safeText(receipt.customerPhone || "")}`, left, y);

  y += 18;
  doc.text("------------------------------------------------", left, y);

  y += 22;
  doc.setFont("courier","bold");
  doc.text("PAGO", left, y);

  y += 18;
  doc.setFont("courier","normal");
  doc.text(`Metodo: ${safeText(receipt.methodLabel)}`, left, y);

  y += 18;
  doc.text(`Estado: ${safeText(receipt.status)}`, left, y);

  y += 26;
  doc.setFont("courier","bold");
  doc.setFontSize(20);
  doc.text(`TOTAL: $${money(receipt.amount || 0)}`, left, y);

  y += 26;
  doc.setFont("courier","bold");
  doc.setFontSize(12);
  doc.text("NOTA", left, y);

  y += 18;
  doc.setFont("courier","normal");
  doc.text(safeText(receipt.note || "-"), left, y);

  y += 22;
  doc.text("------------------------------------------------", left, y);

  y += 20;
  doc.text("Gracias por su pago.", left, y);

  return doc;
}

async function shareReceiptPDF(receipt){
  const doc = buildReceiptPDF(receipt);
  const blob = doc.output("blob");

  const filename = `${receipt.receiptId}.pdf`;
  const file = new File([blob], filename, { type:"application/pdf" });

  // Share Sheet (iOS) con archivo
  if(navigator.share && navigator.canShare && navigator.canShare({ files:[file] })){
    try{
      await navigator.share({
        title: "Recibo de pago",
        text: `Recibo ${receipt.receiptId} — Total $${money(receipt.amount || 0)}`,
        files: [file]
      });
      return;
    }catch(e){}
  }

  // Fallback: abrir PDF en nueva pestaña + el user comparte desde iOS
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(()=>URL.revokeObjectURL(url), 60000);
}

/* =======================
   SHARE TEXT (links / csv)
======================= */
async function shareText(title, text){
  if(navigator.share){
    try{
      await navigator.share({ title, text });
      return;
    }catch(e){}
  }
  // fallback copy
  try{
    await navigator.clipboard.writeText(text);
    alert("Copiado al portapapeles.");
  }catch(e){
    prompt("Copia esto:", text);
  }
}

/* =======================
   UTIL
======================= */
function money(n){
  const v = Number(n || 0);
  return v.toFixed(2);
}
function formatDate(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("es-PR");
  }catch(e){
    return iso || "";
  }
}
function safeText(s){
  return String(s || "").replace(/\s+/g," ").trim();
}
function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =======================
   NAV
======================= */
function goHome(){
  $("viewMethods").classList.remove("hidden");
  $("viewRegister").classList.add("hidden");
  $("viewPay").classList.add("hidden");
}

/* =======================
   SERVICE WORKER REGISTER (simple)
======================= */
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=> {
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  });
}
