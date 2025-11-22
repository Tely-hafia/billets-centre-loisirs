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
//  POPUP RESERVATION
// ===============================
let hasPendingReservation = false;   // vrai si ticket généré mais pas téléchargé
let pendingPayload = null;           // données prêtes à être envoyées
let pendingNumero = null;            // numéro généré
let pendingTicketDataURL = null;     // image ticket en dataURL

function openReservationPopup() {
  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.add("visible");
  card.classList.add("visible");
  document.body.style.overflow = "hidden";

  clearReservationMessage();

  // reset UI ticket si on rouvre
  resetTicketUI();
}

function closeReservationPopup(withWarningIfPending = true) {
  if (withWarningIfPending && hasPendingReservation) {
    showReservationMessage(
      "Attention : si vous ne téléchargez pas votre preuve de réservation, la réservation sera annulée.",
      "error"
    );
    // on annule la réservation en attente
    hasPendingReservation = false;
    pendingPayload = null;
    pendingNumero = null;
    pendingTicketDataURL = null;

    resetTicketUI();
    return; // on laisse la popup ouverte pour que le client voie le message
  }

  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.remove("visible");
  card.classList.remove("visible");
  document.body.style.overflow = "";

  // refermer calendrier
  const calendarCard = $("calendarCard");
  if (calendarCard) calendarCard.style.display = "none";

  clearReservationMessage();
  resetTicketUI();
}

// ===============================
//  CALENDRIER
// ===============================
let calCurrentMonth;
let calCurrentYear;
let calSelectedDate = null;

function initCalendar() {
  const today = new Date();
  calCurrentMonth = today.getMonth();
  calCurrentYear = today.getFullYear();
  renderCalendar();

  const btnPrev = $("calPrev");
  const btnNext = $("calNext");

  if (btnPrev) {
    btnPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      calCurrentMonth--;
      if (calCurrentMonth < 0) {
        calCurrentMonth = 11;
        calCurrentYear--;
      }
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", (e) => {
      e.stopPropagation();
      calCurrentMonth++;
      if (calCurrentMonth > 11) {
        calCurrentMonth = 0;
        calCurrentYear++;
      }
      renderCalendar();
    });
  }
}

function renderCalendar() {
  const daysContainer = $("calendarDays");
  const titleEl = $("calMonthTitle");
  if (!daysContainer || !titleEl) return;

  const monthNames = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];
  titleEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;
  daysContainer.innerHTML = "";

  const firstDayOfMonth = new Date(calCurrentYear, calCurrentMonth, 1);
  const startingWeekDay = (firstDayOfMonth.getDay() + 6) % 7; // 0=lu..6=di
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < startingWeekDay; i++) {
    daysContainer.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.textContent = String(day);

    const dateObj = new Date(calCurrentYear, calCurrentMonth, day);
    dateObj.setHours(0, 0, 0, 0);

    const weekday = (dateObj.getDay() + 6) % 7;
    let isDisabled = false;

    if (weekday === 0 || weekday === 1) {
      cell.classList.add("ferme");
      isDisabled = true;
    }
    if (dateObj < today) {
      cell.classList.add("passee");
      isDisabled = true;
    }
    if (calSelectedDate && dateObj.getTime() === calSelectedDate.getTime()) {
      cell.classList.add("selected");
    }

    if (!isDisabled) {
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        calSelectedDate = dateObj;

        const input = $("resDateDisplay");
        if (input) {
          const dd = String(day).padStart(2, "0");
          const mm = String(calCurrentMonth + 1).padStart(2, "0");
          input.value = `${dd}/${mm}/${calCurrentYear}`;
        }

        renderCalendar();

        // fermeture auto du calendrier après choix
        const calendarCard = $("calendarCard");
        if (calendarCard) calendarCard.style.display = "none";
      });
    } else {
      cell.disabled = true;
    }

    daysContainer.appendChild(cell);
  }
}

