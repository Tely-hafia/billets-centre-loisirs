console.log("[SITE] index.js chargé – réservation Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0."
  );
}

const siteClient = new Appwrite.Client();
siteClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const siteDB = new Appwrite.Databases(siteClient);

function $(id) {
  return document.getElementById(id);
}

// ===============================
//  RESERVATION UI
// ===============================

let calCurrentYear;
let calCurrentMonth; // 0-11
let selectedDate = null; // objet Date

function formatDateDisplay(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Pour Appwrite (date_reservation est datetime)
function toISODateAtNoon(d) {
  const copy = new Date(d.getTime());
  copy.setHours(12, 0, 0, 0);
  return copy.toISOString();
}

// Génération du numéro de réservation RES-mmyy-0001
function buildReservationNumber(dateObj, indexNumber) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yy = String(dateObj.getFullYear()).slice(-2);
  const seq = String(indexNumber).padStart(4, "0");
  return `RES-${mm}${yy}-${seq}`;
}

// ===============================
//  CALENDRIER
// ===============================

function renderCalendar() {
  const daysContainer = $("calendarDays");
  const titleEl = $("calMonthTitle");
  if (!daysContainer || !titleEl) return;

  const monthNames = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];

  const displayDate = new Date(calCurrentYear, calCurrentMonth, 1);
  titleEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  daysContainer.innerHTML = "";

  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Lundi = 0
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  const today = new Date();
  today.setHours(0,0,0,0);

  // Cases vides avant le 1er du mois
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(calCurrentYear, calCurrentMonth, day);
    d.setHours(0,0,0,0);
    const weekday = (d.getDay() + 6) % 7; // 0 lundi

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    btn.textContent = String(day);

    // Dates passées
    if (d < today) {
      btn.classList.add("passee");
    }

    // Lundi (0) et mardi (1) = fermé
    if (weekday === 0 || weekday === 1) {
      btn.classList.add("ferme");
    }

    // Date sélectionnée actuellement
    if (
      selectedDate &&
      d.getFullYear() === selectedDate.getFullYear() &&
      d.getMonth() === selectedDate.getMonth() &&
      d.getDate() === selectedDate.getDate()
    ) {
      btn.classList.add("selected");
    }

    // Click
    btn.addEventListener("click", () => {
      if (btn.classList.contains("passee") || btn.classList.contains("ferme")) {
        return;
      }
      selectedDate = d;
      const display = $("resDateDisplay");
      if (display) {
        display.value = formatDateDisplay(d);
      }
      renderCalendar();
      // On ferme le calendrier après sélection
      const card = $("calendarCard");
      if (card) {
        card.style.display = "block"; // il reste visible mais c'est ton choix
      }
    });

    daysContainer.appendChild(btn);
  }
}

function initCalendar() {
  const now = new Date();
  calCurrentYear = now.getFullYear();
  calCurrentMonth = now.getMonth();
  selectedDate = null;

  const btnPrev = $("calPrev");
  const btnNext = $("calNext");

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

  renderCalendar();
}

// Affichage du calendrier quand on clique sur le champ date
function initDateFieldBehaviour() {
  const dateInput = $("resDateDisplay");
  const calendarCard = $("calendarCard");
  if (!dateInput || !calendarCard) return;

  // Au clic sur le champ -> on assure que le calendrier est visible
  dateInput.addEventListener("click", (e) => {
    e.stopPropagation();
    calendarCard.style.display = "block";
  });

  // Clics à l'intérieur du calendrier -> ne pas fermer
  calendarCard.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Clic en dehors -> on ferme le calendrier
  document.addEventListener("click", () => {
    calendarCard.style.display = "block"; // si tu veux vraiment fermer : "none"
  });
}

// ===============================
//  RESERVATION : ENVOI APPWRITE
// ===============================

async function submitReservation(event) {
  event.preventDefault();

  const nom = $("resNom")?.value.trim();
  const prenom = $("resPrenom")?.value.trim();
  const telephone = $("resTelephone")?.value.trim();
  const email = $("resEmail")?.value.trim();
  const activite = $("resActivite")?.value;
  const msg = $("reservationMessage");

  if (!nom || !prenom || !telephone || !activite || !selectedDate) {
    if (msg) {
      msg.style.display = "block";
      msg.className = "message message-error";
      msg.textContent =
        "Merci de remplir tous les champs obligatoires et de choisir une date.";
    }
    return;
  }

  try {
    // Compter les réservations de ce mois pour générer le numéro
    const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);

    const resCount = await siteDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.greaterThanEqual("date_reservation", monthStart.toISOString()),
        Appwrite.Query.lessThan("date_reservation", monthEnd.toISOString()),
        Appwrite.Query.limit(10000)
      ]
    );

    const indexNumber = (resCount.total || resCount.documents.length || 0) + 1;
    const numeroReservation = buildReservationNumber(selectedDate, indexNumber);

    const doc = {
      nom,
      prenom,
      telephone,
      "e-mail": email || null,
      date_reservation: toISODateAtNoon(selectedDate),
      activite,
      numero_reservation: numeroReservation,
      actif: true
    };

    await siteDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      Appwrite.ID.unique(),
      doc
    );

    if (msg) {
      msg.style.display = "block";
      msg.className = "message message-success";
      msg.textContent =
        `Merci ${prenom}, votre réservation est enregistrée ` +
        `(N° ${numeroReservation}). Nous vous contacterons pour la confirmation.`;
    }

    // Reset du formulaire (on garde le calendrier au mois courant)
    $("reservationForm").reset();
    selectedDate = null;
    renderCalendar();

  } catch (err) {
    console.error("[SITE] Erreur enregistrement réservation :", err);
    if (msg) {
      msg.style.display = "block";
      msg.className = "message message-error";
      msg.textContent =
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.";
    }
  }
}

// ===============================
//  INIT GLOBALE
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  // Bouton du hero pour afficher la section réservation
  const btnShowReservation = $("btnShowReservation");
  const reservationBlock = $("reservation-block");

  if (btnShowReservation && reservationBlock) {
    btnShowReservation.addEventListener("click", () => {
      reservationBlock.style.display = "block";
      reservationBlock.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  initCalendar();
  initDateFieldBehaviour();

  const form = $("reservationForm");
  if (form) {
    form.addEventListener("submit", submitReservation);
  }
});
