/*************************************************
 * Nexus POS Express — app.js (FINAL)
 * - PIN lock
 * - Métodos con iconos en assets/icons/
 * - Stripe Link + ATH Link (URL oculto, share/open)
 * - Historial: Firebase primero, cache local fallback
 * - Recibo: Share Sheet (Mensajes/WhatsApp/etc)
 * - iOS: inputs 16px (sin zoom)
 *************************************************/

const $ = (id) => document.getElementById(id);

const LS = {
  PIN: "nexus_pos_pin",
  LOCAL_CACHE: "nexus_pos_cache",
};

const FIREBASE_ENABLED = true; // pon false si quieres apagarlo rápido

// ====== LINKS DE PAGO (los tuyos) ======
const PAY_LINKS = {
  stripe: "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h",
  ath: "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660",
};

// ====== Métodos (iconos EXACTOS en assets/icons/) ======
const METHODS = [
  { id:"stripe",   label:"Stripe",     icon:"assets/icons/stripe.png", type:"pos" },
  { id:"athmovil", label:"ATH Móvil",   icon:"assets/icons/ath.png",    type:"pos" },
  { id:"tap",      label:"Tap to Pay",  icon:"assets/icons/tap.png",    type:"pos" },
  { id:"cash",     label:"Cash",        icon:"assets/icons/cash.png",   type:"pos" },
  { id:"checks",   label:"Checks",      icon:"assets/icons/checks.png", type:"pos" },

  // Botones extra (envían links de pago)
  { id:"stripe_link", label:"Stripe\nLink", icon:"assets/icons/stripe.png", type:"link", linkKey:"stripe" },
  { id:"ath_link",    label:"ATH Link",     icon:"assets/icons/ath.png",    type:"link", linkKey:"ath" },
];

// ====== Estado ======
const state = {
  method: null,
  form: { nombre:"", telefono:"", monto:"", nota:"" },
  db: null,
};

// ====== Helpers ======
function money(n){
  const x = Number(n || 0);
  return x.toLocaleString("en-US",{ style:"currency", currency:"USD" });
}

function nowId(){
  // R-YYYYMMDD-HHMMSS
  const d = new Date();
  const pad = (v)=> String(v).padStart(2,"0");
  const y = d.getFullYear();
  const m = pad(d.getMonth()+1);
  const da = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `R-${y}${m}${da}-${hh}${mm}${ss}`;
}

function loadLocal(){
  try { return JSON.parse(localStorage.getItem(LS.LOCAL_CACHE)||"[]"); }
  catch{ return []; }
}
function saveLocal(arr){
  localStorage.setItem(LS.LOCAL_CACHE, JSON.stringify(arr||[]));
}

async function shareText(title, text, url){
  try{
    if (navigator.share){
      const data = { title, text };
      if (url) data.url = url;
      await navigator.share(data);
      return true;
    }
  }catch(e){}
  // fallback: copy
  const blob = (url ? `${text}\n${url}` : text);
  try{
    await navigator.clipboard.writeText(blob);
    alert("Copiado. Pégalo en Mensajes.");
  }catch(e){
    prompt("Copia y pega:", blob);
  }
  return false;
}

function setView(name){
  $("viewHome").classList.toggle("hidden", name!=="home");
  $("viewRegistro").classList.toggle("hidden", name!=="registro");
  $("viewCobro").classList.toggle("hidden", name!=="cobro");

  if (name==="home"){
    $("pageTitle").textContent = "Select Payment Method";
    $("pageSub").textContent = "Selecciona el método. Luego registras el cliente y cobras.";
  }
  if (name==="registro"){
    $("pageTitle").textContent = "Registro";
    $("pageSub").textContent = "Completa los datos para ticket e historial.";
  }
  if (name==="cobro"){
    $("pageTitle").textContent = "Cobro";
    $("pageSub").textContent = "Muestra QR o abre enlace. Luego marca “Pago completado”.";
  }
}

