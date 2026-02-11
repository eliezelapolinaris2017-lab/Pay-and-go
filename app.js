/*************************************************
 * Nexus POS — Payment Platform (Final)
 * Carpeta icons: assets/icons/*
 *************************************************/

const APP = {
  method: null,
  data: {
    nombre: "",
    telefono: "",
    monto: "",
    nota: ""
  },
  lastTicket: null
};

/* ====== LINKS REALES (los tuyos) ====== */
const STRIPE_PAY_LINK = "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h";
const ATH_PAY_LINK    = "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660";

/* ====== QR IMAGES (ajusta solo si el nombre difiere) ======
   NO toco tus carpetas. Si tus QR están en otro path/nombre,
   cambia estas 2 líneas y ya.
*/
const STRIPE_QR_SRC = "assets/qr-stripe.png";
const ATH_QR_SRC    = "assets/qr-ath.png";

/* ====== FIREBASE ====== */
const firebaseConfig = {
  apiKey: "AIzaSyAabJd7_zxocAktRlERRv3BHCYpfyiF4ig",
  authDomain: "nexus-payment-platform.firebaseapp.com",
  projectId: "nexus-payment-platform",
  storageBucket: "nexus-payment-platform.firebasestorage.app",
  messagingSenderId: "482375789187",
  appId: "1:482375789187:web:e13839db6d644e215009b6"
};

let db = null;
let firebaseReady = false;

function initFirebase(){
  try{
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseReady = true;
  }catch(e){
    console.warn("Firebase init error:", e);
    firebaseReady = false;
  }
}

/* ====== CACHE LOCAL ====== */
const CACHE_KEY = "nexuspos_cache_tickets_v1";
function readCache(){
  try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); }catch{ return []; }
}
function writeCache(list){
  localStorage.setItem(CACHE_KEY, JSON.stringify(list || []));
}

/* ====== PIN ====== */
const PIN_KEY = "nexuspos_pin";
function getPin(){
  return localStorage.getItem(PIN_KEY) || "1234";
}
function setPin(pin){
  localStorage.setItem(PIN_KEY, String(pin||"").trim());
}

/* ====== UI refs ====== */
const $ = (q)=>document.querySelector(q);

const views = {
  home: $("#viewHome"),
  reg: $("#viewRegistro"),
  cobro: $("#viewCobro")
};

const pageTitle = $("#pageTitle");
const pageSub = $("#pageSub");

const pillMethod = $("#pillMethod");
const pillCobro = $("#pillCobro");

const fNombre = $("#fNombre");
const fTelefono = $("#fTelefono");
const fMonto = $("#fMonto");
const fNota = $("#fNota");

const qrWrap = $("#qrWrap");
const qrImg  = $("#qrImg");

const linkWrap = $("#linkWrap");
const linkText = $("#linkText");
const btnShareLink = $("#btnShareLink");

const pinLock = $("#pinLock");
const pinInput = $("#pinInput");
const pinBtn = $("#pinBtn");

const histModal = $("#histModal");
const histRows = $("#histRows");

/* ====== NAV ====== */
function showView(name){
  Object.values(views).forEach(v=>v.classList.add("hidden"));
  views[name].classList.remove("hidden");

  if(name === "home"){
    pageTitle.textContent = "Select Payment Method";
    pageSub.textContent = "Selecciona el método. Luego registras el cliente y cobras.";
  }
  if(name === "reg"){
    pageTitle.textContent = "Registro";
    pageSub.textContent = "Completa los datos para ticket e historial.";
  }
  if(name === "cobro"){
    pageTitle.textContent = "Cobro";
    pageSub.textContent = "Muestra QR o abre enlace. Luego marca “Pago completado”.";
  }
}

/* ====== METHODS ====== */
const METHOD_LABEL = {
  stripe: "Stripe",
  ath: "ATH Móvil",
  tap: "Tap to Pay",
  cash: "Cash",
  checks: "Checks",
  stripe_link: "Stripe Link",
  ath_link: "ATH Link"
};

function pickMethod(method){
  APP.method = method;
  pillMethod.textContent = `Método: ${METHOD_LABEL[method] || method}`;
  showView("reg");
}

