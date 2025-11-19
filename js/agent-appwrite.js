console.log("[AGENT] agent-appwrite.js chargé");

// ===============================
//  CONFIG APPWRITE
// ===============================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_AGENTS_TABLE_ID = "agents";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";
const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";

// ===============================
//  CLIENT APPWRITE
// ===============================
if (typeof Appwrite === "undefined") {
  console.error("[AGENT] SDK Appwrite non trouvé (script CDN manquant ?)");
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

function formatGNF(n) {
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
  const etuRadio = $("tarif-etudiant");
  if (etuRadio && etuRadio.checked) return "etudiant";
  return "normal";
}

// ===============================
//  ETAT GLOBAL
// ===============================
let currentAgent = null;
let restoProduitsCache = [];
let currentMode = "billets"; // "billets" ou "resto"
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

function updateBilletsSubUI() {
  const hint = $("billetsSubHint");
  const etuBlock = $("etuNumber") ? $("etuNumber").parentElement : null;
  const tarifBlock = $("tarif-normal")
    ? $("tarif-normal").closest("div")
    : null;

  if (currentBilletsSubMode === "ENTREE") {
    if (hint) {
      hint.textContent =
        "Mode : billets d’entrée (bracelets). Saisir le numéro imprimé sur le bracelet.";
    }
    if (etuBlock) etuBlock.style.display = "block";
    if (tarifBlock) tarifBlock.style.display = "block";
  } else {
    if (hint) {
      hint.textContent =
        "Mode : billets JEUX internes. Saisir le numéro imprimé sur le ticket de jeu (ex : J-0001).";
    }
    // billets jeux → pas de tarif étudiant, ni de numéro étudiant
    if (etuBlock) etuBlock.style.display = "none";
    if (tarifBlock) tarifBlock.style.display = "none";
  }
}

function switchBilletsSubMode(mode) {
  currentBilletsSubMode = mode;

  const btnEntree = $("btnBilletsEntree");
  const btnJeux = $("btnBilletsJeux");

  if (btnEntree) {
    btnEntree.classList.toggle("active-submode", mode === "ENTREE");
  }
  if (btnJeux) {
    btnJeux.classList.toggle("active-submode", mode === "JEU");
  }

  updateBilletsSubUI();
  chargerNombreBillets();
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

    if (!canBillets && !canResto) {
      canBillets = true;
      canResto = true;
    }

    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = agent.login || "";
    if (roleEl) roleEl.textContent = agent.role || "";

    if (btnModeBillets) {
      btnModeBillets.style.display = canBillets ? "inline-flex" : "none";
    }
    if (btnModeResto) {
      btnModeResto.style.display = canResto ? "inline-flex" : "none";
    }

    if (canBillets && !canResto) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
    } else if (!canBillets && canResto) {
      switchMode("resto");
    } else {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
    }

    chargerNombreBillets();
  } else {
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
//  COMPTE DE BILLETS NON UTILISÉS
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
    const nb = res.documents ? res.documents.length : 0;
    setTicketCount(nb);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
  }
}

// ===============================
//  VALIDATION BILLETS
// ===============================
async function verifierBilletEntree() {
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
    $("etuNumber").value = "";

    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] ERREUR critique validation billet entrée :", err);
    showResult("Erreur lors de la vérification (voir console).", "error");
    return;
  }

  // journalisation dans validations
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
      type_billet: billet.type_acces || "",
      code_offre: billet.code_offre || "",
      tarif_normal: montantNormal,
      tarif_etudiant: montantEtudiant,
      tarif_applique: tarifChoisi,
      montant_paye: montantPaye,
      agent_id: currentAgent.$id || "",
      poste_id: currentAgent.role || "ENTREE",
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
      "[AGENT] Erreur lors de l'enregistrement de la validation entrée :",
      logErr
    );
  }
}

async function verifierBilletJeu() {
  clearResult();

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  let billet;

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [
        Appwrite.Query.equal("numero_billet", numeroBillet),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showResult(`Billet interne ${numeroBillet} introuvable.`, "error");
      return;
    }

    billet = res.documents[0];

    if (billet.statut === "Validé") {
      showResult(`Billet interne ${numeroBillet} déjà utilisé ❌`, "error");
      return;
    }

    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    showResult(
      `Billet interne ${numeroBillet} VALIDÉ ✅ (${billet.type_billet})`,
      "success"
    );

    const ticketInput = $("ticketNumber");
    if (ticketInput) ticketInput.value = "";

    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] ERREUR critique validation billet interne :", err);
    showResult("Erreur lors de la vérification du billet de jeu (voir console).", "error");
    return;
  }

  // journalisation dans validations (normal uniquement)
  try {
    const nowIso = new Date().toISOString();
    const montant = parseInt(billet.prix || 0, 10) || 0;

    const validationDoc = {
      numero_billet: billet.numero_billet,
      billet_id: billet.$id,
      date_validation: nowIso,
      type_acces: "JEU",
      type_billet: billet.type_billet || "",
      code_offre: billet.code_offre || "",
      tarif_normal: montant,
      tarif_etudiant: 0,
      tarif_applique: "normal",
      montant_paye: montant,
      agent_id: currentAgent.$id || "",
      poste_id: currentAgent.role || "INTERNE",
      numero_etudiant: ""
    };

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      validationDoc
    );
  } catch (logErr) {
    console.warn(
      "[AGENT] Erreur lors de l'enregistrement de la validation interne :",
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
      opt.textContent = `${p.libelle} – ${formatGNF(p.prix_unitaire)}`;
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
  montantEl.textContent = "Montant : " + formatGNF(total);
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
      `Vente enregistrée – Ticket ${numeroTicket}, montant ${formatGNF(montant)}.`;
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
  updateBilletsSubUI();

  // Connexion / déconnexion
  const btnLogin = $("btnLogin");
  if (btnLogin) {
    btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      connecterAgent();
    });
  }

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
      chargerProduitsResto();
    });
  }

  // Sous-onglets Billets
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

  // Validation billet (bouton "Valider le billet ▶▶")
  const validateBtn = $("validateBtn");
  if (validateBtn) {
    validateBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (currentBilletsSubMode === "ENTREE") {
        verifierBilletEntree();
      } else {
        verifierBilletJeu();
      }
    });
  }

  // Resto
  const restoSelect = $("restoProduit");
  const restoQte = $("restoQuantite");
  const btnRestoVente = $("btnRestoVente");

  if (restoSelect) {
    restoSelect.addEventListener("change", majAffichageMontantResto);
  }
  if (restoQte) {
    restoQte.addEventListener("input", majAffichageMontantResto);
  }
  if (btnRestoVente) {
    btnRestoVente.addEventListener("click", (e) => {
      e.preventDefault();
      enregistrerVenteResto();
    });
  }
});
