// ================================
//  Config Appwrite
// ================================
console.log("[SITE] index.js chargé – réservation Calypço");

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "TON_PROJECT_ID";           // <-- remplace
const APPWRITE_DATABASE_ID = "TON_DATABASE_ID";         // <-- remplace
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation"; // id de ta collection

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
  // 2025-11-27T00:00:00.000Z (minuit UTC)
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

function buildCalendar(year, month) {
  const daysContainer = $("calendarDays");
  const titleEl = $("calMonthTitle");
  if (!daysContainer || !titleEl) return;

  daysContainer.innerHTML = "";

  const date = new Date(year, month, 1);
  const monthName = date.toLocaleString("fr-FR", { month: "long" });
  titleEl.textContent =
    monthName.charAt(0).toUpperCase() + monthName.slice(1) + " " + year;

  const firstDayIndex = (date.getDay() + 6) % 7; // 0 = lundi
  const lastDay = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // cases vides avant le 1er
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

    const dayOfWeek = (cellDate.getDay() + 6) % 7; // 0 lundi, 1 mardi, etc.

    // dates passées
    if (cellDate < today) {
      dayEl.classList.add("passee");
      dayEl.disabled = true;
    }

    // lundi (0) et mardi (1) fermés
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
function initReservationOverlay() {
  const overlay = $("reservation-block");
  const card = overlay ? overlay.querySelector(".reservation-card") : null;
  const btnOpen = $("btnShowReservation");
  const btnClose = $("btnCloseReservation");
  const dateInput = $("resDateDisplay");

  if (!overlay || !card || !btnOpen) {
    console.warn("[SITE] éléments overlay réservation manquants.");
    return;
  }

  function openReservation() {
    overlay.style.display = "flex";
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      card.classList.add("visible");
    });
  }

  function closeReservation() {
    overlay.classList.remove("visible");
    card.classList.remove("visible");

    const onTransitionEnd = () => {
      overlay.style.display = "none";
      overlay.removeEventListener("transitionend", onTransitionEnd);
    };
    overlay.addEventListener("transitionend", onTransitionEnd);
  }

  btnOpen.addEventListener("click", () => {
    openReservation();
  });

  if (btnClose) {
    btnClose.addEventListener("click", () => {
      closeReservation();
    });
  }

  // clic en dehors de la carte
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeReservation();
    }
  });

  // touche ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.style.display === "flex") {
      closeReservation();
    }
  });

  // ouvrir le calendrier au clic sur le champ date
  if (dateInput) {
    dateInput.addEventListener("click", () => {
      // rien à faire ici, le calendrier est déjà visible dans la popup
      // on peut éventuellement scroller jusqu’à lui
      const cal = $("calendarCard");
      if (cal) {
        cal.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }
}

// ================================
//  Envoi de la réservation
// ================================
function initReservationForm() {
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
      // on compte les réservations du même mois pour le numéro
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

      form.reset();
      selectedDate = null;
      buildCalendar(currentYear, currentMonth);
      $("resDateDisplay").value = "";
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

  initCalendar();
  initReservationOverlay();
  initReservationForm();
});
