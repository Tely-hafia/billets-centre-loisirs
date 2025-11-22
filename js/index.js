console.log("[SITE] index.js chargé – Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation"; // OK si c'est bien l'ID

if (typeof Appwrite === "undefined") {
  console.error("[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0 dans le HTML.");
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const db = new Appwrite.Databases(client);

// ===============================
//  HELPERS DOM
// ===============================
function $(id) {
  return document.getElementById(id);
}

function showReservationMessage(text, type) {
  const zone = $("reservationMessage");
  if (!zone) return;
  zone.style.display = "block";
  zone.textContent = text;
  zone.className = "message";
  if (type === "success") zone.classList.add("message-success");
  else if (type === "error") zone.classList.add("message-error");
  else zone.classList.add("message-info");
}

function clearReservationMessage() {
  const zone = $("reservationMessage");
  if (!zone) return;
  zone.style.display = "none";
  zone.textContent = "";
  zone.className = "message";
}

// ===============================
//  POPUP + ETAT RESERVATION
// ===============================
let hasPendingReservation = false;
let pendingPayload = null;
let pendingNumero = null;
let pendingTicketDataURL = null;

function openReservationPopup() {
  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.add("visible");
  card.classList.add("visible");
  document.body.style.overflow = "hidden";

  clearReservationMessage();
  resetTicketUI();
}

function closeReservationPopup(withWarningIfPending = true) {
  if (withWarningIfPending && hasPendingReservation) {
    showReservationMessage(
      "Attention : si vous ne téléchargez pas votre preuve de réservation, la réservation sera annulée.",
      "error"
    );
    // annule la réservation en attente
    hasPendingReservation = false;
    pendingPayload = null;
    pendingNumero = null;
    pendingTicketDataURL = null;
    resetTicketUI();
    return; // on laisse ouvert pour que le client voie le message
  }

  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.remove("visible");
  card.classList.remove("visible");
  document.body.style.overflow = "";

  clearReservationMessage();
  resetTicketUI();
}

// ===============================
//  FLATPICKR (CALENDRIER)
// ===============================
let fpInstance = null;

function initFlatpickr() {
  const input = $("resDateDisplay");
  if (!input || typeof flatpickr === "undefined") {
    console.error("[SITE] Flatpickr non chargé.");
    return;
  }

  // si ton ancien bloc calendrier existe, on le cache définitivement
  const oldCalendar = $("calendarCard");
  if (oldCalendar) oldCalendar.style.display = "none";

  fpInstance = flatpickr(input, {
    locale: "fr",
    dateFormat: "d/m/Y",
    minDate: "today",
    disableMobile: true, // force dropdown même sur mobile
    disable: [
      (date) => date.getDay() === 1 || date.getDay() === 2 // lundi 1, mardi 2
    ],
    onDayCreate: function(dObj, dStr, fp, dayElem) {
      const day = dayElem.dateObj.getDay();
      if (day === 1 || day === 2) {
        dayElem.classList.add("fp-ferme"); // style rouge/gris via CSS
      }
    },
    onChange: function(selectedDates, dateStr, instance) {
      // dès qu'on choisit une date => champ rempli + calendrier se ferme
      instance.close();
    }
    // Flatpickr ferme déjà si on clique ailleurs
  });
}

// Pour convertir la date Flatpickr -> ISO UTC
function parseDateFrToISO(dateStr) {
  // "dd/mm/yyyy"
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [ddStr, mmStr, yyyyStr] = parts;
  const dd = parseInt(ddStr, 10);
  const mm = parseInt(mmStr, 10);
  const yyyy = parseInt(yyyyStr, 10);
  if (!dd || !mm || !yyyy) return null;

  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return d.toISOString();
}

// ===============================
//  NUMERO RESERVATION
// ===============================
async function generateReservationNumber(dateIso) {
  const d = new Date(dateIso);
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(-2);
  const prefix = `RES-${month}${year}-`;

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.startsWith("numero_reservation", prefix),
        Appwrite.Query.limit(10000)
      ]
    );

    let maxIndex = 0;
    for (const doc of res.documents) {
      const num = doc.numero_reservation || "";
      const parts = num.split("-");
      const idx = parseInt(parts[2] || "0", 10);
      if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
    }

    const nextIndex = maxIndex + 1;
    return `${prefix}${String(nextIndex).padStart(4, "0")}`;
  } catch (err) {
    console.error("[SITE] Erreur génération numéro réservation :", err);
    const random = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    return `${prefix}${random}`;
  }
}

// ===============================
//  TICKET PNG (APERÇU + DOWNLOAD)
// ===============================
function buildTicketCanvas({ numero, nom, prenom, telephone, activite, dateStr }) {
  const canvas = document.createElement("canvas");
  const W = 900, H = 520;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  ctx.fillStyle = "#2563eb";
  ctx.fillRect(20, 20, W - 40, 90);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Calypço - Ticket de Réservation", 50, 75);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px Arial";
  ctx.fillText(`N° ${numero}`, 50, 155);

  ctx.font = "20px Arial";
  ctx.fillText(`Nom / Prénom : ${nom} ${prenom}`, 50, 215);
  ctx.fillText(`Téléphone : ${telephone}`, 50, 255);
  ctx.fillText(`Activité : ${activite}`, 50, 295);
  ctx.fillText(`Date de réservation : ${dateStr}`, 50, 335);

  ctx.font = "italic 16px Arial";
  ctx.fillStyle = "#475569";
  ctx.fillText("Merci de présenter ce ticket à l’accueil.", 50, 410);

  return canvas;
}

