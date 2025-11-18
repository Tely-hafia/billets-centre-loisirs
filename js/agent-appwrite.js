console.log("[AGENT] agent-appwrite.js chargé");

// ===============================
//  CONFIG APPWRITE
// ===============================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_AGENTS_TABLE_ID = "agents";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";
const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";

// ===============================
//  CLIENT APPWRITE
// ===============================

if (typeof Appwrite === "undefined") {
  console.error(
    "[AGENT] Appwrite SDK non chargé. Vérifie le script CDN."
  );
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const db = new Appwrite.Databases(client);

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

// ===============================
//  ETAT GLOBAL
// ===============================

let currentAgent = null;            // Pas de session persistante
let restoProduitsCache = [];
let currentMode = "billets";        // "billets" ou "resto"
let currentBilletsSubMode = "ENTREE"; // "ENTREE" ou "JEU"

// ===============================
//  UI MODES
// ===============================

function switchMode(mode) {
  currentMode = mode;

  const modeBillets = $("mode-billets");
  const modeResto = $("mode-resto");
  const modeLabel = $("mode-label");

  if (modeBillets) modeBillets.style.display = mode === "billets" ? "block" : "none";
  if (modeResto) modeResto.style.display = mode === "resto" ? "block" : "none";
  if (modeLabel) {
    modeLabel.textContent =
      mode === "billets" ? "Contrôle billets" : "Restauration / Chicha";
  }
}

function switchBilletsSubMode(mode) {
  currentBilletsSubMode = mode; // "ENTREE" ou "JEU"

  const btnEntree = $("btnBilletsEntree");
  const btnJeux = $("btnBilletsJeux");
  const hint = $("billetsSubHint");

  if (btnEntree) {
    btnEntree.classList.toggle("active-submode", mode === "ENTREE");
  }
  if (btnJeux) {
    btnJeux.classList.toggle("active-submode", mode === "JEU");
  }

  if (hint) {
    if (mode === "ENTREE") {
      hint.textContent =
        "Mode : billets d’entrée (bracelets). Saisir le numéro imprimé sur le bracelet.";
    } else {
      hint.textContent =
        "Mode : billets JEUX internes. Saisir le numéro imprimé sur le ticket de jeu (ex : J-0001).";
    }
  }
}

// ===============================
//  CONNEXION / ETAT AGENT
// ===============================

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  const loginCard = $("card-login");
  const appZone = $("app-zone");

  const nameEl = $("agent-connected-name");
  const roleEl = $("agent-connected-role");
  const btnModeBillets = $("btnModeBillets");
  const btnModeResto = $("btnModeResto");

  if (agent) {
    // Décodage du rôle pour savoir quels modes on autorise
    const roleStr = (agent.role || "").toLowerCase();

    let canBillets =
      roleStr.includes("billet") ||
      roleStr.includes("entree") ||
      roleStr.includes("entrée") ||
      roleStr.includes("gardien") ||
      roleStr.includes("jeux") ||
      roleStr.includes("interne");

    let canResto =
      roleStr.includes("resto") ||
      roleStr.includes("restaurant") ||
      roleStr.includes("bar") ||
      roleStr.includes("chicha");

    // Si rien n'est détecté, accès aux deux
    if (!canBillets && !canResto) {
      canBillets = true;
      canResto = true;
    }

    // Affichage zone app
    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = agent.login || "";
    if (roleEl) roleEl.textContent = agent.role || "";

    // Afficher/masquer les boutons de mode selon les droits
    if (btnModeBillets) {
      btnModeBillets.style.display = canBillets ? "inline-flex" : "none";
    }
    if (btnModeResto) {
      btnModeResto.style.display = canResto ? "inline-flex" : "none";
    }

    // Mode par défaut selon le type d'agent
    if (canBillets && !canResto) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
      chargerNombreBillets();
    } else if (!canBillets && canResto) {
      switchMode("resto");
    } else {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
      chargerNombreBillets();
    }
  } else {
    // Déconnexion → retour à la page login
    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";

    if (btnModeBillets) btnModeBillets.style.display = "inline-flex";
    if (btnModeResto) btnModeResto.style.display = "inline-flex";

    setTicketCount(0);
    clearResult();
  }
}

