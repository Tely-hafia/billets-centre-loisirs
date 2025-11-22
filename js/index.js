// js/index.js
console.log("[SITE] index.js chargé – réservation Calypço");

// =========================
// 1. CONFIG APPWRITE
// =========================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@13.0.0\"></script>."
  );
}

const client = new Appwrite.Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);

// =========================
// Helpers
// =========================

function $(id) {
  return document.getElementById(id);
}

function formatDateDisplay(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatDateIso(date) {
  // 00:00:00 du jour concerné
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return d.toISOString();
}

// Numéro de réservation : RES-mmyy-XXXX
function genererNumeroReservation(date, compteurLocal = 1) {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const annee = String(date.getFullYear()).toString().slice(-2);
  const numero = String(compteurLocal).padStart(4, "0"); // 0001
  return `RES-${mois}${annee}-${numero}`;
}

// =========================
// 2. POPUP RÉSERVATION FLOTTANTE
// =========================

let reservationOverlay = null;
let reservationCard = null;

function openReservationPopup() {
  if (!reservationOverlay) return;

  reservationOverlay.classList.add("open");
  reservationOverlay.style.display = "flex";

  // petit rafraîchissement pour déclencher l’animation
  requestAnimationFrame(() => {
    reservationOverlay.classList.add("visible");
    reservationCard.classList.add("visible");
  });

  // reset message
  const msg = $("reservationMessage");
  if (msg) {
    msg.style.display = "none";
    msg.textContent = "";
    msg.className = "message";
  }
}

function closeReservationPopup() {
  if (!reservationOverlay) return;
  reservationOverlay.classList.remove("visible");
  reservationCard.classList.remove("visible");

  // attendre la fin de la transition (300ms)
  setTimeout(() => {
    reservationOverlay.classList.remove("open");
    reservationOverlay.style.display = "none";
  }, 300);
}

// =========================
// 3. CALENDRIER
// =========================

let calCurrentYear = null;
let calCurrentMonth = null;
let calSelectedDate = null;

const calMonthTitle = $("calMonthTitle");
const calDaysContainer = $("calendarDays");

function initCalendar() {
  const today = new Date();
  calCurrentYear = today.getFullYear();
  calCurrentMonth = today.getMonth();
  calSelectedDate = null;
  renderCalendar();
}

function renderCalendar() {
  if (!calDaysContainer || !calMonthTitle) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Titre mois
  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  calMonthTitle.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  // Nettoyer les jours
  calDaysContainer.innerHTML = "";

  const firstDayOfMonth = new Date(calCurrentYear, calCurrentMonth, 1);
  const startWeekday = (firstDayOfMonth.getDay() + 6) % 7; // 0 = lundi

  const nbDaysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  // Ajouter des cases vides pour aligner le début de la semaine
  for (let i = 0; i < startWeekday; i++) {
    const emptyDiv = document.createElement("div");
    calDaysContainer.appendChild(emptyDiv);
  }

  // Créer chaque jour
  for (let day = 1; day <= nbDaysInMonth; day++) {
    const date = new Date(calCurrentYear, calCurrentMonth, day);
    date.setHours(0, 0, 0, 0);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = day.toString();
    btn.className = "calendar-day";

    const weekday = (date.getDay() + 6) % 7; // 0 = lundi
    const isPast = date < today;
    const isLundi = weekday === 0;
    const isMardi = weekday === 1;

    if (isPast) {
      btn.classList.add("passee");
      btn.disabled = true;
    } else if (isLundi || isMardi) {
      btn.classList.add("ferme");
      btn.disabled = true;
    } else {
      // date disponible
      btn.addEventListener("click", () => {
        calSelectedDate = date;
        // mise à jour style
        document.querySelectorAll(".calendar-day").forEach(d => d.classList.remove("selected"));
        btn.classList.add("selected");

        const input = $("resDateDisplay");
        if (input) {
          input.value = formatDateDisplay(date);
        }
      });
    }

    // si déjà sélectionnée dans ce mois
    if (
      calSelectedDate &&
      calSelectedDate.getFullYear() === date.getFullYear() &&
      calSelectedDate.getMonth() === date.getMonth() &&
      calSelectedDate.getDate() === date.getDate()
    ) {
      btn.classList.add("selected");
    }

    calDaysContainer.appendChild(btn);
  }
}

// =========================
// 4. ENREGISTREMENT RÉSERVATION
// =========================

async function enregistrerReservation(e) {
  e.preventDefault();

  const nom = $("resNom")?.value.trim();
  const prenom = $("resPrenom")?.value.trim();
  const telephone = $("resTelephone")?.value.trim();
  const email = $("resEmail")?.value.trim() || null;
  const activite = $("resActivite")?.value;

  const msg = $("reservationMessage");

  if (!nom || !prenom || !telephone || !activite || !calSelectedDate) {
    if (msg) {
      msg.textContent = "Merci de remplir tous les champs obligatoires et de choisir une date.";
      msg.style.display = "block";
      msg.className = "message message-error";
    }
    return;
  }

  const dateReservationIso = formatDateIso(calSelectedDate);
  const numeroReservation = genererNumeroReservation(calSelectedDate, Date.now() % 10000);

  const payload = {
    nom,
    prenom,
    telephone,
    "e-mail": email,
    date_reservation: dateReservationIso,
    activite,
    numero_reservation: numeroReservation,
    actif: true
  };

  console.log("[SITE] Envoi réservation :", payload);

  if (msg) {
    msg.style.display = "block";
    msg.className = "message message-info";
    msg.textContent = "Enregistrement de votre réservation...";
  }

  try {
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      Appwrite.ID.unique(),
      payload
    );

    if (msg) {
      msg.className = "message message-success";
      msg.textContent =
        `Votre réservation a bien été enregistrée. Numéro : ${numeroReservation}.`;
    }

    // reset basique du formulaire (on garde la date sur le calendrier)
    $("reservationForm").reset();
    const dateInput = $("resDateDisplay");
    if (dateInput) dateInput.value = formatDateDisplay(calSelectedDate);
  } catch (err) {
    console.error("[SITE] Erreur enregistrement réservation :", err);
    if (msg) {
      msg.className = "message message-error";
      msg.textContent =
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.";
    }
  }
}

