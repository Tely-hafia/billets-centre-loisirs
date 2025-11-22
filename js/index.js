console.log("[SITE] index.js chargé – Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

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

// ===============================
//  POPUP + ETAT
// ===============================
let hasPendingReservation = false;
let pendingPayload = null;
let pendingNumero = null;
let pendingTicketDataURL = null;

// ✅ AJOUT : on garde les infos nécessaires pour régénérer le ticket
let pendingTicketMeta = null;

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
    // annule ce qui est en attente
    hasPendingReservation = false;
    pendingPayload = null;
    pendingNumero = null;
    pendingTicketDataURL = null;
    pendingTicketMeta = null;
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
    disable: [(date) => date.getDay() === 1 || date.getDay() === 2],
    onDayCreate(_, __, ___, dayElem) {
      const d = dayElem.dateObj.getDay();
      if (d === 1 || d === 2) dayElem.classList.add("fp-ferme");
    },
    onChange(_, __, instance) {
      instance.close(); // ferme direct après sélection
    }
  });
}

function parseDateFrToISO(dateStr) {
  const [dd, mm, yyyy] = dateStr.split("/").map(Number);
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
  for (const doc of res.documents) {
    const num = doc.numero_reservation || "";
    const idx = parseInt(num.split("-")[2] || "0", 10);
    if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
  }

  return `${prefix}${String(maxIndex + 1).padStart(4, "0")}`;
}

// ===============================
//  ✅ RETRY POUR INDEX UNIQUE
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
          `[SITE] Doublon numero_reservation (${numero}). Retry ${attempt}/${MAX_RETRIES}...`
        );
        continue;
      }

      throw err;
    }
  }

  throw new Error("Impossible de générer un numéro unique après plusieurs essais.");
}

// ===============================
//  TICKET PNG (APERÇU)
// ===============================
function buildTicketCanvas({ numero, nom, prenom, telephone, activite, dateStr }) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

  ctx.fillStyle = "#2563eb";
  ctx.fillRect(20, 20, canvas.width - 40, 90);

  ctx.fillStyle = "#fff";
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
  return canvas.toDataURL("image/png");
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
//  UI Ticket (inject)
// ===============================
function ensureTicketUI() {
  const form = $("reservationForm");
  if (!form || $("ticketPreviewZone")) return;

  const zone = document.createElement("div");
  zone.id = "ticketPreviewZone";
  zone.className = "ticket-preview-zone";
  zone.style.display = "none";

  zone.innerHTML = `
    <h3 style="margin-top:1rem;">Aperçu de votre ticket</h3>
    <p style="color:var(--text-muted);font-size:.9rem;margin-bottom:.75rem;">
      Téléchargez ce ticket pour confirmer votre réservation.
    </p>
    <img id="ticketPreviewImg" class="ticket-preview-img" alt="Aperçu ticket"/>
    <div style="margin-top:1rem;display:flex;gap:.75rem;flex-wrap:wrap;">
      <button type="button" id="btnDownloadTicket" class="btn-primary">📥 Télécharger la réservation</button>
      <button type="button" id="btnEditReservation" class="btn-secondary">✏️ Modifier</button>
    </div>
  `;
  form.appendChild(zone);

  zone.querySelector("#btnDownloadTicket").addEventListener("click", async () => {
    if (!hasPendingReservation || !pendingPayload || !pendingTicketMeta) {
      showReservationMessage("Aucune réservation en attente.", "error");
      return;
    }

    try {
      // ✅ 1) on sauvegarde d’abord avec retry (index UNIQUE)
      const dateIso = pendingPayload.date_reservation;
      const { numero } = await createReservationWithRetry(pendingPayload, dateIso);

      // ✅ 2) on régénère le ticket avec le numéro FINAL enregistré
      pendingNumero = numero;
      pendingTicketDataURL = createTicketPreview({
        numero: pendingNumero,
        nom: pendingTicketMeta.nom,
        prenom: pendingTicketMeta.prenom,
        telephone: pendingTicketMeta.telephone,
        activite: pendingTicketMeta.activite,
        dateStr: pendingTicketMeta.dateStr
      });

      // ✅ 3) on télécharge le ticket correspondant à la base
      await downloadDataURL(pendingTicketDataURL, `ticket-${pendingNumero}.png`);

      showReservationMessage(`Réservation confirmée ! Numéro : ${pendingNumero}`, "success");

      // reset puis fermeture
      hasPendingReservation = false;
      pendingPayload = pendingNumero = pendingTicketDataURL = null;
      pendingTicketMeta = null;

      form.reset();
      resetTicketUI();
      closeReservationPopup(false);
    } catch (err) {
      console.error("[SITE] Erreur confirmation reservation :", err);
      showReservationMessage(
        "Erreur lors de la confirmation. Merci de réessayer.",
        "error"
      );
    }
  });

  zone.querySelector("#btnEditReservation").addEventListener("click", () => {
    hasPendingReservation = false;
    pendingPayload = pendingNumero = pendingTicketDataURL = null;
    pendingTicketMeta = null;
    resetTicketUI();
  });
}

function showTicketUI(dataURL) {
  $("ticketPreviewImg").src = dataURL;
  $("ticketPreviewZone").style.display = "block";
  $("btnSubmitReservation").style.display = "none";
}

function resetTicketUI() {
  const z = $("ticketPreviewZone");
  if (z) z.style.display = "none";
  const img = $("ticketPreviewImg");
  if (img) img.src = "";
  const btn = $("btnSubmitReservation");
  if (btn) btn.style.display = "inline-flex";
}

// ===============================
//  SUBMIT => Génère ticket, PAS de save
// ===============================
async function submitReservation(e) {
  e.preventDefault();
  clearReservationMessage();

  const nom = $("resNom").value.trim();
  const prenom = $("resPrenom").value.trim();
  const telephone = $("resTelephone").value.trim();
  const email = $("resEmail").value.trim();
  const dateStr = $("resDateDisplay").value.trim();
  const activite = $("resActivite").value.trim();

  if (!nom || !prenom || !telephone || !dateStr || !activite) {
    showReservationMessage("Merci de remplir tous les champs obligatoires.", "error");
    return;
  }

  const dateIso = parseDateFrToISO(dateStr);
  if (!dateIso) {
    showReservationMessage("Date invalide.", "error");
    return;
  }

  // aperçu numéro (peut changer à la confirmation si collision)
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

  // ✅ AJOUT : stocke meta ticket (sans numéro) pour regen plus tard
  pendingTicketMeta = { nom, prenom, telephone, activite, dateStr };

  pendingTicketDataURL = createTicketPreview({
    numero, nom, prenom, telephone, activite, dateStr
  });

  hasPendingReservation = true;

  showReservationMessage(
    `Ticket généré. Cliquez sur “Télécharger la réservation” pour confirmer.`,
    "success"
  );

  showTicketUI(pendingTicketDataURL);
}

// ===============================
//  INIT
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  ensureTicketUI();
  initFlatpickr();

  $("btnShowReservation").addEventListener("click", openReservationPopup);
  $("btnCloseReservation").addEventListener("click", () => closeReservationPopup(true));

  const overlay = $("reservation-block");
  const card = overlay.querySelector(".reservation-card");
  overlay.addEventListener("click", () => closeReservationPopup(true));
  card.addEventListener("click", (e) => e.stopPropagation());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReservationPopup(true);
  });

  $("reservationForm").addEventListener("submit", submitReservation);
});
