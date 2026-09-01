console.log("[ADMIN] admin-appwrite.js chargé - VERSION AVEC HISTORIQUE RESERVATIONS");

// =====================================
//  Configuration partagée
// =====================================

const APPWRITE_DATABASE_ID = CalypsoConfig.databaseId;
const APPWRITE_BILLETS_TABLE_ID = CalypsoConfig.tables.billets;
const APPWRITE_BILLETS_INTERNE_TABLE_ID = CalypsoConfig.tables.billetsInterne;
const APPWRITE_VALIDATIONS_TABLE_ID = CalypsoConfig.tables.validations;
const APPWRITE_ETUDIANTS_TABLE_ID = CalypsoConfig.tables.etudiants;
const APPWRITE_MENU_RESTO_COLLECTION_ID = CalypsoConfig.tables.menuResto;
const APPWRITE_VENTES_RESTO_COLLECTION_ID = CalypsoConfig.tables.ventesResto;
const APPWRITE_RESERVATION_COLLECTION_ID = CalypsoConfig.tables.reservations;
const APPWRITE_SESSIONS_CAISSE_TABLE_ID = CalypsoConfig.tables.sessionsCaisse;
const APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID = CalypsoConfig.tables.mouvementsCaisse;
const adminDB = CalypsoAppwrite.databases;

// Helpers DOM
function $(id) {
  return document.getElementById(id);
}

// Format monnaie
function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

function getImportType() {
  const r = document.querySelector('input[name="importType"]:checked');
  return r ? r.value : "entree";
}

