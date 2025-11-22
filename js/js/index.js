// ===============================
//  CONFIG APPWRITE
// ===============================
console.log("[SITE] index.js chargé - Réservations");

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation"; // à adapter si besoin

if (typeof Appwrite === "undefined") {
  console.error(
    "[SITE] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0"
  );
}

const siteClient = new Appwrite.Client();
siteClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const siteDB = new Appwrite.Databases(siteClient);

// Petit helper
function $(id) {
  return document.getElementById(id);
}

// ===============================
//  CARROUSEL ACCUEIL
// ===============================
let currentSlide = 0;
let slides = [];
let track;
let dotsContainer;

function initCarousel() {
  slides = Array.from(document.querySelectorAll(".carousel-slide"));
  track = $("carouselTrack");
  dotsContainer = $("carouselDots");
  if (!slides.length || !track || !dotsContainer) return;

  // Création des points
  dotsContainer.innerHTML = "";
  slides.forEach((_, index) => {
    const dot = document.createElement("div");
    dot.className = "carousel-dot" + (index === 0 ? " active" : "");
    dot.addEventListener("click", () => goToSlide(index));
    dotsContainer.appendChild(dot);
  });

  updateCarousel();
  setInterval(() => nextSlide(), 5000);
}

function updateCarousel() {
  if (!track) return;
  track.style.transform = `translateX(-${currentSlide * 100}%)`;
  const dots = document.querySelectorAll(".carousel-dot");
  dots.forEach((dot, idx) => {
    dot.classList.toggle("active", idx === currentSlide);
  });
}

function nextSlide() {
  if (!slides.length) return;
  currentSlide = (currentSlide + 1) % slides.length;
  updateCarousel();
}

function prevSlide() {
  if (!slides.length) return;
  currentSlide = (currentSlide - 1 + slides.length) % slides.length;
  updateCarousel();
}

function goToSlide(index) {
  currentSlide = index;
  updateCarousel();
}

// Rendre accessibles dans le global pour les boutons HTML
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;

// ===============================
//  CALENDRIER DE RÉSERVATION
// ===============================

let calCurrentMonth; // 0-11
let calCurrentYear;  // année complète
let calSelectedDate = null; // Date JS

function initCalendar() {
  const today = new Date();
  calCurrentMonth = today.getMonth();
  calCurrentYear = today.getFullYear();

  const prevBtn = $("calPrevBtn");
  const nextBtn = $("calNextBtn");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => changeMonth(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => changeMonth(1));
  }

  const dateInput = $("resDateInput");
  if (dateInput) {
    // Fait défiler vers le calendrier quand on clique sur le champ
    dateInput.addEventListener("click", () => {
      const wrapper = document.querySelector(".calendar-wrapper");
      if (wrapper) {
        wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  renderCalendar();
}

function changeMonth(delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth < 0) {
    calCurrentMonth = 11;
    calCurrentYear -= 1;
  } else if (calCurrentMonth > 11) {
    calCurrentMonth = 0;
    calCurrentYear += 1;
  }
  renderCalendar();
}

function renderCalendar() {
  const monthLabel = $("calMonthLabel");
  const daysContainer = $("calDays");
  if (!monthLabel || !daysContainer) return;

  const monthNames = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];

  monthLabel.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

  // Nettoie
  daysContainer.innerHTML = "";

  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1);
  const lastDay = new Date(calCurrentYear, calCurrentMonth + 1, 0);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Lundi = 0
  const today = new Date();
  today.setHours(0,0,0,0);

  // cases vides avant le 1er
  for (let i = 0; i < startWeekday; i++) {
    const emptyDiv = document.createElement("button");
    emptyDiv.className = "cal-day empty";
    emptyDiv.disabled = true;
    daysContainer.appendChild(emptyDiv);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(calCurrentYear, calCurrentMonth, d);
    dateObj.setHours(0,0,0,0);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(d);
    btn.className = "cal-day";

    // jour de la semaine : 0 = lundi ... 6 = dimanche
    const weekday = (dateObj.getDay() + 6) % 7;

    // Date passée ?
    if (dateObj < today) {
      btn.classList.add("past");
      btn.disabled = true;
    }

    // Lundi (0) ou mardi (1) => fermé
    if (weekday === 0 || weekday === 1) {
      btn.classList.add("closed");
      btn.disabled = true;
    }

    // date sélectionnée ?
    if (
      calSelectedDate &&
      dateObj.getTime() === calSelectedDate.getTime()
    ) {
      btn.classList.add("selected");
    }

    // click
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      calSelectedDate = dateObj;
      applySelectedDateToInput();
      renderCalendar(); // re-render pour mettre la classe .selected
    });

    daysContainer.appendChild(btn);
  }
}

