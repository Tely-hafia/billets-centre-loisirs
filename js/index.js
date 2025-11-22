// ================================
//  Config Appwrite
// ================================
console.log("[SITE] index.js chargé – réservation Calypço");

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "TON_PROJECT_ID";              // <-- à remplacer
const APPWRITE_DATABASE_ID = "TON_DATABASE_ID";            // <-- à remplacer
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";  // id de la collection

if (typeof Appwrite === "undefined") {
  console.error("[SITE] Appwrite SDK non chargé.");
}

const client = new Appwrite.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);

// ================================
//  Utilitaires
// ================================
function $(id) {
  return document.getElementById(id);
}

function formatDateForDisplay(dateObj) {
  const d = String(dateObj.getDate()).padStart(2, "0");
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatDateForISO(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T00:00:00.000Z`;
}

function generateReservationNumber(dateObj, index) {
  // RES-mmyy-0001
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yy = String(dateObj.getFullYear()).slice(-2);
  const seq = String(index).padStart(4, "0");
  return `RES-${mm}${yy}-${seq}`;
}

// ================================
//  Calendrier
// ================================
let currentMonth;
let currentYear;
let selectedDate = null;
let calendarInitialized = false;

function buildCalendar(year, month) {
  const daysContainer = $("calendarDays");
  const titleEl = $("calMonthTitle");
  if (!daysContainer || !titleEl) return;

  daysContainer.innerHTML = "";

  const date = new Date(year, month, 1);
  const monthName = date.toLocaleString("fr-FR", { month: "long" });
  titleEl.textContent =
    monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + year;

  const firstDayIndex = (date.getDay() + 6) % 7; // lundi=0
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < firstDayIndex; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }

  for (let d = 1; d <= lastDay; d++) {
    const cellDate = new Date(year, month, d);
    cellDate.setHours(0, 0, 0, 0);

    const dayEl = document.createElement("button");
    dayEl.type = "button";
    dayEl.className = "calendar-day";
    dayEl.textContent = d.toString();

    const dayOfWeek = (cellDate.getDay() + 6) % 7; // 0 lundi, 1 mardi...

    // dates passées
    if (cellDate < today) {
      dayEl.classList.add("passee");
      dayEl.disabled = true;
    }

    // lundi / mardi fermés
    if (dayOfWeek === 0 || dayOfWeek === 1) {
      dayEl.classList.add("ferme");
      dayEl.disabled = true;
    }

    if (
      selectedDate &&
      cellDate.getTime() === selectedDate.getTime()
    ) {
      dayEl.classList.add("selected");
    }

    if (!dayEl.disabled) {
      dayEl.addEventListener("click", () => {
        selectedDate = cellDate;
        const input = $("resDateDisplay");
        if (input) {
          input.value = formatDateForDisplay(selectedDate);
        }
        buildCalendar(currentYear, currentMonth);
      });
    }

    daysContainer.appendChild(dayEl);
  }
}

function initCalendar() {
  if (calendarInitialized) return;
  calendarInitialized = true;

  const now = new Date();
  currentMonth = now.getMonth();
  currentYear = now.getFullYear();

  const prevBtn = $("calPrev");
  const nextBtn = $("calNext");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      buildCalendar(currentYear, currentMonth);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      buildCalendar(currentYear, currentMonth);
    });
  }

  buildCalendar(currentYear, currentMonth);
}

// ================================
//  Popup réservation
// ================================
function setupReservationOverlay() {
  const overlay = $("reservation-block");
  const card = overlay ? overlay.querySelector(".reservation-card") : null;
  const btnOpen = $("btnShowReservation");
  const btnClose = $("btnCloseReservation");
  const dateInput = $("resDateDisplay");
  const calendarCard = $("calendarCard");

  if (!overlay || !card || !btnOpen) {
    console.warn("[SITE] éléments overlay réservation manquants.");
    return;
  }

  // sécurité : s'assurer que c'est caché au chargement
  overlay.style.display = "none";
  overlay.classList.remove("visible");
  card.classList.remove("visible");

  function openOverlay() {
    overlay.style.display = "flex";
    // léger délai pour déclencher la transition
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      card.classList.add("visible");
    });
  }

  function closeOverlay() {
    overlay.classList.remove("visible");
    card.classList.remove("visible");

    const onEnd = () => {
      overlay.style.display = "none";
      overlay.removeEventListener("transitionend", onEnd);
      // on remet le calendrier caché
      if (calendarCard) {
        calendarCard.classList.remove("visible");
      }
    };
    overlay.addEventListener("transitionend", onEnd);
  }

  btnOpen.addEventListener("click", () => {
    openOverlay();
  });

  if (btnClose) {
    btnClose.addEventListener("click", () => {
      closeOverlay();
    });
  }

  // clic hors de la carte pour fermer
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeOverlay();
    }
  });

  // touche ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display === "flex") {
      closeOverlay();
    }
  });

  // ouverture du calendrier au clic sur le champ date
  if (dateInput) {
    dateInput.addEventListener("click", () => {
      if (calendarCard) {
        calendarCard.classList.add("visible");
      }
      initCalendar();
      // recentrer visuellement le calendrier
      if (calendarCard) {
        calendarCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  // on expose la fonction de fermeture pour la réutiliser après succès
  window.__closeReservationOverlay = closeOverlay;
}

// ================================
//  Formulaire de réservation
// ================================
function setupReservationForm() {
  const form = $("reservationForm");
  const msg = $("reservationMessage");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!msg) return;

    const nom = $("resNom")?.value.trim();
    const prenom = $("resPrenom")?.value.trim();
    const telephone = $("resTelephone")?.value.trim();
    const email = $("resEmail")?.value.trim() || null;
    const activite = $("resActivite")?.value;
    const dateStr = $("resDateDisplay")?.value;

    if (!nom || !prenom || !telephone || !activite || !dateStr || !selectedDate) {
      msg.textContent = "Merci de remplir tous les champs obligatoires.";
      msg.className = "message message-error";
      msg.style.display = "block";
      return;
    }

    msg.textContent = "Enregistrement en cours...";
    msg.className = "message message-info";
    msg.style.display = "block";

    try {
      // compter les réservations du même mois
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

      const list = await db.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_RESERVATION_COLLECTION_ID,
        [
          Appwrite.Query.greaterEqual("date_reservation", formatDateForISO(monthStart)),
          Appwrite.Query.lessEqual("date_reservation", formatDateForISO(monthEnd)),
          Appwrite.Query.limit(1000)
        ]
      );

      const nextIndex = (list.total || list.documents?.length || 0) + 1;
      const numeroReservation = generateReservationNumber(selectedDate, nextIndex);

      await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_RESERVATION_COLLECTION_ID,
        Appwrite.ID.unique(),
        {
          nom,
          prenom,
          telephone,
          "e-mail": email,
          date_reservation: formatDateForISO(selectedDate),
          activite,
          numero_reservation: numeroReservation,
          actif: true
        }
      );

      msg.textContent = `Réservation enregistrée. Numéro : ${numeroReservation}`;
      msg.className = "message message-success";
      msg.style.display = "block";

      // reset formulaire & calendrier
      form.reset();
      selectedDate = null;
      if (typeof currentYear !== "undefined" && typeof currentMonth !== "undefined") {
        buildCalendar(currentYear, currentMonth);
      }
      const dateInput = $("resDateDisplay");
      if (dateInput) dateInput.value = "";

      // fermer la popup après une petite seconde pour laisser lire le message
      setTimeout(() => {
        if (window.__closeReservationOverlay) {
          window.__closeReservationOverlay();
        }
      }, 1000);
    } catch (err) {
      console.error("[SITE] Erreur enregistrement réservation :", err);
      msg.textContent =
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.";
      msg.className = "message message-error";
      msg.style.display = "block";
    }
  });
}

// ================================
//  DOMContentLoaded
// ================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");
  setupReservationOverlay();
  setupReservationForm();
});