// ===============================
//  FORMAT DATE & NUMÉRO
// ===============================
function parseDateFrToISO(dateStr) {
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
//  TICKET (APERÇU + PNG)
// ===============================
function buildTicketCanvas({ numero, nom, prenom, telephone, activite, dateStr }) {
  const canvas = document.createElement("canvas");
  const W = 900, H = 520;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // fond
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // bordure
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // bandeau
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(20, 20, W - 40, 90);

  // titre
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Calypço - Ticket de Réservation", 50, 75);

  // contenu
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
  return { canvas, dataURL };
}

// Téléchargement manuel + retour Promise quand fini
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
//  UI TICKET (injectée dynamiquement)
// ===============================
function ensureTicketUI() {
  const form = $("reservationForm");
  if (!form) return;

  if ($("ticketPreviewZone")) return; // déjà injecté

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

  // Bouton Télécharger
  zone.querySelector("#btnDownloadTicket").addEventListener("click", async () => {
    if (!hasPendingReservation || !pendingPayload || !pendingNumero || !pendingTicketDataURL) {
      showReservationMessage("Aucune réservation en attente.", "error");
      return;
    }

    // 1) Télécharger
    await downloadDataURL(pendingTicketDataURL, `ticket-${pendingNumero}.png`);

    // 2) ENREGISTRER SEULEMENT ICI
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

      showReservationMessage(
        `Réservation confirmée ! Numéro : ${pendingNumero}`,
        "success"
      );

      // reset + fermer popup
      hasPendingReservation = false;
      pendingPayload = null;
      pendingNumero = null;
      pendingTicketDataURL = null;

      const formEl = $("reservationForm");
      if (formEl) formEl.reset();
      calSelectedDate = null;
      renderCalendar();

      // ferme automatiquement après téléchargement
      closeReservationPopup(false);

    } catch (err) {
      console.error("[SITE] Erreur Appwrite (confirmation) :", err);
      showReservationMessage(
        "Téléchargement OK, mais erreur lors de la confirmation. Merci de réessayer.",
        "error"
      );
    }
  });

  // Bouton Modifier -> on revient au formulaire normal sans sauvegarder
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
//  SUBMIT = Générer ticket (PAS de save)
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

    // on met en attente, sans enregistrer
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
      numero,
      nom,
      prenom,
      telephone,
      activite,
      dateStr
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
    showReservationMessage(
      "Erreur lors de la génération du ticket. Merci de réessayer.",
      "error"
    );
  }
}

// ===============================
//  INIT GLOBAL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init Calypço");

  ensureTicketUI();

  const btnShowReservation = $("btnShowReservation");
  const btnCloseReservation = $("btnCloseReservation");
  const reservationBlock = $("reservation-block");
  const reservationCard = reservationBlock?.querySelector(".reservation-card");

  // Ouvrir popup
  if (btnShowReservation) {
    btnShowReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      openReservationPopup();
    });
  }

  // Fermer via croix
  if (btnCloseReservation) {
    btnCloseReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      closeReservationPopup(true);
    });
  }

  // Fermer si clic overlay
  if (reservationBlock && reservationCard) {
    reservationBlock.addEventListener("click", () => closeReservationPopup(true));
    reservationCard.addEventListener("click", (e) => {
      e.stopPropagation();
      // si clic dans popup mais hors calendrier -> ferme calendrier
      const calendarCard = $("calendarCard");
      if (calendarCard && !calendarCard.contains(e.target)) {
        calendarCard.style.display = "none";
      }
    });
  }

  // Fermer avec Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReservationPopup(true);
  });

  // ===== Calendrier =====
  const dateInput = $("resDateDisplay");
  const calendarCard = $("calendarCard");

  if (calendarCard) {
    calendarCard.style.display = "none"; // pas visible par défaut
    calendarCard.addEventListener("click", (e) => e.stopPropagation());
  }

  if (dateInput) {
    dateInput.addEventListener("click", (e) => {
      e.stopPropagation();
      if (calendarCard) {
        const visible = calendarCard.style.display === "block";
        calendarCard.style.display = visible ? "none" : "block";
        if (!visible) renderCalendar(); // sécurité
      }
    });
  }

  // Clic ailleurs dans popup ou page ferme le calendrier
  document.addEventListener("click", () => {
    if (calendarCard) calendarCard.style.display = "none";
  });

  // Submit
  const form = $("reservationForm");
  if (form) form.addEventListener("submit", submitReservation);

  initCalendar();
});
