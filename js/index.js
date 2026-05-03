console.log("[SITE] index.js chargé – Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

if (typeof Appwrite === "undefined") {
  console.error("[SITE] Appwrite SDK non chargé.");
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);

// ===============================
//  HELPERS DOM
// ===============================
const $ = (id) => document.getElementById(id);

function showReservationMessage(text, type = "info") {
  const zone = $("reservationMessage");
  if (!zone) return;

  zone.style.display = "block";
  zone.textContent = text;
  zone.className = "message message-" + type;
}

function clearReservationMessage() {
  const zone = $("reservationMessage");
  if (!zone) return;

  zone.style.display = "none";
  zone.textContent = "";
  zone.className = "message";
}

function setButtonLoading(button, loadingText) {
  if (!button) return;

  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
}

function resetButtonLoading(button) {
  if (!button) return;

  button.disabled = false;
  button.textContent = button.dataset.originalText || "✅ Confirmer la réservation";
}

// ===============================
//  ETAT RESERVATION
// ===============================
let formDirty = false;
let reservationConfirmed = false;

let confirmedNumero = null;
let confirmedTicketDataURL = null;
let confirmedTicketMeta = null;

// ===============================
//  POPUP
// ===============================
function openReservationPopup() {
  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");

  if (!overlay || !card) return;

  overlay.classList.add("visible");
  card.classList.add("visible");
  document.body.style.overflow = "hidden";

  clearReservationMessage();

  showReservationMessage(
    "Attention : votre réservation n’est pas confirmée tant que vous n’avez pas cliqué sur Confirmer la réservation.",
    "info"
  );
}

function closeReservationPopup(withWarningIfPending = true) {
  if (withWarningIfPending && formDirty && !reservationConfirmed) {
    showReservationMessage(
      "Attention : votre réservation n’est pas confirmée tant que vous n’avez pas cliqué sur Confirmer la réservation. Aucune donnée n’a été enregistrée.",
      "warning"
    );

    formDirty = false;
    return;
  }

  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");

  if (!overlay || !card) return;

  overlay.classList.remove("visible");
  card.classList.remove("visible");
  document.body.style.overflow = "";

  resetReservationState();
}

// ===============================
//  FLATPICKR
// ===============================
let fpInstance = null;

function initFlatpickr() {
  const input = $("resDateDisplay");

  if (!input || typeof flatpickr === "undefined") {
    console.error("[SITE] Flatpickr non chargé.");
    return;
  }

  fpInstance = flatpickr(input, {
    locale: "fr",
    dateFormat: "d/m/Y",
    minDate: "today",
    disableMobile: true,
    disable: [
      (date) => date.getDay() === 1 || date.getDay() === 2
    ],
    onDayCreate(_, __, ___, dayElem) {
      const day = dayElem.dateObj.getDay();

      if (day === 1 || day === 2) {
        dayElem.classList.add("fp-ferme");
      }
    },
    onChange(_, __, instance) {
      formDirty = true;
      instance.close();
    }
  });
}

function parseDateFrToISO(dateStr) {
  const parts = dateStr.split("/").map(Number);

  if (parts.length !== 3) return null;

  const [dd, mm, yyyy] = parts;

  if (!dd || !mm || !yyyy) return null;

  return new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0)).toISOString();
}

// ===============================
//  NUMERO RESERVATION
// ===============================
async function generateReservationNumber(dateIso) {
  const d = new Date(dateIso);

  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(-2);
  const prefix = `RES-${month}${year}-`;

  const res = await db.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_RESERVATION_COLLECTION_ID,
    [
      Appwrite.Query.startsWith("numero_reservation", prefix),
      Appwrite.Query.limit(10000)
    ]
  );

  let maxIndex = 0;

  for (const doc of res.documents || []) {
    const num = doc.numero_reservation || "";
    const idx = parseInt(num.split("-")[2] || "0", 10);

    if (!Number.isNaN(idx) && idx > maxIndex) {
      maxIndex = idx;
    }
  }

  return `${prefix}${String(maxIndex + 1).padStart(4, "0")}`;
}

