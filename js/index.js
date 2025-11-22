console.log("[SITE] index.js chargé – réservation Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

// ⚠️ Remplace par l'ID exact de ta collection "reservation" dans Appwrite
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

// ===============================
//  CLIENT APPWRITE
// ===============================
if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0."
  );
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const db = new Appwrite.Databases(client);

// ===============================
//  HELPERS
// ===============================
function formatDateDDMMYYYY(dateObj) {
  const d = dateObj.getDate().toString().padStart(2, "0");
  const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

// numéro de réservation : RES-mmyy-0001
function buildReservationNumber(lastNumber, dateObj) {
  const mm = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const yy = dateObj.getFullYear().toString().slice(-2);
  let nextSeq = 1;

  if (lastNumber && typeof lastNumber === "string") {
    // RES-0124-0001
    const parts = lastNumber.split("-");
    // parts[1] = mmyy, parts[2] = seq
    if (parts.length === 3) {
      const lastMMYY = parts[1];
      const lastSeq = parseInt(parts[2], 10) || 0;
      const currentMMYY = `${mm}${yy}`;
      if (lastMMYY === currentMMYY) {
        nextSeq = lastSeq + 1;
      }
    }
  }

  const seqStr = nextSeq.toString().padStart(4, "0");
  return `RES-${mm}${yy}-${seqStr}`;
}

function showResaMessage(text, type) {
  const msg = document.getElementById("resaMessage");
  if (!msg) return;
  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message";
  if (type === "success") msg.classList.add("message-success");
  else if (type === "error") msg.classList.add("message-error");
  else msg.classList.add("message-info");
}

// ===============================
//  RESERVATION UI LOGIC
// ===============================
document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  const openResaBtn = document.getElementById("openReservationBtn");
  const resaSection = document.getElementById("reservationSection");

  if (openResaBtn && resaSection) {
    openResaBtn.addEventListener("click", (e) => {
      e.preventDefault();
      resaSection.style.display = "block";
      resaSection.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  initReservationForm();
});

function initReservationForm() {
  const form = document.getElementById("reservationForm");
  if (!form) {
    console.warn("[SITE] Formulaire de réservation introuvable.");
    return;
  }

  const dateInput = document.getElementById("resaDateInput");
  const calendarContainer = document.getElementById("resaCalendarContainer");
  const monthLabel = document.getElementById("resaMonthLabel");
  const grid = document.getElementById("resaCalendarGrid");
  const prevBtn = document.getElementById("resaPrevMonth");
  const nextBtn = document.getElementById("resaNextMonth");

  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let selectedDate = null;

  function renderCalendar() {
    if (!grid || !monthLabel) return;

    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);

    const monthName = firstDay.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    monthLabel.textContent =
      monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // position dans la semaine (1 = lundi, 7 = dimanche)
    let startWeekday = firstDay.getDay();
    if (startWeekday === 0) startWeekday = 7;

    grid.innerHTML = "";

    // cases vides avant le 1er
    for (let i = 1; i < startWeekday; i++) {
      const emptyCell = document.createElement("div");
      grid.appendChild(emptyCell);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const cellDate = new Date(currentYear, currentMonth, d);
      cellDate.setHours(0, 0, 0, 0);

      let weekday = cellDate.getDay();
      if (weekday === 0) weekday = 7; // dimanche = 7

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = d.toString();
      btn.className = "resa-day";

      let isPast = cellDate < today;
      if (isPast) {
        btn.classList.add("resa-day-disabled", "resa-day-past");
      }

      // lundi (=1) et mardi (=2) fermés
      if (weekday === 1 || weekday === 2) {
        btn.classList.add("resa-day-closed");
        isPast = true; // pas cliquable
      }

      if (selectedDate &&
          cellDate.getTime() === selectedDate.getTime()) {
        btn.classList.add("resa-day-selected");
      }

      if (!isPast) {
        btn.addEventListener("click", () => {
          selectedDate = cellDate;
          if (dateInput) {
            dateInput.value = formatDateDDMMYYYY(selectedDate);
          }
          // re-rendre pour mettre à jour la sélection
          renderCalendar();
        });
      }

      grid.appendChild(btn);
    }
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      currentMonth -= 1;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear -= 1;
      }
      renderCalendar();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentMonth += 1;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear += 1;
      }
      renderCalendar();
    });
  }

  // afficher le calendrier uniquement quand on clique sur le champ date
  if (dateInput && calendarContainer) {
    dateInput.addEventListener("click", () => {
      calendarContainer.style.display = "block";
      renderCalendar();
    });
  }

  // Soumission du formulaire
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nom = document.getElementById("resaNom")?.value.trim();
    const prenom = document.getElementById("resaPrenom")?.value.trim();
    const telephone = document.getElementById("resaTelephone")?.value.trim();
    const email = document.getElementById("resaEmail")?.value.trim();
    const activite = document.getElementById("resaActivite")?.value;

    if (!nom || !prenom || !telephone || !activite || !selectedDate) {
      showResaMessage(
        "Veuillez remplir tous les champs obligatoires et choisir une date.",
        "error"
      );
      return;
    }

    try {
      showResaMessage("Enregistrement de votre réservation en cours...", "info");

      // Récupérer la dernière réservation pour construire le prochain numéro
      let lastNumber = null;
      try {
        const lastRes = await db.listDocuments(
          APPWRITE_DATABASE_ID,
          APPWRITE_RESERVATION_COLLECTION_ID,
          [Appwrite.Query.orderDesc("$createdAt"), Appwrite.Query.limit(1)]
        );

        if (lastRes.documents && lastRes.documents.length > 0) {
          lastNumber = lastRes.documents[0].numero_reservation;
        }
      } catch (errLast) {
        console.warn(
          "[SITE] Impossible de récupérer la dernière réservation (ce n'est pas bloquant) :",
          errLast
        );
      }

      const numeroReservation = buildReservationNumber(lastNumber, selectedDate);
      const dateIso = selectedDate.toISOString();

      // Création du document dans Appwrite
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
          numero_reservation: numeroReservation,
          actif: true,
        }
      );

      showResaMessage(
        `Votre réservation a été enregistrée avec succès. Numéro de réservation : ${numeroReservation}`,
        "success"
      );

      // Reset du formulaire (on garde le calendrier visible avec le mois courant)
      form.reset();
      selectedDate = null;
      if (dateInput) dateInput.value = "";
      renderCalendar();
    } catch (err) {
      console.error("[SITE] Erreur enregistrement réservation :", err);
      showResaMessage(
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.",
        "error"
      );
    }
  });

  // Premier rendu du calendrier (il restera caché tant que l'utilisateur n'a pas cliqué dans le champ date)
  renderCalendar();
}
