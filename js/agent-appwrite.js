console.log("[AGENT] agent-appwrite.js chargé - VERSION COMPLETE RESERVATION ENTREE UNIQUEMENT");

// ===============================
//  CONFIGURATION PARTAGÉE
// ===============================

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
const db = CalypsoAppwrite.databases;

// ===============================
//  HELPERS DOM & FORMAT
// ===============================

function $(id) {
  return document.getElementById(id);
}

function formatMontantGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

function showResult(text, type) {
  const zone = $("result-message");
  if (!zone) return;

  zone.style.display = "block";
  zone.textContent = text;
  zone.className = "result";

  if (type === "success") zone.classList.add("ok");
  else if (type === "error") zone.classList.add("error");
  else if (type === "warn") zone.classList.add("warn");
}

function clearResult() {
  const zone = $("result-message");
  if (!zone) return;

  zone.style.display = "none";
  zone.textContent = "";
  zone.className = "result";
}

function showLoginMessage(text, type) {
  const zone = $("login-message");
  if (!zone) return;

  zone.textContent = text || "";
  zone.style.color =
    type === "success" ? "#16a34a" :
    type === "error" ? "#b91c1c" :
    "#6b7280";
}

function setTicketCount(n) {
  const el = $("ticketCount");
  if (el) el.textContent = String(n);
}

function getTarifChoisi() {
  const etu = $("tarif-etudiant");
  if (etu && etu.checked) return "etudiant";
  return "normal";
}

function getCashDetails(inputId, total) {
  const raw = $(inputId)?.value;
  const montantRecu = Number(raw);
  if (!Number.isFinite(montantRecu) || montantRecu < total) {
    throw new Error(`Espèces insuffisantes : ${formatMontantGNF(total)} attendus.`);
  }

  return {
    moyenPaiement: CalypsoConfig.paymentMethods.especes,
    montantRecu,
    monnaieRendue: montantRecu - total
  };
}

function setButtonLoading(button, text) {
  if (!button) return;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.disabled = true;
  button.textContent = text;
}

function resetButtonLoading(button) {
  if (!button) return;
  button.disabled = false;
  button.textContent = button.dataset.originalText || "Valider le billet ▶▶";
}

// ===============================
//  ETAT GLOBAL
// ===============================

let currentAgent = null;
let loginRequestInProgress = false;

let restoProduitsCache = [];
let restoPanier = [];
let restoLoaded = false;
let ticketPanier = [];
let ticketEnApercu = null;

let currentMode = "billets";
let currentBilletsSubMode = "ENTREE";

let lastVenteNumber = 0;
let lastVerifiedEtudiant = null;
let currentCashSession = null;
let currentCashSummary = null;

function agentHasRole(role) {
  return Boolean(currentAgent?.roles?.includes(role));
}

function isAdminAgent() {
  return agentHasRole(CalypsoConfig.staffRoles.admin);
}

function isGerantAgent() {
  return isAdminAgent() ||
    agentHasRole(CalypsoConfig.staffRoles.gerant) ||
    agentHasRole(CalypsoConfig.staffRoles.billets);
}

function isControleAgent() {
  return isAdminAgent() || agentHasRole(CalypsoConfig.staffRoles.controle);
}

function isRestoAgent() {
  return isAdminAgent() || agentHasRole(CalypsoConfig.staffRoles.resto);
}

function getCashPoste() {
  return isGerantAgent() ? "GERANT" : "RESTO";
}

function getLocalCashKey() {
  return currentAgent ? `calypso-caisse-${currentAgent.$id}` : "";
}

function loadLocalCashSession() {
  const key = getLocalCashKey();
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value?.statut === "OUVERTE" ? value : null;
  } catch (_) {
    return null;
  }
}

function saveLocalCashSession(session) {
  const key = getLocalCashKey();
  if (!key) return;
  if (session) localStorage.setItem(key, JSON.stringify(session));
  else localStorage.removeItem(key);
}

function createLocalCashSession(fonds) {
  const date = new Date();
  return {
    $id: `CS-${Date.now()}-${currentAgent.$id.slice(0, 12)}`,
    agent_id: currentAgent.$id,
    agent_nom: currentAgent.nom,
    poste: getCashPoste(),
    statut: "OUVERTE",
    ouverture: date.toISOString(),
    fonds_depart: fonds,
    localFallback: true
  };
}

function showCashMessage(text, type = "info") {
  const element = $("cash-register-message");
  if (!element) return;
  element.textContent = text || "";
  element.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#64748b";
}

async function calculerSyntheseCaisse(session) {
  const [validationsResult, restoResult, movementsResult] = await Promise.all([
    db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
      Appwrite.Query.equal("session_caisse_id", session.$id),
      Appwrite.Query.limit(5000)
    ]).catch(() => ({ documents: [] })),
    db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VENTES_RESTO_COLLECTION_ID, [
      Appwrite.Query.equal("session_caisse_id", session.$id),
      Appwrite.Query.limit(5000)
    ]).catch(() => ({ documents: [] })),
    db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID, [
      Appwrite.Query.equal("session_id", session.$id),
      Appwrite.Query.limit(5000)
    ]).catch(() => ({ documents: [] }))
  ]);

  const ventesBillets = (validationsResult.documents || []).filter(
    (item) => ["VENTE_ENTREE", "INTERNE"].includes(item.poste_id)
  );
  const lignesResto = restoResult.documents || [];
  const ventes = [
    ...ventesBillets.map((item) => ({
      id: item.$id,
      moyen: item.moyen_paiement || "especes",
      montant: Number(item.montant_paye || 0)
    })),
    ...lignesResto.map((item) => ({
      id: item.numero_vente || item.$id,
      moyen: item.moyen_paiement || "especes",
      montant: Number(item.montant_total || 0)
    }))
  ];
  const sumByPayment = (method) => ventes
    .filter((sale) => sale.moyen === method)
    .reduce((sum, sale) => sum + sale.montant, 0);

  const mouvementsApprouves = (movementsResult.documents || []).filter(
    (item) => item.statut === "APPROUVE"
  );
  const ajouts = mouvementsApprouves
    .filter((item) => item.type === "AJOUT_CAISSE")
    .reduce((sum, item) => sum + Number(item.montant || 0), 0);
  const sorties = mouvementsApprouves
    .filter((item) => ["DEPENSE", "REMBOURSEMENT", "AVANCE", "REMISE_GERANT"].includes(item.type))
    .reduce((sum, item) => sum + Number(item.montant || 0), 0);
  const especesVentes = sumByPayment("especes");

  return {
    especes: Number(session.fonds_depart || 0) + especesVentes + ajouts - sorties,
    operations: new Set(ventes.map((sale) => sale.id)).size,
    mouvementsEnAttente: (movementsResult.documents || []).filter((item) => item.statut === "EN_ATTENTE").length
  };
}

function renderCashRegister() {
  const card = $("cash-register-card");
  const openZone = $("cash-open-zone");
  const activeZone = $("cash-active-zone");
  const status = $("cash-register-status");
  const badge = $("cash-session-badge");
  const canCash = currentAgent?.profileComplete && (isGerantAgent() || isRestoAgent()) && currentMode !== "controle";

  if (!card) return;
  card.style.display = canCash ? "block" : "none";
  if (!canCash) return;

  if ($("cash-register-title")) {
    $("cash-register-title").textContent = "Ma caisse";
  }
  openZone.style.display = currentCashSession ? "none" : "block";
  activeZone.style.display = currentCashSession ? "block" : "none";
  badge.textContent = currentCashSession ? "Ouverte" : "Fermée";

  if (!currentCashSession) {
    status.textContent = "Ouvrez une caisse avant la première vente du service.";
    return;
  }

  status.textContent = `Ouverte le ${new Date(currentCashSession.ouverture).toLocaleString("fr-FR")} — fonds : ${formatMontantGNF(currentCashSession.fonds_depart)}.`;
  if (currentCashSummary) {
    $("cashExpected").textContent = formatMontantGNF(currentCashSummary.especes);
    $("cashOperations").textContent = String(currentCashSummary.operations);
  }
}

async function chargerSessionCaisse() {
  currentCashSession = null;
  currentCashSummary = null;
  renderCashRegister();
  if (!currentAgent?.profileComplete || currentMode === "controle") return;
  if (!(isGerantAgent() || isRestoAgent())) return;

  const localSession = loadLocalCashSession();
  if (localSession) {
    currentCashSession = localSession;
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
    return;
  }

  try {
    const result = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_SESSIONS_CAISSE_TABLE_ID,
      [Appwrite.Query.equal("agent_id", currentAgent.$id), Appwrite.Query.limit(100)]
    );
    currentCashSession = (result.documents || []).find((session) => session.statut === "OUVERTE") || null;
    if (currentCashSession) currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
  } catch (error) {
    console.error("[CAISSE] Chargement impossible :", error);
    renderCashRegister();
  }
}