// =========================
// 5. INIT DOM
// =========================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  // préparer la popup flottante
  const section = $("reservation-block");
  if (section) {
    // on transforme la section en overlay
    reservationOverlay = section;
    reservationOverlay.classList.add("reservation-overlay");
    reservationOverlay.style.display = "none";

    reservationCard = reservationOverlay.querySelector(".card");
    if (reservationCard) {
      reservationCard.classList.add("reservation-card");
      // bouton de fermeture (croix)
      let closeBtn = reservationCard.querySelector(".reservation-close");
      if (!closeBtn) {
        closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "reservation-close";
        closeBtn.innerHTML = "&times;";
        reservationCard.insertBefore(closeBtn, reservationCard.firstChild);
        closeBtn.addEventListener("click", closeReservationPopup);
      }
    }

    // fermer si on clique en dehors de la carte
    reservationOverlay.addEventListener("click", (e) => {
      if (e.target === reservationOverlay) {
        closeReservationPopup();
      }
    });
  }

  const btnShowReservation = $("btnShowReservation");
  if (btnShowReservation) {
    btnShowReservation.addEventListener("click", () => {
      openReservationPopup();
      initCalendar();
    });
  }

  // navigation calendrier
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

  // on n’initialise le calendrier qu’à l’ouverture pour éviter l’effet “figé”
  // initCalendar(); // sera appelé dans openReservationPopup()

  const form = $("reservationForm");
  if (form) {
    form.addEventListener("submit", enregistrerReservation);
  }
});
