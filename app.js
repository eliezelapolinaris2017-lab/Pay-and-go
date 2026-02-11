/********************************************************
 Nexus POS — Payment Platform (FINAL)
 - assets/bg.png + assets/icons/*
 - Firebase Auth: Anonymous + Google link (historial único)
 - Firestore: users/{uid}/payments
 - Ticket: jsPDF + Share Sheet
 - PIN lock: setup + verify + change pin
*********************************************************/

const CONFIG = {
  brand: { business: "Nexus Payments", phone: "787-664-3079", location: "Puerto Rico" },
  links: { tapToPay: "https://example.com/tap-to-pay" },
  icons: {
    stripe: "assets/icons/stripe.png",
    ath: "assets/icons/ath.png",
    tap: "assets/icons/tap.png",
    cash: "assets/icons/cash.png",
    checks: "assets/icons/checks.png"
  },
  qrCandidates: {
    stripe: ["assets/icons/stripe-qr.png", "assets/icons/stripe.png"],
    ath: ["assets/icons/ath-qr.png", "assets/icons/ath.png"]
  }
};

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyAabJd7_zxocAktRlERRv3BHCYpfyiF4ig",
  authDomain: "nexus-payment-platform.firebaseapp.com",
  projectId: "nexus-payment-platform",
  storageBucket: "nexus-payment-platform.firebasestorage.app",
  messagingSenderId: "482375789187",
  appId: "1:482375789187:web:e13839db6d644e215009b6"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== UI refs =====
const screenMethods = document.getElementById("screenMethods");
const screenRegister = document.getElementById("screenRegister");
const screenPay = document.getElementById("screenPay");

const methodsGrid = document.getElementById("methodsGrid");
const methodBadge = document.getElementById("methodBadge");
const payBadge = document.getElementById("payBadge");

const payForm = document.getElementById("payForm");
const nameEl = document.getElementById("name");
const phoneEl = document.getElementById("phone");
const amountEl = document.getElementById("amount");
const noteEl = document.getElementById("note");

const payArea = document.getElementById("payArea");
const payHint = document.getElementById("payHint");

const btnBack = document.getElementById("btnBack");
const btnEdit = document.getElementById("btnEdit");
const btnPaid = document.getElementById("btnPaid");

const btnHistory = document.getElementById("btnHistory");
const historyModal = document.getElementById("historyModal");
const btnCloseHistory = document.getElementById("btnCloseHistory");
const btnRefresh = document.getElementById("btnRefresh");
const btnClearLocal = document.getElementById("btnClearLocal");
const btnSync = document.getElementById("btnSync");
const btnChangePin = document.getElementById("btnChangePin");
const historyTableBody = document.querySelector("#historyTable tbody");

// PIN UI
const pinModal = document.getElementById("pinModal");
const pinTitle = document.getElementById("pinTitle");
const pinSub = document.getElementById("pinSub");
const pinDots = document.getElementById("pinDots");
const pinPad = document.getElementById("pinPad");
const pinBackspace = document.getElementById("pinBackspace");
const pinSubmit = document.getElementById("pinSubmit");
const pinHint = document.getElementById("pinHint");

// ===== Métodos =====
const METHODS = [
  { id:"stripe", label:"Stripe", icon: CONFIG.icons.stripe, mode:"qr" },
  { id:"ath", label:"ATH Móvil", icon: CONFIG.icons.ath, mode:"qr" },
  { id:"tap", label:"Tap to Pay", icon: CONFIG.icons.tap, mode:"link", link: () => CONFIG.links.tapToPay },
  { id:"cash", label:"Cash", icon: CONFIG.icons.cash, mode:"manual" },
  { id:"checks", label:"Checks", icon: CONFIG.icons.checks, mode:"manual" }
];

const state = { method:null, form:{ name:"", phone:"", amount:"", note:"" } };

// ===== Local cache =====
const LS_PAY = "nexus_pos_payments_cache";
const LS_PIN = "nexus_pos_pin_hash_v1";

