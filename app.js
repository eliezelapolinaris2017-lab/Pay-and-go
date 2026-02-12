/********************************************************
 Nexus POS — Payment Platform (Clean Build)
 - Email/Password Auth (UID único por usuario)
 - Firestore: users/{uid}/payments
 - Métodos: Stripe/ATH (QR) + Tap/Cash/Checks + Links Stripe/Ath
 - Recibo: jsPDF + Share Sheet
*********************************************************/

console.log("app.js ✅", new Date().toISOString());

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

// ===== Config negocio/links =====
const CONFIG = {
  brand: { business: "Nexus POS Express", phone: "787-664-3079", location: "Puerto Rico" },
  links: {
    ath: "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660",
    stripe: "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h",
    tapToPay: "" // si luego quieres un link real, lo pones aquí
  },
  icons: {
    stripe: "assets/icons/stripe.png",
    ath: "assets/icons/ath.png",
    tap: "assets/icons/tap.png",
    cash: "assets/icons/cash.png",
    checks: "assets/icons/checks.png"
  },
  qr: {
    stripe: "assets/qr-stripe.png",
    ath: "assets/qr-ath.png"
  }
};

// ===== DOM refs =====
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
const btnLogout = document.getElementById("btnLogout");
const historyTableBody = document.querySelector("#historyTable tbody");

// Auth modal
const authModal = document.getElementById("authModal");
const authEmail = document.getElementById("authEmail");
const authPass = document.getElementById("authPass");
const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");
const authHint = document.getElementById("authHint");

// ===== Methods =====
const METHODS = [
  { id:"stripe", label:"Stripe", icon: CONFIG.icons.stripe, mode:"qr" },
  { id:"ath", label:"ATH Móvil", icon: CONFIG.icons.ath, mode:"qr" },
  { id:"tap", label:"Tap to Pay", icon: CONFIG.icons.tap, mode:"link", link: () => CONFIG.links.tapToPay || "" },
  { id:"cash", label:"Cash", icon: CONFIG.icons.cash, mode:"manual" },
  { id:"checks", label:"Checks", icon: CONFIG.icons.checks, mode:"manual" },
  { id:"stripe_link", label:"Stripe Link", icon: CONFIG.icons.stripe, mode:"paylink", link: () => CONFIG.links.stripe },
  { id:"ath_link", label:"ATH Link", icon: CONFIG.icons.ath, mode:"paylink", link: () => CONFIG.links.ath }
];

const state = { method:null, form:{ name:"", phone:"", amount:"", note:"" } };

// ===== UI helpers =====
function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }
function go(to){
  [screenMethods, screenRegister, screenPay].forEach(hide);
  show(to);
  window.scrollTo({top:0, behavior:"smooth"});
}
function money(n){ return (Number(n||0)).toFixed(2); }
function safeText(s){ return String(s ?? "").trim(); }
function pad2(v){ return String(v).padStart(2,"0"); }
function nowStamp(){
  const d=new Date();
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}
function receiptNo(){ return `R-${nowStamp()}`; }
function fmtDate(v){
  if(!v) return "—";
  if(typeof v === "string") return new Date(v).toLocaleString("es-PR");
  if(v.seconds) return new Date(v.seconds*1000).toLocaleString("es-PR");
  return "—";
}
function uid(){ return auth.currentUser?.uid || null; }

// ===== Auth (Email/Password) =====
function setAuthHint(msg){ authHint.textContent = msg || ""; }

async function doLogin(){
  setAuthHint("");
  const email = safeText(authEmail.value);
  const pass = safeText(authPass.value);

  if(!email || !pass){ setAuthHint("Completa email y password."); return; }

  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(err){
    console.warn(err);
    setAuthHint("No pude entrar. Verifica credenciales.");
  }
}

async function doRegister(){
  setAuthHint("");
  const email = safeText(authEmail.value);
  const pass = safeText(authPass.value);

  if(!email || !pass){ setAuthHint("Completa email y password."); return; }
  if(pass.length < 6){ setAuthHint("Password mínimo 6 caracteres."); return; }

  try{
    await auth.createUserWithEmailAndPassword(email, pass);
  }catch(err){
    console.warn(err);
    setAuthHint("No pude crear la cuenta. Revisa si el email ya existe.");
  }
}

btnLogin.addEventListener("click", doLogin);
btnRegister.addEventListener("click", doRegister);

btnLogout.addEventListener("click", async ()=>{
  await auth.signOut();
  hide(historyModal);
});

// ===== Render Methods (icono solo + nombre afuera) =====
function renderMethods(){
  methodsGrid.innerHTML = "";
  METHODS.forEach(m=>{
    const btn=document.createElement("button");
    btn.className="iconBtn";
    btn.type="button";
    btn.innerHTML = `
      <div class="iconInner">
        <div class="iconGlass">
          <img class="iconImg" src="${m.icon}" alt="${m.label}">
        </div>
        <div class="iconName">${m.label}</div>
      </div>`;
    btn.onclick=()=>selectMethod(m.id);
    methodsGrid.appendChild(btn);
  });
}

function selectMethod(idSel){
  const m = METHODS.find(x=>x.id===idSel);
  if(!m) return;
  state.method = m;
  methodBadge.textContent = `Método: ${m.label}`;
  nameEl.value=""; phoneEl.value=""; amountEl.value=""; noteEl.value="";
  go(screenRegister);
}

