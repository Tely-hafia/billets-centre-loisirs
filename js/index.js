console.log("[SITE] index.js chargé - Réservation Calypço");

// ===============================
//  CONFIG APPWRITE
// ===============================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";
const APPWRITE_RESERVATIONS_COLLECTION_ID = "reservations"; // ID de ta collection Appwrite

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
//  ETAT CALENDRIER
// ===============================

let calYear = null;
let calMonth = null; // 0-11
let selectedDateISO = null;

// ===============================
//  POPUP RESERVATION
// ===============================

function initReservationPopup() {
  const btnOpen = $("btnShowReservation");
  const overlay = $("reservation-block");
  const card = $("reservationCard");
  const btnClose = $("btnCloseReservation");

  if (!btnOpen || !overlay || !card) {
    console.warn("[SITE] Éléments popup réservation manquants.");
    return;
  }

  // Ouverture popup
  btnOpen.addEventListener("click", (e) => {
    e.preventDefault();
    overlay.style.display = "flex";

    // Laisser le temps au browser d'appliquer display:flex avant l'animation
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
      card.classList.add("visible");
    });
  });

  function closePopup() {
    overlay.classList.remove("visible");
    card.classList.remove("visible");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 300);
  }

  // Bouton X
  if (btnClose) {
    btnClose.addEventListener("click", (e) => {
      e.preventDefault();
      closePopup();
    });
  }

  // clic sur le fond (fermeture)
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closePopup();
    }
  });
}

// ===============================
//  CALENDRIER RESERVATION
// ===============================

