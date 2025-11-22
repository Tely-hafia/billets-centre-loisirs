console.log("[SITE] index.js chargé – réservation Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================

const INDEX_APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const INDEX_APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const INDEX_APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

// 👉 mets ici l'ID de ta collection "reservation"
const INDEX_RESERVATION_COLLECTION_ID = "reservation"; // ex : "6919xxxxxxx" si c'est un ID Appwrite

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0."
  );
}

const siteClient = new Appwrite.Client();
siteClient.setEndpoint(INDEX_APPWRITE_ENDPOINT).setProject(INDEX_APPWRITE_PROJECT_ID);
const siteDB = new Appwrite.Databases(siteClient);

// ===============================
//  HELPERS
// ===============================

function $(id) {
  return document.getElementById(id);
}

function showReservationMessage(text, type) {
  const msg = $("reservation-message");
  if (!msg) return;
  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message reservation-status";
  if (type === "success") msg.classList.add("message-success");
  else if (type === "error") msg.classList.add("message-error");
  else msg.classList.add("message-info");
}

// Format dd/mm/yyyy
function formatDateFR(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

// Retourne un string ISO 8601 (pour colonne datetime Appwrite)
function dateToISO(date) {
  // à midi pour éviter les décalages de fuseau
  const copy = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0
  );
  return copy.toISOString();
}

// Génère un numéro de réservation du type RES-mmyy-0001
async function genererNumeroReservation(dateReservation) {
  const month = String(dateReservation.getMonth() + 1).padStart(2, "0");
  const year2 = String(dateReservation.getFullYear()).slice(-2);

  const prefix = `RES-${month}${year2}-`;

  // On compte combien de réservations existent déjà pour ce mois/année
  // Astuce simple : on récupère les docs dont numero_reservation commence par RES-mmyy-
  // (nécessite un index "startsWith" si tu veux optimiser, sinon on limite à 1000)
  try {
    const res = await siteDB.listDocuments(
      INDEX_APPWRITE_DATABASE_ID,
      INDEX_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.startsWith("numero_reservation", prefix),
        Appwrite.Query.limit(1000)
      ]
    );
    const count = res.documents.length;
    const n = String(count + 1).padStart(4, "0");
    return `${prefix}${n}`;
  } catch (err) {
    console.warn(
      "[SITE] Impossible de compter les réservations existantes, on met 0001 par défaut :",
      err
    );
    return `${prefix}0001`;
  }
}

// ===============================
//  CALENDRIER
// ===============================

let calCurrentMonth; // 0-11
let calCurrentYear; // année pleine
let calSelectedDate = null; // Date

function initCalendar() {
  const today = new Date();
  calCurrentMonth = today.getMonth();
  calCurrentYear = today.getFullYear();
  renderCalendar();
}

function renderCalendar() {
  const grid = $("calendar-grid");
  const label = $("cal-month-label");
  if (!grid || !label) return;

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];

  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1);
  const lastDay = new Date(calCurrentYear, calCurrentMonth + 1, 0);
  const daysInMonth = lastDay.getDate();

  label.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  // Nettoyage
  grid.innerHTML = "";

  // On veut un calendrier qui commence lundi -> on adapte le getDay() (0 = dimanche)
  const jsWeekdayFirst = firstDay.getDay(); // 0-6
  const mondayIndex = (jsWeekdayFirst + 6) % 7; // 0-6 avec 0 = lundi

  // Cases vides avant le 1er
  for (let i = 0; i < mondayIndex; i++) {
    const div = document.createElement("div");
    div.className = "calendar-day empty";
    grid.appendChild(div);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(calCurrentYear, calCurrentMonth, day);
    date.setHours(0, 0, 0, 0);

    const div = document.createElement("div");
    div.className = "calendar-day";
    div.textContent = day.toString();
    div.dataset.dateIso = dateToISO(date);

    // Détermination du jour de la semaine en version "lundi=0"
    const jsWeekDay = date.getDay(); // 0 = dimanche
    const mondayBase = (jsWeekDay + 6) % 7; // 0 = lundi, 1 = mardi, etc.

    const isPast = date < today;
    const isClosed = mondayBase === 0 || mondayBase === 1; // lundi ou mardi

    if (isPast) div.classList.add("past");
    if (isClosed) div.classList.add("closed");

    const isSelected =
      calSelectedDate &&
      date.getTime() ===
        new Date(
          calSelectedDate.getFullYear(),
          calSelectedDate.getMonth(),
          calSelectedDate.getDate()
        ).getTime();

    if (isSelected) div.classList.add("selected");

    // Clic sur un jour
    div.addEventListener("click", () => {
      if (isPast || isClosed) return;

      calSelectedDate = date;
      const inputAffiche = $("res-date-affiche");
      const inputIso = $("res-date-iso");

      if (inputAffiche && inputIso) {
        inputAffiche.value = formatDateFR(date);
        inputIso.value = dateToISO(date);
      }

      // re-render pour mettre la bonne classe selected
      renderCalendar();
    });

    grid.appendChild(div);
  }
}