async function ouvrirCaisse() {
  if (!currentAgent || currentMode === "controle") return;
  const fonds = Number($("cashOpeningFloat")?.value || 0);
  if (!Number.isFinite(fonds) || fonds < 0) {
    showCashMessage("Le fonds de départ est invalide.", "error");
    return;
  }

  const button = $("btnOpenCash");
  setButtonLoading(button, "Ouverture…");
  try {
    const sessionData = {
      agent_id: currentAgent.$id,
      agent_nom: currentAgent.nom,
      poste: getCashPoste(),
      statut: "OUVERTE",
      ouverture: new Date().toISOString(),
      fonds_depart: fonds
    };
    try {
      currentCashSession = await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_SESSIONS_CAISSE_TABLE_ID,
        Appwrite.ID.unique(),
        sessionData
      );
    } catch (remoteError) {
      const permissionDenied = [401, 403].includes(remoteError?.code) || /not authorized/i.test(remoteError?.message || "");
      if (!permissionDenied) throw remoteError;
      console.warn("[CAISSE] Table sessions indisponible, utilisation du registre de ventes.");
      currentCashSession = createLocalCashSession(fonds);
    }
    saveLocalCashSession(currentCashSession);
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
    showCashMessage("Caisse ouverte. Vous pouvez commencer les ventes.", "success");
  } catch (error) {
    console.error("[CAISSE] Ouverture impossible :", error);
    showCashMessage(error?.message || "Impossible d’ouvrir la caisse.", "error");
  } finally {
    resetButtonLoading(button);
  }
}

async function cloturerCaisse() {
  if (!currentCashSession) return;
  currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
  if (currentCashSummary.mouvementsEnAttente > 0) {
    showCashMessage(
      `${currentCashSummary.mouvementsEnAttente} mouvement(s) attendent encore l’approbation administrative.`,
      "error"
    );
    return;
  }
  const especesDeclarees = Number($("cashActual")?.value);
  const commentaire = $("cashCloseComment")?.value.trim() || "";
  if (!Number.isFinite(especesDeclarees) || especesDeclarees < 0) {
    showCashMessage("Saisissez les espèces réellement remises.", "error");
    return;
  }
  const ecart = especesDeclarees - currentCashSummary.especes;
  if (ecart !== 0 && !commentaire) {
    showCashMessage("Un commentaire est obligatoire en cas d’écart.", "error");
    return;
  }

  const button = $("btnCloseCash");
  setButtonLoading(button, "Clôture…");
  try {
    const closingData = {
      statut: "CLOTUREE",
      fermeture: new Date().toISOString(),
      especes_attendues: currentCashSummary.especes,
      especes_declarees: especesDeclarees,
      ecart,
      commentaire
    };
    if (!currentCashSession.localFallback) {
      await db.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_SESSIONS_CAISSE_TABLE_ID,
        currentCashSession.$id,
        closingData
      );
    }
    saveLocalCashSession(null);
    currentCashSession = null;
    currentCashSummary = null;
    $("cashActual").value = "";
    $("cashCloseComment").value = "";
    renderCashRegister();
    showCashMessage(`Caisse clôturée. Écart : ${formatMontantGNF(ecart)}.`, ecart === 0 ? "success" : "error");
  } catch (error) {
    console.error("[CAISSE] Clôture impossible :", error);
    showCashMessage(error?.message || "Impossible de clôturer la caisse.", "error");
  } finally {
    resetButtonLoading(button);
  }
}

// ===============================
//  UI MODES
// ===============================

function updateTarifEtudiantVisibility() {
  const etuZone = $("etu-zone");
  const tarifZone = $("tarif-zone");
  const radioEtu = $("tarif-etudiant");

  if (currentBilletsSubMode === "ENTREE") {
    if (tarifZone) tarifZone.style.display = "block";

    if (etuZone) {
      etuZone.style.display =
        radioEtu && radioEtu.checked ? "block" : "none";
    }
  } else {
    currentCashSession = null;
    currentCashSummary = null;
    if (tarifZone) tarifZone.style.display = "none";
    if (etuZone) etuZone.style.display = "none";
  }
}

function resetReservationForm() {
  const useReservation = $("useReservation");
  const reservationNumber = $("reservationNumber");
  const reservationNumberZone = $("reservation-number-zone");

  if (useReservation) useReservation.checked = false;
  if (reservationNumber) reservationNumber.value = "";
  if (reservationNumberZone) reservationNumberZone.style.display = "none";
}

function updateReservationVisibility() {
  const reservationZone = $("reservation-zone");

  if (!reservationZone) return;

  if (currentBilletsSubMode === "ENTREE") {
    reservationZone.style.display = "block";
  } else {
    reservationZone.style.display = "none";
    resetReservationForm();
  }
}

function switchMode(mode) {
  if (currentAgent) {
    const allowed = mode === "billets"
      ? isGerantAgent()
      : mode === "controle"
        ? isControleAgent()
        : isRestoAgent();

    if (!allowed) return;
  }

  currentMode = mode;

  const modeBillets = $("mode-billets");
  const modeControle = $("mode-controle");
  const modeResto = $("mode-resto");
  const modeLabel = $("mode-label");
  const btnModeBillets = $("btnModeBillets");
  const btnModeControle = $("btnModeControle");
  const btnModeResto = $("btnModeResto");

  if (modeBillets) {
    modeBillets.style.display = mode === "billets" ? "block" : "none";
  }

  if (modeResto) {
    modeResto.style.display = mode === "resto" ? "block" : "none";
  }

  if (modeControle) {
    modeControle.style.display = mode === "controle" ? "block" : "none";
  }

  if (modeLabel) {
    modeLabel.textContent =
      mode === "billets"
        ? "Caisse billets"
        : mode === "controle"
          ? "Contrôle entrée"
          : "Restauration / Chicha";
  }

  if (btnModeBillets) {
    btnModeBillets.classList.toggle("btn-primary", mode === "billets");
    btnModeBillets.classList.toggle("btn-secondary", mode !== "billets");
    btnModeBillets.setAttribute("aria-pressed", String(mode === "billets"));
  }

  if (btnModeResto) {
    btnModeResto.classList.toggle("btn-primary", mode === "resto");
    btnModeResto.classList.toggle("btn-secondary", mode !== "resto");
    btnModeResto.setAttribute("aria-pressed", String(mode === "resto"));
  }

  if (btnModeControle) {
    btnModeControle.classList.toggle("btn-primary", mode === "controle");
    btnModeControle.classList.toggle("btn-secondary", mode !== "controle");
    btnModeControle.setAttribute("aria-pressed", String(mode === "controle"));
  }

  if (mode === "resto" && !restoLoaded) {
    restoLoaded = true;
    chargerProduitsResto();
  }


  if (mode === "controle") {
    window.setTimeout(() => $("controlTicketNumber")?.focus(), 0);
  }

  if (currentAgent?.profileComplete) chargerSessionCaisse();
}

function switchBilletsSubMode(mode) {
  currentBilletsSubMode = mode;
  ticketEnApercu = null;
  renderTicketPreview();

  const btnEntree = $("btnBilletsEntree");
  const btnJeux = $("btnBilletsJeux");
  const hint = $("billetsSubHint");
  const ticketNumber = $("ticketNumber");

  if (btnEntree) {
    btnEntree.classList.toggle("active-submode", mode === "ENTREE");
  }

  if (btnJeux) {
    btnJeux.classList.toggle("active-submode", mode === "JEU");
  }

  if (hint) {
    if (mode === "ENTREE") {
      hint.textContent =
        "Mode : billets d'entrée. Saisir le numéro du billet attribué au client.";
    } else {
      hint.textContent =
        "Mode : billets jeux internes. Saisir le numéro du ticket de jeu. Aucune réservation n’est vérifiée dans ce mode.";
    }
  }

  if (ticketNumber) {
    ticketNumber.placeholder =
      mode === "ENTREE" ? "Ex : 26-0001" : "Ex : J-0001";
  }

  updateTarifEtudiantVisibility();
  updateReservationVisibility();
  chargerNombreBillets();
}