function initCalendar() {
  const calendarCard = $("calendarCard");
  const daysContainer = $("calendarDays");
  const monthTitle = $("calMonthTitle");
  const btnPrev = $("calPrev");
  const btnNext = $("calNext");
  const dateInput = $("resDateDisplay");

  if (!calendarCard || !daysContainer || !monthTitle || !dateInput) {
    console.warn("[SITE] Éléments calendrier manquants.");
    return;
  }

  // Date actuelle
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();

  function isSameDate(d1, d2) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function renderCalendar() {
    const firstOfMonth = new Date(calYear, calMonth, 1);
    const lastOfMonth = new Date(calYear, calMonth + 1, 0); // dernier jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Titre "Janvier 2025"
    const monthName = firstOfMonth.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    monthTitle.textContent =
      monthName.charAt(0).toUpperCase() + monthName.slice(1);

    daysContainer.innerHTML = "";

    // Décalage pour aligner lundi = première colonne
    let startDay = firstOfMonth.getDay(); // 0=dim, 1=lun, ...
    let offset = startDay === 0 ? 6 : startDay - 1; // 0=lu, 6=di
    for (let i = 0; i < offset; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day empty";
      daysContainer.appendChild(empty);
    }

    for (let day = 1; day <= lastOfMonth.getDate(); day++) {
      const d = new Date(calYear, calMonth, day);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(day);
      btn.className = "calendar-day";

      const dayOfWeek = d.getDay(); // 0=dim,1=lun,2=mar,...

      // Date passée ?
      const dCopy = new Date(d);
      dCopy.setHours(0, 0, 0, 0);
      if (dCopy < today) {
        btn.classList.add("passee");
        btn.disabled = true;
      }

      // Lundi / mardi fermés
      if (dayOfWeek === 1 || dayOfWeek === 2) {
        btn.classList.add("ferme");
        btn.disabled = true;
      }

      // Date sélectionnée ?
      if (selectedDateISO) {
        const selectedDate = new Date(selectedDateISO);
        if (isSameDate(d, selectedDate)) {
          btn.classList.add("selected");
        }
      }

      btn.addEventListener("click", () => {
        if (btn.classList.contains("passee") || btn.classList.contains("ferme")) {
          return;
        }
        // Enregistrer la date en ISO (aaaa-mm-jj)
        selectedDateISO = d.toISOString().slice(0, 10);

        // Affichage lisible dans le champ texte
        const label = d.toLocaleDateString("fr-FR", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const formatted =
          label.charAt(0).toUpperCase() + label.slice(1);
        dateInput.value = formatted;

        // Fermer le calendrier
        calendarCard.style.display = "none";

        // Re-render pour mettre à jour la classe "selected"
        renderCalendar();
      });

      daysContainer.appendChild(btn);
    }
  }

  // Navigation mois précédent / suivant
  if (btnPrev) {
    btnPrev.addEventListener("click", (e) => {
      e.preventDefault();
      calMonth--;
      if (calMonth < 0) {
        calMonth = 11;
        calYear--;
      }
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", (e) => {
      e.preventDefault();
      calMonth++;
      if (calMonth > 11) {
        calMonth = 0;
        calYear++;
      }
      renderCalendar();
    });
  }

  // Affichage/masquage du calendrier au clic sur le champ date
  dateInput.addEventListener("click", (e) => {
    e.stopPropagation();
    if (calendarCard.style.display === "none" || calendarCard.style.display === "") {
      calendarCard.style.display = "block";
    } else {
      calendarCard.style.display = "none";
    }
  });

  // Masquer le calendrier si on clique ailleurs
  document.addEventListener("click", (e) => {
    if (!calendarCard.contains(e.target) && e.target !== dateInput) {
      calendarCard.style.display = "none";
    }
  });

  // Premier rendu
  renderCalendar();
}

// ===============================
//  NUMÉRO DE RÉSERVATION
//  RES-mmyy-0001
// ===============================

async function genererNumeroReservation() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `RES-${mm}${yy}-`;

  try {
    // On récupère la dernière réservation qui commence par ce préfixe,
    // en triant par date de création décroissante.
    const res = await siteDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATIONS_COLLECTION_ID,
      [
        Appwrite.Query.search("numero_reservation", prefix),
        Appwrite.Query.orderDesc("$createdAt"),
        Appwrite.Query.limit(1),
      ]
    );

    let seq = 1;
    if (res.documents && res.documents.length > 0) {
      const last = res.documents[0].numero_reservation || "";
      const parts = last.split("-");
      const numPart = parts[2] || "0000";
      const num = parseInt(numPart, 10);
      if (!isNaN(num)) {
        seq = num + 1;
      }
    }

    return `${prefix}${String(seq).padStart(4, "0")}`;
  } catch (err) {
    console.error("[SITE] Erreur génération numéro réservation :", err);
    // Fallback : numéro aléatoire pour ne pas bloquer
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${String(rand).padStart(4, "0")}`;
  }
}

// ===============================
//  ENREGISTREMENT RESERVATION
// ===============================

async function enregistrerReservation(data) {
  const numero = await genererNumeroReservation();
  const nowIso = new Date().toISOString();

  const doc = {
    numero_reservation: numero,
    nom: data.nom,
    prenom: data.prenom,
    telephone: data.telephone,
    email: data.email || null,
    date_reservation: data.date_reservation, // "aaaa-mm-jj"
    activite: data.activite,
    actif: true,
    created_at: nowIso,
  };

  await siteDB.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_RESERVATIONS_COLLECTION_ID,
    Appwrite.ID.unique(),
    doc
  );

  return numero;
}

// ===============================
//  FORMULAIRE RESERVATION
// ===============================

function initReservationForm() {
  const form = $("reservationForm");
  const msg = $("reservationMessage");

  if (!form || !msg) {
    console.warn("[SITE] Formulaire de réservation introuvable.");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nom = $("resNom")?.value.trim();
    const prenom = $("resPrenom")?.value.trim();
    const telephone = $("resTelephone")?.value.trim();
    const email = $("resEmail")?.value.trim() || "";
    const activite = $("resActivite")?.value;

    msg.style.display = "block";
    msg.className = "message message-info";
    msg.textContent = "Enregistrement de votre réservation en cours...";

    if (!nom || !prenom || !telephone || !activite || !selectedDateISO) {
      msg.className = "message message-error";
      msg.textContent =
        "Veuillez remplir tous les champs obligatoires et choisir une date.";
      return;
    }

    try {
      const numero = await enregistrerReservation({
        nom,
        prenom,
        telephone,
        email,
        activite,
        date_reservation: selectedDateISO,
      });

      // Reset du formulaire, mais on laisse la popup ouverte
      form.reset();
      selectedDateISO = null;
      const dateInput = $("resDateDisplay");
      if (dateInput) dateInput.value = "";

      msg.className = "message message-success";
      msg.textContent =
        `Réservation enregistrée avec succès. ` +
        `Votre numéro de réservation est : ${numero}. ` +
        `Veuillez conserver soigneusement votre numéro de réservation pour pouvoir accéder au centre.`;
    } catch (err) {
      console.error("[SITE] Erreur enregistrement réservation :", err);
      msg.className = "message message-error";
      msg.textContent =
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.";
    }
  });
}

// ===============================
//  INIT GLOBAL
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] DOMContentLoaded - initialisation réservation");

  initReservationPopup();
  initCalendar();
  initReservationForm();
});