// ===============================
//  RETRY ANTI-DOUBLON
// ===============================
async function createReservationWithRetry(data, dateIso) {
  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const numero = await generateReservationNumber(dateIso);

    try {
      const doc = await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_RESERVATION_COLLECTION_ID,
        Appwrite.ID.unique(),
        {
          ...data,
          numero_reservation: numero
        }
      );

      return { doc, numero };
    } catch (err) {
      const isDuplicate =
        err?.code === 409 ||
        err?.type === "document_already_exists" ||
        String(err?.message || "").toLowerCase().includes("unique");

      if (isDuplicate && attempt < MAX_RETRIES) {
        console.warn(
          `[SITE] Doublon numero_reservation (${numero}). Nouvel essai ${attempt}/${MAX_RETRIES}...`
        );
        continue;
      }

      throw err;
    }
  }

  throw new Error("Impossible de générer un numéro unique après plusieurs essais.");
}

// ===============================
//  TICKET PNG
// ===============================
function buildTicketCanvas({ numero, nom, prenom, telephone, activite, dateStr }) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 560;

  const ctx = canvas.getContext("2d");

  // Fond
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bordure
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  // Bandeau
  const gradient = ctx.createLinearGradient(20, 20, canvas.width - 20, 110);
  gradient.addColorStop(0, "#667eea");
  gradient.addColorStop(0.55, "#764ba2");
  gradient.addColorStop(1, "#ff6b35");

  ctx.fillStyle = gradient;
  ctx.fillRect(20, 20, canvas.width - 40, 100);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial";
  ctx.fillText("Calypço - Ticket de Réservation", 50, 82);

  // Numéro
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 28px Arial";
  ctx.fillText(`N° ${numero}`, 50, 165);

  // Infos
  ctx.font = "22px Arial";
  ctx.fillText(`Nom / Prénom : ${nom} ${prenom}`, 50, 230);
  ctx.fillText(`Téléphone : ${telephone}`, 50, 275);
  ctx.fillText(`Activité : ${activite}`, 50, 320);
  ctx.fillText(`Date de réservation : ${dateStr}`, 50, 365);

  // Note
  ctx.fillStyle = "#475569";
  ctx.font = "italic 18px Arial";
  ctx.fillText("Merci de présenter ce ticket à l’accueil.", 50, 445);

  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "#ef4444";
  ctx.fillText("Ce ticket doit être affilié à un billet par un agent à l’arrivée.", 50, 480);

  return canvas;
}

function createTicketPreview(data) {
  const canvas = buildTicketCanvas(data);
  return canvas.toDataURL("image/png");
}