async function connecterAgent() {
  const login = $("agentLogin")?.value.trim();
  const password = $("agentPassword")?.value.trim();

  if (!login || !password) {
    showLoginMessage("Veuillez saisir le code agent et le mot de passe.", "error");
    return;
  }

  showLoginMessage("Vérification en cours...", "info");

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_TABLE_ID,
      [
        Appwrite.Query.equal("login", login),
        Appwrite.Query.equal("mot_de_passe", password),
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showLoginMessage("Identifiants invalides ou agent inactif.", "error");
      return;
    }

    const agent = res.documents[0];
    showLoginMessage("Connexion réussie.", "success");
    appliquerEtatConnexion(agent);

  } catch (err) {
    console.error("[AGENT] Erreur connexion agent :", err);
    showLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function deconnexionAgent() {
  appliquerEtatConnexion(null);
  showLoginMessage("Déconnecté.", "info");
}

// ===============================
//  BILLETS : COMPTE ET VALIDATION
// ===============================

async function chargerNombreBillets() {
  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal("statut", "Non utilisé"),
        Appwrite.Query.limit(10000)
      ]
    );
    const nb = res.documents ? res.documents.length : 0;
    setTicketCount(nb);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
  }
}

async function verifierBillet() {
  clearResult();

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  const numeroEtu = $("etuNumber")?.value.trim();
  const tarifChoisi = getTarifChoisi();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  let billet;

  // 1. Partie critique : billet
  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_billet", numeroBillet),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showResult(`Billet ${numeroBillet} introuvable.`, "error");
      return;
    }

    billet = res.documents[0];

    if (billet.statut === "Validé") {
      showResult(`Billet ${numeroBillet} déjà VALIDÉ ❌`, "error");
      return;
    }

    // Vérifier cohérence avec le sous-onglet choisi (Entrée / Jeux)
    const typeBillet = (billet.type_billet || "").toUpperCase();

    if (currentBilletsSubMode === "ENTREE" && typeBillet === "JEU") {
      showResult(
        "Ce numéro correspond à un billet JEUX. Utilisez l'onglet 'Billets Jeux internes'.",
        "error"
      );
      return;
    }

    if (currentBilletsSubMode === "JEU" && typeBillet === "ENTREE") {
      showResult(
        "Ce numéro correspond à un billet d'ENTRÉE. Utilisez l'onglet 'Billets Entrée'.",
        "error"
      );
      return;
    }

    // Tarif étudiant → vérifier étudiant
    if (tarifChoisi === "etudiant") {
      if (!numeroEtu) {
        showResult(
          "Pour le tarif étudiant, le numéro étudiant est obligatoire.",
          "error"
        );
        return;
      }

      try {
        const etuRes = await db.listDocuments(
          APPWRITE_DATABASE_ID,
          APPWRITE_ETUDIANTS_TABLE_ID,
          [
            Appwrite.Query.equal("numero_etudiant", numeroEtu),
            Appwrite.Query.limit(1)
          ]
        );

        if (!etuRes.documents || etuRes.documents.length === 0) {
          showResult(
            "Numéro étudiant introuvable. L'étudiant doit être enregistré par l'administrateur.",
            "error"
          );
          return;
        }
      } catch (errCheck) {
        console.error("[AGENT] Erreur vérification étudiant :", errCheck);
        showResult(
          "Erreur lors de la vérification du numéro étudiant (voir console).",
          "error"
        );
        return;
      }
    }

    // Mise à jour du billet : statut = Validé
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    const typeAcces = billet.type_acces || "";
    const dateAcces = billet.date_acces || "";
    showResult(
      `Billet ${numeroBillet} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      "success"
    );

    const ticketInput = $("ticketNumber");
    if (ticketInput) ticketInput.value = "";

    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] ERREUR critique validation billet :", err);
    showResult("Erreur lors de la vérification (voir console).", "error");
    return;
  }

  // 2. Journalisation dans validations (non bloquant)
  try {
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
      code_offre: billet.code_offre || "",
      tarif_normal: montantNormal,
      tarif_etudiant: montantEtudiant,
      tarif_applique: tarifChoisi,
      montant_paye: montantPaye,
      agent_id: currentAgent.$id || "",
      poste_id: currentAgent.role || "",
      numero_etudiant: numeroEtu || ""
    };

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      validationDoc
    );
  } catch (logErr) {
    console.warn(
      "[AGENT] Erreur lors de l'enregistrement de la validation :",
      logErr
    );
  }
}

// ===============================
//  RESTO / CHICHA
// ===============================

async function chargerProduitsResto() {
  const select = $("restoProduit");
  if (!select) return;

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(100)
      ]
    );

    restoProduitsCache = res.documents || [];

    select.innerHTML = '<option value="">Choisir un produit...</option>';

    restoProduitsCache.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.code_produit;
      opt.textContent = `${p.libelle} – ${formatMontantGNF(p.prix_unitaire)}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("[AGENT] Erreur chargement menu resto :", err);
    select.innerHTML =
      '<option value="">Erreur de chargement du menu</option>';
  }
}

