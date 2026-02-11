/* =========================================================
   Nexus POS — app.js (PWA + Firestore + Ticket jsPDF)
   ========================================================= */

/* ====== CONFIG ====== */
const CONFIG = {
  brand: "Nexus POS",
  phone: "787-664-3079",
  location: "Puerto Rico",
  currency: "USD",

  // QR/Link por método (editable)
  methods: [
    {
      id: "stripe",
      title: "Stripe",
      subtitle: "Escanear QR",
      iconImg: "assets/icons/stripe.png",
      kind: "qr",
      qrImg: "assets/stripe-qr.png",
      linkUrl: "" // opcional si quieres abrir link
    },
    {
      id: "ath",
      title: "ATH Móvil",
      subtitle: "Escanear QR",
      iconImg: "assets/icons/ath.png",
      kind: "qr",
      qrImg: "assets/ath-qr.png",
      linkUrl: ""
    },
    {
      id: "tap",
      title: "Tap to Pay",
      subtitle: "iPhone (link)",
      iconImg: "assets/icons/tap.png",
      kind: "link",
      linkUrl: "" // pon tu link real si tienes
    },
    {
      id: "cash",
      title: "Cash",
      subtitle: "Efectivo",
      iconImg: "assets/icons/cash.png",
      kind: "manual"
    },
    {
      id: "checks",
      title: "Checks",
      subtitle: "Cheque",
      iconImg: "assets/icons/checks.png",
      kind: "manual"
    }
  ]
};

/* ====== STORAGE ====== */
const LS_KEY = "nexuspos_payments_v1";

/* ====== FIREBASE (PEGA TU CONFIG REAL) ====== */
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_BUCKET",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

let db = null;
let unsubscribeCloud = null;

try{
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log("Firebase listo ✅");
}catch(e){
  console.warn("Firebase no inicializado (usando local):", e);
}

/* ====== HELPERS ====== */
const $ = (id) => document.getElementById(id);
const fmtMoney = (n) => {
  const v = Number(n || 0);
  return v.toLocaleString("en-US", { style:"currency", currency: CONFIG.currency });
};
const nowISO = () => new Date().toISOString();

function makeReceiptId(){
  // R-YYYYMMDD-HHMMSS-XXXX
  const d = new Date();
  const pad = (x) => String(x).padStart(2,"0");
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const rnd = Math.random().toString(16).slice(2,6).toUpperCase();
  return `R-${y}${m}${day}-${hh}${mm}${ss}-${rnd}`;
}