function createTicketPreview(data) {
  const canvas = buildTicketCanvas(data);
  const dataURL = canvas.toDataURL("image/png");
  return { dataURL };
}

function downloadDataURL(dataURL, filename) {
  return new Promise((resolve) => {
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    resolve();
  });
}

// ===============================
//  UI Ticket (injectée)
// ===============================
function ensureTicketUI() {
  const form = $("reservationForm");
  if (!form) return;

  if ($("ticketPreviewZone")) return;

  const zone = document.createElement("div");
  zone.id = "ticketPreviewZone";
  zone.style.display = "none";
  zone.className = "ticket-preview-zone";

  zone.innerHTML = `
    <h3 style="margin-top:1rem;">Aperçu de votre ticket</h3>
    <p style="color: var(--text-muted); font-size:0.9rem; margin-bottom:0.75rem;">
      Téléchargez ce ticket pour confirmer votre réservation.
    </p>
    <img id="ticketPreviewImg" alt="Aperçu ticket" class="ticket-preview-img" />
    <div style="margin-top:1rem; display:flex; gap:0.75rem; flex-wrap:wrap;">
      <button type="button" id="btnDownloadTicket" class="btn-primary">
        📥 Télécharger la réservation
      </button>
      <button type="button" id="btnEditReservation" class="btn-secondary">
        ✏️ Modifier
      </button>
    </div>
  `;

  form.appendChild(zone);

  zone.querySelector("#btnDownloadTicket").addEventListener("click", async () => {
    if (!hasPendingReservation || !pendingPayload || !pendingNumero || !pendingTicketDataURL) {
      showReservationMessage("Aucune réservation en attente.", "error");
      return;
    }

    // 1) Télécharger le ticket
    await downloadDataURL(pendingTicketDataURL, `ticket-${pendingNumero}.png`);

    // 2) Enregistrer SEULEMENT APRES téléchargement
    try {
      await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_RESERVATION_COLLECTION_ID,
        Appwrite.ID.unique(),
        {
          ...pendingPayload,
          numero_reservation: pendingNumero
        }
      );

      showReservationMessage(`Réservation confirmée ! Numéro : ${pendingNumero}`, "success");

      // reset
      hasPendingReservation = false;
      pendingPayload = null;
      pendingNumero = null;
      pendingTicketDataURL = null;

      const formEl = $("reservationForm");
      if (formEl) formEl.reset();

      resetTicketUI();

      // ferme popup automatiquement
      closeReservationPopup(false);

    } catch (err) {
      console.error("[SITE] Erreur Appwrite confirmation :", err);
      showReservationMessage(
        "Téléchargement OK, mais erreur lors de la confirmation. Réessayez.",
        "error"
      );
    }
  });

  zone.querySelector("#btnEditReservation").addEventListener("click", () => {
    hasPendingReservation = false;
    pendingPayload = null;
    pendingNumero = null;
    pendingTicketDataURL = null;
    resetTicketUI();
  });
}

function showTicketUI(dataURL) {
  const zone = $("ticketPreviewZone");
  const img = $("ticketPreviewImg");
  const submitBtn = $("btnSubmitReservation");
  if (!zone || !img) return;

  img.src = dataURL;
  zone.style.display = "block";
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

// ===============================
//  SUBMIT => génère ticket, PAS de save
// ===============================
async function submitReservation(e) {
  e.preventDefault();
  clearReservationMessage();

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
    showReservationMessage("La date de réservation est invalide.", "error");
    return;
  }

  try {
    const numero = await generateReservationNumber(dateIso);

    pendingNumero = numero;
    pendingPayload = {
      nom,
      prenom,
      telephone,
      "e-mail": email || null,
      date_reservation: dateIso,
      activite,
      actif: true
    };

    const { dataURL } = createTicketPreview({
      numero, nom, prenom, telephone, activite, dateStr
    });

    pendingTicketDataURL = dataURL;
    hasPendingReservation = true;

    showReservationMessage(
      `Ticket généré. Cliquez sur “Télécharger la réservation” pour confirmer.`,
      "success"
    );

    showTicketUI(dataURL);

  } catch (err) {
    console.error("[SITE] Erreur génération ticket :", err);
    showReservationMessage("Erreur lors de la génération du ticket. Réessayez.", "error");
  }
}

// ===============================
//  INIT GLOBAL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init Calypço");

  ensureTicketUI();
  initFlatpickr();

  const btnShowReservation = $("btnShowReservation");
  const btnCloseReservation = $("btnCloseReservation");
  const reservationBlock = $("reservation-block");
  const reservationCard = reservationBlock?.querySelector(".reservation-card");

  if (btnShowReservation) {
    btnShowReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      openReservationPopup();
    });
  }

  if (btnCloseReservation) {
    btnCloseReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      closeReservationPopup(true);
    });
  }

  if (reservationBlock && reservationCard) {
    reservationBlock.addEventListener("click", () => closeReservationPopup(true));
    reservationCard.addEventListener("click", (e) => e.stopPropagation());
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReservationPopup(true);
  });

  const form = $("reservationForm");
  if (form) form.addEventListener("submit", submitReservation);
});
