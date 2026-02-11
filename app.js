/*************************************************
 * Nexus POS Express — app.js
 * Firebase + PIN + Historial + jsPDF + Share (SMS)
 *************************************************/

(() => {
  // ====== CONFIG ======
  const STRIPE_LINK = "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h";
  const ATH_LINK    = "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660";

  const QR_STRIPE = "assets/qr-stripe.png";
  const QR_ATH    = "assets/qr-ath.png";

  const STORE_KEY_CACHE = "nexus_pos_cache_v1";
  const STORE_KEY_PIN   = "nexus_pos_pin_v1"; // simple (puedes endurecer luego)
  const DEFAULT_PIN     = "1234";

  // ====== DOM ======
  const el = (id) => document.getElementById(id);

  const viewHome     = el("viewHome");
  const viewRegister = el("viewRegister");
  const viewCharge   = el("viewCharge");

  const title    = el("title");
  const subtitle = el("subtitle");

  const openHistoryBtn  = el("openHistoryBtn");
  const historyModal    = el("historyModal");
  const closeHistoryBtn = el("closeHistoryBtn");

  const syncBtn      = el("syncBtn");
  const refreshBtn   = el("refreshBtn");
  const changePinBtn = el("changePinBtn");
  const clearCacheBtn= el("clearCacheBtn");
  const historyBody  = el("historyBody");

  const methodPill   = el("methodPill");
  const inName       = el("inName");
  const inPhone      = el("inPhone");
  const inAmount     = el("inAmount");
  const inNote       = el("inNote");
  const backHomeBtn  = el("backHomeBtn");
  const toChargeBtn  = el("toChargeBtn");

  const chargeTitle  = el("chargeTitle");
  const qrBlock      = el("qrBlock");
  const qrImg        = el("qrImg");
  const linkBlock    = el("linkBlock");
  const openPayLinkBtn = el("openPayLinkBtn");
  const sendPayLinkBtn = el("sendPayLinkBtn");
  const infoBlock    = el("infoBlock");

  const editBtn      = el("editBtn");
  const paidBtn      = el("paidBtn");

  // PIN
  const pinLock    = el("pinLock");
  const pinInput   = el("pinInput");
  const pinEnterBtn= el("pinEnterBtn");

  // ====== STATE ======
  const state = {
    method: null,
    methodLabel: null,
    isLinkPayment: false,
    payLink: null,
    receipt: null
  };

  // ====== FIREBASE INIT ======
  const firebaseConfig = {
    apiKey: "AIzaSyAabJd7_zxocAktRlERRv3BHCYpfyiF4ig",
    authDomain: "nexus-payment-platform.firebaseapp.com",
    projectId: "nexus-payment-platform",
    storageBucket: "nexus-payment-platform.firebasestorage.app",
    messagingSenderId: "482375789187",
    appId: "1:482375789187:web:e13839db6d644e215009b6"
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  // Anónimo (sin UI): suficiente para leer/escribir si tus reglas lo permiten
  firebase.auth().signInAnonymously().catch(() => {});

  // ====== UTIL ======
  const money = (n) => {
    const x = Number(n || 0);
    return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const nowISO = () => new Date().toISOString();

  const loadCache = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY_CACHE) || "[]"); }
    catch { return []; }
  };

  const saveCache = (arr) => localStorage.setItem(STORE_KEY_CACHE, JSON.stringify(arr));

  const upsertCache = (item) => {
    const arr = loadCache();
    const i = arr.findIndex(x => x.id === item.id);
    if (i >= 0) arr[i] = item; else arr.unshift(item);
    saveCache(arr.slice(0, 300)); // control de crecimiento
  };

  const getPin = () => localStorage.getItem(STORE_KEY_PIN) || DEFAULT_PIN;
  const setPin = (p) => localStorage.setItem(STORE_KEY_PIN, String(p || "").trim() || DEFAULT_PIN);

  const show = (node) => node.classList.remove("hidden");
  const hide = (node) => node.classList.add("hidden");

  function setView(which){
    // reset
    hide(viewHome); hide(viewRegister); hide(viewCharge);

    if (which === "home"){
      title.textContent = "Select Payment Method";
      subtitle.textContent = "Selecciona el método. Luego registras el cliente y cobras.";
      show(viewHome);
      return;
    }
    if (which === "register"){
      title.textContent = "Registro";
      subtitle.textContent = "Completa los datos para ticket e historial.";
      show(viewRegister);
      return;
    }
    if (which === "charge"){
      title.textContent = "Cobro";
      subtitle.textContent = "Muestra QR o abre enlace. Luego marca “Pago completado”.";
      show(viewCharge);
      return;
    }
  }

  function methodLabel(m){
    switch(m){
      case "stripe": return "Stripe";
      case "ath": return "ATH Móvil";
      case "tap": return "Tap to Pay";
      case "cash": return "Cash";
      case "checks": return "Checks";
      case "stripe_link": return "Stripe Link";
      case "ath_link": return "ATH Link";
      default: return m;
    }
  }

  function clearRegister(){
    inName.value = "";
    inPhone.value = "";
    inAmount.value = "";
    inNote.value = "";
  }

  function normalizePhone(s){
    return String(s || "").replace(/[^\d]/g,"").slice(0, 15);
  }

  function buildReceiptId(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `R-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  function buildReceipt(){
    const id = buildReceiptId();
    const createdAt = nowISO();
    return {
      id,
      createdAt,
      method: state.methodLabel,
      methodKey: state.method,
      amount: Number(inAmount.value || 0),
      name: String(inName.value || "Cliente").trim() || "Cliente",
      phone: normalizePhone(inPhone.value),
      note: String(inNote.value || "").trim(),
      status: "PAGADO",
      link: state.payLink || null
    };
  }

  // ====== SHARE ======
  async function shareText(title, text){
    // iOS PWA/ Safari: navigator.share funciona con texto
    if (navigator.share){
      try { await navigator.share({ title, text }); return true; }
      catch { /* user cancel */ }
    }
    // fallback: SMS
    const sms = `sms:&body=${encodeURIComponent(text)}`;
    window.location.href = sms;
    return false;
  }

  async function sharePdfBlob(filename, blob, fallbackText){
    // iOS share files (depende del browser). Si falla: abre pdf y comparte manual.
    const file = new File([blob], filename, { type:"application/pdf" });

    if (navigator.canShare && navigator.canShare({ files:[file] }) && navigator.share){
      try{
        await navigator.share({ files:[file], title:"Recibo", text:"Recibo de pago" });
        return true;
      }catch{/* cancel */}
    }

    // fallback: abrir pdf en nueva pestaña
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    if (fallbackText) await shareText("Recibo", fallbackText);
    return false;
  }

  // ====== jsPDF RECIBO ======
  async function makeReceiptPdf(receipt){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:"pt", format:"letter" });

    const x = 48;
    let y = 64;

    doc.setFont("courier","bold");
    doc.setFontSize(18);
    doc.text("RECIBO DE PAGO", x, y);

    y += 26;
    doc.setFontSize(12);
    doc.setFont("courier","normal");
    doc.text("Nexus Payments", x, y); y += 18;
    doc.text("Tel: 787-664-3079", x, y); y += 18;
    doc.text("Puerto Rico", x, y); y += 18;

    y += 10;
    doc.text("------------------------------------------------", x, y); y += 20;

    doc.setFont("courier","bold");
    doc.text(`Recibo: ${receipt.id}`, x, y); y += 18;

    doc.setFont("courier","normal");
    const d = new Date(receipt.createdAt);
    doc.text(`Fecha: ${d.toLocaleString("es-PR")}`, x, y); y += 18;

    y += 8;
    doc.text("------------------------------------------------", x, y); y += 22;

    doc.setFont("courier","bold");
    doc.text("CLIENTE", x, y); y += 18;

    doc.setFont("courier","normal");
    doc.text(`Nombre: ${receipt.name}`, x, y); y += 18;
    doc.text(`Telefono: ${receipt.phone || "-"}`, x, y); y += 18;

    y += 8;
    doc.text("------------------------------------------------", x, y); y += 22;

    doc.setFont("courier","bold");
    doc.text("PAGO", x, y); y += 18;

    doc.setFont("courier","normal");
    doc.text(`Metodo: ${receipt.method}`, x, y); y += 18;
    doc.text(`Estado: ${receipt.status}`, x, y); y += 22;

    doc.setFont("courier","bold");
    doc.setFontSize(20);
    doc.text(`TOTAL: $${money(receipt.amount)}`, x, y); y += 28;

    doc.setFontSize(12);
    doc.setFont("courier","bold");
    doc.text("NOTA", x, y); y += 18;

    doc.setFont("courier","normal");
    doc.text(receipt.note || "-", x, y); y += 22;

    y += 8;
    doc.text("------------------------------------------------", x, y); y += 22;
    doc.text("Gracias por su pago.", x, y);

    const blob = doc.output("blob");
    return blob;
  }

  // ====== FIRESTORE ======
  async function saveToFirestore(receipt){
    // colección simple
    await db.collection("receipts").doc(receipt.id).set(receipt, { merge:true });
  }

  async function fetchFromFirestore(limit=50){
    const snap = await db.collection("receipts")
      .orderBy("createdAt","desc")
      .limit(limit)
      .get();

    const out = [];
    snap.forEach(doc => out.push(doc.data()));
    return out;
  }

  // ====== HISTORY UI ======
  function renderHistoryRows(rows){
    historyBody.innerHTML = "";

    if (!rows || rows.length === 0){
      const empty = document.createElement("div");
      empty.className = "row";
      empty.innerHTML = `
        <div class="muted">$0.00</div>
        <div class="muted">Sin registros</div>
        <div><button class="btn" disabled>Compartir</button></div>
      `;
      historyBody.appendChild(empty);
      return;
    }

    rows.forEach(r => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="muted">$${money(r.amount)}</div>
        <div class="muted">${r.id}</div>
        <div><button class="btn" data-share="${r.id}">Compartir</button></div>
      `;
      historyBody.appendChild(row);
    });

    historyBody.querySelectorAll("button[data-share]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-share");
        const cached = loadCache().find(x => x.id === id);
        if (!cached) return;

        const blob = await makeReceiptPdf(cached);
        const text = `Recibo ${cached.id}\nCliente: ${cached.name}\nTotal: $${money(cached.amount)}\nMétodo: ${cached.method}`;
        await sharePdfBlob(`${cached.id}.pdf`, blob, text);
      });
    });
  }

  async function refreshHistory(){
    // estrategia: Firestore si hay; si falla, cache
    try{
      const rows = await fetchFromFirestore(60);
      rows.forEach(upsertCache);
      renderHistoryRows(rows);
    }catch{
      renderHistoryRows(loadCache());
    }
  }

  // ====== PIN FLOW ======
  function requirePin(){
    show(pinLock);
    pinInput.value = "";
    setTimeout(() => pinInput.focus(), 50);
  }

  function unlock(){
    hide(pinLock);
    setView("home");
  }

  function checkPin(){
    const entered = String(pinInput.value || "").trim();
    if (entered === getPin()){
      unlock();
    }else{
      pinInput.value = "";
      pinInput.placeholder = "PIN incorrecto";
      setTimeout(() => (pinInput.placeholder = "••••"), 1200);
    }
  }

  // ====== HOME SELECT ======
  function onSelectMethod(method){
    state.method = method;
    state.methodLabel = methodLabel(method);
    state.isLinkPayment = (method === "stripe_link" || method === "ath_link");
    state.payLink = state.isLinkPayment ? (method === "stripe_link" ? STRIPE_LINK : ATH_LINK) : null;

    methodPill.textContent = `Método: ${state.methodLabel}`;
    setView("register");
  }

  // ====== CHARGE RENDER ======
  function renderCharge(){
    const amount = Number(inAmount.value || 0);
    chargeTitle.textContent = `Método: ${state.methodLabel} — Total $${money(amount)}`;

    hide(qrBlock); hide(linkBlock); hide(infoBlock);

    // QR methods
    if (state.method === "stripe"){
      qrImg.src = QR_STRIPE;
      qrImg.alt = "QR Stripe";
      show(qrBlock);
      return;
    }
    if (state.method === "ath"){
      qrImg.src = QR_ATH;
      qrImg.alt = "QR ATH";
      show(qrBlock);
      return;
    }

    // Link methods (NO se imprime el link feo)
    if (state.isLinkPayment){
      show(linkBlock);
      return;
    }

    // Others
    infoBlock.textContent =
      state.method === "tap"
        ? "Cobro por Tap to Pay. Marca “Pago completado (manual)” al finalizar."
        : state.method === "cash"
          ? "Cobro en efectivo. Marca “Pago completado (manual)” al finalizar."
          : "Pago por cheque. Marca “Pago completado (manual)” al finalizar.";
    show(infoBlock);
  }

  // ====== ACTIONS ======
  function validateRegister(){
    const name = String(inName.value || "").trim();
    const amt = Number(inAmount.value || 0);
    if (!name) return "Falta nombre.";
    if (!amt || amt <= 0) return "Monto inválido.";
    return null;
  }

  async function markPaid(){
    const err = validateRegister();
    if (err){
      subtitle.textContent = err;
      return;
    }

    const receipt = buildReceipt();
    state.receipt = receipt;

    // 1) guardar cache local
    upsertCache(receipt);

    // 2) guardar firebase
    try{ await saveToFirestore(receipt); }catch{/* offline */}

    // 3) generar pdf (jsPDF) y compartir
    const pdfBlob = await makeReceiptPdf(receipt);
    const smsText =
      `RECIBO ${receipt.id}\n` +
      `Cliente: ${receipt.name}\n` +
      `Total: $${money(receipt.amount)}\n` +
      `Método: ${receipt.method}\n` +
      `Fecha: ${new Date(receipt.createdAt).toLocaleString("es-PR")}`;

    await sharePdfBlob(`${receipt.id}.pdf`, pdfBlob, smsText);

    // 4) volver home limpio
    clearRegister();
    setView("home");
  }

  // Link open/send
  async function openPayLink(){
    if (!state.payLink) return;
    window.open(state.payLink, "_blank");
  }

  async function sendPayLink(){
    if (!state.payLink) return;
    const amt = Number(inAmount.value || 0);
    const name = String(inName.value || "Cliente").trim() || "Cliente";
    const text =
      `Link de pago — ${state.methodLabel}\n` +
      `Cliente: ${name}\n` +
      `Monto: $${money(amt)}\n` +
      `${state.payLink}`;
    await shareText("Link de pago", text);
  }

  // ====== HISTORY / PIN MGMT ======
  function openHistory(){
    show(historyModal);
    refreshHistory();
  }
  function closeHistory(){
    hide(historyModal);
  }

  function promptChangePin(){
    const current = getPin();
    const next = prompt("Nuevo PIN (4-8 dígitos):", current);
    if (next === null) return;
    const clean = String(next).replace(/[^\d]/g,"").slice(0,8);
    if (clean.length < 4){
      alert("PIN muy corto. Usa mínimo 4 dígitos.");
      return;
    }
    setPin(clean);
    alert("PIN actualizado.");
  }

  // ====== EVENTS ======
  document.querySelectorAll(".pay-icon-btn").forEach(btn => {
    btn.addEventListener("click", () => onSelectMethod(btn.dataset.method));
  });

  backHomeBtn.addEventListener("click", () => { clearRegister(); setView("home"); });
  toChargeBtn.addEventListener("click", () => {
    const err = validateRegister();
    if (err){ subtitle.textContent = err; return; }
    setView("charge");
    renderCharge();
  });

  editBtn.addEventListener("click", () => setView("register"));
  paidBtn.addEventListener("click", markPaid);

  openPayLinkBtn.addEventListener("click", openPayLink);
  sendPayLinkBtn.addEventListener("click", sendPayLink);

  openHistoryBtn.addEventListener("click", openHistory);
  closeHistoryBtn.addEventListener("click", closeHistory);

  refreshBtn.addEventListener("click", refreshHistory);

  // “Sync Google” = Firestore pull/push (sin show-off)
  syncBtn.addEventListener("click", async () => {
    syncBtn.textContent = "Sync…";
    try{
      const rows = await fetchFromFirestore(80);
      rows.forEach(upsertCache);
      renderHistoryRows(rows);
      syncBtn.textContent = "Sync Google";
    }catch{
      // offline: solo cache
      renderHistoryRows(loadCache());
      syncBtn.textContent = "Sync Google";
    }
  });

  clearCacheBtn.addEventListener("click", () => {
    if (!confirm("¿Borrar cache local?")) return;
    saveCache([]);
    renderHistoryRows([]);
  });

  changePinBtn.addEventListener("click", promptChangePin);

  // PIN
  pinEnterBtn.addEventListener("click", checkPin);
  pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") checkPin(); });

  // ====== SERVICE WORKER ======
  if ("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(()=>{});
    });
  }

  // ====== START ======
  requirePin();
})();