// ===============================
//  CONNEXION / ETAT AGENT
// ===============================

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  const loginCard = $("card-login");
  const appZone = $("app-zone");
  const profileCard = $("agent-profile-card");
  const nameEl = $("agent-connected-name");
  const roleEl = $("agent-connected-role");
  const btnModeBillets = $("btnModeBillets");
  const btnModeControle = $("btnModeControle");
  const btnModeResto = $("btnModeResto");

  if (agent) {
    const isAdmin = agent.roles.includes(CalypsoConfig.staffRoles.admin);
    const canBillets = isGerantAgent();
    const canControle = isControleAgent();
    const canResto = isRestoAgent();
    const operationalRoleCount = [canBillets, canControle, canResto].filter(Boolean).length;

    document.body.dataset.singleRole = String(operationalRoleCount === 1);
    document.body.dataset.role = operationalRoleCount > 1
      ? "multiple"
      : canBillets
        ? "gerant"
        : canControle
          ? "controle"
          : "resto";

    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = agent.nom || "Profil à compléter";
    if (roleEl) {
      const labels = [];
      if (canBillets) labels.push("Gérant");
      if (canControle) labels.push("Contrôle");
      if (canResto) labels.push("Restauration");
      if (isAdmin) labels.push("Admin");
      roleEl.textContent = [...new Set(labels)].join(" · ");
    }

    if (btnModeBillets) {
      btnModeBillets.style.display = canBillets ? "inline-flex" : "none";
    }


    if (btnModeControle) {
      btnModeControle.style.display = canControle ? "inline-flex" : "none";
    }

    if (btnModeResto) {
      btnModeResto.style.display = canResto ? "inline-flex" : "none";
    }

    if (!agent.profileComplete) {
      if (profileCard) profileCard.style.display = "block";
      if (btnModeBillets) btnModeBillets.disabled = true;
      if (btnModeControle) btnModeControle.disabled = true;
      if (btnModeResto) btnModeResto.disabled = true;
      if ($("mode-billets")) $("mode-billets").style.display = "none";
      if ($("mode-controle")) $("mode-controle").style.display = "none";
      if ($("mode-resto")) $("mode-resto").style.display = "none";
      if ($("mode-label")) $("mode-label").textContent = "Profil à compléter";
      return;
    }

    if (profileCard) profileCard.style.display = "none";
    if (btnModeBillets) btnModeBillets.disabled = false;
    if (btnModeControle) btnModeControle.disabled = false;
    if (btnModeResto) btnModeResto.disabled = false;

    if (canBillets) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
    } else if (canControle) {
      switchMode("controle");
    } else {
      switchMode("resto");
    }
  } else {
    currentCashSession = null;
    currentCashSummary = null;
    ticketPanier = [];
    ticketEnApercu = null;
    delete document.body.dataset.singleRole;
    delete document.body.dataset.role;

    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";
    if (profileCard) profileCard.style.display = "none";

    if (btnModeBillets) btnModeBillets.style.display = "inline-flex";
    if (btnModeControle) btnModeControle.style.display = "inline-flex";
    if (btnModeResto) btnModeResto.style.display = "inline-flex";

    setTicketCount(0);
    clearResult();
    renderTicketPreview();
    renderTicketCart();
    renderCashRegister();
  }
}

function showAgentProfileMessage(text, type = "info") {
  const element = $("agent-profile-message");
  if (!element) return;

  element.textContent = text || "";
  element.style.color =
    type === "success" ? "#15803d" :
    type === "error" ? "#b91c1c" :
    "#64748b";
}

async function enregistrerProfilAgent() {
  const prenomEl = $("agent-profile-prenom");
  const nomEl = $("agent-profile-nom");
  const button = $("btnSaveAgentProfile");
  const prenom = prenomEl?.value.trim() || "";
  const nom = nomEl?.value.trim() || "";

  if (!prenom || !nom) {
    showAgentProfileMessage("Veuillez saisir votre prénom et votre nom.", "error");
    return;
  }

  if (button) button.disabled = true;
  showAgentProfileMessage("Enregistrement en cours…");

  try {
    const updatedAgent = await CalypsoAuth.updateStaffName({ prenom, nom });
    appliquerEtatConnexion(updatedAgent);
    showTempMessage(`Profil enregistré : ${updatedAgent.nom}`, "success");
  } catch (error) {
    console.error("[AGENT] Erreur profil :", error);
    showAgentProfileMessage(error?.message || "Impossible d’enregistrer le profil.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function connecterAgent() {
  if (loginRequestInProgress) return;

  const email = $("agentEmail")?.value.trim();
  const password = $("agentPassword")?.value || "";
  const button = $("btnLogin");

  if (!email || !password) {
    showLoginMessage("Veuillez saisir votre e-mail et votre mot de passe.", "error");
    return;
  }

  loginRequestInProgress = true;
  setButtonLoading(button, "Connexion…");
  showLoginMessage("Vérification en cours...", "info");

  try {
    const agent = await CalypsoAuth.login(email, password, [
      CalypsoConfig.staffRoles.admin,
      CalypsoConfig.staffRoles.gerant,
      CalypsoConfig.staffRoles.controle,
      CalypsoConfig.staffRoles.billets,
      CalypsoConfig.staffRoles.resto
    ]);

    showLoginMessage("Connexion réussie.", "success");
    appliquerEtatConnexion(agent);
  } catch (err) {
    console.error("[AGENT] Erreur connexion agent :", err);
    const limited = err?.code === 429 || /rate limit/i.test(err?.message || "");
    showLoginMessage(
      limited
        ? "Trop de tentatives rapprochées. Attendez quelques minutes, puis cliquez une seule fois sur Se connecter."
        : err?.message || "Identifiants invalides.",
      "error"
    );
  } finally {
    loginRequestInProgress = false;
    resetButtonLoading(button);
  }
}

async function deconnexionAgent() {
  try {
    await CalypsoAuth.logout();
  } finally {
    appliquerEtatConnexion(null);
    showLoginMessage("Déconnecté.", "info");
  }
}

async function restaurerSessionAgent() {
  try {
    const agent = await CalypsoAuth.restore([
      CalypsoConfig.staffRoles.admin,
      CalypsoConfig.staffRoles.gerant,
      CalypsoConfig.staffRoles.controle,
      CalypsoConfig.staffRoles.billets,
      CalypsoConfig.staffRoles.resto
    ]);
    appliquerEtatConnexion(agent);
    showLoginMessage("Session restaurée.", "success");
  } catch (error) {
    appliquerEtatConnexion(null);
    if (error?.code && error.code !== 401) {
      showLoginMessage(error.message, "error");
    }
  }
}

// ===============================
//  BILLETS : COMPTE
// ===============================

async function chargerNombreBillets() {
  try {
    let res;

    if (currentBilletsSubMode === "JEU") {
      res = await db.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_INTERNE_TABLE_ID,
        [
          Appwrite.Query.equal("statut", "Non utilisé"),
          Appwrite.Query.limit(10000)
        ]
      );
    } else {
      res = await db.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_TABLE_ID,
        [
          Appwrite.Query.equal("statut", "Non utilisé"),
          Appwrite.Query.limit(10000)
        ]
      );
    }

    setTicketCount(res.documents ? res.documents.length : 0);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
  }
}

// ===============================
//  RESERVATION : ENTREE UNIQUEMENT
// ===============================

function getReservationInfoFromForm() {
  const useReservation = $("useReservation")?.checked || false;
  const numeroReservation =
    $("reservationNumber")?.value.trim().toUpperCase() || "";

  return {
    useReservation,
    numeroReservation
  };
}

async function verifierReservationActive(numeroReservation) {
  if (!numeroReservation) {
    showResult("Veuillez saisir le numéro de réservation.", "error");
    return null;
  }

  if (!numeroReservation.startsWith("RES-")) {
    showResult("Le numéro de réservation doit commencer par RES-.", "error");
    return null;
  }

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      [
        Appwrite.Query.equal("numero_reservation", numeroReservation),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showResult(`Réservation ${numeroReservation} introuvable.`, "error");
      return null;
    }

    const reservation = res.documents[0];

    if (reservation.actif === false) {
      showResult(`Réservation ${numeroReservation} déjà utilisée ou annulée.`, "error");
      return null;
    }

    return reservation;
  } catch (err) {
    console.error("[AGENT] Erreur vérification réservation :", err);
    showResult("Erreur lors de la vérification de la réservation.", "error");
    return null;
  }
}

async function verifierReservationDejaLiee(numeroReservation) {
  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal("reservation", numeroReservation),
        Appwrite.Query.limit(1)
      ]
    );

    if (res.documents && res.documents.length > 0) {
      return res.documents[0];
    }

    return null;
  } catch (err) {
    console.error("[AGENT] Erreur contrôle réservation déjà liée :", err);
    showResult(
      "Erreur : impossible de vérifier si cette réservation est déjà affiliée.",
      "error"
    );
    return "ERROR";
  }
}

// ===============================
//  VALIDATION BILLETS
// ===============================