function formatDateFR(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =====================================
//  ÉTAT GLOBAL ADMIN
// =====================================

let currentAdmin = null;
let adminCurrentMode = "dashboard";
let reservationHistoryPage = 0;
const RESERVATIONS_PER_PAGE = 50;

const adminDashboardState = {
  validationDocs: [],
  saleDocs: [],
  billetsRevenue: 0,
  restoRevenue: 0,
  ticketCount: 0,
  orderCount: 0,
  billetsLoaded: false,
  restoLoaded: false,
  agentNames: {}
};

function getAgentLabel(agentId) {
  if (!agentId) return "Agent non identifié";
  return adminDashboardState.agentNames[agentId] || `Profil à compléter · …${agentId.slice(-6)}`;
}

function renderAgentActivity() {
  const tbody = $("dashboard-agent-body");
  if (!tbody) return;

  const activity = new Map();
  const ensureAgent = (agentId) => {
    const key = agentId || "unknown";
    if (!activity.has(key)) {
      activity.set(key, {
        agentId,
        tickets: 0,
        orders: new Set(),
        revenue: 0
      });
    }
    return activity.get(key);
  };

  adminDashboardState.validationDocs.forEach((doc) => {
    const entry = ensureAgent(doc.agent_id);
    entry.tickets += 1;
    entry.revenue += Number(doc.montant_paye) || 0;
  });

  adminDashboardState.saleDocs.forEach((doc) => {
    const entry = ensureAgent(doc.agent_id);
    entry.orders.add(doc.numero_vente || doc.$id);
    entry.revenue += Number(doc.montant_total) || 0;
  });

  const rows = [...activity.values()].sort((a, b) => b.revenue - a.revenue);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Aucune activité pour cette période.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHTML(getAgentLabel(row.agentId))}</td>
      <td>${row.tickets}</td>
      <td>${row.orders.size}</td>
      <td>${formatGNF(row.revenue)}</td>
    </tr>
  `).join("");
}

function detectDashboardAlerts() {
  const alerts = [];
  const salesByTicket = new Map();
  const pendingSalesByTicket = new Set();
  const confirmationsByTicket = new Map();
  const studentsByDay = new Map();
  const salesByNumber = new Map();

  adminDashboardState.validationDocs.forEach((doc) => {
    const ticket = doc.numero_billet || "";
    if (ticket && ["ENTREE", "VENTE_ENTREE"].includes(doc.poste_id)) {
      salesByTicket.set(ticket, (salesByTicket.get(ticket) || 0) + 1);
      if (doc.poste_id === "VENTE_ENTREE") pendingSalesByTicket.add(ticket);
    }
    if (ticket && doc.poste_id === "CONTROLE_ENTREE") {
      confirmationsByTicket.set(ticket, (confirmationsByTicket.get(ticket) || 0) + 1);
    }

    const student = doc.numero_etudiant || "";
    if (student) {
      const day = String(doc.date_validation || doc.$createdAt || "").slice(0, 10);
      const key = `${student}|${day}`;
      studentsByDay.set(key, (studentsByDay.get(key) || 0) + 1);
    }
  });

  const duplicateTickets = [...salesByTicket.values()].filter((count) => count > 1).length;
  if (duplicateTickets > 0) {
    alerts.push({
      level: "high",
      title: `${duplicateTickets} billet(s) vendu(s) plusieurs fois`,
      detail: "Vérifier le journal de vente et l’état réel des billets."
    });
  }

  const duplicateConfirmations = [...confirmationsByTicket.values()].filter((count) => count > 1).length;
  if (duplicateConfirmations > 0) {
    alerts.push({
      level: "high",
      title: `${duplicateConfirmations} double(s) confirmation(s) d’entrée`,
      detail: "Contrôler l’agent de contrôle et les numéros concernés."
    });
  }

  const unconfirmed = [...pendingSalesByTicket].filter((ticket) => !confirmationsByTicket.has(ticket)).length;
  if (unconfirmed > 0) {
    alerts.push({
      level: "medium",
      title: `${unconfirmed} billet(s) vendu(s) sans entrée confirmée`,
      detail: "Résumé de clôture à vérifier ; ce résultat ne signifie pas automatiquement un vol."
    });
  }

  const confirmationsWithoutSale = [...confirmationsByTicket.keys()].filter((ticket) => !salesByTicket.has(ticket)).length;
  if (confirmationsWithoutSale > 0) {
    alerts.push({
      level: "high",
      title: `${confirmationsWithoutSale} entrée(s) sans vente correspondante`,
      detail: "Anomalie importante : rapprocher immédiatement le billet et la caisse du gérant."
    });
  }

  const repeatedStudents = [...studentsByDay.values()].filter((count) => count >= 3).length;
  if (repeatedStudents > 0) {
    alerts.push({
      level: "medium",
      title: `${repeatedStudents} numéro(s) étudiant utilisé(s) au moins 3 fois dans une journée`,
      detail: "Contrôler les justificatifs avant de conclure à une anomalie."
    });
  }

  const missingValidationAgents = adminDashboardState.validationDocs.filter((doc) => !doc.agent_id).length;
  if (missingValidationAgents > 0) {
    alerts.push({
      level: "high",
      title: `${missingValidationAgents} validation(s) sans agent identifié`,
      detail: "Une opération métier doit toujours être rattachée à une session."
    });
  }

  const zeroValidationAmounts = adminDashboardState.validationDocs.filter(
    (doc) => doc.poste_id !== "CONTROLE_ENTREE" && (Number(doc.montant_paye) || 0) <= 0
  ).length;
  if (zeroValidationAmounts > 0) {
    alerts.push({
      level: "medium",
      title: `${zeroValidationAmounts} validation(s) avec un montant nul`,
      detail: "Vérifier qu’il s’agit bien d’une gratuité autorisée."
    });
  }

  adminDashboardState.saleDocs.forEach((doc) => {
    const saleNumber = doc.numero_vente || doc.$id;
    if (!salesByNumber.has(saleNumber)) {
      salesByNumber.set(saleNumber, { agents: new Set(), dates: [] });
    }
    const group = salesByNumber.get(saleNumber);
    if (doc.agent_id) group.agents.add(doc.agent_id);
    const date = new Date(doc.date_vente || doc.$createdAt || 0).getTime();
    if (Number.isFinite(date)) group.dates.push(date);
  });

  let conflictingSales = 0;
  salesByNumber.forEach((group) => {
    const minDate = group.dates.length ? Math.min(...group.dates) : 0;
    const maxDate = group.dates.length ? Math.max(...group.dates) : 0;
    if (group.agents.size > 1 || (maxDate - minDate) > 15 * 60 * 1000) conflictingSales += 1;
  });

  if (conflictingSales > 0) {
    alerts.push({
      level: "high",
      title: `${conflictingSales} numéro(s) de vente réutilisé(s) de façon incohérente`,
      detail: "Le numéro peut avoir été généré simultanément sur plusieurs appareils."
    });
  }

  const invalidSaleLines = adminDashboardState.saleDocs.filter(
    (doc) => (Number(doc.quantite) || 0) <= 0 || (Number(doc.montant_total) || 0) <= 0
  ).length;
  if (invalidSaleLines > 0) {
    alerts.push({
      level: "high",
      title: `${invalidSaleLines} ligne(s) de vente avec quantité ou montant invalide`,
      detail: "Contrôler l’intégrité de la commande concernée."
    });
  }

  const missingSaleAgents = adminDashboardState.saleDocs.filter((doc) => !doc.agent_id).length;
  if (missingSaleAgents > 0) {
    alerts.push({
      level: "high",
      title: `${missingSaleAgents} ligne(s) de vente sans agent identifié`,
      detail: "La vente doit être rattachée à une session authentifiée."
    });
  }

  return alerts;
}

function renderDashboardAlerts() {
  const container = $("admin-alert-list");
  const count = $("dashboard-alert-count");
  if (!container || !count) return;

  if (!adminDashboardState.billetsLoaded || !adminDashboardState.restoLoaded) {
    count.textContent = "…";
    container.innerHTML = '<div class="empty-state">Analyse en cours…</div>';
    return;
  }

  const alerts = detectDashboardAlerts();
  count.textContent = alerts.length.toString();

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Aucune incohérence détectée sur la période. Cela ne remplace pas le contrôle de caisse.
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.slice(0, 6).map((alert) => `
    <div class="admin-alert ${alert.level === "high" ? "is-high" : ""}">
      <span class="admin-alert-dot" aria-hidden="true"></span>
      <div>
        <strong>${escapeHTML(alert.title)}</strong>
        <p>${escapeHTML(alert.detail)}</p>
      </div>
    </div>
  `).join("");
}

function renderDashboard() {
  const totalRevenue = adminDashboardState.billetsRevenue + adminDashboardState.restoRevenue;
  const revenueEl = $("dashboard-revenue-total");
  const ticketEl = $("dashboard-ticket-count");
  const orderEl = $("dashboard-order-count");

  if (revenueEl) revenueEl.textContent = formatGNF(totalRevenue);
  if (ticketEl) ticketEl.textContent = adminDashboardState.ticketCount.toString();
  if (orderEl) orderEl.textContent = adminDashboardState.orderCount.toString();

  renderAgentActivity();
  renderDashboardAlerts();
}

async function chargerRepertoireAgents() {
  try {
    const result = await CalypsoAppwrite.teams.listMemberships(
      CalypsoConfig.staffTeamId,
      [Appwrite.Query.limit(100)]
    );

    const names = {};
    (result.memberships || []).forEach((membership) => {
      if (!membership.userId) return;
      const candidate = String(membership.userName || "").trim();
      const email = String(membership.userEmail || "").trim().toLowerCase();
      if (
        candidate &&
        candidate !== membership.userId &&
        candidate.toLowerCase() !== email
      ) {
        names[membership.userId] = candidate;
      }
    });
    adminDashboardState.agentNames = names;
    renderAgentActivity();
  } catch (error) {
    console.warn("[ADMIN] Répertoire agents indisponible :", error);
  }
}

// =====================================
//  UI Connexion Admin
// =====================================

function showAdminLoginMessage(text, type) {
  const el = $("admin-login-message");
  if (!el) return;

  el.textContent = text || "";
  el.style.color =
    type === "success" ? "#16a34a" :
    type === "error"   ? "#b91c1c" :
    "#6b7280";
}

function appliquerEtatConnexionAdmin(admin) {
  currentAdmin = admin;

  const loginCard = $("admin-login-card");
  const appZone   = $("admin-app-zone");
  const nameEl    = $("admin-connected-name");
  const roleEl    = $("admin-connected-role");

  if (admin) {
    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = admin.nom || admin.login || "";
    if (roleEl) roleEl.textContent = admin.role || "";

    switchAdminMode("dashboard");

    chargerRepertoireAgents();
    chargerStatsBillets();
    chargerStatsResto();
    chargerHistoriqueReservations();
    chargerControleCaisses();
  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";

    if (nameEl) nameEl.textContent = "";
    if (roleEl) roleEl.textContent = "";

    showAdminLoginMessage("Non connecté.", "info");
  }
}

async function adminLogin() {
  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value.trim();

  if (!email || !password) {
    showAdminLoginMessage("Veuillez saisir votre e-mail et votre mot de passe.", "error");
    return;
  }

  showAdminLoginMessage("Vérification en cours...", "info");

  try {
    const agent = await CalypsoAuth.login(email, password, [
      CalypsoConfig.staffRoles.admin
    ]);

    showAdminLoginMessage("Connexion administrateur réussie.", "success");
    appliquerEtatConnexionAdmin(agent);
  } catch (err) {
    console.error("[ADMIN] Erreur connexion admin :", err);
    showAdminLoginMessage(err?.message || "Identifiants invalides.", "error");
  }
}

async function adminLogout() {
  try {
    await CalypsoAuth.logout();
  } finally {
    appliquerEtatConnexionAdmin(null);
  }
}

async function restaurerSessionAdmin() {
  try {
    const admin = await CalypsoAuth.restore([CalypsoConfig.staffRoles.admin]);
    appliquerEtatConnexionAdmin(admin);
    showAdminLoginMessage("Session restaurée.", "success");
  } catch (error) {
    appliquerEtatConnexionAdmin(null);
    if (error?.code && error.code !== 401) {
      showAdminLoginMessage(error.message, "error");
    }
  }
}

// =====================================
//  SWITCH MODE
// =====================================

function switchAdminMode(mode) {
  adminCurrentMode = mode;

  const btnDashboard = $("btnAdminModeDashboard");
  const btnSaisie = $("btnAdminModeSaisie");
  const btnGestion = $("btnAdminModeGestion");
  const zoneDashboard = $("admin-zone-dashboard");
  const zoneSaisie = $("admin-zone-saisie");
  const zoneGestion = $("admin-zone-gestion");

  if (btnDashboard) btnDashboard.classList.toggle("active", mode === "dashboard");
  if (btnSaisie) btnSaisie.classList.toggle("active", mode === "saisie");
  if (btnGestion) btnGestion.classList.toggle("active", mode === "gestion");

  if (zoneDashboard) zoneDashboard.style.display = mode === "dashboard" ? "grid" : "none";
  if (zoneSaisie) zoneSaisie.style.display = mode === "saisie" ? "block" : "none";
  if (zoneGestion) zoneGestion.style.display = mode === "gestion" ? "block" : "none";

  if (mode === "dashboard") {
    renderDashboard();
  }

  if (mode === "gestion") {
    chargerHistoriqueReservations();
    chargerControleCaisses();
  }
}

// =====================================
//  1. IMPORT CSV BILLETS
// =====================================

async function importerCSVDansBillets(file) {
  const status = $("importStatus");

  if (!file) {
    if (status) status.textContent = "Veuillez choisir un fichier CSV.";
    return;
  }

  const typeImport = getImportType();
  console.log("[ADMIN] Import type =", typeImport);

  const reader = new FileReader();

  reader.onload = async (e) => {
    const text = e.target.result;
    const lignes = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lignes.length <= 1) {
      if (status) status.textContent = "Le fichier CSV semble vide.";
      return;
    }

    const header = lignes[0].split(";").map((h) => h.trim());
    console.log("[ADMIN] En-têtes CSV :", header);

    let count = 0;

    if (typeImport === "entree") {
      const idxNumero = header.indexOf("numero_billet");
      const idxType = header.indexOf("type_acces");
      const idxPrix = header.indexOf("prix");
      const idxTarifUni = header.indexOf("tarif_universite");
      const idxStatut = header.indexOf("statut");

      if (idxNumero === -1 || idxType === -1) {
        alert("Pour les billets d'entrée, le CSV doit contenir au minimum : numero_billet;type_acces");
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeAcces = cols[idxType] ? cols[idxType].trim() : "";

        if (!numero || !typeAcces) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;

        const tarifUni =
          idxTarifUni !== -1
            ? parseInt(cols[idxTarifUni].trim() || "0", 10) || 0
            : 0;

        const statut =
          idxStatut !== -1 && cols[idxStatut]
            ? cols[idxStatut].trim()
            : "Non utilisé";

        const doc = {
          numero_billet: numero,
          type_acces: typeAcces,
          prix,
          tarif_universite: tarifUni,
          statut
        };

        try {
          await adminDB.createDocument(
            APPWRITE_DATABASE_ID,
            APPWRITE_BILLETS_TABLE_ID,
            Appwrite.ID.unique(),
            doc
          );
          count++;
        } catch (err) {
          console.error("[ADMIN] Erreur création billet entrée ligne", i, err);
        }
      }

      alert(`Import billets d'entrée terminé : ${count} billets créés.`);
    } else {
      const idxNumero = header.indexOf("numero_billet");
      const idxTypeBillet = header.indexOf("type_billet");
      const idxPrix = header.indexOf("prix");

      if (idxNumero === -1 || idxTypeBillet === -1) {
        alert("Pour les billets internes, le CSV doit contenir au minimum : numero_billet;type_billet");
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeBillet = cols[idxTypeBillet] ? cols[idxTypeBillet].trim() : "";

        if (!numero || !typeBillet) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix,
          statut: "Non utilisé"
        };

        try {
          await adminDB.createDocument(
            APPWRITE_DATABASE_ID,
            APPWRITE_BILLETS_INTERNE_TABLE_ID,
            Appwrite.ID.unique(),
            doc
          );
          count++;
        } catch (err) {
          console.error("[ADMIN] Erreur création billet interne ligne", i, err);
        }
      }

      alert(`Import billets internes terminé : ${count} billets créés.`);
    }

    console.log("[ADMIN] Import CSV terminé. Billets créés :", count);
    if (status) status.textContent = `Import terminé. Billets créés : ${count}`;
  };

  reader.readAsText(file, "UTF-8");
}