/* ====== LOCAL PAYMENTS ====== */
function localGet(){
  return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
}
function localSet(arr){
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function localAdd(payment){
  const arr = localGet();
  arr.unshift(payment);
  localSet(arr);
}

/* ====== CLOUD SAVE ====== */
async function saveToCloud(payment){
  if(!db) return { ok:false, where:"local" };
  try{
    const docRef = await db.collection("payments").add({
      ...payment,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return { ok:true, where:"cloud", id: docRef.id };
  }catch(e){
    console.warn("Cloud save fail -> local only", e);
    return { ok:false, where:"local" };
  }
}

/* ====== SYNC LOCAL -> CLOUD ====== */
async function syncLocalToCloud(){
  if(!db) return { ok:false, msg:"Firebase no está listo." };

  const arr = localGet();
  const pending = arr.filter(x => x && x._cloud !== true);

  if(pending.length === 0) return { ok:true, msg:"Nada pendiente." };

  let okCount = 0;
  for(const p of pending){
    const res = await saveToCloud(p);
    if(res.ok){
      okCount++;
      // marca como subido
      p._cloud = true;
      p._cloudId = res.id || null;
    }
  }

  // guardar cambios en local
  localSet(arr);

  return { ok:true, msg:`Sincronizado: ${okCount}/${pending.length}` };
}

/* ====== CLOUD LISTEN ====== */
function startCloudListener(onData){
  if(!db) return;
  if(unsubscribeCloud) unsubscribeCloud();

  unsubscribeCloud = db.collection("payments")
    .orderBy("createdAt","desc")
    .limit(300)
    .onSnapshot((snap) => {
      const cloud = [];
      snap.forEach(doc => {
        const d = doc.data();
        cloud.push({ ...d, _cloud:true, _cloudId: doc.id });
      });
      onData(cloud);
    }, (err) => {
      console.warn("Listener error:", err);
    });
}

/* ====== UI STATE ====== */
let selectedMethod = null;
let lastPayment = null;
let cloudCache = []; // data nube

/* ====== RENDER METHODS ====== */
function renderMethods(){
  const grid = $("methodsGrid");
  grid.innerHTML = "";

  CONFIG.methods.forEach((m) => {
    const btn = document.createElement("button");
    btn.className = "tileBtn";
    btn.type = "button";

    btn.innerHTML = `
      <div class="tileInner">
        <div class="tileLogoWrap">
          <img class="tileLogo" src="${m.iconImg}" alt="${m.title}">
        </div>
        <div class="tileText">
          <div class="tileTitle">${m.title}</div>
          <div class="tileSmall">${m.subtitle}</div>
        </div>
      </div>
    `;

    btn.addEventListener("click", () => {
      selectedMethod = m;
      openRegister();
    });

    grid.appendChild(btn);
  });
}

/* ====== NAV ====== */
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function openRegister(){
  hide($("screenMethods"));
  show($("screenRegister"));
  $("methodBadge").textContent = `Método: ${selectedMethod?.title || "-"}`;
  $("statusHint").textContent = "Listo.";
  $("payForm").reset();
  $("fAmount").value = "75.00";
  lastPayment = null;
}

function backToMethods(){
  hide($("screenRegister"));
  show($("screenMethods"));
  lastPayment = null;
}

/* ====== QR MODAL ====== */
function openQR(method){
  if(method.kind === "link" && method.linkUrl){
    window.open(method.linkUrl, "_blank");
    return;
  }

  if(method.kind === "qr"){
    $("qrTitle").textContent = `${method.title} — Escanea para pagar`;
    $("qrSub").textContent = "Escanea el QR y completa el pago.";
    $("qrImg").src = method.qrImg;
    $("qrFoot").textContent = method.linkUrl ? `Link alterno: ${method.linkUrl}` : "";
    show($("qrModal"));
  } else {
    // manual -> no QR
    $("statusHint").textContent = "Método manual: marca Pago completado cuando cobres.";
  }
}

function closeQR(){ hide($("qrModal")); }

/* ====== HISTORIAL (merge nube + local) ====== */
function mergedHistory(){
  const local = localGet();

  // estrategia: mostrar nube primero (si existe), y local no-subido separado
  const cloudIds = new Set(cloudCache.map(x => x._cloudId).filter(Boolean));

  const localPending = local
    .filter(x => x && x._cloud !== true)
    .map(x => ({ ...x, _cloud:false, _pending:true }));

  const cloud = cloudCache.map(x => ({ ...x, _cloud:true, _pending:false }));

  // si no hay nube (db off) muestra local completo
  if(!db) return local.map(x => ({...x, _cloud:false, _pending:(x._cloud!==true)}));

  // merge
  return [...cloud, ...localPending].slice(0, 400);
}

function renderHistory(){
  const tbody = $("histBody");
  tbody.innerHTML = "";

  const rows = mergedHistory();

  rows.forEach((p) => {
    const tr = document.createElement("tr");
    const dt = p.createdAt?.toDate ? p.createdAt.toDate() : (p.dateISO ? new Date(p.dateISO) : new Date());
    const dateStr = dt.toLocaleString("es-PR");

    const status = p.status || (p._pending ? "PENDIENTE" : "OK");
    const id = p.receiptId || p._cloudId || "-";

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${p.method || "-"}</td>
      <td>${p.name || "-"}</td>
      <td>${p.phone || "-"}</td>
      <td>${p.note || ""}</td>
      <td class="r">${fmtMoney(p.amount)}</td>
      <td>${status}</td>
      <td>${id}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* ====== PDF TICKET (pequeño tipo tienda) ====== */
async function printTicket(payment){
  const { jsPDF } = window.jspdf;

  // ticket narrow (80mm aprox) -> jsPDF usa "mm"
  const doc = new jsPDF({ unit:"mm", format:[80, 150] });

  const x = 6;
  let y = 10;

  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text(CONFIG.brand.toUpperCase(), x, y); y += 6;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(`Tel: ${CONFIG.phone}`, x, y); y += 5;
  doc.text(`${CONFIG.location}`, x, y); y += 6;

  doc.setDrawColor(200);
  doc.line(x, y, 74, y); y += 6;

  const d = new Date();
  doc.text(`Recibo: ${payment.receiptId}`, x, y); y += 5;
  doc.text(`Fecha: ${d.toLocaleString("es-PR")}`, x, y); y += 6;

  doc.setFont("courier", "bold");
  doc.text("CLIENTE", x, y); y += 5;
  doc.setFont("courier", "normal");
  doc.text(`${payment.name}`, x, y); y += 5;
  if(payment.phone) { doc.text(`${payment.phone}`, x, y); y += 5; }
  if(payment.invoice) { doc.text(`Ref: ${payment.invoice}`, x, y); y += 5; }
  y += 2;

  doc.setFont("courier", "bold");
  doc.text("PAGO", x, y); y += 5;
  doc.setFont("courier", "normal");
  doc.text(`Método: ${payment.method}`, x, y); y += 5;
  doc.text(`Estado: ${payment.status}`, x, y); y += 6;

  doc.setFont("courier", "bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: ${fmtMoney(payment.amount)}`, x, y); y += 7;

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  if(payment.note){
    doc.text("Nota:", x, y); y += 5;
    doc.text(doc.splitTextToSize(payment.note, 66), x, y);
    y += 10;
  }

  doc.line(x, y, 74, y); y += 8;
  doc.text("Gracias por su pago.", x, y);

  doc.save(`${payment.receiptId}.pdf`);
}

/* ====== EVENTS ====== */
function bindEvents(){
  $("btnBack").addEventListener("click", backToMethods);

  $("btnCloseQR").addEventListener("click", closeQR);
  $("qrModal").addEventListener("click", (e) => {
    if(e.target === $("qrModal")) closeQR();
  });

  $("btnHistory").addEventListener("click", () => {
    show($("histModal"));
    renderHistory();
  });

  $("btnCloseHist").addEventListener("click", () => hide($("histModal")));
  $("histModal").addEventListener("click", (e) => {
    if(e.target === $("histModal")) hide($("histModal"));
  });

  $("btnExportCSV").addEventListener("click", exportCSV);
  $("btnExportJSON").addEventListener("click", exportJSON);
  $("btnClearLocal").addEventListener("click", () => {
    if(confirm("¿Borrar historial local?")){
      localSet([]);
      renderHistory();
    }
  });

  $("btnSync").addEventListener("click", async () => {
    $("btnSync").disabled = true;
    const r = await syncLocalToCloud();
    $("btnSync").disabled = false;
    alert(r.msg);
    renderHistory();
  });

  // Guardar (submit)
  $("payForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payment = buildPayment("GUARDADO");
    lastPayment = payment;

    localAdd(payment);
    $("statusHint").textContent = "Guardado local ✅ (intentando nube...)";

    const res = await saveToCloud(payment);
    if(res.ok){
      markLocalAsCloud(payment.receiptId, res.id);
      $("statusHint").textContent = "Guardado en nube ✅";
    }else{
      $("statusHint").textContent = "Sin internet / nube: quedó en local (pendiente).";
    }
  });

  // Ir a pagar
  $("btnGoPay").addEventListener("click", () => {
    const draft = buildPayment("PENDIENTE");
    lastPayment = draft;
    openQR(selectedMethod);
  });

  // Pago completado manual + PDF + save
  $("btnPaid").addEventListener("click", async () => {
    const payment = buildPayment("PAGADO");
    lastPayment = payment;

    localAdd(payment);
    $("statusHint").textContent = "Pago marcado PAGADO. Guardando...";

    const res = await saveToCloud(payment);
    if(res.ok){
      markLocalAsCloud(payment.receiptId, res.id);
      $("statusHint").textContent = "PAGADO ✅ (nube)";
    }else{
      $("statusHint").textContent = "PAGADO ✅ (local pendiente de sync)";
    }

    await printTicket(payment);
  });

  // Sync automático al volver online
  window.addEventListener("online", async () => {
    const r = await syncLocalToCloud();
    console.log("Sync online:", r);
  });
}

/* ====== BUILD PAYMENT ====== */
function buildPayment(status){
  const name = $("fName").value.trim();
  const phone = $("fPhone").value.trim();
  const amount = parseFloat(String($("fAmount").value).replace(/[^0-9.]/g,"")) || 0;
  const invoice = $("fInvoice").value.trim();
  const note = $("fNote").value.trim();

  if(!selectedMethod) throw new Error("No method selected");

  return {
    receiptId: makeReceiptId(),
    dateISO: nowISO(),
    status,
    method: selectedMethod.title,
    methodId: selectedMethod.id,
    name,
    phone,
    amount,
    invoice,
    note,
    _cloud: false
  };
}

function markLocalAsCloud(receiptId, cloudId){
  const arr = localGet();
  const idx = arr.findIndex(x => x && x.receiptId === receiptId);
  if(idx >= 0){
    arr[idx]._cloud = true;
    arr[idx]._cloudId = cloudId || null;
    localSet(arr);
  }
}

/* ====== EXPORTS ====== */
function downloadFile(filename, content, type){
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(){
  const data = mergedHistory();
  downloadFile(`nexuspos_historial_${Date.now()}.json`, JSON.stringify(data, null, 2), "application/json");
}

function exportCSV(){
  const data = mergedHistory();
  const header = ["fecha","metodo","cliente","telefono","nota","monto","estado","id"];
  const lines = [header.join(",")];

  data.forEach(p => {
    const dt = p.createdAt?.toDate ? p.createdAt.toDate() : (p.dateISO ? new Date(p.dateISO) : new Date());
    const row = [
      `"${dt.toLocaleString("es-PR")}"`,
      `"${(p.method||"").replaceAll('"','""')}"`,
      `"${(p.name||"").replaceAll('"','""')}"`,
      `"${(p.phone||"").replaceAll('"','""')}"`,
      `"${(p.note||"").replaceAll('"','""')}"`,
      `${Number(p.amount||0)}`,
      `"${(p.status||"").replaceAll('"','""')}"`,
      `"${(p.receiptId || p._cloudId || "").replaceAll('"','""')}"`
    ];
    lines.push(row.join(","));
  });

  downloadFile(`nexuspos_historial_${Date.now()}.csv`, lines.join("\n"), "text/csv");
}

/* ====== INIT ====== */
function init(){
  renderMethods();
  bindEvents();

  // Listener nube
  if(db){
    startCloudListener((cloud) => {
      cloudCache = cloud;
      // si historial abierto, repinta
      if(!$("histModal").classList.contains("hidden")){
        renderHistory();
      }
    });
  }

  // intento de sync al arrancar
  syncLocalToCloud().then(r => console.log("Sync init:", r));
}

document.addEventListener("DOMContentLoaded", init);