function renderTicketPreview() {
  const preview = $("ticketPreview");
  if (!preview) return;
  preview.style.display = ticketEnApercu ? "grid" : "none";
  if (!ticketEnApercu) return;
  $("ticketPreviewNumber").textContent = ticketEnApercu.numero_billet;
  $("ticketPreviewType").textContent = ticketEnApercu.type;
  $("ticketPreviewPrice").textContent = formatMontantGNF(ticketEnApercu.prix);
}

function renderTicketCart() {
  const container = $("ticketCartItems");
  const total = CalypsoTicketWorkflow.getCartTotal(ticketPanier);
  if ($("ticketCartCount")) {
    $("ticketCartCount").textContent = `${ticketPanier.length} billet${ticketPanier.length > 1 ? "s" : ""}`;
  }
  if ($("ticketCartTotal")) $("ticketCartTotal").textContent = formatMontantGNF(total);
  if ($("btnValidateTicketCart")) $("btnValidateTicketCart").disabled = ticketPanier.length === 0;

  if (container) {
    container.replaceChildren();
    if (ticketPanier.length === 0) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "Aucun billet ajouté.";
      container.appendChild(empty);
    } else {
      ticketPanier.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "ticket-cart-item";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = `${item.numero_billet} — ${item.type}`;
        const detail = document.createElement("span");
        detail.textContent = `${item.mode === "ENTREE" ? "Entrée" : "Jeu interne"} · ${formatMontantGNF(item.prix)}`;
        copy.append(title, detail);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ticket-cart-remove";
        remove.dataset.index = String(index);
        remove.setAttribute("aria-label", `Retirer le billet ${item.numero_billet}`);
        remove.textContent = "Retirer";
        row.append(copy, remove);
        container.appendChild(row);
      });
    }
  }
  updateTicketChange();
}

function updateTicketChange() {
  const output = $("ticketChange");
  if (!output) return;
  const total = CalypsoTicketWorkflow.getCartTotal(ticketPanier);
  const received = $("ticketCashReceived")?.value;
  const change = CalypsoTicketWorkflow.getCashChange(total, received);
  output.textContent = change == null
    ? `Reste à recevoir : ${formatMontantGNF(Math.max(0, total - Number(received || 0)))}`
    : `Monnaie à rendre : ${formatMontantGNF(change)}`;
}

async function verifierBillet() {
  clearResult();
  ticketEnApercu = null;
  renderTicketPreview();
  const button = $("btnLookupTicket");

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }


  if (!isGerantAgent()) {
    showResult("Seul le gérant peut enregistrer une vente de billet.", "error");
    return;
  }


  if (!currentCashSession) {
    showResult("Ouvrez votre caisse avant d’ajouter un billet.", "error");
    return;
  }

  if (!navigator.onLine) {
    showResult("Connexion requise pour valider un billet.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  if (ticketPanier.some((item) => item.numero_billet === numeroBillet && item.mode === currentBilletsSubMode)) {
    showResult(`Le billet ${numeroBillet} est déjà dans le panier.`, "warn");
    return;
  }

  setButtonLoading(button, "Recherche…");

  try {
    const tableId = currentBilletsSubMode === "ENTREE"
      ? APPWRITE_BILLETS_TABLE_ID
      : APPWRITE_BILLETS_INTERNE_TABLE_ID;
    const result = await db.listDocuments(APPWRITE_DATABASE_ID, tableId, [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.limit(1)
    ]);
    const billet = result.documents?.[0];
    if (!billet) {
      showResult(`Billet ${numeroBillet} introuvable.`, "error");
      return;
    }
    if (!CalypsoTicketWorkflow.canSell(billet.statut)) {
      showResult(CalypsoTicketWorkflow.getSaleRefusal(billet.statut) || "Ce billet a déjà été utilisé.", "error");
      return;
    }

    const existing = await db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.limit(25)
    ]);
    const salePosts = currentBilletsSubMode === "ENTREE" ? ["VENTE_ENTREE", "ENTREE"] : ["INTERNE"];
    if ((existing.documents || []).some((item) => salePosts.includes(item.poste_id))) {
      showResult(`Billet ${numeroBillet} déjà vendu ou utilisé.`, "error");
      return;
    }

    const tarifChoisi = currentBilletsSubMode === "ENTREE" ? getTarifChoisi() : "normal";
    const numeroEtu = $("etuNumber")?.value.trim() || "";
    const reservationInfo = currentBilletsSubMode === "ENTREE"
      ? getReservationInfoFromForm()
      : { useReservation: false, numeroReservation: "" };

    if (currentBilletsSubMode === "ENTREE" && billet.reservation) {
      showResult(`Ce billet est déjà affilié à la réservation ${billet.reservation}.`, "error");
      return;
    }
    if (tarifChoisi === "etudiant" && !(await verifierTarifEtudiantAvantValidation(numeroEtu))) return;
    if (reservationInfo.useReservation) {
      const reservation = await verifierReservationActive(reservationInfo.numeroReservation);
      if (!reservation) return;
      const dejaLiee = await verifierReservationDejaLiee(reservationInfo.numeroReservation);
      if (dejaLiee === "ERROR") return;
      if (dejaLiee) {
        showResult(`Cette réservation est déjà affiliée au billet ${dejaLiee.numero_billet || ""}.`, "error");
        return;
      }
    }

    const prix = CalypsoTicketWorkflow.getTicketPrice(billet, tarifChoisi);
    ticketEnApercu = {
      documentId: billet.$id,
      numero_billet: billet.numero_billet,
      type: billet.type_acces || billet.type_billet || billet.code_offre || "Billet",
      prix,
      mode: currentBilletsSubMode,
      tarifChoisi,
      numeroEtu,
      numeroReservation: reservationInfo.useReservation ? reservationInfo.numeroReservation : ""
    };
    renderTicketPreview();
    showResult("Type et prix chargés depuis Appwrite. Ajoutez le billet au panier.", "success");
  } catch (error) {
    console.error("[BILLETS] Recherche impossible :", error);
    showResult(error?.message || "Impossible de charger ce billet.", "error");
  } finally {
    resetButtonLoading(button);
  }
}

function ajouterBilletAuPanier() {
  if (!ticketEnApercu) return;
  ticketPanier.push(ticketEnApercu);
  ticketEnApercu = null;
  if ($("ticketNumber")) $("ticketNumber").value = "";
  renderTicketPreview();
  renderTicketCart();
  clearResult();
  $("ticketNumber")?.focus();
}

async function enregistrerBilletDuPanier(item, paiement) {
  const tableId = item.mode === "ENTREE" ? APPWRITE_BILLETS_TABLE_ID : APPWRITE_BILLETS_INTERNE_TABLE_ID;
  const ticketResult = await db.listDocuments(APPWRITE_DATABASE_ID, tableId, [
    Appwrite.Query.equal("numero_billet", item.numero_billet),
    Appwrite.Query.limit(1)
  ]);
  const billet = ticketResult.documents?.[0];
  if (!billet || !CalypsoTicketWorkflow.canSell(billet.statut)) {
    throw new Error(`Le billet ${item.numero_billet} n’est plus disponible.`);
  }
  const prixActuel = CalypsoTicketWorkflow.getTicketPrice(billet, item.tarifChoisi);
  if (prixActuel !== item.prix) {
    throw new Error(`Le prix du billet ${item.numero_billet} a changé. Rechargez-le dans le panier.`);
  }

  if (item.mode === "ENTREE") {
    await journaliserValidationEntree({
      billet,
      tarifChoisi: item.tarifChoisi,
      numeroEtu: item.numeroEtu,
      paiement,
      numeroReservation: item.numeroReservation
    });
    const update = { statut: CalypsoConfig.ticketStatuses.vendu };
    if (item.numeroReservation) update.reservation = item.numeroReservation;
    await db.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_BILLETS_TABLE_ID, billet.$id, update);
    if (item.numeroReservation) {
      const reservation = await verifierReservationActive(item.numeroReservation);
      if (reservation) {
        await db.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_RESERVATION_COLLECTION_ID, reservation.$id, { actif: false });
      }
    }
    return;
  }

  await db.createDocument(APPWRITE_DATABASE_ID, APPWRITE_VALIDATIONS_TABLE_ID, Appwrite.ID.unique(), {
    numero_billet: billet.numero_billet,
    billet_id: billet.$id,
    date_validation: new Date().toISOString(),
    type_acces: billet.type_billet || "Jeu interne",
    type_billet: billet.type_billet || "Jeu interne",
    code_offre: billet.code_offre || "JEU",
    tarif_normal: item.prix,
    tarif_etudiant: 0,
    tarif_applique: "normal",
    montant_paye: item.prix,
    agent_id: currentAgent.$id || "",
    poste_id: "INTERNE",
    numero_etudiant: "",
    moyen_paiement: "especes",
    montant_recu: paiement.montantRecu,
    monnaie_rendue: paiement.monnaieRendue,
    session_caisse_id: currentCashSession.$id
  });
  await db.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_BILLETS_INTERNE_TABLE_ID, billet.$id, { statut: "Validé" });
}