function getLocalPayments(){ try{return JSON.parse(localStorage.getItem(LS_PAY)||"[]");}catch{return[];} }
function setLocalPayments(arr){ localStorage.setItem(LS_PAY, JSON.stringify(arr)); }
function pushLocalPayment(p){ const arr=getLocalPayments(); arr.unshift(p); setLocalPayments(arr); }

// ===== Helpers =====
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }
function go(to){ [screenMethods, screenRegister, screenPay].forEach(hide); show(to); window.scrollTo({top:0,behavior:"smooth"}); }
function money(n){ return (Number(n||0)).toFixed(2); }
function safeText(s){ return String(s ?? "").trim(); }
function pad2(v){ return String(v).padStart(2,"0"); }
function nowStamp(){ const d=new Date(); return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`; }
function receiptNo(){ return `R-${nowStamp()}`; }
function currentUID(){ return auth.currentUser?.uid || null; }
function fmtDate(v){
  if(!v) return "—";
  if(typeof v === "string") return new Date(v).toLocaleString("es-PR");
  if(v.seconds) return new Date(v.seconds*1000).toLocaleString("es-PR");
  return "—";
}
function setImgWithFallback(imgEl, candidates){
  const list=(candidates||[]).map(p=>encodeURI(p));
  let i=0;
  const tryNext=()=>{ imgEl.src = list[i++] || list[list.length-1] || ""; };
  imgEl.onerror = tryNext;
  tryNext();
}

function isiOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent || ""); }

// ===== PIN (hash SHA-256) =====
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

let pinBuffer = "";
let pinMode = "verify"; // verify | setup | change
let pinSetupFirst = "";
let pinUnlocked = false;

function pinStoredHash(){ return localStorage.getItem(LS_PIN) || ""; }

function renderDots(){
  pinDots.innerHTML = "";
  for(let i=0;i<4;i++){
    const d=document.createElement("div");
    d.className = "pinDot" + (i < pinBuffer.length ? " filled" : "");
    pinDots.appendChild(d);
  }
}

function pinSetHint(msg){ pinHint.textContent = msg || ""; }

function openPin(mode){
  pinMode = mode;
  pinBuffer = "";
  pinSetupFirst = "";
  pinSetHint("");

  const hasPin = !!pinStoredHash();

  if(mode === "verify"){
    pinTitle.textContent = "Bloqueo — Nexus POS";
    pinSub.textContent = hasPin ? "Entra tu PIN para continuar." : "Crea un PIN (4 dígitos) para proteger la app.";
  } else if(mode === "setup"){
    pinTitle.textContent = "Crear PIN";
    pinSub.textContent = "Entra un PIN de 4 dígitos.";
  } else if(mode === "change"){
    pinTitle.textContent = "Cambiar PIN";
    pinSub.textContent = "Primero confirma tu PIN actual.";
  }

  renderDots();
  pinModal.classList.remove("hidden");
}

function closePin(){
  pinModal.classList.add("hidden");
  pinUnlocked = true;
}

function buildPinPad(){
  const keys = ["1","2","3","4","5","6","7","8","9","0"];
  pinPad.innerHTML = "";
  // layout 1-9, then 0 centered
  const layout = ["1","2","3","4","5","6","7","8","9","0"];
  layout.forEach(k=>{
    const b=document.createElement("button");
    b.className="pinKey";
    b.type="button";
    b.textContent = k;
    b.onclick = ()=>{ if(pinBuffer.length<4){ pinBuffer += k; renderDots(); } };
    pinPad.appendChild(b);
  });
}

async function pinSubmitFlow(){
  const hasPin = !!pinStoredHash();

  // Si no hay PIN guardado, forzamos setup desde verify
  if(!hasPin && pinMode==="verify"){
    pinMode = "setup";
    pinTitle.textContent = "Crear PIN";
    pinSub.textContent = "Entra un PIN de 4 dígitos.";
  }

  if(pinBuffer.length !== 4){
    pinSetHint("PIN incompleto. Son 4 dígitos.");
    return;
  }

  if(pinMode === "verify"){
    const enteredHash = await sha256(pinBuffer);
    if(enteredHash === pinStoredHash()){
      closePin();
    }else{
      pinSetHint("PIN incorrecto.");
      pinBuffer = "";
      renderDots();
    }
    return;
  }

  if(pinMode === "setup"){
    // doble confirmación
    if(!pinSetupFirst){
      pinSetupFirst = pinBuffer;
      pinBuffer = "";
      renderDots();
      pinSub.textContent = "Confirma el PIN (mismos 4 dígitos).";
      pinSetHint("");
      return;
    }
    if(pinSetupFirst !== pinBuffer){
      pinSetHint("No coincide. Intenta de nuevo.");
      pinSetupFirst = "";
      pinBuffer = "";
      renderDots();
      pinSub.textContent = "Entra un PIN de 4 dígitos.";
      return;
    }
    const h = await sha256(pinBuffer);
    localStorage.setItem(LS_PIN, h);
    pinSetHint("PIN guardado ✅");
    setTimeout(()=>closePin(), 450);
    return;
  }

  if(pinMode === "change"){
    // paso 1: validar pin actual
    if(pinTitle.textContent.includes("Cambiar") && pinSub.textContent.includes("actual")){
      const enteredHash = await sha256(pinBuffer);
      if(enteredHash !== pinStoredHash()){
        pinSetHint("PIN actual incorrecto.");
        pinBuffer = "";
        renderDots();
        return;
      }
      // ahora cambia a setup de nuevo pin
      pinMode = "setup";
      pinTitle.textContent = "Nuevo PIN";
      pinSub.textContent = "Entra el nuevo PIN (4 dígitos).";
      pinSetHint("");
      pinBuffer = "";
      renderDots();
      pinSetupFirst = "";
      return;
    }
  }
}

pinBackspace.onclick = ()=>{
  if(pinBuffer.length>0){
    pinBuffer = pinBuffer.slice(0,-1);
    renderDots();
  }
};
pinSubmit.onclick = pinSubmitFlow;

buildPinPad();
renderDots();

// Arranque: si hay PIN, verifica; si no, setup.
(function bootPin(){
  if(pinStoredHash()){
    openPin("verify");
  }else{
    openPin("setup");
  }
})();

// ===== Auth: start anonymous =====
auth.signInAnonymously().catch(console.error);

// ===== Google Sync (link anonymous -> Google) =====
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

auth.onAuthStateChanged(async (user)=>{
  if(!user){
    try{ await auth.signInAnonymously(); }catch(e){ console.warn(e); }
    return;
  }
  if(btnSync){
    btnSync.textContent = user.isAnonymous ? "Sync Google" : "Google OK";
  }
});

async function linkAnonymousToGoogle(){
  const user = auth.currentUser;
  if(!user) return alert("Auth no listo todavía.");

  if(!user.isAnonymous){
    alert("Google ya está conectado ✅");
    return;
  }

  try{
    if(isiOS()){
      await user.linkWithRedirect(googleProvider);
      return;
    }else{
      await user.linkWithPopup(googleProvider);
      alert("Google conectado ✅ Historial unificado.");
    }
  }catch(err){
    console.warn("Google link error:", err);
    alert("No se pudo conectar Google. Verifica Authorized Domains en Firebase Auth.");
  }
}

btnSync.addEventListener("click", linkAnonymousToGoogle);
btnChangePin.addEventListener("click", ()=> openPin("change"));

// ===== Render métodos =====
function renderMethods(){
  methodsGrid.innerHTML = "";
  METHODS.forEach(m=>{
    const btn=document.createElement("button");
    btn.className="iconBtn";
    btn.type="button";
    btn.innerHTML = `
      <div class="iconInner">
        <div class="iconGlass"><img class="iconImg" src="${m.icon}" alt="${m.label}"></div>
        <div class="iconName">${m.label}</div>
      </div>`;
    btn.onclick=()=>selectMethod(m.id);
    methodsGrid.appendChild(btn);
  });
}

function selectMethod(id){
  if(!pinUnlocked && pinModal && !pinModal.classList.contains("hidden")) return;

  state.method = METHODS.find(m=>m.id===id);
  if(!state.method) return;

  methodBadge.textContent = `Método: ${state.method.label}`;

  nameEl.value=""; phoneEl.value=""; amountEl.value=""; noteEl.value="";
  go(screenRegister);
}

btnBack.onclick = ()=> go(screenMethods);
btnEdit.onclick = ()=> go(screenRegister);

// ===== Registro =====
payForm.addEventListener("submit",(e)=>{
  e.preventDefault();
  state.form.name = safeText(nameEl.value);
  state.form.phone = safeText(phoneEl.value);
  state.form.amount = safeText(amountEl.value);
  state.form.note = safeText(noteEl.value);
  renderPayScreen();
  go(screenPay);
});

// ===== Cobro =====
function renderPayScreen(){
  const m=state.method, f=state.form;
  payBadge.textContent = `Método: ${m.label} — Total $${money(f.amount)}`;
  payArea.innerHTML=""; payHint.textContent="";

  if(m.mode==="qr"){
    payArea.innerHTML = `<div class="qrBox"><img id="qrImg" alt="QR ${m.label}"></div>`;
    const img=document.getElementById("qrImg");
    const candidates = m.id==="stripe" ? CONFIG.qrCandidates.stripe : CONFIG.qrCandidates.ath;
    setImgWithFallback(img, candidates);
    payHint.textContent = "El cliente escanea el QR. Luego marca “Pago completado (manual)”.";
  }

  if(m.mode==="link"){
    const link=m.link();
    payArea.innerHTML = `
      <div class="linkBox">
        <div><b>Link:</b></div>
        <a href="${link}" target="_blank" rel="noopener">${link}</a>
        <button class="btn btnPrimary" type="button" id="btnOpenLink">Abrir</button>
      </div>`;
    document.getElementById("btnOpenLink").onclick=()=>window.open(link,"_blank");
    payHint.textContent = "Abre el enlace y confirma manual cuando esté pago.";
  }

  if(m.mode==="manual"){
    payArea.innerHTML = `
      <div class="linkBox">
        <div><b>Modo manual:</b></div>
        <div>Marca “Pago completado” cuando recibas el pago.</div>
      </div>`;
    payHint.textContent = "Cash/Checks: confirmación manual + ticket para control.";
  }
}

// ===== Firestore =====
async function savePaymentCloud(payment){
  const uid=currentUID();
  if(!uid) throw new Error("Auth no disponible.");
  await db.collection("users").doc(uid).collection("payments").add({
    ...payment,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function loadPaymentsCloud(limit=60){
  const uid=currentUID();
  if(!uid) throw new Error("Auth no disponible.");
  const snap = await db.collection("users").doc(uid).collection("payments")
    .orderBy("createdAt","desc")
    .limit(limit)
    .get();
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

// ===== Ticket + compartir =====
async function printReceipt(payment){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:[80,170] });

  let y=10;
  const line=(txt,size=10,bold=false)=>{
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(String(txt).slice(0,40), 6, y);
    y+=5;
  };

  doc.setFont("courier","bold");
  doc.setFontSize(12);
  doc.text("RECIBO DE PAGO", 6, y); y+=7;

  line(CONFIG.brand.business,10,true);
  line(`Tel: ${CONFIG.brand.phone}`,9,false);
  line(CONFIG.brand.location,9,false);
  y+=2; line("--------------------------------",9,false);

  line(`Recibo: ${payment.receiptNo}`,9,true);
  line(`Fecha: ${payment.dateText}`,9,false);
  y+=1; line("--------------------------------",9,false);

  line("CLIENTE",9,true);
  line(`Nombre: ${payment.customerName}`,9,false);
  if(payment.phone) line(`Telefono: ${payment.phone}`,9,false);

  y+=1; line("--------------------------------",9,false);

  line("PAGO",9,true);
  line(`Metodo: ${payment.method}`,9,false);
  line(`Estado: ${payment.status}`,9,false);

  y+=2;
  doc.setFont("courier","bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: $${money(payment.amount)}`, 6, y); y+=8;

  if(payment.note){
    line("NOTA",9,true);
    line(payment.note,9,false);
    y+=2;
  }

  line("--------------------------------",9,false);
  line("Gracias por su pago.",9,false);

  const filename = `${payment.receiptNo}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type:"application/pdf" });

  if(navigator.share && navigator.canShare && navigator.canShare({ files:[file] })){
    try{
      await navigator.share({
        title: "Recibo de pago",
        text: `Recibo ${payment.receiptNo} — ${payment.customerName} — $${money(payment.amount)}`,
        files: [file]
      });
      return;
    }catch(err){
      console.warn("Share cancelado/falló:", err);
    }
  }
  doc.save(filename);
}

// ===== Pago completado =====
btnPaid.onclick = async ()=>{
  try{
    const m=state.method, f=state.form;
    const payment = {
      receiptNo: receiptNo(),
      dateISO: new Date().toISOString(),
      dateText: new Date().toLocaleString("es-PR"),
      customerName: f.name,
      phone: f.phone,
      method: m.label,
      amount: Number(f.amount || 0),
      note: f.note,
      status: "PAGADO"
    };

    pushLocalPayment({ ...payment, _local:true });

    try{ await savePaymentCloud(payment); }
    catch(err){ console.warn("Cloud save failed, queda local.", err); }

    await printReceipt(payment);
    go(screenMethods);

  }catch(err){
    alert(err.message || "Error registrando pago");
  }
};

// ===== Historial =====
btnHistory.onclick = async ()=>{ show(historyModal); await refreshHistory(); };
btnCloseHistory.onclick = ()=> hide(historyModal);
btnRefresh.onclick = ()=> refreshHistory();
btnClearLocal.onclick = ()=>{ localStorage.removeItem(LS_PAY); refreshHistory(); };

async function refreshHistory(){
  historyTableBody.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;
  let rows=[];

  try{
    const cloud=await loadPaymentsCloud(60);
    rows = cloud.map(p=>({
      date: fmtDate(p.createdAt || p.dateISO),
      name: p.customerName || "—",
      method: p.method || "—",
      amount: p.amount || 0,
      receipt: p.receiptNo || "—",
      raw: p
    }));
  }catch(err){
    console.warn("Cloud load failed, usando local.", err);
  }

  if(rows.length===0){
    const local=getLocalPayments();
    rows = local.slice(0,60).map(p=>({
      date: p.dateText || fmtDate(p.dateISO),
      name: p.customerName || "—",
      method: p.method || "—",
      amount: p.amount || 0,
      receipt: p.receiptNo || "—",
      raw: p
    }));
  }

  if(rows.length===0){
    historyTableBody.innerHTML = `<tr><td colspan="6">No hay pagos aún.</td></tr>`;
    return;
  }

  historyTableBody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.name}</td>
      <td>${r.method}</td>
      <td class="r">$${money(r.amount)}</td>
      <td>${r.receipt}</td>
      <td><button class="btn btnGhost">Compartir</button></td>
    `;
    tr.querySelector("button").onclick = async ()=>{
      const p=r.raw;
      const payment = {
        receiptNo: p.receiptNo || r.receipt,
        dateText: p.dateText || fmtDate(p.createdAt || p.dateISO),
        customerName: p.customerName || r.name,
        phone: p.phone || "",
        method: p.method || r.method,
        amount: p.amount || r.amount,
        note: p.note || "",
        status: p.status || "PAGADO"
      };
      await printReceipt(payment);
    };
    historyTableBody.appendChild(tr);
  });
}

function renderMethods(){ /* (mantengo la firma para hoisting) */ }
renderMethods = function(){
  methodsGrid.innerHTML = "";
  METHODS.forEach(m=>{
    const btn=document.createElement("button");
    btn.className="iconBtn";
    btn.type="button";
    btn.innerHTML = `
      <div class="iconInner">
        <div class="iconGlass"><img class="iconImg" src="${m.icon}" alt="${m.label}"></div>
        <div class="iconName">${m.label}</div>
      </div>`;
    btn.onclick=()=>selectMethod(m.id);
    methodsGrid.appendChild(btn);
  });
};

renderMethods();
go(screenMethods);
