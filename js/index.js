// js/index.js
console.log("[SITE] index.js chargé – réservation Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "VOTRE_PROJECT_ID";     // <-- garde les valeurs que tu utilisais déjà
const APPWRITE_DATABASE_ID = "VOTRE_DATABASE_ID";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation"; // nom/ID de la collection

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] SDK Appwrite non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@13.0.0\"></script>"
  );
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);

// ===============================
//  HELPERS
// ===============================

function $(id) {
  return document.getElementById(id);
}

// format dd/mm/yyyy
function formatDateFR(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear().toString();
  return `${d}/${m}/${y}`;
}

// Renvoie {iso, month, year}
function normaliseDate(date) {
  return {
    iso: date.toISOString(),
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
}

// Génère un numéro de réservation du type RES-mmyy-0001
async function genererNumeroReservation(dateObj) {
  const { month, year } = normaliseDate(dateObj);
  const mm = month.toString().padStart(2, "0");
  const yy = year.toString().slice(-2);

  const startMonth = new Date(year, month - 1, 1);
  const endMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const startIso = startMonth.toISOString();
  const endIso = endMonth.toISOString();

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.between("date_reservation", startIso, endIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const count = (res.total ?? res.documents?.length ?? 0) + 1;
    const seq = count.toString().padStart(4, "0");
    return `RES-${mm}${yy}-${seq}`;
  } catch (err) {
    console.error("[SITE] Erreur génération numéro réservation, fallback 0001 :", err);
    return `RES-${mm}${yy}-0001`;
  }
}

// ===============================
//  CALENDRIER
// ===============================

let currentMonth = null;  // 0-11
let currentYear = null;   // année complète
let selectedDate = null;  // Date JS

function initCalendar() {
  const today = new Date();
  currentMonth = today.getMonth();
  currentYear = today.getFullYear();
  renderCalendar(currentYear, currentMonth);
}

function renderCalendar(year, month) {
  const daysContainer = $("calendarDays");
  const titleEl = $("calMonthTitle");
  if (!daysContainer || !titleEl) return;

  daysContainer.innerHTML = "";

  const moisNoms = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];
  titleEl.textContent = `${moisNoms[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // 0=lu,6=di
  const totalDays = lastDay.getDate();

  const today = new Date();
  today.setHours(0,0,0,0);

  // cases vides avant le 1er
  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    daysContainer.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const weekday = (date.getDay() + 6) % 7; // 0=lu ... 6=di
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    cell.textContent = day.toString();

    const isPast = date < today;
    const isMonday = weekday === 0;
    const isTuesday = weekday === 1;

    if (isPast) {
      cell.classList.add("passee");
      cell.disabled = true;
    } else if (isMonday || isTuesday) {
      cell.classList.add("ferme");
      cell.disabled = true;
    }

    if (
      selectedDate &&
      date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    ) {
      cell.classList.add("selected");
    }

    cell.addEventListener("click", () => {
      if (cell.classList.contains("passee") || cell.classList.contains("ferme")) {
        return;
      }
      selectedDate = date;
      $("resDateDisplay").value = formatDateFR(selectedDate);

      // mettre à jour la sélection visuelle
      document.querySelectorAll(".calendar-day.selected").forEach((el) =>
        el.classList.remove("selected")
      );
      cell.classList.add("selected");
    });

    daysContainer.appendChild(cell);
  }
}

// ===============================
//  FORMULAIRE & OVERLAY
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  const overlay = $("reservationOverlay");
  const btnShowReservation = $("btnShowReservation");
  const btnCloseReservation = $("btnCloseReservation");
  const form = $("reservationForm");
  const msgEl = $("reservationMessage");
  const btnPrev = $("calPrev");
  const btnNext = $("calNext");

  // ouverture popup
  if (btnShowReservation && overlay) {
    btnShowReservation.addEventListener("click", () => {
      overlay.classList.add("show");
      initCalendar();
    });
  }

  // fermeture popup
  if (btnCloseReservation && overlay) {
    btnCloseReservation.addEventListener("click", () => {
      overlay.classList.remove("show");
    });
  }

  // fermer en cliquant sur le fond sombre
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.remove("show");
      }
    });
  }

  // navigation calendrier
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentMonth === null) return;
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar(currentYear, currentMonth);
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (currentMonth === null) return;
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar(currentYear, currentMonth);
    });
  }

  // clic sur le champ de date => focus visuel sur le calendrier (optionnel)
  const dateInput = $("resDateDisplay");
  const calendarCard = $("calendarCard");
  if (dateInput && calendarCard) {
    dateInput.addEventListener("click", () => {
      calendarCard.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // soumission formulaire
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!msgEl) return;

      const nom = $("resNom")?.value.trim();
      const prenom = $("resPrenom")?.value.trim();
      const telephone = $("resTelephone")?.value.trim();
      const email = $("resEmail")?.value.trim();
      const activite = $("resActivite")?.value;

      if (!nom || !prenom || !telephone || !activite) {
        msgEl.textContent = "Merci de remplir tous les champs obligatoires.";
        msgEl.className = "message message-error";
        msgEl.style.display = "block";
        return;
      }

      if (!selectedDate) {
        msgEl.textContent = "Merci de choisir une date de réservation.";
        msgEl.className = "message message-error";
        msgEl.style.display = "block";
        return;
      }

      msgEl.textContent = "Enregistrement de votre réservation...";
      msgEl.className = "message message-info";
      msgEl.style.display = "block";

      const { iso } = normaliseDate(selectedDate);

      try {
        const numero = await genererNumeroReservation(selectedDate);

        await db.createDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_RESERVATION_COLLECTION_ID,
          Appwrite.ID.unique(),
          {
            nom,
            prenom,
            telephone,
            "e-mail": email || null,
            date_reservation: iso,
            activite,
            numero_reservation: numero,
            actif: true
          }
        );

        msgEl.textContent =
          "Votre réservation a été enregistrée avec succès. Numéro : " + numero;
        msgEl.className = "message message-success";
        msgEl.style.display = "block";

        // reset formulaire
        form.reset();
        selectedDate = null;
        if (dateInput) dateInput.value = "";

        // on laisse la popup ouverte, l'utilisateur peut fermer
      } catch (err) {
        console.error("[SITE] Erreur enregistrement réservation :", err);
        msgEl.textContent =
          "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.";
        msgEl.className = "message message-error";
        msgEl.style.display = "block";
      }
    });
  }
});