function majAffichageMontantResto() {
  const select = $("restoProduit");
  const qteInput = $("restoQuantite");
  const montantEl = $("restoMontant");
  if (!select || !qteInput || !montantEl) return;

  const produit = restoProduitsCache.find(
    (p) => p.code_produit === select.value
  );

  const qte = parseInt(qteInput.value || "1", 10);
  if (!produit || !qte || qte <= 0) {
    montantEl.textContent = "Montant : 0 GNF";
    return;
  }

  const total = (Number(produit.prix_unitaire) || 0) * qte;
  montantEl.textContent = "Montant : " + formatMontantGNF(total);
}

async function enregistrerVenteResto() {
  const resultZone = $("restoResult");
  const select = $("restoProduit");
  const qteInput = $("restoQuantite");

  if (!resultZone || !select || !qteInput) return;

  resultZone.style.display = "block";

  if (!currentAgent) {
    resultZone.textContent = "Veuillez vous connecter avant d'enregistrer une vente.";
    resultZone.className = "result error";
    return;
  }

  const code = select.value;
  const qte = parseInt(qteInput.value || "1", 10);

  if (!code) {
    resultZone.textContent = "Choisissez un produit.";
    resultZone.className = "result warn";
    return;
  }

  if (!qte || qte <= 0) {
    resultZone.textContent = "La quantité doit être au moins 1.";
    resultZone.className = "result warn";
    return;
  }

  const produit = restoProduitsCache.find(
    (p) => p.code_produit === code
  );

  if (!produit) {
    resultZone.textContent = "Produit introuvable.";
    resultZone.className = "result error";
    return;
  }

  const montant = (Number(produit.prix_unitaire) || 0) * qte;
  const numeroTicket =
    "R-" + Date.now().toString(36).toUpperCase().slice(-6);

  try {
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      Appwrite.ID.unique(),
      {
        numero_ticket: numeroTicket,
        date_vente: new Date().toISOString(),
        code_produit: code,
        quantite: qte,
        montant_total: montant,
        agent_id: currentAgent.$id,
        poste_id: currentAgent.role || "RESTO",
        mode: "cash"
      }
    );

    resultZone.textContent =
      `Vente enregistrée – Ticket ${numeroTicket}, montant ${formatMontantGNF(montant)}.`;
    resultZone.className = "result ok";

    qteInput.value = "1";
    majAffichageMontantResto();
  } catch (err) {
    console.error("[AGENT] Erreur enregistrement vente resto :", err);
    resultZone.textContent =
      "Erreur lors de l'enregistrement de la vente (voir console).";
    resultZone.className = "result error";
  }
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded");

  appliquerEtatConnexion(null);

  // Connexion
  const btnLogin = $("btnLogin");
  if (btnLogin) {
    btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      connecterAgent();
    });
  }

  // Déconnexion
  const btnLogout = $("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      deconnexionAgent();
    });
  }

  // Modes principaux
  const btnModeBillets = $("btnModeBillets");
  const btnModeResto = $("btnModeResto");

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

  // Sous-onglets Billets
  const btnBilletsEntree = $("btnBilletsEntree");
  const btnBilletsJeux = $("btnBilletsJeux");

  if (btnBilletsEntree) {
    btnBilletsEntree.addEventListener("click", (e) => {
      e.preventDefault();console.log("[AGENT] agent-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_AGENTS_TABLE_ID = "agents";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";

// =====================================
//  Initialisation Appwrite
// =====================================

const agentClient = new Appwrite.Client();
agentClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const agentDB = new Appwrite.Databases(agentClient);

function $(id) {
  return document.getElementById(id);
}

function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

// =====================================
//  Gestion session agent
// =====================================

let currentAgent = null; // { $id, login, role, nom }

function saveSession(agent) {
  if (agent) {
    sessionStorage.setItem(
      "agentSession",
      JSON.stringify({
        id: agent.$id,
        login: agent.login,
        role: agent.role,
        nom: agent.nom
      })
    );
  } else {
    sessionStorage.removeItem("agentSession");
  }
}

function loadSession() {
  const s = sessionStorage.getItem("agentSession");
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function updateUIForAgent() {
  const loggedIn = !!currentAgent;
  const sectionLogin = $("section-login");
  const sectionBillets = $("section-billets-count");
  const sectionEntree = $("section-entree");
  const sectionInterne = $("section-interne");
  const loginStatus = $("loginStatus");

  if (sectionBillets) sectionBillets.classList.toggle("hidden", !loggedIn);
  if (sectionEntree) sectionEntree.classList.toggle("hidden", !loggedIn);
  if (sectionInterne) sectionInterne.classList.toggle("hidden", !loggedIn);

  if (loginStatus) {
    if (loggedIn) {
      loginStatus.textContent =
        "Connecté : " + (currentAgent.nom || currentAgent.login) +
        " (" + (currentAgent.role || "agent") + ")";
    } else {
      loginStatus.textContent = "Non connecté.";
    }
  }
}

async function restoreAgentFromSession() {
  const s = loadSession();
  if (!s) {
    currentAgent = null;
    updateUIForAgent();
    return;
  }
  try {
    const doc = await agentDB.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_TABLE_ID,
      s.id
    );
    if (!doc.actif) {
      currentAgent = null;
      saveSession(null);
    } else {
      currentAgent = doc;
    }
  } catch {
    currentAgent = null;
    saveSession(null);
  }
  updateUIForAgent();
  if (currentAgent) {
    chargerNombreBilletsEntree();
  }
}

// =====================================
//  Connexion / déconnexion
// =====================================

async function loginAgent() {
  const login = $("agentLogin")?.value.trim();
  const pwd = $("agentPassword")?.value.trim();

  const resElt = $("loginStatus");
  if (!login || !pwd) {
    if (resElt) resElt.textContent = "Veuillez entrer login et mot de passe.";
    return;
  }

  try {
    const res = await agentDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_TABLE_ID,
      [
        Appwrite.Query.equal("login", [login]),
        Appwrite.Query.equal("mot_de_passe", [pwd]),
        Appwrite.Query.equal("actif", [true]),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      if (resElt) resElt.textContent = "Identifiants invalides ou agent inactif.";
      currentAgent = null;
      saveSession(null);
      updateUIForAgent();
      return;
    }

    currentAgent = res.documents[0];
    saveSession(currentAgent);
    if (resElt) resElt.textContent = "Connexion réussie.";
    updateUIForAgent();
    chargerNombreBilletsEntree();
  } catch (err) {
    console.error("[AGENT] Erreur login :", err);
    if (resElt) resElt.textContent = "Erreur de connexion (voir console).";
  }
}

function logoutAgent() {
  currentAgent = null;
  saveSession(null);
  updateUIForAgent();
}

// =====================================
//  Billets d'entrée : nombre dispo
// =====================================

async function chargerNombreBilletsEntree() {
  const elCount = $("ticketCount");
  if (!elCount) return;
  if (!currentAgent) {
    elCount.textContent = "0";
    return;
  }

  try {
    const res = await agentDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const billets = res.documents || [];
    // tu peux filtrer statut === "Non utilisé" si tu veux
    elCount.textContent = billets.length.toString();
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
    elCount.textContent = "0";
  }
}

// =====================================
//  Helpers messages
// =====================================

function showResult(id, text, type) {
  const zone = $(id);
  if (!zone) return;
  zone.textContent = text;
  zone.className = "result";
  if (type) zone.classList.add(type); // ok | error | warn
}

// =====================================
//  Vérification billet d'entrée
// =====================================

async function verifierBilletEntree() {
  if (!currentAgent) {
    showResult("result-entree", "Veuillez vous connecter.", "error");
    return;
  }

  const numero = $("ticketNumberEntree")?.value.trim();
  const tarifChoice = document.querySelector(
    'input[name="tarifEntree"]:checked'
  )?.value || "normal";
  const numEtu = $("studentNumber")?.value.trim();

  if (!numero) {
    showResult("result-entree", "Veuillez saisir un numéro de billet.", "error");
    return;
  }

  showResult("result-entree", "Vérification en cours...", "warn");

  try {
    // 1. Chercher le billet
    const res = await agentDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_billet", [numero]),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showResult("result-entree", `Billet ${numero} introuvable.`, "error");
      return;
    }

    const billet = res.documents[0];

    if (billet.statut === "Validé") {
      showResult(
        "result-entree",
        `Billet ${numero} déjà VALIDÉ ❌`,
        "error"
      );
      return;
    }

    // 2. Calcul tarif
    let montant = billet.prix || 0;
    let tarifNormal = billet.prix || 0;
    let tarifEtudiant = billet.tarif_universite || 0;
    let tarifApplique = "normal";

    if (tarifChoice === "etudiant") {
      if (!numEtu) {
        showResult(
          "result-entree",
          "Numéro étudiant requis pour le tarif étudiant.",
          "error"
        );
        return;
      }

      // Vérifier l'étudiant
      const etuRes = await agentDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_ETUDIANTS_TABLE_ID,
        [
          Appwrite.Query.equal("numero_etudiant", [numEtu]),
          Appwrite.Query.limit(1)
        ]
      );
      if (!etuRes.documents || etuRes.documents.length === 0) {
        showResult(
          "result-entree",
          "Numéro étudiant introuvable / non enregistré.",
          "error"
        );
        return;
      }

      montant = tarifEtudiant;
      tarifApplique = "etudiant";
    }

    // 3. Mettre à jour le billet (statut Validé)
    await agentDB.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      {
        statut: "Validé"
      }
    );

    // 4. Enregistrer dans validations
    const nowIso = new Date().toISOString();

    await agentDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: numero,
        billet_id: billet.$id,
        date_validation: nowIso,
        type_acces: billet.type_acces || "Entrée parc",
        tarif_normal: tarifNormal,
        tarif_etudiant: tarifEtudiant,
        tarif_applique: tarifApplique,
        montant_paye: montant,
        agent_id: currentAgent.$id || currentAgent.login || "AGENT",
        poste_id: "ENTREE",
        numero_etudiant: numEtu || "",
        mode: "online",
        source: "agent-entree"
      }
    );

    showResult(
      "result-entree",
      `Billet ${numero} VALIDÉ ✅ (${billet.type_acces} – ${formatGNF(
        montant
      )})`,
      "ok"
    );

    $("ticketNumberEntree").value = "";
    $("studentNumber").value = "";
    chargerNombreBilletsEntree();
  } catch (err) {
    console.error("[AGENT] Erreur vérification billet entrée :", err);
    showResult(
      "result-entree",
      "Erreur lors de la vérification (voir console).",
      "error"
    );
  }
}