async function validerPanierBillets() {
  clearResult();
  if (!currentAgent || !isGerantAgent() || !currentCashSession) {
    showResult("Connectez-vous comme gérant et ouvrez votre caisse.", "error");
    return;
  }
  if (!navigator.onLine) {
    showResult("Connexion requise pour valider le panier.", "error");
    return;
  }
  if (ticketPanier.length === 0) {
    showResult("Ajoutez au moins un billet au panier.", "warn");
    return;
  }

  const total = CalypsoTicketWorkflow.getCartTotal(ticketPanier);
  let paiement;
  try {
    paiement = getCashDetails("ticketCashReceived", total);
  } catch (error) {
    showResult(error.message, "error");
    return;
  }

  const button = $("btnValidateTicketCart");
  setButtonLoading(button, "Encaissement…");
  let completed = 0;
  try {
    for (const [index, item] of [...ticketPanier].entries()) {
      await enregistrerBilletDuPanier(item, {
        moyenPaiement: "especes",
        montantRecu: index === 0 ? paiement.montantRecu : 0,
        monnaieRendue: index === 0 ? paiement.monnaieRendue : 0
      });
      completed += 1;
    }
    ticketPanier = [];
    $("ticketCashReceived").value = "";
    renderTicketCart();
    lastVerifiedEtudiant = null;
    resetReservationForm();
    chargerNombreBillets();
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
    showResult(`${completed} billet${completed > 1 ? "s" : ""} vendu${completed > 1 ? "s" : ""} ✅ — monnaie : ${formatMontantGNF(paiement.monnaieRendue)}.`, "success");
  } catch (error) {
    ticketPanier = ticketPanier.slice(completed);
    renderTicketCart();
    console.error("[BILLETS] Panier partiellement enregistré :", error);
    showResult(`${completed} billet(s) enregistré(s). ${error?.message || "La suite du panier a été arrêtée."}`, "error");
  } finally {
    resetButtonLoading(button);
    if (button) button.textContent = "Valider le panier";
  }
}

// ===============================
//  VALIDATION BILLET ENTREE
// ===============================

async function validerBilletEntree(numeroBillet, numeroEtu, tarifChoisi) {
  const reservationInfo = getReservationInfoFromForm();

  const useReservation = reservationInfo.useReservation;
  const numeroReservation = reservationInfo.numeroReservation;

  let reservationDoc = null;

  if (useReservation) {
    reservationDoc = await verifierReservationActive(numeroReservation);
    if (!reservationDoc) return;

    const dejaLiee = await verifierReservationDejaLiee(numeroReservation);

    if (dejaLiee === "ERROR") return;

    if (dejaLiee) {
      showResult(
        `Cette réservation est déjà affiliée au billet ${dejaLiee.numero_billet || ""}.`,
        "error"
      );
      return;
    }
  }

  let billet;

  const billetRes = await db.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_BILLETS_TABLE_ID,
    [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.limit(1)
    ]
  );

  if (!billetRes.documents || billetRes.documents.length === 0) {
    showResult(`Billet ${numeroBillet} introuvable.`, "error");
    return;
  }

  billet = billetRes.documents[0];

  if (!CalypsoTicketWorkflow.canSell(billet.statut)) {
    showResult(CalypsoTicketWorkflow.getSaleRefusal(billet.statut), "error");
    return;
  }


  const ventesExistantes = await db.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_VALIDATIONS_TABLE_ID,
    [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.limit(25)
    ]
  );
  const venteDejaJournalisee = (ventesExistantes.documents || []).some(
    (item) => ["VENTE_ENTREE", "ENTREE"].includes(item.poste_id)
  );
  if (venteDejaJournalisee) {
    showResult(`Billet ${numeroBillet} déjà vendu ou utilisé.`, "error");
    return;
  }

  if (billet.reservation) {
    showResult(
      `Ce billet est déjà affilié à la réservation ${billet.reservation}.`,
      "error"
    );
    return;
  }

  if (tarifChoisi === "etudiant") {
    const okEtudiant = await verifierTarifEtudiantAvantValidation(numeroEtu);
    if (!okEtudiant) return;
  }

  const montantBillet = tarifChoisi === "etudiant"
    ? Number(billet.tarif_universite || 0)
    : Number(billet.prix || 0);
  let paiement;
  try {
    paiement = getCashDetails("ticketCashReceived", montantBillet);
  } catch (error) {
    showResult(error.message, "error");
    return;
  }

  const updateBilletData = { statut: CalypsoConfig.ticketStatuses.vendu };

  if (useReservation) {
    updateBilletData.reservation = numeroReservation;
  }

  await journaliserValidationEntree({
    billet,
    tarifChoisi,
    numeroEtu,
    paiement,
    numeroReservation: useReservation ? numeroReservation : ""
  });

  await db.updateDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_BILLETS_TABLE_ID,
    billet.$id,
    updateBilletData
  );

  if (useReservation && reservationDoc) {
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      reservationDoc.$id,
      { actif: false }
    );
  }

  const ticketInput = $("ticketNumber");
  if (ticketInput) ticketInput.value = "";
  if ($("ticketCashReceived")) $("ticketCashReceived").value = "";
  if ($("ticketChange")) $("ticketChange").textContent = "Monnaie à rendre : 0 GNF";

  if (useReservation) resetReservationForm();

  lastVerifiedEtudiant = null;
  chargerNombreBillets();

  showResult(
    useReservation
      ? `Billet ${numeroBillet} VENDU ✅ et lié à ${numeroReservation}. Monnaie : ${formatMontantGNF(paiement.monnaieRendue)}.`
      : `Billet ${numeroBillet} VENDU ✅. Monnaie : ${formatMontantGNF(paiement.monnaieRendue)}.`,
    "success"
  );

  currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
  renderCashRegister();
  ticketInput?.focus();
}

async function verifierTarifEtudiantAvantValidation(numeroEtu) {
  if (!numeroEtu) {
    showResult(
      "Pour le tarif étudiant, le numéro étudiant est obligatoire.",
      "error"
    );
    return false;
  }

  if (!lastVerifiedEtudiant || lastVerifiedEtudiant !== numeroEtu) {
    showResult(
      "Veuillez d'abord cliquer sur « Vérifier l'étudiant » pour ce numéro, puis valider le billet.",
      "error"
    );
    return false;
  }

  try {
    const etuRes = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_etudiant", numeroEtu),
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(1)
      ]
    );

    if (!etuRes.documents || etuRes.documents.length === 0) {
      showResult(
        "Numéro étudiant introuvable ou inactif. L'étudiant doit être enregistré par l'administrateur.",
        "error"
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error("[AGENT] Erreur vérification étudiant :", err);
    showResult("Erreur lors de la vérification du numéro étudiant.", "error");
    return false;
  }
}

async function journaliserValidationEntree({
  billet,
  tarifChoisi,
  numeroEtu,
  paiement,
  numeroReservation
}) {
  const nowIso = new Date().toISOString();

    const montantNormal = parseInt(billet.prix || 0, 10) || 0;
    const montantEtudiant = parseInt(billet.tarif_universite || 0, 10) || 0;

    const montantPaye =
      tarifChoisi === "etudiant" ? montantEtudiant : montantNormal;

    const validationDoc = {
      numero_billet: billet.numero_billet,
      billet_id: billet.$id,
      date_validation: nowIso,
      type_acces: billet.type_acces || "",
      type_billet: billet.type_billet || "",
      code_offre: billet.code_offre || "ENTREE",
      tarif_normal: montantNormal,
      tarif_etudiant: montantEtudiant,
      tarif_applique: tarifChoisi,
      montant_paye: montantPaye,
      agent_id: currentAgent.$id || "",
      poste_id: "VENTE_ENTREE",
      numero_etudiant: numeroEtu || "",
      moyen_paiement: paiement.moyenPaiement,
      montant_recu: paiement.montantRecu,
      monnaie_rendue: paiement.monnaieRendue,
      session_caisse_id: currentCashSession.$id
    };

  return db.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_VALIDATIONS_TABLE_ID,
    Appwrite.ID.unique(),
    validationDoc
  );
}