/* ====== COBRO SCREEN ====== */
function openCobro(){
  const m = APP.method;
  const total = toMoney(APP.data.monto);

  pillCobro.textContent = `Método: ${METHOD_LABEL[m] || m} — Total $${total.toFixed(2)}`;

  // reset panels
  qrWrap.classList.add("hidden");
  linkWrap.classList.add("hidden");

  // show according to method
  if(m === "stripe"){
    qrImg.src = STRIPE_QR_SRC;
    qrWrap.classList.remove("hidden");
  }else if(m === "ath"){
    qrImg.src = ATH_QR_SRC;
    qrWrap.classList.remove("hidden");
  }else if(m === "stripe_link"){
    linkText.textContent = STRIPE_PAY_LINK;
    linkWrap.classList.remove("hidden");
  }else if(m === "ath_link"){
    linkText.textContent = ATH_PAY_LINK;
    linkWrap.classList.remove("hidden");
  }else{
    // tap / cash / checks -> no qr, no link
    linkText.textContent = "";
  }

  showView("cobro");
}

/* ====== RECEIPT ====== */
function nowId(){
  const d = new Date();
  const pad = (n)=>String(n).padStart(2,"0");
  const y = d.getFullYear();
  const mo = pad(d.getMonth()+1);
  const da = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `R-${y}${mo}${da}-${hh}${mm}${ss}`;
}

function toMoney(v){
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function formatDate(dt){
  try{
    return new Intl.DateTimeFormat("es-PR", { dateStyle:"short", timeStyle:"medium" }).format(dt);
  }catch{
    return String(dt);
  }
}

function buildReceiptText(ticket){
  const lines = [];
  lines.push("RECIBO DE PAGO");
  lines.push("");
  lines.push("Nexus Payments");
  lines.push("Tel: 787-664-3079");
  lines.push("Puerto Rico");
  lines.push("");
  lines.push("--------------------------------");
  lines.push(`Recibo: ${ticket.id}`);
  lines.push(`Fecha: ${formatDate(new Date(ticket.createdAt))}`);
  lines.push("--------------------------------");
  lines.push("CLIENTE");
  lines.push(`Nombre: ${ticket.nombre || "-"}`);
  lines.push(`Telefono: ${ticket.telefono || "-"}`);
  lines.push("--------------------------------");
  lines.push("PAGO");
  lines.push(`Metodo: ${METHOD_LABEL[ticket.method] || ticket.method}`);
  lines.push(`Estado: PAGADO`);
  lines.push("");
  lines.push(`TOTAL: $${Number(ticket.monto||0).toFixed(2)}`);
  lines.push("");
  lines.push("NOTA");
  lines.push(`${ticket.nota || "-"}`);
  lines.push("");
  lines.push("--------------------------------");
  lines.push("Gracias por su pago.");
  return lines.join("\n");
}

async function shareReceipt(ticket){
  const text = buildReceiptText(ticket);

  // Web Share (texto)
  if(navigator.share){
    try{
      await navigator.share({
        title: "Recibo de pago",
        text: text
      });
      return true;
    }catch(e){
      // usuario canceló o no soporta
    }
  }

  // Fallback: copiar
  try{
    await navigator.clipboard.writeText(text);
    alert("Recibo copiado. Pégalo en Mensajes/WhatsApp y envíalo.");
  }catch{
    alert(text);
  }
  return false;
}

/* ====== FIREBASE SAVE ====== */
async function saveTicket(ticket){
  // Siempre guarda en cache local primero
  const cache = readCache();
  cache.unshift(ticket);
  writeCache(cache.slice(0,200));

  // Luego intenta Firebase
  if(!firebaseReady || !db) return;

  try{
    await db.collection("tickets").doc(ticket.id).set(ticket, { merge:true });
  }catch(e){
    console.warn("Firebase save failed:", e);
  }
}

/* ====== HISTORIAL ====== */
async function loadHistory(){
  // UI: limpia
  histRows.innerHTML = "";

  // 1) intenta firebase
  if(firebaseReady && db){
    try{
      const snap = await db.collection("tickets")
        .orderBy("createdAt", "desc")
        .limit(25)
        .get();

      const list = [];
      snap.forEach(doc => list.push(doc.data()));
      if(list.length){
        // refresca cache
        writeCache(list.concat(readCache()).slice(0,200));
        renderHistory(list);
        return;
      }
    }catch(e){
      console.warn("Firebase read failed:", e);
    }
  }

  // 2) fallback cache
  renderHistory(readCache().slice(0,25));
}

function renderHistory(list){
  if(!list || !list.length){
    histRows.innerHTML = `<div class="row"><div class="muted">$0.00</div><div class="muted">Sin registros</div><div></div></div>`;
    return;
  }

  histRows.innerHTML = list.map(t => {
    const monto = `$${Number(t.monto||0).toFixed(2)}`;
    const id = t.id || "-";
    return `
      <div class="row">
        <div class="muted">${monto}</div>
        <div class="muted">${id}</div>
        <div><button class="btn" data-share="${id}">Compartir</button></div>
      </div>
    `;
  }).join("");

  // bind share buttons
  histRows.querySelectorAll("[data-share]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-share");
      const all = readCache();
      const ticket = all.find(x => x.id === id) || (APP.lastTicket && APP.lastTicket.id===id ? APP.lastTicket : null);
      if(ticket) shareReceipt(ticket);
    });
  });
}

