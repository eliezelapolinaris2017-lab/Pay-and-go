/*************************************************
 * Nexus POS Express — Pay-and-go
 * app.js — Firebase + Cache local + jsPDF Receipt
 *************************************************/

(() => {
  // ========== DOM ==========
  const $ = (id) => document.getElementById(id);

  const viewMethods = $("viewMethods");
  const viewRegistro = $("viewRegistro");
  const viewCobro = $("viewCobro");

  const pageTitle = $("pageTitle");
  const pageSub = $("pageSub");

  const pillMetodo = $("pillMetodo");
  const cobroMetodoPill = $("cobroMetodoPill");

  const registroForm = $("registroForm");
  const volverBtn = $("volverBtn");
  const editarBtn = $("editarBtn");
  const pagadoBtn = $("pagadoBtn");

  const qrArea = $("qrArea");
  const qrImg = $("qrImg");
  const linkArea = $("linkArea");
  const openLinkBtn = $("openLinkBtn");
  const shareLinkBtn = $("shareLinkBtn");

  const openHistoryBtn = $("openHistoryBtn");
  const modal = $("modal");
  const closeModalBtn = $("closeModalBtn");
  const syncBtn = $("syncBtn");
  const refreshBtn = $("refreshBtn");
  const changePinBtn = $("changePinBtn");
  const clearCacheBtn = $("clearCacheBtn");
  const tbody = $("tbody");

  // PIN
  const pinLock = $("pinLock");
  const pinInput = $("pinInput");
  const pinEnterBtn = $("pinEnterBtn");
  const pinResetBtn = $("pinResetBtn");

  // Inputs
  const nombre = $("nombre");
  const telefono = $("telefono");
  const monto = $("monto");
  const nota = $("nota");

  // ========== LINKS (los que me diste) ==========
  const PAYMENT_LINKS = {
    ath_link: "https://pagos.athmovilapp.com/pagoPorCodigo.html?id=8fbf89be-ac6a-4a00-b4d8-a7020c474660",
    stripe_link: "https://buy.stripe.com/5kQ9AS8nQ2mA6w6aFV1RC0h"
  };

  // ========== METHODS ==========
  const METHOD_LABEL = {
    stripe: "Stripe",
    ath: "ATH Móvil",
    tap: "Tap to Pay",
    cash: "Cash",
    checks: "Checks",
    stripe_link: "Stripe Link",
    ath_link: "ATH Link"
  };

  const METHOD_QR = {
    stripe: "assets/qr-stripe.png",
    ath: "assets/qr-ath.png"
  };

  // ========== STATE ==========
  const store = {
    method: null,
    draft: null,       // datos de la transacción actual
    lastLink: null     // link oculto del cobro
  };

  // Cache local
  const CACHE_KEY = "NEXUS_POS_CACHE_V1";
  const PIN_KEY = "NEXUS_POS_PIN_V1";

  const getCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]"); }
    catch { return []; }
  };
  const setCache = (rows) => localStorage.setItem(CACHE_KEY, JSON.stringify(rows || []));

  // ========== FIREBASE ==========
  // TODO: pega tu config aquí (el objeto completo)
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

  function initFirebase() {
    try {
      if (!firebaseConfig || !firebaseConfig.projectId) {
        console.warn("Firebase config no está pegado.");
        return;
      }
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      firebaseReady = true;
    } catch (e) {
      console.warn("Firebase init falló:", e);
      firebaseReady = false;
    }
  }

  // ========== NAV ==========
  function show(view) {
    viewMethods.classList.add("hidden");
    viewRegistro.classList.add("hidden");
    viewCobro.classList.add("hidden");
    view.classList.remove("hidden");
  }

  function setHeader(title, sub) {
    pageTitle.textContent = title;
    pageSub.textContent = sub;
  }

  function formatMoney(n) {
    const x = Number(n || 0);
    return x.toLocaleString("en-US", { style:"currency", currency:"USD" });
  }

  function nowStamp() {
    // R-YYYYMMDD-HHMMSS
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    const hh = String(d.getHours()).padStart(2,"0");
    const mi = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `R-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  function methodIsLink(m) {
    return m === "ath_link" || m === "stripe_link";
  }

  function methodHasQR(m) {
    return m === "ath" || m === "stripe";
  }

  // ========== PIN ==========
  function getPin() {
    return localStorage.getItem(PIN_KEY) || "1234";
  }
  function setPin(p) {
    localStorage.setItem(PIN_KEY, String(p || "").trim());
  }

  function requirePin() {
    pinLock.classList.remove("hidden");
    pinInput.value = "";
    setTimeout(()=>pinInput.focus(), 50);
  }

  function unlockPin() {
    pinLock.classList.add("hidden");
  }

  function checkPin() {
    const entered = String(pinInput.value || "").trim();
    if (!entered) return;
    if (entered === getPin()) unlockPin();
    else alert("PIN incorrecto.");
  }

  // ========== HISTORIAL (UI) ==========
  function renderHistory(rows) {
    tbody.innerHTML = "";

    if (!rows || !rows.length) {
      const empty = document.createElement("div");
      empty.className = "row";
      empty.innerHTML = `
        <div class="muted">$0.00</div>
        <div class="muted">Sin registros</div>
        <div></div>
      `;
      tbody.appendChild(empty);
      return;
    }

    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="muted">${formatMoney(r.amount)}</div>
        <div class="muted">${r.receiptId || "—"}</div>
        <div><button class="btn-mini" data-id="${r.receiptId}">Compartir</button></div>
      `;
      tbody.appendChild(row);
    }

    tbody.querySelectorAll(".btn-mini").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const r = rows.find(x => x.receiptId === id);
        if (!r) return;
        const pdf = await buildReceiptPDF(r);
        await shareOrOpenPDF(pdf, `Recibo-${id}.pdf`);
      });
    });
  }

  function openModal() {
    modal.classList.remove("hidden");
    refreshHistory();
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  async function refreshHistory() {
    // Firebase primero, si falla -> cache local
    if (firebaseReady) {
      try {
        const snap = await db.collection("receipts").orderBy("createdAt", "desc").limit(50).get();
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .map(r => ({
            receiptId: r.receiptId,
            createdAt: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : (r.createdAt || ""),
            name: r.name || "",
            phone: r.phone || "",
            note: r.note || "",
            method: r.method || "",
            amount: Number(r.amount || 0),
            status: r.status || "PAGADO",
            payLink: r.payLink || ""
          }));

        setCache(rows);
        renderHistory(rows);
        return;
      } catch (e) {
        console.warn("History Firebase falló, usando cache:", e);
      }
    }

    renderHistory(getCache());
  }

  async function syncGoogle() {
    // “Sync Google” = refresh forzado desde Firebase
    if (!firebaseReady) {
      alert("Firebase no está disponible ahora mismo.");
      return;
    }
    await refreshHistory();
    alert("Sync completado.");
  }

  function clearLocalCache() {
    setCache([]);
    refreshHistory();
  }

  async function changePinFlow() {
    const current = prompt("PIN actual:");
    if (current === null) return;
    if (String(current).trim() !== getPin()) {
      alert("PIN actual incorrecto.");
      return;
    }
    const next = prompt("Nuevo PIN (4+ dígitos):");
    if (next === null) return;
    if (String(next).trim().length < 4) {
      alert("PIN muy corto.");
      return;
    }
    setPin(String(next).trim());
    alert("PIN actualizado.");
  }

  // ========== FLOW ==========
  function startRegistro(method) {
    store.method = method;
    store.draft = null;
    store.lastLink = null;

    pillMetodo.textContent = `Método: ${METHOD_LABEL[method] || method}`;
    setHeader("Registro", "Completa los datos para ticket e historial.");

    // limpiar form
    registroForm.reset();
    show(viewRegistro);
  }

  function startCobro(draft) {
    store.draft = draft;

    const label = METHOD_LABEL[draft.method] || draft.method;
    cobroMetodoPill.textContent = `Método: ${label} — Total ${formatMoney(draft.amount)}`;

    // QR / Link areas
    qrArea.classList.add("hidden");
    linkArea.classList.add("hidden");

    if (methodHasQR(draft.method)) {
      qrImg.src = METHOD_QR[draft.method];
      qrArea.classList.remove("hidden");
    }

    if (methodIsLink(draft.method)) {
      // URL oculto
      store.lastLink = PAYMENT_LINKS[draft.method];
      linkArea.classList.remove("hidden");
    }

    setHeader("Cobro", "Muestra QR o abre enlace. Luego marca “Pago completado”.");
    show(viewCobro);
  }

  function backToMethods() {
    store.method = null;
    store.draft = null;
    store.lastLink = null;
    setHeader("Select Payment Method", "Selecciona el método. Luego registras el cliente y cobras.");
    show(viewMethods);
  }

  // ========== PDF (jsPDF) ==========
  async function buildReceiptPDF(r) {
    const { jsPDF } = window.jspdf;

    // Formato “ticket”
    const doc = new jsPDF({
      unit: "pt",
      format: [320, 620] // tamaño tipo recibo
    });

    const pad = 18;
    let y = 28;

    doc.setFont("courier", "bold");
    doc.setFontSize(18);
    doc.text("RECIBO DE PAGO", pad, y);

    y += 26;
    doc.setFont("courier", "normal");
    doc.setFontSize(12);
    doc.text("Nexus Payments", pad, y); y += 16;
    doc.text("Tel: 787-664-3079", pad, y); y += 16;
    doc.text("Puerto Rico", pad, y); y += 16;

    y += 8;
    doc.text("----------------------------------------", pad, y); y += 22;

    doc.setFont("courier", "bold");
    doc.text(`Recibo: ${r.receiptId}`, pad, y); y += 18;

    doc.setFont("courier", "normal");
    const d = r.createdAt ? new Date(r.createdAt) : new Date();
    doc.text(`Fecha: ${d.toLocaleString("es-PR")}`, pad, y); y += 18;

    y += 6;
    doc.text("----------------------------------------", pad, y); y += 22;

    doc.setFont("courier", "bold");
    doc.text("CLIENTE", pad, y); y += 18;

    doc.setFont("courier", "normal");
    doc.text(`Nombre: ${r.name || "—"}`, pad, y); y += 18;
    doc.text(`Telefono: ${r.phone || "—"}`, pad, y); y += 18;

    y += 6;
    doc.text("----------------------------------------", pad, y); y += 22;

    doc.setFont("courier", "bold");
    doc.text("PAGO", pad, y); y += 18;

    doc.setFont("courier", "normal");
    doc.text(`Metodo: ${METHOD_LABEL[r.method] || r.method}`, pad, y); y += 18;
    doc.text(`Estado: ${r.status || "PAGADO"}`, pad, y); y += 18;

    y += 6;
    doc.setFont("courier", "bold");
    doc.setFontSize(16);
    doc.text(`TOTAL: ${formatMoney(r.amount)}`, pad, y); y += 22;

    doc.setFontSize(12);
    doc.setFont("courier", "bold");
    doc.text("NOTA", pad, y); y += 18;

    doc.setFont("courier", "normal");
    const note = (r.note || "—").slice(0, 80);
    doc.text(note, pad, y);

    y += 28;
    doc.text("----------------------------------------", pad, y); y += 20;
    doc.text("Gracias por su pago.", pad, y);

    return doc.output("blob");
  }

  async function shareOrOpenPDF(blob, filename) {
    try {
      // Web Share (iOS moderno)
      if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: "application/pdf" })] })) {
        await navigator.share({
          files: [new File([blob], filename, { type: "application/pdf" })],
          title: "Recibo",
          text: "Recibo de pago"
        });
        return;
      }
    } catch (_) {}

    // fallback: abrir en nueva pestaña
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // ========== SAVE RECEIPT ==========
  async function saveReceipt(r) {
    // 1) cache local
    const rows = getCache();
    rows.unshift(r);
    setCache(rows.slice(0, 200));

    // 2) firebase
    if (firebaseReady) {
      try {
        await db.collection("receipts").add({
          receiptId: r.receiptId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          name: r.name || "",
          phone: r.phone || "",
          note: r.note || "",
          method: r.method,
          amount: Number(r.amount || 0),
          status: r.status || "PAGADO",
          payLink: r.payLink || ""
        });
      } catch (e) {
        console.warn("Guardar en Firebase falló, queda en cache:", e);
      }
    }
  }

  // ========== EVENTS ==========
  // selección de métodos
  document.querySelectorAll(".pay-icon-btn").forEach(btn => {
    btn.addEventListener("click", () => startRegistro(btn.getAttribute("data-method")));
  });

  volverBtn.addEventListener("click", backToMethods);
  editarBtn.addEventListener("click", () => startRegistro(store.method));

  registroForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const method = store.method;
    if (!method) return;

    const amt = Number(String(monto.value || "").replace(/[^\d.]/g, ""));
    if (!amt || amt <= 0) {
      alert("Monto inválido.");
      return;
    }

    const draft = {
      method,
      name: String(nombre.value || "").trim(),
      phone: String(telefono.value || "").trim(),
      note: String(nota.value || "").trim(),
      amount: amt
    };

    startCobro(draft);
  });

  // Abrir link (oculto)
  openLinkBtn.addEventListener("click", () => {
    if (!store.lastLink) return;
    window.open(store.lastLink, "_blank", "noopener,noreferrer");
  });

  // Enviar link (share sheet si existe)
  shareLinkBtn.addEventListener("click", async () => {
    if (!store.lastLink) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Link de pago",
          text: "Aquí tienes el link de pago:",
          url: store.lastLink
        });
        return;
      }
    } catch (_) {}

    // fallback: copiar
    try {
      await navigator.clipboard.writeText(store.lastLink);
      alert("Link copiado.");
    } catch {
      prompt("Copia el link:", store.lastLink);
    }
  });

  // Pago completado -> guardar + generar recibo
  pagadoBtn.addEventListener("click", async () => {
    if (!store.draft) return;

    const receiptId = nowStamp();
    const record = {
      receiptId,
      createdAt: new Date().toISOString(),
      method: store.draft.method,
      name: store.draft.name,
      phone: store.draft.phone,
      note: store.draft.note,
      amount: Number(store.draft.amount || 0),
      status: "PAGADO",
      payLink: methodIsLink(store.draft.method) ? (PAYMENT_LINKS[store.draft.method] || "") : ""
    };

    await saveReceipt(record);

    // PDF
    const pdf = await buildReceiptPDF(record);
    await shareOrOpenPDF(pdf, `Recibo-${receiptId}.pdf`);

    // volver al inicio
    backToMethods();
  });

  // Modal
  openHistoryBtn.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  refreshBtn.addEventListener("click", refreshHistory);
  syncBtn.addEventListener("click", syncGoogle);
  clearCacheBtn.addEventListener("click", clearLocalCache);
  changePinBtn.addEventListener("click", changePinFlow);

  // PIN events
  pinEnterBtn.addEventListener("click", checkPin);
  pinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkPin();
  });

  pinResetBtn.addEventListener("click", () => {
    const ok = confirm("Reset PIN a 1234?");
    if (!ok) return;
    setPin("1234");
    alert("PIN reseteado.");
  });

  // ========== INIT ==========
  initFirebase();
  setHeader("Select Payment Method", "Selecciona el método. Luego registras el cliente y cobras.");
  show(viewMethods);
  requirePin();
})();
