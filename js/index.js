console.log("[SITE] index.js chargé – Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0 dans le HTML."
  );
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
function openReservationPopup() {
  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.add("visible");
  card.classList.add("visible");
  document.body.style.overflow = "hidden";

  clearReservationMessage();
}

function closeReservationPopup() {
  const overlay = $("reservation-block");
  const card = overlay?.querySelector(".reservation-card");
  if (!overlay || !card) return;

  overlay.classList.remove("visible");
  card.classList.remove("visible");
  document.body.style.overflow = "";

  // refermer aussi le calendrier si ouvert
  const calendarCard = $("calendarCard");
  if (calendarCard) calendarCard.style.display = "none";
}

// ===============================
//  CALENDRIER
// ===============================
let calCurrentMonth;         // 0 - 11
let calCurrentYear;          // année complète
let calSelectedDate = null;  // Date JS

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
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  titleEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;
  daysContainer.innerHTML = "";

  const firstDayOfMonth = new Date(calCurrentYear, calCurrentMonth, 1);
  const startingWeekDay = (firstDayOfMonth.getDay() + 6) % 7; // 0=lu .. 6=di
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // cases vides avant le 1er
  for (let i = 0; i < startingWeekDay; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.textContent = String(day);

    const dateObj = new Date(calCurrentYear, calCurrentMonth, day);
    dateObj.setHours(0, 0, 0, 0);

    const weekday = (dateObj.getDay() + 6) % 7; // 0=lu,1=ma,...6=di
    let isDisabled = false;

    // Lundi (0) et mardi (1) fermés
    if (weekday === 0 || weekday === 1) {
      cell.classList.add("ferme");
      isDisabled = true;
    }

    // Dates passées
    if (dateObj < today) {
      cell.classList.add("passee");
      isDisabled = true;
    }

    // Sélection actuelle
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
          const yyyy = String(calCurrentYear);
          input.value = `${dd}/${mm}/${yyyy}`;
        }

        renderCalendar();

        // on ferme le calendrier après sélection
        const card = $("calendarCard");
        if (card) card.style.display = "none";
      });
    } else {
      cell.disabled = true;
    }

    daysContainer.appendChild(cell);
  }
}

// ===============================
//  FORMAT DATE & NUMÉRO RÉSERVATION
// ===============================
function parseDateFrToISO(dateStr) {
  // "dd/mm/yyyy" -> ISO
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
  // format RES-mmyy-0001
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
      const lastPart = parts[2] || "";
      const idx = parseInt(lastPart, 10);
      if (!isNaN(idx) && idx > maxIndex) maxIndex = idx;
    }

    const nextIndex = maxIndex + 1;
    const indexStr = String(nextIndex).padStart(4, "0");
    return `${prefix}${indexStr}`;
  } catch (err) {
    console.error("[SITE] Erreur génération numéro réservation :", err);
    const random = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    return `${prefix}${random}`;
  }
}

// ===============================
//  TICKET PNG (CANVAS)
// ===============================
async function generateTicketPNG(data) {
  const {
    numero,
    nom,
    prenom,
    telephone,
    activite,
    dateStr
  } = data;

  const canvas = document.createElement("canvas");
  const W = 900, H = 520;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Fond
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Bordure
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Bandeau haut
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(20, 20, W - 40, 90);

  // Titre
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px Arial";
  ctx.fillText("Calypço - Ticket de Réservation", 50, 75);

  // Sous-titre
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 26px Arial";
  ctx.fillText(`N° ${numero}`, 50, 155);

  ctx.font = "20px Arial";
  ctx.fillText(`Nom / Prénom : ${nom} ${prenom}`, 50, 215);
  ctx.fillText(`Téléphone : ${telephone}`, 50, 255);
  ctx.fillText(`Activité : ${activite}`, 50, 295);
  ctx.fillText(`Date de réservation : ${dateStr}`, 50, 335);

  // Message bas
  ctx.font = "italic 16px Arial";
  ctx.fillStyle = "#475569";
  ctx.fillText("Merci de présenter ce ticket à l’accueil.", 50, 410);

  // Export PNG + téléchargement
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-${numero}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

// ===============================
//  ENVOI RESERVATION
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
    showReservationMessage(
      "Merci de remplir tous les champs obligatoires.",
      "error"
    );
    return;
  }

  const dateIso = parseDateFrToISO(dateStr);
  if (!dateIso) {
    showReservationMessage("La date de réservation est invalide.", "error");
    return;
  }

  try {
    const numero = await generateReservationNumber(dateIso);

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      Appwrite.ID.unique(),
      {
        nom,
        prenom,
        telephone,
        "e-mail": email || null,
        date_reservation: dateIso,
        activite,
        numero_reservation: numero,
        actif: true
      }
    );

    showReservationMessage(
      `Votre réservation a été enregistrée. Ticket en cours de téléchargement...`,
      "success"
    );

    // Générer puis télécharger le ticket PNG
    await generateTicketPNG({
      numero,
      nom,
      prenom,
      telephone,
      activite,
      dateStr
    });

    // Fermer automatiquement APRÈS le téléchargement
    closeReservationPopup();

    // Reset formulaire + calendrier
    const form = $("reservationForm");
    if (form) form.reset();
    calSelectedDate = null;
    renderCalendar();

  } catch (err) {
    console.error("[SITE] Erreur enregistrement réservation :", err);
    showReservationMessage(
      "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.",
      "error"
    );
  }
}

// ===============================
//  INIT GLOBAL
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init Calypço");

  const btnShowReservation = $("btnShowReservation");
  const btnCloseReservation = $("btnCloseReservation");
  const reservationBlock = $("reservation-block");
  const reservationCard = reservationBlock?.querySelector(".reservation-card");

  // La popup reste cachée au départ (CSS).
  // Ouvrir avec bouton 🏆 Réservation
  if (btnShowReservation) {
    btnShowReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      openReservationPopup();
    });
  }

  // Fermer avec croix ×
  if (btnCloseReservation) {
    btnCloseReservation.addEventListener("click", (e) => {
      e.stopPropagation();
      closeReservationPopup();
    });
  }

  // Fermer si clic sur fond overlay
  if (reservationBlock && reservationCard) {
    reservationBlock.addEventListener("click", () => closeReservationPopup());
    reservationCard.addEventListener("click", (e) => e.stopPropagation());
  }

  // Fermer avec Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReservationPopup();
  });

  // ===== Calendrier toggle =====
  const dateInput = $("resDateDisplay");
  const calendarCard = $("calendarCard");

  if (calendarCard) {
    calendarCard.style.display = "none";
    calendarCard.addEventListener("click", (e) => e.stopPropagation());
  }

  if (dateInput) {
    dateInput.addEventListener("click", (e) => {
      e.stopPropagation();
      if (calendarCard) {
        const visible = calendarCard.style.display === "block";
        calendarCard.style.display = visible ? "none" : "block";
      }
    });
  }

  // Fermer le calendrier quand on clique ailleurs
  document.addEventListener("click", () => {
    if (calendarCard) calendarCard.style.display = "none";
  });

  // Submit formulaire
  const form = $("reservationForm");
  if (form) form.addEventListener("submit", submitReservation);

  // Init calendrier
  initCalendar();
});