// =====================================
//  Vérification billet interne (jeux)
// =====================================

async function verifierBilletInterne() {
  if (!currentAgent) {
    showResult("result-interne", "Veuillez vous connecter.", "error");
    return;
  }

  const numero = $("ticketNumberInterne")?.value.trim();
  if (!numero) {
    showResult(
      "result-interne",
      "Veuillez saisir un numéro de billet interne.",
      "error"
    );
    return;
  }

  showResult("result-interne", "Vérification en cours...", "warn");

  try {
    // 1. Chercher le billet interne
    const res = await agentDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [
        Appwrite.Query.equal("numero_billet", [numero]),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showResult("result-interne", `Billet interne ${numero} introuvable.`, "error");
      return;
    }

    const billet = res.documents[0];

    // 2. Vérifier si déjà utilisé (dans validations)
    const valRes = await agentDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_billet", [numero]),
        Appwrite.Query.equal("poste_id", ["INTERNE"]),
        Appwrite.Query.limit(1)
      ]
    );

    if (valRes.documents && valRes.documents.length > 0) {
      showResult(
        "result-interne",
        `Billet interne ${numero} déjà utilisé ❌`,
        "error"
      );
      return;
    }

    const montant = billet.prix || 0;
    const nowIso = new Date().toISOString();

    await agentDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: numero,
        billet_id: billet.$id,
        date_validation: nowIso,
        type_acces: billet.type_billet || "Jeu interne",
        tarif_normal: montant,
        tarif_etudiant: 0,
        tarif_applique: "normal",
        montant_paye: montant,
        agent_id: currentAgent.$id || currentAgent.login || "AGENT",
        poste_id: "INTERNE",
        numero_etudiant: "",
        mode: "online",
        source: "agent-interne"
      }
    );

    showResult(
      "result-interne",
      `Billet interne ${numero} VALIDÉ ✅ (${billet.type_billet} – ${formatGNF(
        montant
      )})`,
      "ok"
    );
    $("ticketNumberInterne").value = "";
  } catch (err) {
    console.error("[AGENT] Erreur vérification billet interne :", err);
    showResult(
      "result-interne",
      "Erreur lors de la vérification (voir console).",
      "error"
    );
  }
}

// =====================================
//  Initialisation
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded");

  const btnLogin = $("btnLoginAgent");
  const btnLogout = $("btnLogoutAgent");
  const btnEntree = $("btnValidateEntree");
  const btnInterne = $("btnValidateInterne");

  if (btnLogin) {
    btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      loginAgent();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      logoutAgent();
    });
  }

  if (btnEntree) {
    btnEntree.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBilletEntree();
    });
  }

  if (btnInterne) {
    btnInterne.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBilletInterne();
    });
  }

  restoreAgentFromSession();
});