function downloadDataURL(dataURL, filename) {
  const a = document.createElement("a");

  a.href = dataURL;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ===============================
//  UI TICKET
// ===============================
function ensureTicketUI() {
  const form = $("reservationForm");

  if (!form || $("ticketPreviewZone")) return;

  const zone = document.createElement("div");
  zone.id = "ticketPreviewZone";
  zone.className = "ticket-preview-zone";
  zone.style.display = "none";

  zone.innerHTML = `
    <h3>Aperçu de votre ticket</h3>

    <p class="ticket-help">
      Votre réservation est confirmée. Vous pouvez télécharger votre ticket comme preuve.
    </p>

    <img id="ticketPreviewImg" class="ticket-preview-img" alt="Aperçu du ticket de réservation" />

    <div class="ticket-actions">
      <button type="button" id="btnDownloadTicket" class="btn-secondary">
        📥 Télécharger le ticket
      </button>

      <button type="button" id="btnNewReservation" class="btn-primary">
        🆕 Nouvelle réservation
      </button>
    </div>
  `;

  form.appendChild(zone);

  const btnDownload = zone.querySelector("#btnDownloadTicket");
  const btnNew = zone.querySelector("#btnNewReservation");

  btnDownload.addEventListener("click", () => {
    if (!confirmedTicketDataURL || !confirmedNumero) {
      showReservationMessage("Aucun ticket disponible à télécharger.", "error");
      return;
    }

    downloadDataURL(confirmedTicketDataURL, `ticket-${confirmedNumero}.png`);
  });

  btnNew.addEventListener("click", () => {
    const formEl = $("reservationForm");

    if (formEl) formEl.reset();

    resetReservationState();
    clearReservationMessage();

    showReservationMessage(
      "Vous pouvez saisir une nouvelle réservation.",
      "info"
    );
  });
}

function showTicketUI(dataURL) {
  const img = $("ticketPreviewImg");
  const zone = $("ticketPreviewZone");
  const submitBtn = $("btnSubmitReservation");

  if (img) img.src = dataURL;
  if (zone) zone.style.display = "block";
  if (submitBtn) submitBtn.style.display = "none";
}

function resetTicketUI() {
  const zone = $("ticketPreviewZone");
  const img = $("ticketPreviewImg");
  const submitBtn = $("btnSubmitReservation");

  if (zone) zone.style.display = "none";
  if (img) img.src = "";
  if (submitBtn) submitBtn.style.display = "inline-flex";
}

function resetReservationState() {
  formDirty = false;
  reservationConfirmed = false;

  confirmedNumero = null;
  confirmedTicketDataURL = null;
  confirmedTicketMeta = null;

  resetTicketUI();
  clearReservationMessage();

  const submitBtn = $("btnSubmitReservation");
  resetButtonLoading(submitBtn);
}

// ===============================
//  CONFIRMATION RESERVATION
// ===============================
async function submitReservation(e) {
  e.preventDefault();

  clearReservationMessage();

  const submitBtn = $("btnSubmitReservation");

  const nom = $("resNom")?.value.trim();
  const prenom = $("resPrenom")?.value.trim();
  const telephone = $("resTelephone")?.value.trim();
  const email = $("resEmail")?.value.trim();
  const dateStr = $("resDateDisplay")?.value.trim();
  const activite = $("resActivite")?.value.trim();

  if (!nom || !prenom || !telephone || !dateStr || !activite) {
    showReservationMessage("Merci de remplir tous les champs obligatoires.", "error");
    return;
  }

  const dateIso = parseDateFrToISO(dateStr);

  if (!dateIso) {
    showReservationMessage("Date invalide.", "error");
    return;
  }

  const payload = {
    nom,
    prenom,
    telephone,
    "e-mail": email || null,
    date_reservation: dateIso,
    activite,
    actif: true
  };

  try {
    setButtonLoading(submitBtn, "Confirmation en cours...");

    const { numero } = await createReservationWithRetry(payload, dateIso);

    confirmedNumero = numero;
    confirmedTicketMeta = {
      numero,
      nom,
      prenom,
      telephone,
      activite,
      dateStr
    };

    confirmedTicketDataURL = createTicketPreview(confirmedTicketMeta);

    reservationConfirmed = true;
    formDirty = false;

    showReservationMessage(
      `Réservation confirmée avec succès. Numéro : ${confirmedNumero}`,
      "success"
    );

    showTicketUI(confirmedTicketDataURL);
  } catch (err) {
    console.error("[SITE] Erreur confirmation réservation :", err);

    showReservationMessage(
      "Erreur lors de la confirmation de la réservation. Merci de réessayer.",
      "error"
    );

    resetButtonLoading(submitBtn);
  }
}

// ===============================
//  TRACK FORM MODIFIE
// ===============================
function initFormDirtyTracking() {
  const form = $("reservationForm");

  if (!form) return;

  form.querySelectorAll("input, select").forEach((field) => {
    field.addEventListener("input", () => {
      if (!reservationConfirmed) {
        formDirty = true;
      }
    });

    field.addEventListener("change", () => {
      if (!reservationConfirmed) {
        formDirty = true;
      }
    });
  });
}

// ===============================
//  INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  ensureTicketUI();
  initFlatpickr();
  initFormDirtyTracking();

  const btnShowReservation = $("btnShowReservation");
  const btnCloseReservation = $("btnCloseReservation");
  const form = $("reservationForm");

  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");

  if (btnShowReservation) {
    btnShowReservation.addEventListener("click", openReservationPopup);
  }

  if (btnCloseReservation) {
    btnCloseReservation.addEventListener("click", () => {
      closeReservationPopup(true);
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      closeReservationPopup(true);
    });
  }

  if (card) {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeReservationPopup(true);
    }
  });

  if (form) {
    form.addEventListener("submit", submitReservation);
  }
});