// ====== PIN ======
function ensurePin(){
  const pin = localStorage.getItem(LS.PIN);
  if (!pin){
    // Primera vez: set default 1234 y obliga a cambiar luego desde Historial
    localStorage.setItem(LS.PIN, "1234");
  }
}
function openPinLock(msg){
  $("pinHint").textContent = msg || "PIN por defecto: 1234 (cámbialo en Historial → Cambiar PIN).";
  $("pinInput").value = "";
  $("pinLock").classList.remove("hidden");
  setTimeout(()=> $("pinInput").focus(), 200);
}
function closePinLock(){
  $("pinLock").classList.add("hidden");
}
function checkPin(){
  const wanted = localStorage.getItem(LS.PIN) || "1234";
  const got = ($("pinInput").value||"").trim();
  if (!got) return;
  if (got === wanted){
    closePinLock();
  } else {
    openPinLock("PIN incorrecto. Intenta otra vez.");
  }
}

// ====== Firebase (pon tus credenciales reales) ======
function initFirebase(){
  if (!FIREBASE_ENABLED) return;

  // 🔥 Pega tu config aquí
  const firebaseConfig = window.__FIREBASE_CONFIG__ || null;

  if (!firebaseConfig){
    console.warn("Firebase config no está definido. Se usará solo cache local.");
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  state.db = db;

  // login anónimo (simple y sin fricción)
  firebase.auth().signInAnonymously().catch(()=>{});
}

// ====== Guardar/leer historial ======
async function saveToFirebase(record){
  if (!state.db) return false;
  try{
    await state.db.collection("nexus_pos_receipts").doc(record.id).set(record, { merge:true });
    return true;
  }catch(e){
    return false;
  }
}

async function loadFromFirebase(){
  if (!state.db) return null;
  try{
    const snap = await state.db
      .collection("nexus_pos_receipts")
      .orderBy("ts","desc")
      .limit(60)
      .get();
    const arr = [];
    snap.forEach(d=> arr.push(d.data()));
    return arr;
  }catch(e){
    return null;
  }
}

// ====== UI render ======
function renderGrid(){
  const grid = $("payGrid");
  grid.innerHTML = "";

  METHODS.forEach(m=>{
    const btn = document.createElement("button");
    btn.className = "pay-icon-btn" + (m.type==="link" ? " link-btn" : "");
    btn.innerHTML = `
      <img src="${m.icon}" alt="${m.label.replace("\n"," ")}"/>
      <span>${m.label.replace("\n","<br/>")}</span>
    `;
    btn.onclick = ()=> selectMethod(m.id);
    grid.appendChild(btn);
  });
}

function selectMethod(methodId){
  const m = METHODS.find(x=>x.id===methodId);
  if (!m) return;
  state.method = m;

  // si es link: igual pasa por Registro → Cobro (para generar recibo y historial)
  $("pillMetodo").textContent = `Método: ${m.label.replace("\n"," ")}`;

  // reset form rápido
  $("inpNombre").value = "";
  $("inpTelefono").value = "";
  $("inpMonto").value = "";
  $("inpNota").value = "";

  setView("registro");
}

function buildCobroUI(){
  const m = state.method;
  const total = money(state.form.monto);
  $("pillCobro").textContent = `Método: ${m.label.replace("\n"," ")} — Total ${total}`;

  const body = $("cobroBody");
  body.innerHTML = "";

  const box = document.createElement("div");
  box.className = "cobro-box";

  const title = document.createElement("div");
  title.className = "cobro-title";
  title.textContent = (m.type === "link") ? "Link de pago (enviado desde el botón)" : "Instrucción de cobro";
  box.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "cobro-meta";

  if (m.type === "link"){
    meta.textContent = "Usa “Enviar link” para mandar el pago por Mensajes/WhatsApp. No se muestra el URL aquí (cero papelones).";
    box.appendChild(meta);

    const row = document.createElement("div");
    row.className = "btn-row";
    row.style.marginTop = "12px";

    const send = document.createElement("button");
    send.className = "btn primary";
    send.textContent = "Enviar link";
    send.onclick = async ()=>{
      const url = PAY_LINKS[m.linkKey];
      const txt =
`Pago - Nexus POS Express
Cliente: ${state.form.nombre || "—"}
Total: ${money(state.form.monto)}
Nota: ${state.form.nota || "—"}`;

      await shareText("Link de pago", txt, url);
    };

    const open = document.createElement("button");
    open.className = "btn";
    open.textContent = "Abrir link";
    open.onclick = ()=>{
      const url = PAY_LINKS[m.linkKey];
      window.open(url, "_blank", "noopener,noreferrer");
    };

    row.appendChild(send);
    row.appendChild(open);
    box.appendChild(row);

    $("cobroHint").textContent = "Envía el link al cliente. Cuando confirme, marca “Pago completado (manual)”.";
  } else {
    meta.textContent = "Cobra con el método seleccionado. Luego marca “Pago completado (manual)”.";
    box.appendChild(meta);
    $("cobroHint").textContent = "Si quieres QR por método, se puede añadir luego con imágenes QR en assets.";
  }

  body.appendChild(box);
}

async function finalizePayment(){
  const m = state.method;
  const id = nowId();
  const d = new Date();

  const record = {
    id,
    ts: Date.now(),
    fecha: d.toLocaleString("es-PR"),
    metodo: m.label.replace("\n"," "),
    monto: Number(state.form.monto || 0),
    cliente: state.form.nombre || "",
    telefono: state.form.telefono || "",
    nota: state.form.nota || "",
    status: "PAGADO",
    source: "manual",
  };

  // guardar local primero (siempre)
  const local = loadLocal();
  local.unshift(record);
  saveLocal(local.slice(0, 200));

  // intentar firebase
  const okFb = await saveToFirebase(record);

  // crear recibo texto y share
  const receipt =
`RECIBO DE PAGO
Nexus Payments
Tel: 787-664-3079
Puerto Rico

--------------------------------
Recibo: ${record.id}
Fecha: ${record.fecha}

CLIENTE
Nombre: ${record.cliente || "—"}
Telefono: ${record.telefono || "—"}

PAGO
Metodo: ${record.metodo}
Estado: ${record.status}

TOTAL: ${money(record.monto)}

NOTA
${record.nota || "—"}

--------------------------------
Gracias por su pago.
`;

  const extra = okFb ? "Guardado en Firebase." : "Guardado local (offline).";
  await shareText("Recibo de pago", `${receipt}\n${extra}`);

  alert("Recibo listo para enviar. ✅");
  setView("home");
}

// ====== Historial ======
function openHistory(){
  $("historyModal").classList.remove("hidden");
  refreshHistory();
}
function closeHistory(){
  $("historyModal").classList.add("hidden");
}

function renderHistoryRows(rows){
  const body = $("historyBody");
  body.innerHTML = "";

  if (!rows || rows.length===0){
    const empty = document.createElement("div");
    empty.className = "row";
    empty.innerHTML = `<div class="muted">$0.00</div><div class="muted">Sin registros</div><div></div>`;
    body.appendChild(empty);
    return;
  }

  rows.forEach(r=>{
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="muted">${money(r.monto)}</div>
      <div class="muted">${r.id}</div>
      <div><button class="btn" style="padding:10px 12px;">Compartir</button></div>
    `;
    row.querySelector("button").onclick = async ()=>{
      const receipt =
`RECIBO DE PAGO
Recibo: ${r.id}
Fecha: ${r.fecha}
Cliente: ${r.cliente || "—"}
Tel: ${r.telefono || "—"}
Metodo: ${r.metodo}
Total: ${money(r.monto)}
Nota: ${r.nota || "—"}`;
      await shareText("Recibo", receipt);
    };
    body.appendChild(row);
  });
}

async function refreshHistory(){
  // Firebase primero
  const fb = await loadFromFirebase();
  if (fb && fb.length){
    renderHistoryRows(fb);
    return;
  }
  // fallback local
  const local = loadLocal();
  renderHistoryRows(local);
}

// ====== Cambiar PIN ======
async function changePinFlow(){
  const current = localStorage.getItem(LS.PIN) || "1234";
  const oldPin = prompt("PIN actual:", "");
  if (oldPin === null) return;
  if (oldPin.trim() !== current){
    alert("PIN actual incorrecto.");
    return;
  }
  const newPin = prompt("Nuevo PIN:", "");
  if (newPin === null) return;
  if (newPin.trim().length < 4){
    alert("PIN muy corto. Usa mínimo 4 dígitos.");
    return;
  }
  localStorage.setItem(LS.PIN, newPin.trim());
  alert("PIN actualizado ✅");
}

// ====== Export “Sync Google” (realista: CSV + Share Sheet) ======
async function syncGoogle(){
  const rows = (await loadFromFirebase()) || loadLocal();
  if (!rows.length){
    alert("No hay registros para exportar.");
    return;
  }

  const csv = [
    ["id","fecha","metodo","monto","cliente","telefono","nota","status"].join(","),
    ...rows.map(r=>[
      r.id,
      `"${String(r.fecha||"").replaceAll('"','""')}"`,
      `"${String(r.metodo||"").replaceAll('"','""')}"`,
      r.monto,
      `"${String(r.cliente||"").replaceAll('"','""')}"`,
      `"${String(r.telefono||"").replaceAll('"','""')}"`,
      `"${String(r.nota||"").replaceAll('"','""')}"`,
      r.status
    ].join(","))
  ].join("\n");

  // share como archivo si soporta
  try{
    const blob = new Blob([csv], { type:"text/csv" });
    const file = new File([blob], `nexus-pos-historial.csv`, { type:"text/csv" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ title:"Historial Nexus POS", files:[file] });
      return;
    }
  }catch(e){}

  // fallback texto
  await shareText("Historial Nexus POS (CSV)", csv);
}