// ===============================
//  RÉSERVATION : SUBMIT
// ===============================

async function envoyerReservation(e) {
  e.preventDefault();

  const nom = $("res-nom")?.value.trim();
  const prenom = $("res-prenom")?.value.trim();
  const telephone = $("res-telephone")?.value.trim();
  const email = $("res-email")?.value.trim();
  const activite = $("res-activite")?.value;
  const dateIso = $("res-date-iso")?.value;

  if (!nom || !prenom || !telephone || !activite || !dateIso) {
    showReservationMessage(
      "Merci de remplir tous les champs obligatoires.",
      "error"
    );
    return;
  }

  let dateObj;
  try {
    dateObj = new Date(dateIso);
  } catch {
    showReservationMessage(
      "La date de réservation est invalide.",
      "error"
    );
    return;
  }

  try {
    const numeroReservation = await genererNumeroReservation(dateObj);

    const payload = {
      nom,
      prenom,
      telephone,
      "e-mail": email || null,
      date_reservation: dateIso,
      activite,
      numero_reservation: numeroReservation,
      actif: true
    };

    await siteDB.createDocument(
      INDEX_APPWRITE_DATABASE_ID,
      INDEX_RESERVATION_COLLECTION_ID,
      Appwrite.ID.unique(),
      payload
    );

    showReservationMessage(
      `Votre réservation a été enregistrée avec succès. Numéro : ${numeroReservation}`,
      "success"
    );

    // reset formulaire (on garde le calendrier sur la date choisie)
    $("reservation-form").reset();
    const aff = $("res-date-affiche");
    const iso = $("res-date-iso");
    if (aff) aff.value = "";
    if (iso) iso.value = "";
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
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  const btnOpenReservation = $("btnOpenReservation");
  const reservationSection = $("reservation-section");

  if (btnOpenReservation && reservationSection) {
    btnOpenReservation.addEventListener("click", (e) => {
      e.preventDefault();
      reservationSection.style.display = "block";
      reservationSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const dateInput = $("res-date-affiche");
  const dateCard = $("reservation-date-picker-card");

  if (dateInput && dateCard) {
    dateInput.addEventListener("click", () => {
      if (dateCard.style.display === "none" || !dateCard.style.display) {
        dateCard.style.display = "block";
      } else {
        // si tu veux le refermer quand on re-clique sur l'input :
        // dateCard.style.display = "none";
      }
    });
  }

  // Navigation mois calendrier
  const btnPrev = $("cal-prev-month");
  const btnNext = $("cal-next-month");

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      calCurrentMonth--;
      if (calCurrentMonth < 0) {
        calCurrentMonth = 11;
        calCurrentYear--;
      }
      renderCalendar();
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      calCurrentMonth++;
      if (calCurrentMonth > 11) {
        calCurrentMonth = 0;
        calCurrentYear++;
      }
      renderCalendar();
    });
  }

  // Soumission réservation
  const form = $("reservation-form");
  if (form) {
    form.addEventListener("submit", envoyerReservation);
  }

  // Démarrer le calendrier
  initCalendar();
});