// =====================================
//  2. HISTORIQUE RESERVATIONS
// =====================================

function showReservationHistoryMessage(text, type = "info") {
  const msg = $("reservations-history-message");
  if (!msg) return;

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message message-" + type;
}

function clearReservationHistoryMessage() {
  const msg = $("reservations-history-message");
  if (!msg) return;

  msg.style.display = "none";
  msg.textContent = "";
  msg.className = "message";
}

async function chargerHistoriqueReservations() {
  const tbody = $("reservations-history-body");
  const filter = $("reservationFilter")?.value || "all";
  const startDate = $("reservationStartDate")?.value || "";
  const endDate = $("reservationEndDate")?.value || "";

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6">Chargement des réservations...</td>
    </tr>
  `;

  clearReservationHistoryMessage();

  try {
    const queries = [
      Appwrite.Query.orderDesc("$createdAt"),
      Appwrite.Query.limit(RESERVATIONS_PER_PAGE),
      Appwrite.Query.offset(reservationHistoryPage * RESERVATIONS_PER_PAGE)
    ];

    if (startDate) queries.unshift(Appwrite.Query.greaterThanEqual("date_reservation", `${startDate}T00:00:00.000Z`));
    if (endDate) queries.unshift(Appwrite.Query.lessThanEqual("date_reservation", `${endDate}T23:59:59.999Z`));

    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      queries
    );

    const allDocs = res.documents || [];
    const docs = allDocs.filter((reservation) => {
      if (filter === "active") return reservation.actif !== false;
      if (filter === "used") return reservation.actif === false;
      return true;
    });
    const pageInfo = $("reservationPageInfo");
    const prevButton = $("btnReservationPrev");
    const nextButton = $("btnReservationNext");
    if (pageInfo) pageInfo.textContent = `Page ${reservationHistoryPage + 1} · ${res.total || 0} réservation(s)`;
    if (prevButton) prevButton.disabled = reservationHistoryPage === 0;
    if (nextButton) {
      nextButton.disabled = (reservationHistoryPage + 1) * RESERVATIONS_PER_PAGE >= (res.total || 0);
    }

    if (docs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">Aucune réservation trouvée.</td>
        </tr>
      `;
      showReservationHistoryMessage("Aucune réservation pour ces dates et ce statut.", "info");
      return;
    }

    tbody.innerHTML = docs.map((r) => {
      const numero = escapeHTML(r.numero_reservation || "-");
      const client = escapeHTML(`${r.prenom || ""} ${r.nom || ""}`.trim() || "-");
      const tel = escapeHTML(r.telephone || "-");
      const activite = escapeHTML(r.activite || "-");
      const date = formatDateFR(r.date_reservation);
      const active = r.actif !== false;

      return `
        <tr>
          <td><strong>${numero}</strong></td>
          <td>${client}</td>
          <td>${tel}</td>
          <td>${activite}</td>
          <td>${date}</td>
          <td>
            <span class="${active ? "badge-success" : "badge-muted"}">
              ${active ? "Active" : "Utilisée / désactivée"}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    showReservationHistoryMessage(
      `${docs.length} réservation(s) affichée(s) sur cette page.`,
      "success"
    );
  } catch (err) {
    console.error("[ADMIN] Erreur chargement réservations :", err);

    tbody.innerHTML = `
      <tr>
        <td colspan="6">Erreur lors du chargement.</td>
      </tr>
    `;

    showReservationHistoryMessage(
      "Erreur lors du chargement des réservations.",
      "error"
    );
  }
}

// =====================================
//  CONTRÔLE COMPTABLE DES CAISSES
// =====================================

function showAdminCashMessage(text, type = "info") {
  const message = $("admin-cash-message");
  if (!message) return;
  message.textContent = text || "";
  message.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#64748b";
}

async function chargerControleCaisses() {
  const sessionsBody = $("admin-cash-sessions-body");
  const movementsBody = $("admin-cash-movements-body");
  if (!sessionsBody || !movementsBody || !currentAdmin) return;

  sessionsBody.innerHTML = '<tr><td colspan="8">Chargement…</td></tr>';
  movementsBody.innerHTML = '<tr><td colspan="7">Chargement…</td></tr>';

  try {
    const [sessionsResult, movementsResult] = await Promise.all([
      adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_SESSIONS_CAISSE_TABLE_ID, [
        Appwrite.Query.orderDesc("$createdAt"),
        Appwrite.Query.limit(100)
      ]),
      adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID, [
        Appwrite.Query.orderDesc("$createdAt"),
        Appwrite.Query.limit(100)
      ])
    ]);

    const sessions = sessionsResult.documents || [];
    sessionsBody.innerHTML = sessions.length ? sessions.map((session) => {
      const closed = session.statut === "CLOTUREE";
      const validated = Boolean(session.valide_admin_id);
      const ecart = Number(session.ecart || 0);
      return `<tr>
        <td>${escapeHTML(session.agent_nom || getAgentLabel(session.agent_id))}</td>
        <td>${escapeHTML(session.poste || "-")}</td>
        <td>${formatDateFR(session.ouverture)}</td>
        <td>${closed ? formatGNF(session.especes_attendues) : "En cours"}</td>
        <td>${closed ? formatGNF(session.especes_declarees) : "-"}</td>
        <td><span class="${ecart === 0 ? "badge-success" : "badge-warning"}">${closed ? formatGNF(ecart) : "-"}</span></td>
        <td>${validated ? "Validée admin" : closed ? "À valider" : "Ouverte"}</td>
        <td>${closed && !validated ? `<button class="btn-secondary admin-validate-cash" data-id="${session.$id}">Valider</button>` : "-"}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="8">Aucune caisse enregistrée.</td></tr>';

    const movements = movementsResult.documents || [];
    movementsBody.innerHTML = movements.length ? movements.map((movement) => {
      const pending = movement.statut === "EN_ATTENTE";
      return `<tr>
        <td>${formatDateFR(movement.date_mouvement)}</td>
        <td>${escapeHTML(getAgentLabel(movement.agent_id))}</td>
        <td>${escapeHTML(movement.type || "-")}</td>
        <td>${formatGNF(movement.montant)}</td>
        <td>${escapeHTML(movement.motif || "-")}</td>
        <td>${escapeHTML(movement.statut || "-")}</td>
        <td>${pending ? `<div class="compact-actions"><button class="btn-secondary admin-cash-movement" data-action="APPROUVE" data-id="${movement.$id}">Approuver</button><button class="btn-danger admin-cash-movement" data-action="REJETE" data-id="${movement.$id}">Refuser</button></div>` : "-"}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="7">Aucun mouvement enregistré.</td></tr>';

    showAdminCashMessage("Contrôle des caisses actualisé.", "success");
  } catch (error) {
    console.error("[ADMIN CAISSE] Chargement impossible :", error);
    sessionsBody.innerHTML = '<tr><td colspan="8">Impossible de charger les caisses.</td></tr>';
    movementsBody.innerHTML = '<tr><td colspan="7">Impossible de charger les mouvements.</td></tr>';
    showAdminCashMessage(error?.message || "Erreur de chargement.", "error");
  }
}

async function traiterActionCaisse(event) {
  const movementButton = event.target.closest(".admin-cash-movement");
  const sessionButton = event.target.closest(".admin-validate-cash");
  if (!movementButton && !sessionButton) return;

  try {
    if (movementButton) {
      await adminDB.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID,
        movementButton.dataset.id,
        { statut: movementButton.dataset.action, approbateur_id: currentAdmin.$id }
      );
    } else {
      await adminDB.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_SESSIONS_CAISSE_TABLE_ID,
        sessionButton.dataset.id,
        { valide_admin_id: currentAdmin.$id }
      );
    }
    await chargerControleCaisses();
  } catch (error) {
    console.error("[ADMIN CAISSE] Action impossible :", error);
    showAdminCashMessage(error?.message || "Action impossible.", "error");
  }
}

// =====================================
//  3. STATS : gestion de la période
// =====================================

function getSelectedPeriod() {
  const select = $("statsPeriod");
  const mode = select ? select.value : "week";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start = new Date(today);
  let end = new Date(today);
  end.setDate(end.getDate() + 1);

  if (mode === "yesterday") {
    start.setDate(today.getDate() - 1);
    end = new Date(today);
  } else if (mode === "last7") {
    start.setDate(today.getDate() - 6);
  } else if (mode === "week") {
    const day = today.getDay();
    const diff = (day + 6) % 7;
    start = new Date(today);
    start.setDate(today.getDate() - diff);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else if (mode === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else if (mode === "custom") {
    const startInput = $("statsStartDate");
    const endInput = $("statsEndDate");

    if (!startInput?.value || !endInput?.value) {
      return { error: "custom-missing" };
    }

    start = new Date(startInput.value + "T00:00:00");
    end = new Date(endInput.value + "T00:00:00");
    end.setDate(end.getDate() + 1);
  }

  return { start, end, mode };
}

// =====================================
//  4. STATS BILLETS
// =====================================

async function chargerStatsBillets() {
  const msg = $("stats-message-billets");

  if (msg) {
    msg.style.display = "block";
    msg.textContent = "Chargement des stats billets...";
    msg.className = "message message-info";
  }

  const period = getSelectedPeriod();

  if (period.error === "custom-missing") {
    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Veuillez choisir une période personnalisée.";
      msg.className = "message message-warning";
    }
    return;
  }

  const { start, end } = period;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [
        Appwrite.Query.greaterThanEqual("date_validation", startIso),
        Appwrite.Query.lessThan("date_validation", endIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const docs = res.documents || [];
    const ventes = docs.filter((doc) => ["ENTREE", "VENTE_ENTREE", "INTERNE"].includes(doc.poste_id));
    const confirmations = docs.filter((doc) => doc.poste_id === "CONTROLE_ENTREE");
    const confirmationsNumbers = new Set(confirmations.map((doc) => doc.numero_billet).filter(Boolean));
    const ventesEntree = ventes.filter((doc) => doc.poste_id === "VENTE_ENTREE");
    const nonConfirmees = ventesEntree.filter((doc) => !confirmationsNumbers.has(doc.numero_billet));
    const totalValidations = ventes.length;

    let recetteTotale = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;

    const parType = {};

    const paiements = { especes: 0, orange_money: 0, mtn_money: 0 };

    ventes.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") recetteNormal += montant;
      else if (d.tarif_applique === "etudiant") recetteEtudiant += montant;

      const type = d.type_acces || "Non renseigné";
      if (!parType[type]) parType[type] = { count: 0, montant: 0 };

      parType[type].count += 1;
      parType[type].montant += montant;
      const moyen = d.moyen_paiement || "especes";
      if (Object.hasOwn(paiements, moyen)) paiements[moyen] += montant;
    });

    adminDashboardState.validationDocs = docs;
    adminDashboardState.billetsRevenue = recetteTotale;
    adminDashboardState.ticketCount = totalValidations;
    adminDashboardState.billetsLoaded = true;
    renderDashboard();

    if ($("stat-validations-count")) $("stat-validations-count").textContent = totalValidations.toString();
    if ($("stat-confirmations-count")) $("stat-confirmations-count").textContent = confirmations.length.toString();
    if ($("stat-unconfirmed-count")) $("stat-unconfirmed-count").textContent = nonConfirmees.length.toString();
    if ($("stat-revenue-total")) $("stat-revenue-total").textContent = formatGNF(recetteTotale);
    if ($("stat-revenue-normal")) $("stat-revenue-normal").textContent = formatGNF(recetteNormal);
    if ($("stat-revenue-etudiant")) $("stat-revenue-etudiant").textContent = formatGNF(recetteEtudiant);
    if ($("stat-payment-cash")) $("stat-payment-cash").textContent = formatGNF(paiements.especes);
    if ($("stat-payment-orange")) $("stat-payment-orange").textContent = formatGNF(paiements.orange_money);
    if ($("stat-payment-mtn")) $("stat-payment-mtn").textContent = formatGNF(paiements.mtn_money);

    const tbody = $("stats-type-body");

    if (tbody) {
      const types = Object.keys(parType);

      if (types.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3">Aucune validation pour cette période.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = types.map((type) => `
          <tr>
            <td>${escapeHTML(type)}</td>
            <td>${parType[type].count}</td>
            <td>${formatGNF(parType[type].montant)}</td>
          </tr>
        `).join("");
      }
    }

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Stats billets mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    adminDashboardState.billetsLoaded = false;
    renderDashboard();
    console.error("[ADMIN] Erreur chargement stats billets :", err);

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Erreur lors du chargement des stats billets.";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  5. STATS RESTAURATION
// =====================================

let restoMenuCache = null;

async function chargerMenuRestoPourStats() {
  if (restoMenuCache) return restoMenuCache;

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [Appwrite.Query.limit(200)]
    );

    restoMenuCache = res.documents || [];
    return restoMenuCache;
  } catch (err) {
    console.warn("[ADMIN] Impossible de charger le menu resto pour les stats :", err);
    restoMenuCache = [];
    return restoMenuCache;
  }
}

async function chargerStatsResto() {
  const msg = $("stats-message-resto");

  if (msg) {
    msg.style.display = "block";
    msg.textContent = "Chargement des stats restauration...";
    msg.className = "message message-info";
  }

  const period = getSelectedPeriod();

  if (period.error === "custom-missing") {
    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Veuillez choisir une période personnalisée.";
      msg.className = "message message-warning";
    }
    return;
  }

  const { start, end } = period;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.greaterThanEqual("date_vente", startIso),
        Appwrite.Query.lessThan("date_vente", endIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const docs = res.documents || [];

    const numeros = new Set();
    let totalPlats = 0;
    let totalMontant = 0;

    const parProduit = {};

    docs.forEach((d) => {
      const numeroVente = d.numero_vente || d.$id;
      numeros.add(numeroVente);

      const qte = parseInt(d.quantite || 0, 10) || 0;
      const montant = parseInt(d.montant_total || 0, 10) || 0;

      totalPlats += qte;
      totalMontant += montant;

      const code = d.code_produit || "N/A";
      if (!parProduit[code]) parProduit[code] = { qte: 0, montant: 0 };

      parProduit[code].qte += qte;
      parProduit[code].montant += montant;
    });

    adminDashboardState.saleDocs = docs;
    adminDashboardState.restoRevenue = totalMontant;
    adminDashboardState.orderCount = numeros.size;
    adminDashboardState.restoLoaded = true;
    renderDashboard();

    if ($("stat-resto-tickets")) $("stat-resto-tickets").textContent = numeros.size.toString();
    if ($("stat-resto-plates")) $("stat-resto-plates").textContent = totalPlats.toString();
    if ($("stat-resto-total")) $("stat-resto-total").textContent = formatGNF(totalMontant);

    const menu = await chargerMenuRestoPourStats();
    const libellesByCode = {};

    menu.forEach((p) => {
      libellesByCode[p.code_produit] = p.libelle || p.code_produit;
    });

    const tbody = $("stats-resto-body");

    if (tbody) {
      const codes = Object.keys(parProduit);

      if (codes.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4">Aucune vente restauration pour cette période.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = codes.map((code) => `
          <tr>
            <td>${escapeHTML(code)}</td>
            <td>${escapeHTML(libellesByCode[code] || "")}</td>
            <td>${parProduit[code].qte}</td>
            <td>${formatGNF(parProduit[code].montant)}</td>
          </tr>
        `).join("");
      }
    }

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Stats restauration mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    adminDashboardState.restoLoaded = false;
    renderDashboard();
    console.error("[ADMIN] Erreur chargement stats restauration :", err);

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Erreur lors du chargement des stats restauration.";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  6. Nettoyage des BILLETS
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\nLes validations NE seront PAS effacées."
  );

  if (!ok) return;

  try {
    const billetsRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const billets = billetsRes.documents || [];

    for (const b of billets) {
      try {
        await adminDB.deleteDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_BILLETS_TABLE_ID,
          b.$id
        );
      } catch (err) {
        console.error("[ADMIN] Erreur suppression billet", b.$id, err);
      }
    }

    const biRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const billetsInt = biRes.documents || [];

    for (const bi of billetsInt) {
      try {
        await adminDB.deleteDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_BILLETS_INTERNE_TABLE_ID,
          bi.$id
        );
      } catch (err) {
        console.error("[ADMIN] Erreur suppression billet interne", bi.$id, err);
      }
    }

    alert("Tous les billets ont été supprimés. Les validations sont conservées.");
  } catch (err) {
    console.error("[ADMIN] Erreur lors du nettoyage des billets :", err);
    alert("Erreur lors du nettoyage.");
  }
}

// =====================================
//  7. SAISIE : étudiants & agents
// =====================================

function showAdminEtuMessage(text, type) {
  const msg = $("admin-etu-message");

  if (!msg) {
    alert(text);
    return;
  }

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message";

  if (type === "success") msg.classList.add("message-success");
  else if (type === "error") msg.classList.add("message-error");
  else msg.classList.add("message-info");
}

function showAdminAgentMessage(text, type) {
  const msg = $("admin-agent-message");
  if (!msg) return;

  msg.textContent = text;
  msg.className = "status";

  if (type === "success") msg.style.color = "#16a34a";
  else if (type === "error") msg.style.color = "#b91c1c";
  else msg.style.color = "#6b7280";
}

function genererNumeroEtudiant(universite) {
  const clean = (universite || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  const codeEcole = clean.slice(0, 2) || "XX";
  const randomDigits = Math.floor(1000 + Math.random() * 9000);

  return `UNIV-${codeEcole}-${randomDigits}`;
}

async function creerEtudiantDepuisAdmin() {
  const univEl = $("admin-etu-universite");
  const nomEl = $("admin-etu-nom");
  const preEl = $("admin-etu-prenom");
  const mailEl = $("admin-etu-email");
  const telEl = $("admin-etu-telephone");
  const actEl = $("admin-etu-actif");

  if (!univEl || !nomEl || !preEl) {
    alert("Problème de configuration du formulaire étudiant.");
    return;
  }

  const universite = univEl.value.trim();
  const nom = nomEl.value.trim();
  const prenom = preEl.value.trim();
  const email = (mailEl?.value || "").trim();
  const telephone = (telEl?.value || "").trim();
  const actif = !!(actEl && actEl.checked);

  if (!universite || !nom || !prenom) {
    showAdminEtuMessage("Veuillez remplir au minimum université, nom et prénom.", "error");
    return;
  }

  const numero = genererNumeroEtudiant(universite);

  try {
    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_etudiant: numero,
        nom,
        prenom,
        universite,
        "e-mail": email || null,
        telephone: telephone || null,
        actif,
        date_creation: new Date().toISOString()
      }
    );

    showAdminEtuMessage(
      `Étudiant enregistré avec succès. Numéro généré : ${numero}`,
      "success"
    );

    univEl.value = "";
    nomEl.value = "";
    preEl.value = "";
    if (mailEl) mailEl.value = "";
    if (telEl) telEl.value = "";
    if (actEl) actEl.checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création étudiant :", err);
    showAdminEtuMessage("Erreur lors de l'enregistrement de l'étudiant.", "error");
  }
}

async function creerAgentDepuisAdmin() {
  const emailEl = $("admin-agent-email");
  const prenomEl = $("admin-agent-prenom");
  const nomEl = $("admin-agent-nom");
  const roleEls = document.querySelectorAll(".admin-agent-role:checked");

  const email = emailEl?.value.trim();
  const prenom = prenomEl?.value.trim() || "";
  const nom = nomEl?.value.trim() || "";
  const roles = [...roleEls].map((element) => element.value);

  if (!email || !prenom || !nom || roles.length === 0) {
    showAdminAgentMessage(
      "Veuillez saisir l’e-mail, le prénom, le nom et au moins un rôle.",
      "error"
    );
    return;
  }

  try {
    await CalypsoAuth.inviteStaff({ email, prenom, nom, roles });

    showAdminAgentMessage(
      "Invitation envoyée. L’agent devra l’accepter puis définir son mot de passe.",
      "success"
    );

    if (emailEl) emailEl.value = "";
    if (prenomEl) prenomEl.value = "";
    if (nomEl) nomEl.value = "";
    roleEls.forEach((element) => {
      element.checked = false;
    });
  } catch (err) {
    console.error("[ADMIN] Erreur invitation agent :", err);
    showAdminAgentMessage(err?.message || "Erreur lors de l'invitation.", "error");
  }
}

// =====================================
//  8. Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[ADMIN] DOMContentLoaded");

  const btnAdminLogin = $("btnAdminLogin");
  const btnAdminLogout = $("btnAdminLogout");

  if (btnAdminLogin) {
    btnAdminLogin.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogin();
    });
  }

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogout();
    });
  }

  const btnDashboard = $("btnAdminModeDashboard");
  const btnSaisie = $("btnAdminModeSaisie");
  const btnGestion = $("btnAdminModeGestion");

  if (btnDashboard) {
    btnDashboard.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("dashboard");
    });
  }

  if (btnSaisie) {
    btnSaisie.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("saisie");
    });
  }

  if (btnGestion) {
    btnGestion.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("gestion");
    });
  }

  const btnDashboardRefresh = $("btnDashboardRefresh");
  const btnDashboardGoStats = $("btnDashboardGoStats");

  if (btnDashboardRefresh) {
    btnDashboardRefresh.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsBillets();
      chargerStatsResto();
      chargerHistoriqueReservations();
      chargerControleCaisses();
      chargerRepertoireAgents();
    });
  }

  if (btnDashboardGoStats) {
    btnDashboardGoStats.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("gestion");
      $("admin-statistics")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const btnImportCsv = $("btnImportCsv");
  const csvInput = $("csvFile");

  if (btnImportCsv && csvInput) {
    btnImportCsv.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  const refreshStatsBtn = $("refreshStatsBtn");

  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsBillets();
      chargerStatsResto();
    });
  }

  const statsPeriodSelect = $("statsPeriod");
  const customRange = $("stats-custom-range");

  if (statsPeriodSelect && customRange) {
    const toggleCustomRange = () => {
      customRange.style.display =
        statsPeriodSelect.value === "custom" ? "flex" : "none";
    };

    statsPeriodSelect.addEventListener("change", toggleCustomRange);
    toggleCustomRange();
  }

  const billetsPanel = $("stats-billets-panel");
  const restoPanel = $("stats-resto-panel");

  const modeBillets = $("statsModeBillets");
  const modeResto = $("statsModeResto");

  const infoBillets = $("stats-info-billets");
  const infoResto = $("stats-info-resto");

  const updateStatsMode = () => {
    const mode = modeResto && modeResto.checked ? "resto" : "billets";

    if (billetsPanel) billetsPanel.style.display = mode === "billets" ? "block" : "none";
    if (restoPanel) restoPanel.style.display = mode === "resto" ? "block" : "none";

    if (infoBillets) infoBillets.style.display = mode === "billets" ? "block" : "none";
    if (infoResto) infoResto.style.display = mode === "resto" ? "block" : "none";
  };

  if (modeBillets && modeResto) {
    modeBillets.addEventListener("change", updateStatsMode);
    modeResto.addEventListener("change", updateStatsMode);
    updateStatsMode();
  }

  const btnRefreshReservations = $("btnRefreshReservations");
  const reservationFilter = $("reservationFilter");
  const reservationStartDate = $("reservationStartDate");
  const reservationEndDate = $("reservationEndDate");
  const btnResetReservationDates = $("btnResetReservationDates");
  const btnReservationPrev = $("btnReservationPrev");
  const btnReservationNext = $("btnReservationNext");
  const btnRefreshCashAdmin = $("btnRefreshCashAdmin");
  const adminCashControl = $("admin-cash-control");

  btnRefreshCashAdmin?.addEventListener("click", chargerControleCaisses);
  adminCashControl?.addEventListener("click", traiterActionCaisse);

  if (btnRefreshReservations) {
    btnRefreshReservations.addEventListener("click", (e) => {
      e.preventDefault();
      reservationHistoryPage = 0;
      chargerHistoriqueReservations();
    });
  }

  if (reservationFilter) {
    reservationFilter.addEventListener("change", () => {
      reservationHistoryPage = 0;
      chargerHistoriqueReservations();
    });
  }

  [reservationStartDate, reservationEndDate].forEach((input) => {
    input?.addEventListener("change", () => {
      reservationHistoryPage = 0;
      chargerHistoriqueReservations();
    });
  });

  btnResetReservationDates?.addEventListener("click", () => {
    if (reservationStartDate) reservationStartDate.value = "";
    if (reservationEndDate) reservationEndDate.value = "";
    reservationHistoryPage = 0;
    chargerHistoriqueReservations();
  });

  btnReservationPrev?.addEventListener("click", () => {
    if (reservationHistoryPage > 0) reservationHistoryPage -= 1;
    chargerHistoriqueReservations();
  });

  btnReservationNext?.addEventListener("click", () => {
    reservationHistoryPage += 1;
    chargerHistoriqueReservations();
  });

  const clearDataBtn = $("clearDataBtn");

  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      effacerTousLesBillets();
    });
  }

  const btnCreateEtudiant = $("btnCreateEtudiant");
  const btnCreateAgent = $("btnCreateAgent");

  if (btnCreateEtudiant) {
    btnCreateEtudiant.addEventListener("click", (e) => {
      e.preventDefault();
      creerEtudiantDepuisAdmin();
    });
  }

  if (btnCreateAgent) {
    btnCreateAgent.addEventListener("click", (e) => {
      e.preventDefault();
      creerAgentDepuisAdmin();
    });
  }

  restaurerSessionAdmin();
});
