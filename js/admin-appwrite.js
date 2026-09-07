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
let adminLoginRequestInProgress = false;
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
  cashSessionsLoaded: false,
  cashSessionDocs: [],
  agentNames: {}
};

function getAgentLabel(agentId) {
  if (!agentId) return "Agent non identifié";
  return adminDashboardState.agentNames[agentId] || `Profil à compléter · …${agentId.slice(-6)}`;
}

function getDocumentDay(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeFR(value, fallback = "-") {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function buildAgentAlertCounts() {
  const counts = new Map();
  const keyFor = (doc, dateField) => `${getDocumentDay(doc[dateField] || doc.$createdAt)}|${doc.agent_id || "unknown"}`;
  const add = (doc, dateField, amount = 1) => {
    const key = keyFor(doc, dateField);
    counts.set(key, (counts.get(key) || 0) + amount);
  };
  const salesByTicket = new Map();
  const confirmationsByTicket = new Map();

  adminDashboardState.validationDocs.forEach((doc) => {
    const ticket = doc.numero_billet || "";
    if (ticket && ["ENTREE", "VENTE_ENTREE"].includes(doc.poste_id)) {
      if (!salesByTicket.has(ticket)) salesByTicket.set(ticket, []);
      salesByTicket.get(ticket).push(doc);
    }
    if (ticket && doc.poste_id === "CONTROLE_ENTREE") {
      if (!confirmationsByTicket.has(ticket)) confirmationsByTicket.set(ticket, []);
      confirmationsByTicket.get(ticket).push(doc);
    }
    if (!doc.agent_id) add(doc, "date_validation");
    if (doc.poste_id !== "CONTROLE_ENTREE" && (Number(doc.montant_paye) || 0) <= 0) {
      add(doc, "date_validation");
    }
  });

  salesByTicket.forEach((sales, ticket) => {
    if (sales.length > 1) sales.forEach((doc) => add(doc, "date_validation"));
    if (!confirmationsByTicket.has(ticket)) sales.forEach((doc) => add(doc, "date_validation"));
  });
  confirmationsByTicket.forEach((confirmations, ticket) => {
    if (confirmations.length > 1) confirmations.forEach((doc) => add(doc, "date_validation"));
    if (!salesByTicket.has(ticket)) confirmations.forEach((doc) => add(doc, "date_validation"));
  });

  adminDashboardState.saleDocs.forEach((doc) => {
    if (!doc.agent_id || (Number(doc.quantite) || 0) <= 0 || (Number(doc.montant_total) || 0) <= 0) {
      add(doc, "date_vente");
    }
  });
  return counts;
}

function renderAgentActivity() {
  const tbody = $("dashboard-agent-body");
  if (!tbody) return;

  if (!adminDashboardState.billetsLoaded || !adminDashboardState.cashSessionsLoaded) {
    tbody.innerHTML = '<tr><td colspan="9">Chargement du journal…</td></tr>';
    return;
  }

  const journal = new Map();
  const ensureRow = (day, agentId) => {
    const key = `${day}|${agentId || "unknown"}`;
    if (!journal.has(key)) {
      journal.set(key, {
        key,
        day,
        agentId,
        openings: [],
        closings: [],
        openingFloat: 0,
        tickets: 0,
        entryRevenue: 0,
        internalRevenue: 0,
        alerts: 0
      });
    }
    return journal.get(key);
  };

  adminDashboardState.cashSessionDocs.forEach((session) => {
    const day = getDocumentDay(session.ouverture || session.$createdAt);
    if (!day) return;
    const row = ensureRow(day, session.agent_id);
    if (session.ouverture || session.$createdAt) row.openings.push(session.ouverture || session.$createdAt);
    if (session.fermeture) row.closings.push(session.fermeture);
    row.openingFloat += Number(session.fonds_depart || 0);
    if (session.statut === "OUVERTE") row.isOpen = true;
  });

  adminDashboardState.validationDocs.forEach((doc) => {
    if (!["VENTE_ENTREE", "ENTREE", "INTERNE"].includes(doc.poste_id)) return;
    const day = getDocumentDay(doc.date_validation || doc.$createdAt);
    if (!day) return;
    const row = ensureRow(day, doc.agent_id);
    row.tickets += 1;
    if (doc.poste_id === "INTERNE") row.internalRevenue += Number(doc.montant_paye) || 0;
    else row.entryRevenue += Number(doc.montant_paye) || 0;
  });

  const alertCounts = buildAgentAlertCounts();
  journal.forEach((row) => { row.alerts = alertCounts.get(row.key) || 0; });
  const rows = [...journal.values()].sort((a, b) => b.day.localeCompare(a.day) || getAgentLabel(a.agentId).localeCompare(getAgentLabel(b.agentId), "fr"));

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">Aucune activité pour cette période.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDateFR(`${row.day}T12:00:00`)}</td>
      <td>${row.openings.length ? formatTimeFR(row.openings.sort()[0]) : "-"}</td>
      <td>${row.isOpen ? "En cours" : row.closings.length ? formatTimeFR(row.closings.sort()[row.closings.length - 1]) : row.openings.length ? "En cours" : "-"}</td>
      <td>${escapeHTML(getAgentLabel(row.agentId))}</td>
      <td>${row.openings.length ? formatGNF(row.openingFloat) : "-"}</td>
      <td>${row.tickets}</td>
      <td>${formatGNF(row.entryRevenue)}</td>
      <td>${formatGNF(row.internalRevenue)}</td>
      <td><span class="${row.alerts ? "badge-warning" : "badge-success"}">${row.alerts}</span></td>
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
  const agentList = (ids) => {
    const labels = [...new Set((ids || []).filter(Boolean).map(getAgentLabel))];
    return labels.length ? ` Agent(s) : ${labels.join(", ")}.` : " Agent non identifié.";
  };

  adminDashboardState.validationDocs.forEach((doc) => {
    const ticket = doc.numero_billet || "";
    if (ticket && ["ENTREE", "VENTE_ENTREE"].includes(doc.poste_id)) {
      const group = salesByTicket.get(ticket) || { count: 0, agents: [] };
      group.count += 1;
      group.agents.push(doc.agent_id);
      salesByTicket.set(ticket, group);
      if (doc.poste_id === "VENTE_ENTREE") pendingSalesByTicket.add(ticket);
    }
    if (ticket && doc.poste_id === "CONTROLE_ENTREE") {
      const group = confirmationsByTicket.get(ticket) || { count: 0, agents: [] };
      group.count += 1;
      group.agents.push(doc.agent_id);
      confirmationsByTicket.set(ticket, group);
    }

    const student = doc.numero_etudiant || "";
    if (student) {
      const day = String(doc.date_validation || doc.$createdAt || "").slice(0, 10);
      const key = `${student}|${day}`;
      studentsByDay.set(key, (studentsByDay.get(key) || 0) + 1);
    }
  });

  const duplicateTicketGroups = [...salesByTicket.values()].filter((group) => group.count > 1);
  if (duplicateTicketGroups.length > 0) {
    alerts.push({
      level: "high",
      title: `${duplicateTicketGroups.length} billet(s) vendu(s) plusieurs fois`,
      detail: `Vérifier le journal de vente et l’état réel des billets.${agentList(duplicateTicketGroups.flatMap((group) => group.agents))}`
    });
  }

  const duplicateConfirmationGroups = [...confirmationsByTicket.values()].filter((group) => group.count > 1);
  if (duplicateConfirmationGroups.length > 0) {
    alerts.push({
      level: "high",
      title: `${duplicateConfirmationGroups.length} double(s) confirmation(s) d’entrée`,
      detail: `Contrôler les numéros concernés.${agentList(duplicateConfirmationGroups.flatMap((group) => group.agents))}`
    });
  }

  const unconfirmed = [...pendingSalesByTicket].filter((ticket) => !confirmationsByTicket.has(ticket)).length;
  if (unconfirmed > 0) {
    const agents = [...pendingSalesByTicket]
      .filter((ticket) => !confirmationsByTicket.has(ticket))
      .flatMap((ticket) => salesByTicket.get(ticket)?.agents || []);
    alerts.push({
      level: "medium",
      title: `${unconfirmed} billet(s) vendu(s) sans entrée confirmée`,
      detail: `À vérifier ; cela ne signifie pas automatiquement un vol.${agentList(agents)}`
    });
  }

  const confirmationsWithoutSale = [...confirmationsByTicket.keys()].filter((ticket) => !salesByTicket.has(ticket)).length;
  if (confirmationsWithoutSale > 0) {
    const agents = [...confirmationsByTicket.keys()]
      .filter((ticket) => !salesByTicket.has(ticket))
      .flatMap((ticket) => confirmationsByTicket.get(ticket)?.agents || []);
    alerts.push({
      level: "high",
      title: `${confirmationsWithoutSale} entrée(s) sans vente correspondante`,
      detail: `Anomalie importante : rapprocher le billet et la caisse.${agentList(agents)}`
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
    const result = await CalypsoData.cache.read("staff-names", () => CalypsoAppwrite.teams.listMemberships(
      CalypsoConfig.staffTeamId, [Appwrite.Query.limit(100)]
    ), 300000);

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

let dashboardRequest = 0;
async function chargerTableauDeBord() {
  if (!$("dashboardPeriod")?.value) {
    adminDashboardState.billetsLoaded = false;
    adminDashboardState.restoLoaded = false;
    adminDashboardState.cashSessionsLoaded = false;
    adminDashboardState.validationDocs = [];
    adminDashboardState.saleDocs = [];
    adminDashboardState.cashSessionDocs = [];
    ["dashboard-revenue-total", "dashboard-ticket-count", "dashboard-order-count", "dashboard-alert-count"].forEach((id) => {
      if ($(id)) $(id).textContent = "—";
    });
    const body = $("dashboard-agent-body");
    if (body) body.innerHTML = '<tr><td colspan="9">Choisissez une période pour afficher le journal.</td></tr>';
    const alerts = $("admin-alert-list");
    if (alerts) alerts.innerHTML = '<div class="empty-state">Choisissez une période pour lancer les contrôles.</div>';
    return;
  }
  const request = ++dashboardRequest;
  const period = getSelectedPeriod("dashboardPeriod");
  if (period.error) return;
  adminDashboardState.billetsLoaded = false; adminDashboardState.restoLoaded = false; adminDashboardState.cashSessionsLoaded = false;
  renderDashboard(); chargerRepertoireAgents();
  const range = field => [Appwrite.Query.greaterThanEqual(field, period.start.toISOString()), Appwrite.Query.lessThan(field, period.end.toISOString())];
  try {
    const [tickets, resto, sessions] = await Promise.all([
      CalypsoData.cachedList(adminDB, APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, range("date_validation")),
      CalypsoData.cachedList(adminDB, APPWRITE_DATABASE_ID, APPWRITE_VENTES_RESTO_COLLECTION_ID, range("date_vente")),
      CalypsoData.cachedList(adminDB, APPWRITE_DATABASE_ID, APPWRITE_SESSIONS_CAISSE_TABLE_ID, range("$createdAt"))
    ]);
    if (request !== dashboardRequest) return;
    const sales = tickets.documents.filter(d => ["VENTE_ENTREE", "ENTREE", "INTERNE"].includes(d.poste_id));
    Object.assign(adminDashboardState, { validationDocs: tickets.documents, saleDocs: resto.documents, cashSessionDocs: sessions.documents,
      billetsRevenue: sales.reduce((sum, d) => sum + Number(d.montant_paye || 0), 0), ticketCount: sales.length,
      restoRevenue: resto.documents.reduce((sum, d) => sum + Number(d.montant_total || 0), 0),
      orderCount: new Set(resto.documents.map(d => d.numero_vente || d.$id)).size, billetsLoaded: true, restoLoaded: true, cashSessionsLoaded: true });
    sessions.documents.forEach(d => { if (d.agent_id && d.agent_nom && !adminDashboardState.agentNames[d.agent_id]) adminDashboardState.agentNames[d.agent_id] = d.agent_nom; });
    renderDashboard();
  } catch (error) {
    if (request !== dashboardRequest) return;
    const body = $("dashboard-agent-body"); if (body) body.innerHTML = '<tr><td colspan="9">' + escapeHTML(CalypsoData.errorMessage(error, "Lecture du journal")) + '</td></tr>';
    const alerts = $("admin-alert-list"); if (alerts) alerts.textContent = "Données incomplètes : les alertes ne peuvent pas être calculées.";
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

    if ($("statsPeriod")) $("statsPeriod").value = "today";
    switchAdminMode("dashboard");

  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";

    if (nameEl) nameEl.textContent = "";
    if (roleEl) roleEl.textContent = "";

    showAdminLoginMessage("Non connecté.", "info");
  }
}

async function adminLogin() {
  if (adminLoginRequestInProgress) return;
  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value || "";
  const button = $("btnAdminLogin");

  if (!email || !password) {
    showAdminLoginMessage("Veuillez saisir votre e-mail et votre mot de passe.", "error");
    return;
  }

  showAdminLoginMessage("Vérification en cours...", "info");
  adminLoginRequestInProgress = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Connexion…";
  }

  try {
    const agent = await CalypsoAuth.login(email, password, [
      CalypsoConfig.staffRoles.admin
    ]);

    showAdminLoginMessage("Connexion administrateur réussie.", "success");
    appliquerEtatConnexionAdmin(agent);
  } catch (err) {
    console.error("[ADMIN] Erreur connexion admin :", err);
    const limited = err?.code === 429 || /rate limit/i.test(err?.message || "");
    showAdminLoginMessage(
      limited
        ? "Trop de tentatives rapprochées. Attendez quelques minutes, puis cliquez une seule fois sur Se connecter."
        : err?.message || "Identifiants invalides.",
      "error"
    );
  } finally {
    adminLoginRequestInProgress = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Se connecter";
    }
  }
}

async function adminLogout() {
  try {
    await CalypsoAuth.logout();
  } finally {
    sessionStorage.removeItem("calypso_access_granted");
    window.location.replace("connexion.html");
  }
}

async function restaurerSessionAdmin() {
  try {
    const admin = await CalypsoAuth.restore([CalypsoConfig.staffRoles.admin]);
    appliquerEtatConnexionAdmin(admin);
    showAdminLoginMessage("Session restaurée.", "success");
  } catch (error) {
    sessionStorage.removeItem("calypso_access_granted");
    window.location.replace("connexion.html");
  }
}

// =====================================
//  SWITCH MODE
// =====================================

function switchAdminMode(mode) {
  adminCurrentMode = mode;

  const btnDashboard = $("btnAdminModeDashboard");
  const btnTeam = $("btnAdminModeTeam");
  const btnHistory = $("btnAdminModeHistory");
  const btnTickets = $("btnAdminModeTickets");
  const zoneDashboard = $("admin-zone-dashboard");
  const zoneTeam = $("admin-zone-team");
  const zoneGestion = $("admin-zone-gestion");
  const historySections = ["admin-statistics", "admin-reservations", "admin-accounting-corrections", "admin-conservation-card"];
  const ticketSections = ["admin-ticket-management"];

  if (btnDashboard) btnDashboard.classList.toggle("active", mode === "dashboard");
  if (btnTeam) btnTeam.classList.toggle("active", mode === "team");
  if (btnHistory) btnHistory.classList.toggle("active", mode === "history");
  if (btnTickets) btnTickets.classList.toggle("active", mode === "tickets");

  if (zoneDashboard) zoneDashboard.style.display = mode === "dashboard" ? "grid" : "none";
  if (zoneTeam) zoneTeam.style.display = mode === "team" ? "block" : "none";
  if (zoneGestion) zoneGestion.style.display = ["history", "tickets"].includes(mode) ? "block" : "none";
  historySections.forEach((id) => { if ($(id)) $(id).style.display = mode === "history" ? "block" : "none"; });
  ticketSections.forEach((id) => { if ($(id)) $(id).style.display = mode === "tickets" ? "block" : "none"; });

  if (mode === "dashboard") {
    chargerTableauDeBord();
  }

}

let ticketManagementPage = 0;
const TICKETS_PER_PAGE = 100;
function getTicketManagementContext() {
  const kind = $("ticketManagementType")?.value || "entree";
  return { kind, tableId: kind === "interne" ? APPWRITE_BILLETS_INTERNE_TABLE_ID : APPWRITE_BILLETS_TABLE_ID };
}

function showTicketsMessage(text, type = "info") {
  const message = $("admin-tickets-message");
  if (!message) return;
  message.textContent = text || "";
  message.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#64748b";
}

async function chargerBilletsGestion() {
  const body = $("admin-tickets-body");
  if (!body) return;
  try {
    const context = getTicketManagementContext();
    body.innerHTML = '<tr><td colspan="6">Chargement…</td></tr>';
    const result = await adminDB.listDocuments(APPWRITE_DATABASE_ID, context.tableId, [
      Appwrite.Query.orderAsc("$id"),
      Appwrite.Query.offset(ticketManagementPage * TICKETS_PER_PAGE),
      Appwrite.Query.limit(TICKETS_PER_PAGE)
    ]);
    $("ticketsPageInfo").textContent = `Page ${ticketManagementPage + 1} · ${result.total} billets`;
    $("btnTicketsPrev").disabled = ticketManagementPage === 0;
    $("btnTicketsNext").disabled = (ticketManagementPage + 1) * TICKETS_PER_PAGE >= result.total;
    const docs = [...(result.documents || [])].sort((a, b) => String(a.numero_billet || "").localeCompare(String(b.numero_billet || ""), "fr", { numeric: true }));
    body.innerHTML = docs.length ? docs.map((ticket) => {
      const unused = CalypsoTicketWorkflow.canSell(ticket.statut);
      const type = ticket.type_acces || ticket.type_billet || ticket.code_offre || "-";
      return `<tr>
        <td>${escapeHTML(ticket.numero_billet)}</td>
        <td>${escapeHTML(type)}</td>
        <td>${formatGNF(ticket.prix)}</td>
        <td>${context.kind === "entree" ? formatGNF(ticket.tarif_universite) : "-"}</td>
        <td><span class="${unused ? "badge-success" : "badge-muted"}">${escapeHTML(ticket.statut || "Non utilisé")}</span></td>
        <td>${unused ? `<div class="compact-actions"><button type="button" class="btn-secondary admin-edit-ticket" data-id="${ticket.$id}">Modifier</button><button type="button" class="btn-danger admin-delete-ticket" data-id="${ticket.$id}">Supprimer</button></div>` : "Conservé (déjà utilisé)"}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="6">Aucun billet dans ce stock.</td></tr>';
    body.dataset.kind = context.kind;
    body.dataset.tableId = context.tableId;
    body.dataset.documents = JSON.stringify(docs.map((ticket) => ({
      id: ticket.$id,
      numero: ticket.numero_billet,
      type: ticket.type_acces || ticket.type_billet || ticket.code_offre || "",
      prix: Number(ticket.prix || 0),
      tarif: Number(ticket.tarif_universite || 0),
      statut: ticket.statut || "Non utilisé"
    })));
    const unusedCount = docs.filter((ticket) => CalypsoTicketWorkflow.canSell(ticket.statut)).length;
    const bulkDeleteButton = $("btnDeleteDisplayedTickets");
    if (bulkDeleteButton) bulkDeleteButton.disabled = unusedCount === 0;
    showTicketsMessage(`${docs.length} billet(s) affiché(s), dont ${unusedCount} inutilisé(s).`, "success");
  } catch (error) {
    body.innerHTML = '<tr><td colspan="6">Choisissez le type, puis affichez les billets.</td></tr>';
    const bulkDeleteButton = $("btnDeleteDisplayedTickets");
    if (bulkDeleteButton) bulkDeleteButton.disabled = true;
    showTicketsMessage(error?.message || "Chargement impossible.", "error");
  }
}

function getLoadedTicket(id) {
  try {
    return JSON.parse($("admin-tickets-body")?.dataset.documents || "[]").find((ticket) => ticket.id === id);
  } catch (_) {
    return null;
  }
}

function ouvrirEditionBillet(id) {
  const ticket = getLoadedTicket(id);
  const kind = $("admin-tickets-body")?.dataset.kind || "entree";
  if (!ticket || !CalypsoTicketWorkflow.canSell(ticket.statut)) return;
  $("ticketEditId").value = ticket.id;
  $("ticketEditKind").value = kind;
  $("ticketEditNumber").value = ticket.numero;
  $("ticketEditType").value = ticket.type;
  $("ticketEditPrice").value = ticket.prix;
  $("ticketEditStudentPrice").value = ticket.tarif;
  $("ticketEditStudentRow").style.display = kind === "entree" ? "flex" : "none";
  $("ticketEditDialog").showModal();
}

async function verifierAucuneCaisseOuverte() {
  const active = await adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_SESSIONS_CAISSE_TABLE_ID, [
    Appwrite.Query.equal("statut", "OUVERTE"), Appwrite.Query.limit(1)
  ]);
  if (active.documents?.length) throw new Error("Fermez les caisses avant de modifier ou supprimer le stock, pour éviter une vente simultanée.");
}

async function verifierStockHorsVente(tableId, id, options = {}) {
  if (!options.cashAlreadyChecked) await verifierAucuneCaisseOuverte();
  const ticket = await adminDB.getDocument(APPWRITE_DATABASE_ID, tableId, id);
  if (!CalypsoTicketWorkflow.canSell(ticket.statut)) throw new Error("Ce billet a déjà été utilisé : il est conservé.");
  if (options.soldNumbers?.has(ticket.numero_billet)) throw new Error("Ce numéro figure dans le journal des ventes : il est conservé.");
  if (options.soldNumbers) return;
  const events = await adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
    Appwrite.Query.equal("numero_billet", ticket.numero_billet), Appwrite.Query.limit(1)
  ]);
  if (events.documents?.length) throw new Error("Ce numéro figure dans le journal des ventes : il est conservé.");
}

async function enregistrerEditionBillet(event) {
  event.preventDefault();
  const kind = $("ticketEditKind").value;
  const tableId = kind === "interne" ? APPWRITE_BILLETS_INTERNE_TABLE_ID : APPWRITE_BILLETS_TABLE_ID;
  const data = {
    numero_billet: $("ticketEditNumber").value.trim(),
    prix: Number($("ticketEditPrice").value)
  };
  if (kind === "entree") {
    data.type_acces = $("ticketEditType").value.trim();
    data.tarif_universite = Number($("ticketEditStudentPrice").value || 0);
  } else {
    data.type_billet = $("ticketEditType").value.trim();
  }
  try {
    await verifierStockHorsVente(tableId, $("ticketEditId").value);
    await adminDB.updateDocument(APPWRITE_DATABASE_ID, tableId, $("ticketEditId").value, data);
    $("ticketEditDialog").close();
    showTicketsMessage("Billet mis à jour.", "success");
    await chargerBilletsGestion();
  } catch (error) {
    showTicketsMessage(error?.message || "Modification impossible.", "error");
  }
}

async function traiterActionBillet(event) {
  const editButton = event.target.closest(".admin-edit-ticket");
  const deleteButton = event.target.closest(".admin-delete-ticket");
  if (editButton) return ouvrirEditionBillet(editButton.dataset.id);
  if (!deleteButton) return;
  const ticket = getLoadedTicket(deleteButton.dataset.id);
  if (!ticket || !CalypsoTicketWorkflow.canSell(ticket.statut)) {
    showTicketsMessage("Un billet déjà vendu ou utilisé ne peut pas être supprimé.", "error");
    return;
  }
  if (!window.confirm(`Supprimer définitivement le billet inutilisé ${ticket.numero} ?`)) return;
  try {
    const tableId = $("admin-tickets-body").dataset.tableId;
    await verifierStockHorsVente(tableId, ticket.id);
    await adminDB.deleteDocument(APPWRITE_DATABASE_ID, tableId, ticket.id);
    showTicketsMessage(`Billet ${ticket.numero} supprimé.`, "success");
    await chargerBilletsGestion();
  } catch (error) {
    showTicketsMessage(error?.message || "Suppression impossible.", "error");
  }
}

async function supprimerBilletsInutilisesAffiches() {
  const body = $("admin-tickets-body");
  const button = $("btnDeleteDisplayedTickets");
  if (!body || !button) return;
  let tickets = [];
  try {
    tickets = JSON.parse(body.dataset.documents || "[]").filter((ticket) =>
      CalypsoTicketWorkflow.canSell(ticket.statut)
    );
  } catch (_) {
    tickets = [];
  }
  if (!tickets.length) {
    showTicketsMessage("Aucun billet inutilisé à supprimer dans cette liste.", "error");
    return;
  }
  if (!window.confirm(`Supprimer définitivement ${tickets.length} billet(s) inutilisé(s) affiché(s) ?`)) return;

  button.disabled = true;
  button.textContent = "Suppression…";
  let deleted = 0;
  try {
    await verifierAucuneCaisseOuverte();
    const events = await CalypsoData.listAll(adminDB, APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
      Appwrite.Query.equal("numero_billet", tickets.map((ticket) => ticket.numero))
    ]);
    const soldNumbers = new Set((events.documents || []).map((event) => event.numero_billet));
    for (const ticket of tickets) {
      await verifierStockHorsVente(body.dataset.tableId, ticket.id, { cashAlreadyChecked: true, soldNumbers });
      await adminDB.deleteDocument(APPWRITE_DATABASE_ID, body.dataset.tableId, ticket.id);
      deleted += 1;
    }
    showTicketsMessage(`${deleted} billet(s) inutilisé(s) supprimé(s).`, "success");
    await chargerBilletsGestion();
  } catch (error) {
    showTicketsMessage(`${deleted} billet(s) supprimé(s). ${error?.message || "La suppression n’a pas pu être terminée."}`, "error");
    await chargerBilletsGestion();
  } finally {
    button.textContent = "Supprimer les billets inutilisés affichés";
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

  if (!startDate || !endDate || startDate > endDate) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Choisissez les dates ci-dessus, puis affichez les réservations.</td></tr>';
    showReservationHistoryMessage("Les dates de début et de fin sont obligatoires.", "error");
    return;
  }

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

    if (filter === "active") queries.push(Appwrite.Query.equal("actif", true));
    if (filter === "used") queries.push(Appwrite.Query.equal("actif", false));
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

async function annulerOuRembourserVente() {
  if (!currentAdmin) return;
  const reference = $("adminRefundReference")?.value.trim() || "";
  const reason = $("adminRefundReason")?.value.trim() || "";
  const button = $("btnAdminRefund");

  if (!reference || !reason) {
    showAdminCashMessage("Le numéro de vente et le motif sont obligatoires.", "error");
    return;
  }

  button.disabled = true;
  button.textContent = "Vérification…";
  try {
    const [ticketResult, restoResult] = await Promise.all([
      adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
        Appwrite.Query.equal("numero_billet", reference),
        Appwrite.Query.limit(25)
      ]),
      adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VENTES_RESTO_COLLECTION_ID, [
        Appwrite.Query.equal("numero_vente", reference),
        Appwrite.Query.limit(100)
      ])
    ]);

    const ticketSale = (ticketResult.documents || []).find((item) =>
      ["VENTE_ENTREE", "INTERNE"].includes(item.poste_id)
    );
    const restoLines = restoResult.documents || [];
    const sale = ticketSale || restoLines[0];
    if (!sale) throw new Error(`Aucune vente trouvée pour ${reference}.`);

    const amount = ticketSale
      ? Number(ticketSale.montant_paye || 0)
      : restoLines.reduce((sum, item) => sum + Number(item.montant_total || 0), 0);
    const sessionId = sale.session_caisse_id || "";
    if (!sessionId) throw new Error("Cette ancienne vente n’est rattachée à aucune caisse.");

    const marker = `[VENTE:${reference}]`;
    const existing = await adminDB.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID, [
      Appwrite.Query.equal("session_id", sessionId),
      Appwrite.Query.limit(500)
    ]);
    if ((existing.documents || []).some((item) => String(item.motif || "").includes(marker))) {
      throw new Error("Cette vente a déjà été annulée ou remboursée.");
    }

    if (!window.confirm(`Confirmer la correction de ${reference} pour ${formatGNF(amount)} ?`)) return;

    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID,
      Appwrite.ID.unique(),
      {
        session_id: sessionId,
        agent_id: sale.agent_id || "",
        type: "REMBOURSEMENT",
        montant: amount,
        motif: `${marker} ${reason}`,
        date_mouvement: new Date().toISOString(),
        statut: "APPROUVE",
        approbateur_id: currentAdmin.$id
      }
    );

    $("adminRefundReference").value = "";
    $("adminRefundReason").value = "";
    showAdminCashMessage(`Correction enregistrée pour ${reference}. La vente originale est conservée.`, "success");
    CalypsoData.cache.clear();
  } catch (error) {
    console.error("[ADMIN CAISSE] Correction impossible :", error);
    showAdminCashMessage(error?.message || "Correction impossible.", "error");
  } finally {
    button.disabled = false;
    button.textContent = "Annuler / rembourser";
  }
}

// =====================================
//  3. STATS : gestion de la période
// =====================================

function getSelectedPeriod(inputId = "statsPeriod") {
  const select = $(inputId);
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
  } else if (mode === "year") {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear() + 1, 0, 1);
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

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return { error: "custom-missing" };
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
    const res = await CalypsoData.cachedList(adminDB, APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
      Appwrite.Query.greaterThanEqual("date_validation", startIso),
      Appwrite.Query.lessThan("date_validation", endIso)
    ]);
    const selected = getSelectedPeriod();
    if (selected.error || selected.start.toISOString() !== startIso || selected.end.toISOString() !== endIso) return;

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

    let paiementsEspeces = 0;

    ventes.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") recetteNormal += montant;
      else if (d.tarif_applique === "etudiant") recetteEtudiant += montant;

      const type = d.type_acces || "Non renseigné";
      if (!parType[type]) parType[type] = { count: 0, montant: 0 };

      parType[type].count += 1;
      parType[type].montant += montant;
      if (!d.moyen_paiement || d.moyen_paiement === "especes") paiementsEspeces += montant;
    });


    if ($("stat-validations-count")) $("stat-validations-count").textContent = totalValidations.toString();
    if ($("stat-confirmations-count")) $("stat-confirmations-count").textContent = confirmations.length.toString();
    if ($("stat-unconfirmed-count")) $("stat-unconfirmed-count").textContent = nonConfirmees.length.toString();
    if ($("stat-revenue-total")) $("stat-revenue-total").textContent = formatGNF(recetteTotale);
    if ($("stat-revenue-normal")) $("stat-revenue-normal").textContent = formatGNF(recetteNormal);
    if ($("stat-revenue-etudiant")) $("stat-revenue-etudiant").textContent = formatGNF(recetteEtudiant);
    if ($("stat-payment-cash")) $("stat-payment-cash").textContent = formatGNF(paiementsEspeces);

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
    const res = await CalypsoData.cachedList(adminDB, APPWRITE_DATABASE_ID, APPWRITE_VENTES_RESTO_COLLECTION_ID, [
      Appwrite.Query.greaterThanEqual("date_vente", startIso),
      Appwrite.Query.lessThan("date_vente", endIso)
    ]);
    const selected = getSelectedPeriod();
    if (selected.error || selected.start.toISOString() !== startIso || selected.end.toISOString() !== endIso) return;

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
  switchAdminMode("tickets");
  showTicketsMessage("Choisissez le stock d’entrée ou interne, affichez-le puis supprimez les billets inutilisés. Les validations ne sont jamais supprimées.");
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

  if (sessionStorage.getItem("calypso_access_granted") !== "1") {
    window.location.replace("connexion.html");
    return;
  }

  const btnAdminLogout = $("btnAdminLogout");

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogout();
    });
  }

  const btnDashboard = $("btnAdminModeDashboard");
  const btnTeam = $("btnAdminModeTeam");
  const btnHistory = $("btnAdminModeHistory");
  const btnTickets = $("btnAdminModeTickets");

  if (btnDashboard) {
    btnDashboard.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("dashboard");
    });
  }

  if (btnTeam) {
    btnTeam.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("team");
    });
  }

  if (btnHistory) {
    btnHistory.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("history");
    });
  }

  if (btnTickets) {
    btnTickets.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("tickets");
    });
  }

  const dashboardPeriod = $("dashboardPeriod");
  dashboardPeriod?.addEventListener("change", chargerTableauDeBord);

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
      CalypsoData.cache.clear();
      if ($("statsModeResto")?.checked) chargerStatsResto();
      else chargerStatsBillets();
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
  const btnAdminRefund = $("btnAdminRefund");
  const adminCashControl = $("admin-cash-control");
  const btnLoadTickets = $("btnLoadTickets");
  const btnDeleteDisplayedTickets = $("btnDeleteDisplayedTickets");
  const ticketsBody = $("admin-tickets-body");
  const ticketEditForm = $("ticketEditForm");

  btnLoadTickets?.addEventListener("click", () => { ticketManagementPage = 0; chargerBilletsGestion(); });
  $("btnTicketsPrev")?.addEventListener("click", () => { ticketManagementPage = Math.max(0, ticketManagementPage - 1); chargerBilletsGestion(); });
  $("btnTicketsNext")?.addEventListener("click", () => { ticketManagementPage += 1; chargerBilletsGestion(); });
  $("ticketManagementType")?.addEventListener("change", () => {
    ticketManagementPage = 0;
    if (ticketsBody) { ticketsBody.dataset.documents = "[]"; ticketsBody.innerHTML = '<tr><td colspan="6">Cliquez sur Afficher les billets.</td></tr>'; }
    if (btnDeleteDisplayedTickets) btnDeleteDisplayedTickets.disabled = true;
    $("btnTicketsPrev").disabled = true;
    $("btnTicketsNext").disabled = true;
  });
  btnDeleteDisplayedTickets?.addEventListener("click", supprimerBilletsInutilisesAffiches);
  ticketsBody?.addEventListener("click", traiterActionBillet);
  ticketEditForm?.addEventListener("submit", enregistrerEditionBillet);

  btnAdminRefund?.addEventListener("click", annulerOuRembourserVente);

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
    });
  }

  [reservationStartDate, reservationEndDate].forEach((input) => {
    input?.addEventListener("change", () => {
      reservationHistoryPage = 0;
    });
  });

  btnResetReservationDates?.addEventListener("click", () => {
    if (reservationStartDate) reservationStartDate.value = "";
    if (reservationEndDate) reservationEndDate.value = "";
    reservationHistoryPage = 0;
    if (btnReservationPrev) btnReservationPrev.disabled = true;
    if (btnReservationNext) btnReservationNext.disabled = true;
    if ($("reservationPageInfo")) $("reservationPageInfo").textContent = "Page 1";
    const body = $("reservations-history-body");
    if (body) body.innerHTML = '<tr><td colspan="6">Choisissez une période pour afficher l’historique.</td></tr>';
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
