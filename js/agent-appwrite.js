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

function getSelectedPayment(groupName) {
  return document.querySelector(`input[name="${groupName}"]:checked`)?.value ||
    CalypsoConfig.paymentMethods.especes;
}

function getCashDetails(groupName, inputId, total) {
  const moyenPaiement = getSelectedPayment(groupName);
  if (moyenPaiement !== CalypsoConfig.paymentMethods.especes) {
    return { moyenPaiement, montantRecu: total, monnaieRendue: 0 };
  }

  const raw = $(inputId)?.value;
  const montantRecu = raw === "" || raw == null ? total : Number(raw);
  if (!Number.isFinite(montantRecu) || montantRecu < total) {
    throw new Error(`Espèces insuffisantes : ${formatMontantGNF(total)} attendus.`);
  }

  return {
    moyenPaiement,
    montantRecu,
    monnaieRendue: montantRecu - total
  };
}

function updatePaymentZone(groupName, zoneId) {
  const zone = $(zoneId);
  if (!zone) return;
  zone.style.display = getSelectedPayment(groupName) === CalypsoConfig.paymentMethods.especes
    ? "grid"
    : "none";
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
  return currentMode === "resto" ? "RESTO" : "GERANT";
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
    ]),
    db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_VENTES_RESTO_COLLECTION_ID, [
      Appwrite.Query.equal("session_caisse_id", session.$id),
      Appwrite.Query.limit(5000)
    ]),
    db.listDocuments(APPWRITE_DATABASE_ID, APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID, [
      Appwrite.Query.equal("session_id", session.$id),
      Appwrite.Query.limit(5000)
    ])
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
    orange: sumByPayment("orange_money"),
    mtn: sumByPayment("mtn_money"),
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
    $("cash-register-title").textContent = getCashPoste() === "GERANT" ? "Caisse du gérant" : "Caisse restauration";
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
    $("cashOrange").textContent = formatMontantGNF(currentCashSummary.orange);
    $("cashMtn").textContent = formatMontantGNF(currentCashSummary.mtn);
    $("cashOperations").textContent = String(currentCashSummary.operations);
  }
}

async function chargerSessionCaisse() {
  currentCashSession = null;
  currentCashSummary = null;
  renderCashRegister();
  if (!currentAgent?.profileComplete || currentMode === "controle") return;
  if (!(isGerantAgent() || isRestoAgent())) return;

  try {
    const result = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_SESSIONS_CAISSE_TABLE_ID,
      [Appwrite.Query.equal("agent_id", currentAgent.$id), Appwrite.Query.limit(100)]
    );
    currentCashSession = (result.documents || []).find(
      (session) => session.poste === getCashPoste() && session.statut === "OUVERTE"
    ) || null;
    if (currentCashSession) currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
  } catch (error) {
    console.error("[CAISSE] Chargement impossible :", error);
    showCashMessage("La caisse n’est pas encore disponible. Contactez l’administrateur.", "error");
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
    currentCashSession = await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SESSIONS_CAISSE_TABLE_ID,
      Appwrite.ID.unique(),
      {
        agent_id: currentAgent.$id,
        agent_nom: currentAgent.nom,
        poste: getCashPoste(),
        statut: "OUVERTE",
        ouverture: new Date().toISOString(),
        fonds_depart: fonds
      }
    );
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
    showCashMessage("Caisse ouverte. Les ventes peuvent commencer.", "success");
  } catch (error) {
    console.error("[CAISSE] Ouverture impossible :", error);
    showCashMessage(error?.message || "Impossible d’ouvrir la caisse.", "error");
  } finally {
    resetButtonLoading(button);
  }
}