/* ====== MODAL ====== */
function openHist(){
  histModal.classList.remove("hidden");
  loadHistory();
}
function closeHist(){
  histModal.classList.add("hidden");
}

/* ====== LINK SHARE ====== */
async function shareLink(url){
  if(navigator.share){
    try{
      await navigator.share({ title:"Link de pago", text:"Paga aquí:", url });
      return;
    }catch(e){}
  }
  // fallback: abre
  window.open(url, "_blank");
}

/* ====== EVENTS ====== */
function bind(){
  // Pick method
  document.querySelectorAll(".pay-icon-btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      pickMethod(btn.dataset.method);
    });
  });

  $("#btnBackHome").addEventListener("click", ()=>showView("home"));

  $("#btnToCobro").addEventListener("click", ()=>{
    APP.data.nombre = fNombre.value.trim();
    APP.data.telefono = fTelefono.value.trim();
    APP.data.monto = fMonto.value;
    APP.data.nota = fNota.value.trim();

    if(!APP.data.nombre){
      alert("Falta el nombre.");
      return;
    }
    if(toMoney(APP.data.monto) <= 0){
      alert("Monto inválido.");
      return;
    }
    openCobro();
  });

  $("#btnEdit").addEventListener("click", ()=>showView("reg"));

  $("#btnPaid").addEventListener("click", async ()=>{
    const ticket = {
      id: nowId(),
      method: APP.method,
      nombre: APP.data.nombre,
      telefono: APP.data.telefono,
      monto: Number(toMoney(APP.data.monto).toFixed(2)),
      nota: APP.data.nota || "",
      createdAt: new Date().toISOString()
    };

    APP.lastTicket = ticket;

    await saveTicket(ticket);
    await shareReceipt(ticket);

    // vuelve a home
    showView("home");
  });

  // historial
  $("#btnHistory").addEventListener("click", openHist);
  $("#btnCloseHist").addEventListener("click", closeHist);

  $("#btnRefresh").addEventListener("click", loadHistory);

  $("#btnClearCache").addEventListener("click", ()=>{
    if(confirm("¿Borrar cache local?")){
      writeCache([]);
      loadHistory();
    }
  });

  // Sync Google: se queda dentro del historial como pediste (placeholder)
  $("#btnSyncGoogle").addEventListener("click", ()=>{
    alert("Sync Google: listo para integrar cuando conectes tu flujo (Sheets/Drive/API).");
  });

  // cambiar PIN
  $("#btnChangePin").addEventListener("click", ()=>{
    const current = prompt("PIN actual:");
    if(current !== getPin()){
      alert("PIN incorrecto.");
      return;
    }
    const np = prompt("Nuevo PIN (4-8 dígitos):");
    if(!np || np.length < 4){
      alert("PIN inválido.");
      return;
    }
    setPin(np);
    alert("PIN actualizado.");
  });

  // share link button
  btnShareLink.addEventListener("click", ()=>{
    if(APP.method === "stripe_link") shareLink(STRIPE_PAY_LINK);
    if(APP.method === "ath_link") shareLink(ATH_PAY_LINK);
  });

  // Si están en pantalla cobro por link, tocar el card también comparte
  linkWrap.addEventListener("click", ()=>{
    if(APP.method === "stripe_link") shareLink(STRIPE_PAY_LINK);
    if(APP.method === "ath_link") shareLink(ATH_PAY_LINK);
  });

  // Cerrar modal tocando fuera
  histModal.addEventListener("click", (e)=>{
    if(e.target === histModal) closeHist();
  });

  // PIN lock
  pinBtn.addEventListener("click", ()=>{
    const v = pinInput.value.trim();
    if(v !== getPin()){
      pinInput.value = "";
      pinInput.focus();
      alert("PIN incorrecto.");
      return;
    }
    pinLock.classList.add("hidden");
  });

  pinInput.addEventListener("keydown", (e)=>{
    if(e.key === "Enter") pinBtn.click();
  });
}

/* ====== START ====== */
(function start(){
  initFirebase();
  bind();
  showView("home");

  // PIN on load
  pinLock.classList.remove("hidden");
  setTimeout(()=>pinInput.focus(), 250);
})();