async function confirmerEntree() {
  const input = $("controlTicketNumber");
  const button = $("btnConfirmEntry");
  const result = $("control-result");
  const numeroBillet = input?.value.trim() || "";

  function render(text, type) {
    if (!result) return;
    result.style.display = "block";
    result.className = `result ${type}`;
    result.textContent = text;
  }

  if (!currentAgent || !isControleAgent()) {
    render("Votre rôle ne permet pas de confirmer une entrée.", "error");
    return;
  }
  if (!navigator.onLine) {
    render("Connexion requise pour confirmer l’entrée.", "error");
    return;
  }
  if (!numeroBillet) {
    render("Saisissez le numéro du billet.", "error");
    input?.focus();
    return;
  }

  setButtonLoading(button, "Contrôle…");
  try {
    const ticketResult = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.equal("numero_billet", numeroBillet), Appwrite.Query.limit(1)]
    );
    const billet = ticketResult.documents?.[0];
    if (!billet) {
      render(`Billet ${numeroBillet} inconnu : entrée refusée.`, "error");
      return;
    }

    if (!CalypsoTicketWorkflow.canConfirm(billet.statut)) {
      render(CalypsoTicketWorkflow.getConfirmationRefusal(billet.statut), "error");
      return;
    }

    const journalResult = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [Appwrite.Query.equal("numero_billet", numeroBillet), Appwrite.Query.limit(25)]
    );
    const events = journalResult.documents || [];
    const vente = events.find((item) => item.poste_id === "VENTE_ENTREE");
    const dejaConfirme = events.some((item) => item.poste_id === "CONTROLE_ENTREE");
    if (!vente) {
      render("Vente introuvable dans le journal : entrée refusée et anomalie à vérifier.", "error");
      return;
    }
    if (dejaConfirme) {
      render("Double utilisation : cette entrée est déjà confirmée.", "error");
      return;
    }

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: billet.numero_billet,
        billet_id: billet.$id,
        date_validation: new Date().toISOString(),
        type_acces: billet.type_acces || "",
        type_billet: billet.type_billet || "",
        code_offre: billet.code_offre || "ENTREE",
        tarif_normal: Number(billet.prix || 0),
        tarif_etudiant: Number(billet.tarif_universite || 0),
        tarif_applique: "controle",
        montant_paye: 0,
        agent_id: currentAgent.$id || "",
        poste_id: "CONTROLE_ENTREE",
        numero_etudiant: "",
        moyen_paiement: vente.moyen_paiement || "",
        montant_recu: 0,
        monnaie_rendue: 0
      }
    );

    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: CalypsoConfig.ticketStatuses.confirme }
    );

    input.value = "";
    render(`Entrée confirmée ✅ — billet ${numeroBillet}.`, "ok");
  } catch (error) {
    console.error("[CONTROLE] Erreur :", error);
    render(error?.message || "Impossible de confirmer ce billet.", "error");
  } finally {
    resetButtonLoading(button);
    if (button) button.textContent = "Confirmer l’entrée";
    input?.focus();
  }
}

// ===============================
//  VALIDATION BILLET JEU INTERNE
//  AUCUNE RESERVATION ICI
// ===============================

async function validerBilletJeuInterne(numeroBillet) {
  if (!isGerantAgent()) {
    showResult("Seul le gérant peut vendre les billets de jeux internes.", "error");
    return;
  }

  const res = await db.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_BILLETS_INTERNE_TABLE_ID,
    [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.limit(1)
    ]
  );

  if (!res.documents || res.documents.length === 0) {
    showResult(`Billet jeu ${numeroBillet} introuvable.`, "error");
    return;
  }

  const billet = res.documents[0];

  if (!CalypsoTicketWorkflow.canSell(billet.statut)) {
    showResult(`Billet jeu ${numeroBillet} déjà vendu ou utilisé ❌`, "error");
    return;
  }

  const valRes = await db.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_VALIDATIONS_TABLE_ID,
    [
      Appwrite.Query.equal("numero_billet", numeroBillet),
      Appwrite.Query.equal("poste_id", "INTERNE"),
      Appwrite.Query.limit(1)
    ]
  );

  if (valRes.documents && valRes.documents.length > 0) {
    showResult(`Billet jeu ${numeroBillet} déjà utilisé ❌`, "error");
    return;
  }

  const montant = parseInt(billet.prix || 0, 10) || 0;
  const nowIso = new Date().toISOString();
  let paiement;
  try {
    paiement = getCashDetails("ticketCashReceived", montant);
  } catch (error) {
    showResult(error.message, "error");
    return;
  }

  await db.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_VALIDATIONS_TABLE_ID,
    Appwrite.ID.unique(),
    {
      numero_billet: numeroBillet,
      billet_id: billet.$id,
      date_validation: nowIso,
      type_acces: billet.type_billet || "Jeu interne",
      type_billet: billet.type_billet || "Jeu interne",
      code_offre: billet.code_offre || "JEU",
      tarif_normal: montant,
      tarif_etudiant: 0,
      tarif_applique: "normal",
      montant_paye: montant,
      agent_id: currentAgent.$id || "",
      poste_id: "INTERNE",
      numero_etudiant: "",
      moyen_paiement: paiement.moyenPaiement,
      montant_recu: paiement.montantRecu,
      monnaie_rendue: paiement.monnaieRendue,
      session_caisse_id: currentCashSession.$id
    }
  );

  await db.updateDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_BILLETS_INTERNE_TABLE_ID,
    billet.$id,
    { statut: "Validé" }
  );

  const ticketInput = $("ticketNumber");
  if (ticketInput) ticketInput.value = "";
  if ($("ticketCashReceived")) $("ticketCashReceived").value = "";

  chargerNombreBillets();

  showResult(
    `Billet jeu ${numeroBillet} VENDU ✅ (${billet.type_billet || "Jeu interne"} – ${formatMontantGNF(montant)}). Monnaie : ${formatMontantGNF(paiement.monnaieRendue)}.`,
    "success"
  );
  currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
  renderCashRegister();
}

// ===============================
//  VERIFICATION SIMPLE ETUDIANT
// ===============================

async function verifierEtudiant() {
  const numeroEtu = $("etuNumber")?.value.trim();
  const zoneInfo = $("etu-info");

  if (!zoneInfo) return;

  zoneInfo.style.display = "block";
  zoneInfo.className = "result";
  zoneInfo.textContent = "";

  lastVerifiedEtudiant = null;

  if (!numeroEtu) {
    zoneInfo.classList.add("error");
    zoneInfo.textContent = "Veuillez saisir un numéro étudiant.";
    return;
  }

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_etudiant", numeroEtu),
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      zoneInfo.classList.add("error");
      zoneInfo.textContent =
        "Numéro étudiant introuvable ou inactif. Vérifiez avec l'administration.";
      return;
    }

    const etu = res.documents[0];

    lastVerifiedEtudiant = numeroEtu;

    zoneInfo.classList.add("ok");
    zoneInfo.innerHTML =
      `Étudiant trouvé : <strong>${etu.prenom} ${etu.nom}</strong> – ` +
      `${etu.universite || "Université non renseignée"}<br>` +
      `<small>Comparez avec la pièce d'identité avant de valider le billet.</small>`;
  } catch (err) {
    console.error("[AGENT] Erreur vérification étudiant :", err);
    zoneInfo.classList.add("error");
    zoneInfo.textContent = "Erreur lors de la vérification du numéro étudiant.";
  }
}

// ===============================
//  RESTO
// ===============================

function creerOngletsCategories() {
  const categoriesTabs = $("restoCategoriesTabs");
  if (!categoriesTabs) return;

  const categories = Array.from(
    new Set(restoProduitsCache.map((p) => p.categorie || "Autre"))
  ).sort();

  categoriesTabs.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "resto-category-tab active";
  allButton.textContent = "Tous les plats";

  allButton.onclick = () => {
    document.querySelectorAll(".resto-category-tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    allButton.classList.add("active");
    afficherTousLesProduits();
  };

  categoriesTabs.appendChild(allButton);

  categories.forEach((categorie) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "resto-category-tab";
    button.textContent = categorie;

    button.onclick = () => {
      document.querySelectorAll(".resto-category-tab").forEach((tab) => {
        tab.classList.remove("active");
      });

      button.classList.add("active");
      filtrerProduitsParCategorie(categorie);
    };

    categoriesTabs.appendChild(button);
  });
}

function afficherTousLesProduits() {
  afficherProduits(restoProduitsCache);
}

function filtrerProduitsParCategorie(categorie) {
  const produitsFiltres = restoProduitsCache.filter(
    (p) => (p.categorie || "Autre") === categorie
  );

  afficherProduits(produitsFiltres);
}

