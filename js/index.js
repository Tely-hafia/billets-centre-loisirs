/* =========================
   Calypço - Réservation client
   index.js (v4)
   ========================= */

document.addEventListener("DOMContentLoaded", () => {
  console.log("[SITE] index.js chargé - réservation Calypço");

  // -------------------------
  // 0) CONFIG APPWRITE
  // -------------------------
  const cfg = window.APPWRITE_CONFIG;
  if (!cfg || !cfg.endpoint || !cfg.projectId || !cfg.databaseId || !cfg.reservationCollectionId) {
    console.error("[SITE] APPWRITE_CONFIG manquant dans index.html");
    return;
  }

  const { Client, Databases, Query, ID } = Appwrite;

  const client = new Client()
    .setEndpoint(cfg.endpoint)
    .setProject(cfg.projectId);

  const db = new Databases(client);

  // -------------------------
  // 1) ELEMENTS DOM
  // -------------------------
  const overlay = document.getElementById("reservation-block");
  const card = document.getElementById("reservationCard");
  const btnOpen = document.getElementById("btnShowReservation");
  const btnClose = document.getElementById("btnCloseReservation");
  const form = document.getElementById("reservationForm");
  const msg = document.getElementById("reservationMessage");

  const dateDisplay = document.getElementById("resDateDisplay");
  const calendarCard = document.getElementById("calendarCard");
  const daysWrap = document.getElementById("calendarDays");
  const monthTitle = document.getElementById("calMonthTitle");
  const calPrev = document.getElementById("calPrev");
  const calNext = document.getElementById("calNext");

  // Sécurité si un id manque
  if (!overlay || !card || !btnOpen || !btnClose || !form || !dateDisplay || !calendarCard) {
    console.error("[SITE] Un ou plusieurs éléments DOM sont introuvables. Vérifie les IDs HTML.");
    return;
  }

  // -------------------------
  // 2) POPUP OUVRIR / FERMER
  // -------------------------
  function openPopup() {
    overlay.classList.add("visible");
    overlay.style.display = "flex";
    // animation carte
    requestAnimationFrame(() => card.classList.add("visible"));
    // reset message
    hideMessage();
    // calendrier caché au départ
    hideCalendar();
  }

  function closePopup() {
    card.classList.remove("visible");
    overlay.classList.remove("visible");
    setTimeout(() => {
      overlay.style.display = "none";
      hideCalendar();
    }, 250);
  }

  btnOpen.addEventListener("click", openPopup);
  btnClose.addEventListener("click", closePopup);

  // clic sur fond => ferme popup
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePopup();
  });

  // -------------------------
  // 3) CALENDRIER
  // -------------------------
  let viewDate = new Date();         // mois affiché
  let selectedDate = null;          // date choisie (Date)

  function isClosedDay(d) {
    // Lundi=1, Mardi=2 en JS getDay(): 1=lundi, 2=mardi
    const day = d.getDay();
    return day === 1 || day === 2;
  }

  function isPastDay(d) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x < today;
  }

  function renderCalendar() {
    daysWrap.innerHTML = "";

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);

    const monthNames = [
      "Janvier","Février","Mars","Avril","Mai","Juin",
      "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
    ];
    monthTitle.textContent = `${monthNames[month]} ${year}`;

    // JS: dimanche=0 ... samedi=6
    // On veut commencer par lundi => décalage:
    let startIndex = (first.getDay() + 6) % 7; // lundi=0 ... dimanche=6

    // cases vides avant le 1er
    for (let i = 0; i < startIndex; i++) {
      const empty = document.createElement("div");
      empty.className = "calendar-day passee";
      empty.style.visibility = "hidden";
      daysWrap.appendChild(empty);
    }

    // jours du mois
    for (let d = 1; d <= last.getDate(); d++) {
      const dateObj = new Date(year, month, d);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "calendar-day";
      btn.textContent = d;

      const closed = isClosedDay(dateObj);
      const past = isPastDay(dateObj);

      if (past) btn.classList.add("passee");
      if (closed) btn.classList.add("ferme");

      if (
        selectedDate &&
        dateObj.toDateString() === selectedDate.toDateString()
      ) {
        btn.classList.add("selected");
      }

      btn.addEventListener("click", () => {
        if (past || closed) return;

        selectedDate = dateObj;
        const fr = dateObj.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric"
        });
        dateDisplay.value = fr;

        renderCalendar();
        hideCalendar(); // cache après sélection
      });

      daysWrap.appendChild(btn);
    }
  }

  function showCalendar() {
    calendarCard.style.display = "block";
    renderCalendar();
  }
  function hideCalendar() {
    calendarCard.style.display = "none";
  }

  // calendrier visible seulement au clic sur input date
  dateDisplay.addEventListener("click", (e) => {
    e.stopPropagation();
    showCalendar();
  });

  // navigation mois
  calPrev.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    renderCalendar();
  });
  calNext.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    renderCalendar();
  });

  // clic ailleurs dans la popup => ferme calendrier (si ouvert)
  document.addEventListener("click", (e) => {
    if (!overlay.classList.contains("visible")) return;
    if (calendarCard.style.display === "block") {
      const insideCal = calendarCard.contains(e.target);
      const insideInput = dateDisplay.contains(e.target);
      if (!insideCal && !insideInput) hideCalendar();
    }
  });

  // empêche fermeture si clic dans calendrier
  calendarCard.addEventListener("click", (e) => e.stopPropagation());

  // -------------------------
  // 4) MESSAGE HELPERS
  // -------------------------
  function showMessage(text, type="info") {
    msg.style.display = "block";
    msg.className = `message message-${type}`;
    msg.textContent = text;
  }
  function hideMessage() {
    msg.style.display = "none";
    msg.textContent = "";
  }

  // -------------------------
  // 5) GENERATION NUMERO RES
  // -------------------------
  async function generateReservationNumber() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const prefix = `RES-${mm}${yy}-`; // ex RES-1125-

    // Appwrite v13: Query.startsWith existe normalement
    const qStartsWith = Query.startsWith
      ? Query.startsWith("numero_reservation", prefix)
      : Query.search("numero_reservation", prefix);

    let lastNumber = 0;
    try {
      const res = await db.listDocuments(
        cfg.databaseId,
        cfg.reservationCollectionId,
        [
          qStartsWith,
          Query.orderDesc("numero_reservation"),
          Query.limit(1)
        ]
      );

      if (res.documents.length) {
        const last = res.documents[0].numero_reservation || "";
        const match = last.match(/-(\d{4})$/);
        if (match) lastNumber = parseInt(match[1], 10);
      }
    } catch (err) {
      // si liste échoue, on part de 0 sans bloquer
      console.warn("[SITE] Impossible de lire le dernier numéro, on repart à 0001", err);
    }

    const next = String(lastNumber + 1).padStart(4, "0");
    return `${prefix}${next}`; // ex RES-1125-0001
  }

  // -------------------------
  // 6) SUBMIT FORM
  // -------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage();

    // validations locales
    if (!selectedDate) {
      showMessage("Veuillez choisir une date de réservation.", "warning");
      showCalendar();
      return;
    }

    const nom = document.getElementById("resNom").value.trim();
    const prenom = document.getElementById("resPrenom").value.trim();
    const telephone = document.getElementById("resTelephone").value.trim();
    const email = document.getElementById("resEmail").value.trim() || null;
    const activite = document.getElementById("resActivite").value;

    if (!nom || !prenom || !telephone || !activite) {
      showMessage("Veuillez remplir tous les champs obligatoires.", "warning");
      return;
    }

    try {
      const numero = await generateReservationNumber();

      const payload = {
        nom,
        prenom,
        telephone,
        "e-mail": email,               // ta colonne s’appelle "e-mail"
        date_reservation: selectedDate.toISOString(),
        activite,
        numero_reservation: numero,
        actif: true
      };

      await db.createDocument(
        cfg.databaseId,
        cfg.reservationCollectionId,
        ID.unique(),
        payload
      );

      showMessage(
        `Réservation enregistrée ✅\nVotre numéro est ${numero}. Veuillez conserver soigneusement votre numéro de réservation pour pouvoir accéder au centre.`,
        "success"
      );

      form.reset();
      selectedDate = null;
      dateDisplay.value = "";
      hideCalendar();

      // ferme popup après un petit délai pour lecture
      setTimeout(closePopup, 1600);

    } catch (err) {
      console.error("[SITE] Erreur enregistrement réservation :", err);
      showMessage(
        "Erreur lors de l'enregistrement de la réservation. Merci de réessayer plus tard.",
        "error"
      );
    }
  });

});
