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
  const zone = $("reservation-message");
  if (!zone) return;
  zone.style.display = "block";
  zone.textContent = text;
  zone.className = "message";
  if (type === "success") zone.classList.add("message-success");
  else if (type === "error") zone.classList.add("message-error");
  else zone.classList.add("message-info");
}

function clearReservationMessage() {
  const zone = $("reservation-message");
  if (!zone) return;
  zone.style.display = "none";
  zone.textContent = "";
  zone.className = "message";
}

// ===============================
//  CALENDRIER
// ===============================
let calCurrentMonth; // 0-11
let calCurrentYear;  // année full
let calSelectedDate = null; // Date JS

function initCalendar() {
  const today = new Date();
  calCurrentMonth = today.getMonth();
  calCurrentYear = today.getFullYear();
  renderCalendar();

  const btnPrev = $("cal-prev");
  const btnNext = $("cal-next");

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
}

function renderCalendar() {
  const daysContainer = $("cal-days");
  const titleEl = $("cal-title");
  if (!daysContainer || !titleEl) return;

  const monthNames = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];

  titleEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  daysContainer.innerHTML = "";

  const firstDayOfMonth = new Date(calCurrentYear, calCurrentMonth, 1);
  const startingWeekDay = (firstDayOfMonth.getDay() + 6) % 7; // 0=lu .. 6=di
  const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
  const today = new Date();
  today.setHours(0,0,0,0);

  // cases vides avant le 1er
  for (let i = 0; i < startingWeekDay; i++) {
    const emptyCell = document.createElement("div");
    daysContainer.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const d = document.createElement("button");
    d.type = "button";
    d.className = "calendar-day";
    d.textContent = String(day);

    const dateObj = new Date(calCurrentYear, calCurrentMonth, day);
    dateObj.setHours(0,0,0,0);

    const weekday = (dateObj.getDay() + 6) % 7; // 0=lu

    let isDisabled = false;

    // Lundi (0) et mardi (1) fermés
    if (weekday === 0 || weekday === 1) {
      d.classList.add("closed");
      isDisabled = true;
    }

    // Dates passées (par rapport à aujourd'hui) désactivées
    if (dateObj < today) {
      d.classList.add("disabled");
      isDisabled = true;
    }

    // Highlight si sélectionnée
    if (
      calSelectedDate &&
      dateObj.getTime() === calSelectedDate.getTime()
    ) {
      d.classList.add("selected");
    }

    if (!isDisabled) {
      d.addEventListener("click", () => {
        calSelectedDate = dateObj;
        const input = $("reservation-date");
        if (input) {
          const dd = String(day).padStart(2, "0");
          const mm = String(calCurrentMonth + 1).padStart(2, "0");
          const yyyy = String(calCurrentYear);
          input.value = `${dd}/${mm}/${yyyy}`;
        }
        renderCalendar(); // refresh highlight
      });
    } else {
      d.disabled = true;
    }

    daysContainer.appendChild(d);
  }
}

// ===============================
//  RÉSERVATION APPWRITE
// ===============================

function parseDateFrToISO(dateStr) {
  // "dd/mm/yyyy" -> ISO "yyyy-mm-ddT00:00:00.000Z"
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts.map(p => parseInt(p, 10));
  if (!dd || !mm || !yyyy) return null;

  const d = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0));
  return d.toISOString();
}

async function generateReservationNumber(dateIso) {
  // dateIso : "yyyy-mm-ddT..."
  const dateObj = new Date(dateIso);
  const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const year = String(dateObj.getUTCFullYear()).slice(-2);
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
      if (!isNaN(idx) && idx > maxIndex) {
        maxIndex = idx;
      }
    }

    const nextIndex = maxIndex + 1;
    const indexStr = String(nextIndex).padStart(4, "0");
    return `${prefix}${indexStr}`;
  } catch (err) {
    console.error("[SITE] Erreur génération numéro réservation :", err);
    // fallback simple
    const random = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
    return `${prefix}${random}`;
  }
}

async function submitReservation(e) {
  e.preventDefault();
  clearReservationMessage();

  const nom = $("reservation-nom")?.value.trim();
  const prenom = $("reservation-prenom")?.value.trim();
  const telephone = $("reservation-telephone")?.value.trim();
  const email = $("reservation-email")?.value.trim();
  const dateStr = $("reservation-date")?.value.trim();
  const activite = $("reservation-activite")?.value.trim();

  if (!nom || !prenom || !telephone || !dateStr || !activite) {
    showReservationMessage(
      "Merci de remplir tous les champs obligatoires.",
      "error"
    );
    return;
  }

  const dateIso = parseDateFrToISO(dateStr);
  if (!dateIso) {
    showReservationMessage(
      "La date de réservation est invalide.",
      "error"
    );
    return;
  }

  try {
    const numeroReservation = await generateReservationNumber(dateIso);

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
        actif: true
      }
    );

    showReservationMessage(
      `Votre réservation a été enregistrée avec le numéro : ${numeroReservation}.`,
      "success"
    );

    // Reset formulaire & sélection
    const form = $("reservation-form");
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
//  CAROUSEL (comme avant)
// ===============================
let currentSlide = 0;
let carouselInterval = null;

function setupCarousel() {
  const slides = document.querySelectorAll(".carousel-slide");
  const track = $("carouselTrack");
  const dotsContainer = $("carouselDots");
  if (!slides.length || !track || !dotsContainer) return;

  dotsContainer.innerHTML = "";
  slides.forEach((_, index) => {
    const dot = document.createElement("div");
    dot.className = "carousel-dot" + (index === 0 ? " active" : "");
    dot.addEventListener("click", () => goToSlide(index));
    dotsContainer.appendChild(dot);
  });

  function updateCarousel() {
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    document.querySelectorAll(".carousel-dot").forEach((dot, index) => {
      dot.classList.toggle("active", index === currentSlide);
    });
  }

  window.goToSlide = function (index) {
    currentSlide = index;
    updateCarousel();
  };

  window.nextSlide = function () {
    currentSlide = (currentSlide + 1) % slides.length;
    updateCarousel();
  };

  window.prevSlide = function () {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateCarousel();
  };

  updateCarousel();

  if (carouselInterval) clearInterval(carouselInterval);
  carouselInterval = setInterval(() => {
    window.nextSlide();
  }, 5000);
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded – init réservation");

  // Affichage de la carte réservation au clic sur le bouton du hero
  const btnGoRes = $("btnGoReservation");
  const reservationCard = $("reservation-card");
  if (btnGoRes && reservationCard) {
    btnGoRes.addEventListener("click", () => {
      reservationCard.style.display = "block";
      reservationCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Formulaire
  const form = $("reservation-form");
  if (form) {
    form.addEventListener("submit", submitReservation);
  }

  // Calendrier
  initCalendar();

  // Carousel
  setupCarousel();
});