function afficherProduits(produits) {
  const productsGrid = $("restoProductsGrid");
  if (!productsGrid) return;

  if (!produits || produits.length === 0) {
    productsGrid.innerHTML = `
      <div class="resto-loading">
        Aucun produit dans cette catégorie
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = produits
    .map(
      (produit) => `
        <div class="resto-product-card" onclick="ajouterProduitAuPanier('${produit.code_produit}')">
          <div class="resto-product-name">${produit.libelle}</div>
          <div class="resto-product-price">${formatMontantGNF(produit.prix_unitaire)}</div>
          <div style="margin-top:0.5rem;">
            <button type="button" class="btn-primary" style="padding:0.5rem 1rem; font-size:0.9rem;">
              + Ajouter
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

async function chargerProduitsResto() {
  const productsGrid = $("restoProductsGrid");
  if (!productsGrid) return;

  productsGrid.innerHTML = '<div class="resto-loading">Chargement du menu...</div>';

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(200)
      ]
    );

    restoProduitsCache = res.documents || [];

    if (restoProduitsCache.length === 0) {
      productsGrid.innerHTML = `
        <div class="resto-loading" style="color:var(--accent-primary);">
          ❌ Aucun produit trouvé dans le menu
        </div>
      `;
      return;
    }

    await initialiserDernierNumeroVente();
    creerOngletsCategories();
    afficherTousLesProduits();
  } catch (err) {
    console.error("[RESTO] Erreur chargement menu :", err);

    productsGrid.innerHTML = `
      <div class="resto-loading" style="color:var(--accent-primary);">
        ❌ Erreur de chargement du menu : ${err.message}
      </div>
    `;
  }
}

async function initialiserDernierNumeroVente() {
  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.orderDesc("$createdAt"),
        Appwrite.Query.limit(1)
      ]
    );

    if (res.documents.length > 0) {
      const lastNum = res.documents[0].numero_vente;
      const match = lastNum && lastNum.match(/V-(\d+)/);

      if (match) {
        lastVenteNumber = parseInt(match[1], 10) || 0;
      }
    }
  } catch (err) {
    console.warn("[RESTO] Impossible de récupérer le dernier numéro de vente :", err);
    lastVenteNumber = 0;
  }
}

function genererNumeroVente() {
  lastVenteNumber += 1;
  return `V-${lastVenteNumber.toString().padStart(3, "0")}`;
}

function ajouterProduitAuPanier(codeProduit) {
  const produit = restoProduitsCache.find(
    (p) => p.code_produit === codeProduit
  );

  if (!produit) return;

  const existant = restoPanier.find(
    (item) => item.code_produit === codeProduit
  );

  if (existant) {
    existant.quantite += 1;
  } else {
    restoPanier.push({
      code_produit: produit.code_produit,
      libelle: produit.libelle,
      prix_unitaire: Number(produit.prix_unitaire) || 0,
      quantite: 1
    });
  }

  actualiserPanier();
  showTempMessage(`✅ ${produit.libelle} ajouté au panier`, "success");
}

function showTempMessage(text, type) {
  const msg = $("restoResult");
  if (!msg) return;

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "result";

  if (type === "success") msg.classList.add("ok");
  else if (type === "error") msg.classList.add("error");
  else if (type === "warn") msg.classList.add("warn");

  setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}

function actualiserPanier() {
  const cartItems = $("restoCartItems");
  const cartCount = $("restoCartCount");
  const cartTotal = $("restoCartTotal");
  const validerBtn = $("btnRestoValider");

  if (!cartItems) return;

  const totalArticles = restoPanier.reduce(
    (sum, item) => sum + item.quantite,
    0
  );

  const totalMontant = restoPanier.reduce(
    (sum, item) => sum + item.prix_unitaire * item.quantite,
    0
  );

  if (cartCount) cartCount.textContent = `${totalArticles} article(s)`;
  if (cartTotal) cartTotal.textContent = formatMontantGNF(totalMontant);
  if (validerBtn) validerBtn.disabled = totalArticles === 0;
  updateRestoChange();

  if (restoPanier.length === 0) {
    cartItems.innerHTML = '<div class="resto-cart-empty">Panier vide</div>';
    return;
  }

  cartItems.innerHTML = restoPanier
    .map(
      (item, index) => `
        <div class="resto-cart-item">
          <div class="resto-cart-item-info">
            <div class="resto-cart-item-name">${item.libelle}</div>
            <div class="resto-cart-item-price">${formatMontantGNF(item.prix_unitaire)}/unité</div>
          </div>

          <div class="resto-cart-item-controls">
            <button type="button" class="resto-cart-item-btn" onclick="modifierQuantitePanier(${index}, -1)">-</button>
            <span class="resto-cart-item-quantity">${item.quantite}</span>
            <button type="button" class="resto-cart-item-btn" onclick="modifierQuantitePanier(${index}, 1)">+</button>
            <button type="button" class="resto-cart-item-btn resto-cart-item-remove" onclick="supprimerDuPanier(${index})">×</button>
          </div>
        </div>
      `
    )
    .join("");
}

function updateRestoChange() {
  const output = $("restoChange");
  if (!output) return;
  const total = restoPanier.reduce((sum, item) => sum + item.prix_unitaire * item.quantite, 0);
  const received = Number($("restoCashReceived")?.value || 0);
  const change = CalypsoTicketWorkflow.getCashChange(total, received);
  output.textContent = change == null
    ? `Reste à recevoir : ${formatMontantGNF(Math.max(0, total - received))}`
    : `Monnaie à rendre : ${formatMontantGNF(change)}`;
}

function modifierQuantitePanier(index, delta) {
  if (index < 0 || index >= restoPanier.length) return;

  const newQte = restoPanier[index].quantite + delta;

  if (newQte <= 0) {
    supprimerDuPanier(index);
  } else {
    restoPanier[index].quantite = newQte;
    actualiserPanier();
  }
}

function supprimerDuPanier(index) {
  if (index < 0 || index >= restoPanier.length) return;

  const nom = restoPanier[index].libelle;

  restoPanier.splice(index, 1);
  actualiserPanier();

  showTempMessage(`🗑️ ${nom} retiré du panier`, "warn");
}

function viderPanier() {
  if (restoPanier.length === 0) return;

  if (confirm("Vider tout le panier ?")) {
    restoPanier = [];
    actualiserPanier();
    showTempMessage("🔄 Panier vidé", "warn");
  }
}

async function enregistrerVenteResto() {
  if (!currentAgent) {
    showTempMessage("❌ Veuillez vous connecter", "error");
    return;
  }

  if (!navigator.onLine) {
    showTempMessage("❌ Connexion requise pour enregistrer la vente", "error");
    return;
  }

  if (restoPanier.length === 0) {
    showTempMessage("🛒 Le panier est vide", "warn");
    return;
  }


  if (!isRestoAgent()) {
    showTempMessage("❌ Votre rôle ne permet pas d’encaisser en restauration", "error");
    return;
  }


  if (!currentCashSession) {
    showTempMessage("❌ Ouvrez votre caisse avant la vente", "error");
    return;
  }

  const numeroVente = genererNumeroVente();
  const nowIso = new Date().toISOString();

  const orderType =
    document.querySelector('input[name="orderType"]:checked')?.value ||
    "sur_place";

  const notes = $("restoOrderNotes")?.value.trim() || "";

  const totalCommande = restoPanier.reduce(
    (total, item) => total + item.prix_unitaire * item.quantite,
    0
  );
  let paiement;
  try {
    paiement = getCashDetails("restoCashReceived", totalCommande);
  } catch (error) {
    showTempMessage(`❌ ${error.message}`, "error");
    return;
  }

  let totalGlobal = 0;

  try {
    for (const [index, item] of restoPanier.entries()) {
      const montant = item.prix_unitaire * item.quantite;

      totalGlobal += montant;

      await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_VENTES_RESTO_COLLECTION_ID,
        Appwrite.ID.unique(),
        {
          numero_vente: numeroVente,
          date_vente: nowIso,
          code_produit: item.code_produit,
          quantite: item.quantite,
          montant_total: montant,
          agent_id: currentAgent.$id,
          poste_id: "RESTO",
          moyen_paiement: paiement.moyenPaiement,
          montant_recu: index === 0 ? paiement.montantRecu : 0,
          monnaie_rendue: index === 0 ? paiement.monnaieRendue : 0,
          session_caisse_id: currentCashSession.$id
        }
      );
    }

    afficherReçu(numeroVente, totalGlobal, orderType, notes);

    if ($("restoCashReceived")) $("restoCashReceived").value = "";
    if ($("restoChange")) {
      $("restoChange").textContent = `Monnaie rendue : ${formatMontantGNF(paiement.monnaieRendue)}`;
    }
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();

    const msg = $("restoResult");
    if (msg) msg.style.display = "none";
  } catch (err) {
    console.error("[RESTO] Erreur enregistrement vente :", err);
    showTempMessage("❌ Erreur lors de l'enregistrement", "error");
  }
}