// ====== Service worker (PWA + favicon 404 fix) ======
async function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("sw.js");
  }catch(e){}
}

// ====== Eventos ======
function wire(){
  $("openHistoryBtn").onclick = openHistory;
  $("btnCloseHistory").onclick = closeHistory;

  $("btnRefreshHistory").onclick = refreshHistory;
  $("btnClearLocal").onclick = ()=>{
    if (confirm("¿Borrar cache local?")){
      saveLocal([]);
      refreshHistory();
    }
  };
  $("btnChangePin").onclick = changePinFlow;
  $("btnSyncGoogle").onclick = syncGoogle;

  $("btnBackHome").onclick = ()=> setView("home");
  $("btnToCobro").onclick = ()=>{
    // guardar form
    state.form.nombre = $("inpNombre").value.trim();
    state.form.telefono = $("inpTelefono").value.trim();
    state.form.monto = $("inpMonto").value.trim();
    state.form.nota = $("inpNota").value.trim();

    if (!state.form.nombre){
      alert("Falta nombre.");
      return;
    }
    if (!state.form.monto || Number(state.form.monto) <= 0){
      alert("Monto inválido.");
      return;
    }

    setView("cobro");
    buildCobroUI();
  };

  $("btnEdit").onclick = ()=> setView("registro");
  $("btnPaid").onclick = finalizePayment;

  // PIN events
  $("pinEnterBtn").onclick = checkPin;
  $("pinInput").addEventListener("keydown", (e)=>{
    if (e.key === "Enter") checkPin();
  });
}

// ====== INIT ======
(function init(){
  ensurePin();
  renderGrid();
  wire();
  setView("home");

  // PIN gate
  openPinLock();

  // Firebase + SW
  initFirebase();
  registerSW();
})();