function applySelectedDateToInput() {
  const input = $("resDateInput");
  if (!input || !calSelectedDate) return;

  const d = calSelectedDate.getDate().toString().padStart(2, "0");
  const m = (calSelectedDate.getMonth() + 1).toString().padStart(2, "0");
  const y = calSelectedDate.getFullYear();

  input.value = `${d}/${m}/${y}`;
}

// ===============================
//  NUMÉRO DE RÉSERVATION
//  format: RES-mmyy-0001
// ===============================

async function genererNumeroReservation() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).substring(2);
  const prefix = `RES-${mm}${yy}-`;

  try {
    const res = await siteDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.orderDesc("$createdAt"),
        Appwrite.Query.limit(1)
      ]
    );

    let seq = 1;
    if (res.documents && res.documents.length > 0) {
      const last = res.documents[0].numero_reservation || "";
      if (last.startsWith(prefix)) {
        const part = last.substring(prefix.length);
        const n = parseInt(part, 10);
        if (!isNaN(n)) {
          seq = n + 1;
        }
      }
    }

    return `${prefix}${String(seq).padStart(4, "0")}`;
  } catch (err) {
    console.warn("[SITE] Impossible de récupérer la dernière réservation :", err);
    // Si erreur, on ne bloque pas : on part sur ...-0001
    return `${prefix}0001`;
  }
}

// ===============================
//  FORMULAIRE DE RÉSERVATION
// ===============================

function showReservationMessage(text, type) {
  const msg = $("reservationMessage");
  if (!msg) return;
  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message";
  if (type === "success") msg.classList.add("message-success");
  else if (type === "error") msg.classList.add("message-error");
  else msg.classList.add("message-info");
}

async function handleReservationSubmit(e) {
  e.preventDefault();

  const nom = $("resNom")?.value.trim() || "";
  const prenom = $("resPrenom")?.value.trim() || "";
  const telephone = $("resTelephone")?.value.trim() || "";
  const email = $("resEmail")?.value.trim() || "";
  const dateStr = $("resDateInput")?.value.trim() || "";
  const activite = $("resActivite")?.value.trim() || "";

  if (!nom || !prenom || !telephone || !dateStr || !activite) {
    showReservationMessage(
      "Merci de remplir tous les champs obligatoires.",
      "error"
    );
    return;
  }

  // Convertit dd/mm/yyyy en ISO
  const [dd, mm, yyyy] = dateStr.split("/");
  let isoDate = null;
  try {
    const jsDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    isoDate = jsDate.toISOString();
  } catch (err) {
    showReservationMessage("Date de réservation invalide.", "error");
    return;
  }

  const submitBtn = $("btnReservationSubmit");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Enregistrement...";
  }
  showReservationMessage("Enregistrement en cours...", "info");

  try {
    const numeroReservation = await genererNumeroReservation();

    await siteDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      Appwrite.ID.unique(),
      {
        nom,
        prenom,
        telephone,
        "e-mail": email || null,
        date_reservation: isoDate,
        actif: true, // booléen
        numero_reservation: numeroReservation,
        activite
      }
    );

    showReservationMessage(
      "Votre réservation a bien été enregistrée. Merci !",
      "success"
    );

    // reset partiel (on garde la date sélectionnée si tu veux)
    $("resNom").value = "";
    $("resPrenom").value = "";
    $("resTelephone").value = "";
    $("resEmail").value = "";
    $("resActivite").value = "";

  } catch (err) {
    console.error("[SITE] Erreur enregistrement réservation :", err);
    showReservationMessage(
      "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.",
      "error"
    );
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "✅ Valider la réservation";
    }
  }
}

// ===============================
//  INIT GLOBAL
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  initCarousel();
  initCalendar();

  const form = $("reservationForm");
  if (form) {
    form.addEventListener("submit", handleReservationSubmit);
  }

  // Smooth scroll pour tous les liens #ancre
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const href = this.getAttribute("href");
      if (!href || href === "#") return;
      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
});
