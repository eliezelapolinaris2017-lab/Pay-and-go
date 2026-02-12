/********************************************************
 Nexus POS — Payment Platform (FINAL)
 - assets/bg.png
 - icons: assets/icons/*.png
 - qrs: assets/icons/ath-qr.png / stripe-qr.png
 - Firebase: users/{uid}/payments
 - PIN local (4 dígitos) + cambiar PIN
 - Ticket: jsPDF + Share (Mensajes)
*********************************************************/

const CONFIG = {
  brand: { business: "Nexus Payments", phone: "787-664-3079", location: "Puerto Rico" },
  links: { tapToPay: "https://example.com/tap-to-pay" }, // edita si quieres
  icons: {
    stripe: "assets/icons/stripe.png",
    ath: "assets/icons/ath.png",
    tap: "assets/icons/tap.png",
    cash: "assets/icons/cash.png",
    checks: "assets/icons/checks.png"
  },
  qrs: {
    stripe: "assets/icons/stripe-qr.png",
    ath: "assets/icons/ath-qr.png"
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
function isiOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent || ""); }

// ===== PIN SHA-256 =====
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function pinStoredHash(){ return localStorage.getItem(LS_PIN) || ""; }

let pinBuffer = "";
let pinMode = "verify"; // verify | setup | change
let pinSetupFirst = "";
let pinUnlocked = false;

function renderDots(){
  pinDots.innerHTML = "";
  for(let i=0;i<4;i++){
    const d=document.createElement("div");
    d.className = "pinDot" + (i < pinBuffer.length ? " filled" : "");
    pinDots.appendChild(d);
  }
}
function pinSetHint(msg){ pinHint.textContent = msg || ""; }

function buildPinPad(){
  pinPad.innerHTML = "";
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

async function pinSubmitFlow(){
  const hasPin = !!pinStoredHash();

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
    setTimeout(()=>closePin(), 400);
    return;
  }

  if(pinMode === "change"){
    const enteredHash = await sha256(pinBuffer);
    if(enteredHash !== pinStoredHash()){
      pinSetHint("PIN actual incorrecto.");
      pinBuffer = "";
      renderDots();
      return;
    }
    pinMode = "setup";
    pinTitle.textContent = "Nuevo PIN";
    pinSub.textContent = "Entra el nuevo PIN (4 dígitos).";
    pinSetHint("");
    pinBuffer = "";
    renderDots();
    pinSetupFirst = "";
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
(pinStoredHash() ? openPin("verify") : openPin("setup"));

// ===== Auth anonymous =====
auth.signInAnonymously().catch(console.error);

// ===== Sync Google (en Historial) =====
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
    alert("No se pudo conectar Google. Revisa Authorized Domains en Firebase Auth.");
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
  if(!pinUnlocked && !pinModal.classList.contains("hidden")) return;
  state.method = METHODS.find(m=>m.id===id);
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
    const qrSrc = m.id==="stripe" ? CONFIG.qrs.stripe : CONFIG.qrs.ath;
    payArea.innerHTML = `<div class="qrBox"><img src="${qrSrc}" alt="QR ${m.label}"></div>`;
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
    }catch(err){}
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