btnBack.onclick = ()=> go(screenMethods);
btnEdit.onclick = ()=> go(screenRegister);

// ===== Registro -> Cobro =====
payForm.addEventListener("submit",(e)=>{
  e.preventDefault();
  state.form.name = safeText(nameEl.value);
  state.form.phone = safeText(phoneEl.value);
  state.form.amount = safeText(amountEl.value);
  state.form.note = safeText(noteEl.value);
  renderPayScreen();
  go(screenPay);
});

// ===== Cobro: QR / PayLink / Manual =====
function renderPayScreen(){
  const m=state.method, f=state.form;
  payBadge.textContent = `Método: ${m.label} — Total $${money(f.amount)}`;
  payArea.innerHTML="";
  payHint.textContent="";

  // QR
  if(m.mode==="qr"){
    const src = (m.id==="stripe") ? CONFIG.qr.stripe : CONFIG.qr.ath;

    payArea.innerHTML = `
      <div class="qrBox">
        <img src="${src}" alt="QR ${m.label}" onerror="this.style.display='none'">
      </div>
    `;
    payHint.textContent = "El cliente escanea el QR. Luego marca “Pago completado (manual)”.";
  }

  // PayLink (NO mostramos URL feo)
  if(m.mode==="paylink"){
    const link = m.link();
    payArea.innerHTML = `
      <div class="linkBox">
        <div class="linkTitle">Link de pago</div>
        <div class="linkMeta">Abre el enlace para cobrar. (El URL se mantiene oculto para que se vea pro.)</div>
        <div class="btnRow">
          <button class="btn btnPrimary" type="button" id="btnOpenPayLink">Abrir link</button>
          <button class="btn btnGhost" type="button" id="btnCopyPayLink">Copiar link</button>
        </div>
      </div>
    `;
    document.getElementById("btnOpenPayLink").onclick = ()=> window.open(link, "_blank");
    document.getElementById("btnCopyPayLink").onclick = async ()=>{
      try{ await navigator.clipboard.writeText(link); payHint.textContent="Link copiado ✅"; }
      catch{ payHint.textContent="No pude copiar. Mantén presionado y copia desde el navegador."; }
    };
    payHint.textContent = "Abre el link y confirma manual cuando esté pago.";
  }

  // Link normal (Tap to Pay)
  if(m.mode==="link"){
    const link = m.link();
    payArea.innerHTML = `
      <div class="linkBox">
        <div class="linkTitle">Acción</div>
        <div class="linkMeta">Abrir Tap to Pay (si tienes enlace configurado).</div>
        <div class="btnRow">
          <button class="btn btnPrimary" type="button" id="btnOpenLink" ${link ? "" : "disabled"}>Abrir</button>
        </div>
      </div>
    `;
    const b = document.getElementById("btnOpenLink");
    b.onclick = ()=> link && window.open(link,"_blank");
    payHint.textContent = link ? "Abre y confirma manual cuando esté pago." : "Tap to Pay sin enlace configurado aún.";
  }

  // Manual
  if(m.mode==="manual"){
    payArea.innerHTML = `
      <div class="linkBox">
        <div class="linkTitle">Modo manual</div>
        <div class="linkMeta">Marca “Pago completado” cuando recibas el pago.</div>
      </div>
    `;
    payHint.textContent = "Cash/Checks: confirmación manual + recibo para control.";
  }
}

// ===== Firestore =====
async function savePaymentCloud(payment){
  const u = uid();
  if(!u) throw new Error("No hay sesión activa.");
  await db.collection("users").doc(u).collection("payments").add({
    ...payment,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function loadPaymentsCloud(limit=60){
  const u = uid();
  if(!u) throw new Error("No hay sesión activa.");
  const snap = await db.collection("users").doc(u).collection("payments")
    .orderBy("createdAt","desc")
    .limit(limit)
    .get();
  return snap.docs.map(d=>({ id:d.id, ...d.data() }));
}

// ===== jsPDF Recibo + Share =====
async function printReceipt(payment){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:[80,170] });

  let y=10;
  const line=(txt,size=10,bold=false)=>{
    doc.setFont("courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(String(txt).slice(0,42), 6, y);
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
    }catch(e){
      console.warn("Share cancelado/falló:", e);
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

    await savePaymentCloud(payment);
    await printReceipt(payment);

    go(screenMethods);

  }catch(err){
    console.warn(err);
    alert(err.message || "Error registrando pago");
  }
};

// ===== Historial =====
btnHistory.onclick = async ()=>{
  if(!uid()){ return; }
  show(historyModal);
  await refreshHistory();
};
btnCloseHistory.onclick = ()=> hide(historyModal);
btnRefresh.onclick = ()=> refreshHistory();

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
    console.warn(err);
  }

  if(rows.length===0){
    historyTableBody.innerHTML = `<tr><td colspan="6">Sin registros.</td></tr>`;
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

// ===== Boot =====
auth.onAuthStateChanged((user)=>{
  if(user){
    authModal.classList.add("hidden");
    renderMethods();
    go(screenMethods);
  }else{
    authModal.classList.remove("hidden");
    // evita que se quede “vacío”
    go(screenMethods);
  }
});