function afficherReçu(numeroVente, total, orderType, notes) {
  const receipt = $("restoReceipt");
  const receiptNumber = $("receiptNumber");
  const receiptContent = $("receiptContent");
  const productsSide = document.querySelector(".resto-products-side");

  if (!receipt) return;

  if (receiptNumber) receiptNumber.textContent = numeroVente;

  let html = `
    <div style="margin-bottom:1rem;">
      <div><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</div>
      <div><strong>Type :</strong> ${orderType === "sur_place" ? "Sur place" : "À emporter"}</div>
      ${
        notes
          ? `<div><strong>Notes :</strong> ${notes.replace(/</g, "&lt;")}</div>`
          : ""
      }
    </div>

    <div style="border-bottom:1px dashed #ccc; margin-bottom:0.5rem;"></div>
  `;

  restoPanier.forEach((item) => {
    const sousTotal = item.prix_unitaire * item.quantite;

    html += `
      <div class="receipt-item">
        <div>${item.quantite}x ${item.libelle}</div>
        <div>${sousTotal.toLocaleString("fr-FR")} GNF</div>
      </div>
    `;
  });

  html += `
    <div style="border-bottom:1px dashed #ccc; margin:0.5rem 0;"></div>

    <div class="receipt-item receipt-total">
      <div>TOTAL</div>
      <div>${total.toLocaleString("fr-FR")} GNF</div>
    </div>

    <div style="text-align:center; margin-top:1rem; font-style:italic;">
      Merci pour votre commande !
    </div>
  `;

  if (receiptContent) receiptContent.innerHTML = html;

  receipt.style.display = "block";

  if (productsSide) productsSide.style.display = "none";

  restoPanier = [];
  actualiserPanier();
}

function nouvelleCommandeResto() {
  const receipt = $("restoReceipt");
  const productsSide = document.querySelector(".resto-products-side");
  const notes = $("restoOrderNotes");

  if (productsSide) productsSide.style.display = "block";
  if (receipt) receipt.style.display = "none";
  if (notes) notes.value = "";

  showTempMessage("🆕 Nouvelle commande prête", "success");
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded - RESERVATION ENTREE UNIQUEMENT");

  appliquerEtatConnexion(null);
  updateTarifEtudiantVisibility();
  updateReservationVisibility();
  renderTicketCart();

  const btnLogin = $("btnLogin");
  const btnLogout = $("btnLogout");
  const btnSaveAgentProfile = $("btnSaveAgentProfile");

  if (btnLogin) {
    btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      connecterAgent();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      deconnexionAgent();
    });
  }

  if (btnSaveAgentProfile) {
    btnSaveAgentProfile.addEventListener("click", (e) => {
      e.preventDefault();
      enregistrerProfilAgent();
    });
  }

  const btnModeBillets = $("btnModeBillets");
  const btnModeControle = $("btnModeControle");
  const btnModeResto = $("btnModeResto");
  const btnOpenCash = $("btnOpenCash");
  const btnCloseCash = $("btnCloseCash");

  if (btnOpenCash) btnOpenCash.addEventListener("click", ouvrirCaisse);
  if (btnCloseCash) btnCloseCash.addEventListener("click", cloturerCaisse);

  if (btnModeBillets) {
    btnModeBillets.addEventListener("click", (e) => {
      e.preventDefault();
      switchMode("billets");
      chargerNombreBillets();
    });
  }

  if (btnModeResto) {
    btnModeResto.addEventListener("click", (e) => {
      e.preventDefault();
      switchMode("resto");
    });
  }


  if (btnModeControle) {
    btnModeControle.addEventListener("click", (e) => {
      e.preventDefault();
      switchMode("controle");
    });
  }

  const btnBilletsEntree = $("btnBilletsEntree");
  const btnBilletsJeux = $("btnBilletsJeux");

  if (btnBilletsEntree) {
    btnBilletsEntree.addEventListener("click", (e) => {
      e.preventDefault();
      switchBilletsSubMode("ENTREE");
    });
  }

  if (btnBilletsJeux) {
    btnBilletsJeux.addEventListener("click", (e) => {
      e.preventDefault();
      switchBilletsSubMode("JEU");
    });
  }

  const btnLookupTicket = $("btnLookupTicket");
  const btnAddTicket = $("btnAddTicket");
  const btnValidateTicketCart = $("btnValidateTicketCart");
  const btnClearTicketCart = $("btnClearTicketCart");
  const ticketCartItems = $("ticketCartItems");
  const ticketCashReceived = $("ticketCashReceived");

  if (btnLookupTicket) {
    btnLookupTicket.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  if (btnAddTicket) btnAddTicket.addEventListener("click", ajouterBilletAuPanier);
  if (btnValidateTicketCart) btnValidateTicketCart.addEventListener("click", validerPanierBillets);
  if (btnClearTicketCart) {
    btnClearTicketCart.addEventListener("click", () => {
      ticketPanier = [];
      ticketEnApercu = null;
      renderTicketPreview();
      renderTicketCart();
      clearResult();
    });
  }
  if (ticketCartItems) {
    ticketCartItems.addEventListener("click", (event) => {
      const remove = event.target.closest(".ticket-cart-remove");
      if (!remove) return;
      ticketPanier.splice(Number(remove.dataset.index), 1);
      renderTicketCart();
    });
  }
  if (ticketCashReceived) ticketCashReceived.addEventListener("input", updateTicketChange);


  const ticketNumberInput = $("ticketNumber");
  if (ticketNumberInput) {
    ticketNumberInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        verifierBillet();
      }
    });
  }

  const btnConfirmEntry = $("btnConfirmEntry");
  const controlTicketInput = $("controlTicketNumber");
  if (btnConfirmEntry) {
    btnConfirmEntry.addEventListener("click", (event) => {
      event.preventDefault();
      confirmerEntree();
    });
  }
  if (controlTicketInput) {
    controlTicketInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirmerEntree();
      }
    });
  }

  const btnCheckStudent = $("btnCheckStudent");

  if (btnCheckStudent) {
    btnCheckStudent.addEventListener("click", (e) => {
      e.preventDefault();
      verifierEtudiant();
    });
  }

  const radioNormal = $("tarif-normal");
  const radioEtu = $("tarif-etudiant");

  if (radioNormal) {
    radioNormal.addEventListener("change", () => {
      lastVerifiedEtudiant = null;
      updateTarifEtudiantVisibility();
    });
  }

  if (radioEtu) {
    radioEtu.addEventListener("change", () => {
      lastVerifiedEtudiant = null;
      updateTarifEtudiantVisibility();
    });
  }

  const etuInput = $("etuNumber");

  if (etuInput) {
    etuInput.addEventListener("input", () => {
      lastVerifiedEtudiant = null;

      const zoneInfo = $("etu-info");

      if (zoneInfo) {
        zoneInfo.style.display = "none";
        zoneInfo.textContent = "";
        zoneInfo.className = "result";
      }
    });
  }

  const useReservationCheckbox = $("useReservation");
  const reservationNumberZone = $("reservation-number-zone");
  const reservationNumberInput = $("reservationNumber");

  if (useReservationCheckbox && reservationNumberZone) {
    useReservationCheckbox.addEventListener("change", () => {
      reservationNumberZone.style.display = useReservationCheckbox.checked
        ? "block"
        : "none";

      if (!useReservationCheckbox.checked && reservationNumberInput) {
        reservationNumberInput.value = "";
      }
    });
  }

  if (reservationNumberInput) {
    reservationNumberInput.addEventListener("input", () => {
      reservationNumberInput.value = reservationNumberInput.value.toUpperCase();
    });
  }

  const btnRestoValider = $("btnRestoValider");
  const btnRestoVider = $("btnRestoVider");
  const btnRestoNouvelleCommande = $("btnRestoNouvelleCommande");
  const btnRestoImprimer = $("btnRestoImprimer");
  const restoCashReceived = $("restoCashReceived");

  if (restoCashReceived) restoCashReceived.addEventListener("input", updateRestoChange);

  if (btnRestoValider) {
    btnRestoValider.addEventListener("click", (e) => {
      e.preventDefault();
      enregistrerVenteResto();
    });
  }

  if (btnRestoVider) {
    btnRestoVider.addEventListener("click", (e) => {
      e.preventDefault();
      viderPanier();
    });
  }

  if (btnRestoNouvelleCommande) {
    btnRestoNouvelleCommande.addEventListener("click", (e) => {
      e.preventDefault();
      nouvelleCommandeResto();
    });
  }

  if (btnRestoImprimer) {
    btnRestoImprimer.addEventListener("click", (e) => {
      e.preventDefault();
      window.print();
    });
  }
});