async function ajouterMouvementCaisse() {
  if (!currentCashSession) {
    showCashMessage("Ouvrez d’abord votre caisse.", "error");
    return;
  }
  const type = $("cashMovementType")?.value || "";
  const montant = Number($("cashMovementAmount")?.value || 0);
  const motif = $("cashMovementReason")?.value.trim() || "";
  if (!type || montant <= 0 || !motif) {
    showCashMessage("Type, montant et motif sont obligatoires.", "error");
    return;
  }

  const button = $("btnAddCashMovement");
  setButtonLoading(button, "Enregistrement…");
  try {
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_MOUVEMENTS_CAISSE_TABLE_ID,
      Appwrite.ID.unique(),
      {
        session_id: currentCashSession.$id,
        agent_id: currentAgent.$id,
        type,
        montant,
        motif,
        date_mouvement: new Date().toISOString(),
        statut: "EN_ATTENTE"
      }
    );
    $("cashMovementAmount").value = "";
    $("cashMovementReason").value = "";
    currentCashSummary = await calculerSyntheseCaisse(currentCashSession);
    renderCashRegister();
    showCashMessage("Mouvement enregistré, en attente d’approbation.", "success");
  } catch (error) {
    console.error("[CAISSE] Mouvement impossible :", error);
    showCashMessage(error?.message || "Impossible d’enregistrer ce mouvement.", "error");
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
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_SESSIONS_CAISSE_TABLE_ID,
      currentCashSession.$id,
      {
        statut: "CLOTUREE",
        fermeture: new Date().toISOString(),
        especes_attendues: currentCashSummary.especes,
        especes_declarees: especesDeclarees,
        orange_money: currentCashSummary.orange,
        mtn_money: currentCashSummary.mtn,
        ecart,
        commentaire
      }
    );
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

async function verifierBillet() {
  clearResult();

  const btnCheckTicket = $("btnCheckTicket");

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }


  if (!isGerantAgent()) {
    showResult("Seul le gérant peut enregistrer une vente de billet.", "error");
    return;
  }


  if (!currentCashSession || currentCashSession.poste !== "GERANT") {
    showResult("Ouvrez la caisse du gérant avant d’enregistrer une vente.", "error");
    return;
  }

  if (!navigator.onLine) {
    showResult("Connexion requise pour valider un billet.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  const numeroEtu = $("etuNumber")?.value.trim();
  const tarifChoisi = getTarifChoisi();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  setButtonLoading(btnCheckTicket, "Validation en cours...");

  try {
    if (currentBilletsSubMode === "ENTREE") {
      await validerBilletEntree(numeroBillet, numeroEtu, tarifChoisi);
      return;
    }

    if (currentBilletsSubMode === "JEU") {
      await validerBilletJeuInterne(numeroBillet);
      return;
    }
  } finally {
    resetButtonLoading(btnCheckTicket);
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
    paiement = getCashDetails("ticketPayment", "ticketCashReceived", montantBillet);
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
    paiement = getCashDetails("ticketPayment", "ticketCashReceived", montant);
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


  if (!currentCashSession || currentCashSession.poste !== "RESTO") {
    showTempMessage("❌ Ouvrez la caisse restauration avant la vente", "error");
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
    paiement = getCashDetails("restoPayment", "restoCashReceived", totalCommande);
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

  restaurerSessionAgent();
  updateTarifEtudiantVisibility();
  updateReservationVisibility();

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
  const btnAddCashMovement = $("btnAddCashMovement");
  const btnCloseCash = $("btnCloseCash");

  if (btnOpenCash) btnOpenCash.addEventListener("click", ouvrirCaisse);
  if (btnAddCashMovement) btnAddCashMovement.addEventListener("click", ajouterMouvementCaisse);
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

  const btnCheckTicket = $("btnCheckTicket");

  if (btnCheckTicket) {
    btnCheckTicket.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }


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

  document.querySelectorAll('input[name="ticketPayment"]').forEach((input) => {
    input.addEventListener("change", () => updatePaymentZone("ticketPayment", "ticket-cash-zone"));
  });
  document.querySelectorAll('input[name="restoPayment"]').forEach((input) => {
    input.addEventListener("change", () => updatePaymentZone("restoPayment", "resto-cash-zone"));
  });
  updatePaymentZone("ticketPayment", "ticket-cash-zone");
  updatePaymentZone("restoPayment", "resto-cash-zone");

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
