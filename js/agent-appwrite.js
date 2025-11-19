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
  console.error("[AGENT] SDK Appwrite non chargé !");
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const db = new Appwrite.Databases(client);

// ===============================
//  HELPERS
// ===============================
function $(id) {
  return document.getElementById(id);
}

function formatGNF(n) {
  return (Number(n) || 0).toLocaleString("fr-FR") + " GNF";
}

function showResult(msg, type) {
  const zone = $("result-message");
  if (!zone) return;
  zone.style.display = "block";
  zone.textContent = msg;
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
  return etu && etu.checked ? "etudiant" : "normal";
}

// ===============================
//  ETAT GLOBAL
// ===============================
let currentAgent = null;
let restoProduitsCache = [];
let currentMode = "billets";          // "billets" | "resto"
let currentBilletsSubMode = "ENTREE"; // "ENTREE" | "JEU"

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
  const etuInput = $("etuNumber");
  const tarifNormal = $("tarif-normal");

  const etuBlock = etuInput ? etuInput.parentElement : null;
  const tarifBlock = tarifNormal ? tarifNormal.closest("div") : null;

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
    if (etuBlock) etuBlock.style.display = "none";
    if (tarifBlock) tarifBlock.style.display = "none";
  }
}

function switchBilletsSubMode(mode) {
  currentBilletsSubMode = mode;

  const btnEntree = $("btnBilletsEntree");
  const btnJeux = $("btnBilletsJeux");

  if (btnEntree) btnEntree.classList.toggle("active-submode", mode === "ENTREE");
  if (btnJeux) btnJeux.classList.toggle("active-submode", mode === "JEU");

  updateBilletsSubUI();
  chargerNombreBillets();
}

// ===============================
//  CONNEXION / AGENT
// ===============================
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

    currentAgent = res.documents[0];

    const loginCard = $("card-login");
    const appZone = $("app-zone");
    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    const nameEl = $("agent-connected-name");
    const roleEl = $("agent-connected-role");
    if (nameEl) nameEl.textContent = currentAgent.login || "";
    if (roleEl) roleEl.textContent = currentAgent.role || "";

    showLoginMessage("Connexion réussie.", "success");

    switchMode("billets");
    switchBilletsSubMode("ENTREE");
    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] Erreur connexion agent :", err);
    showLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function deconnexionAgent() {
  currentAgent = null;
  const loginCard = $("card-login");
  const appZone = $("app-zone");
  if (loginCard) loginCard.style.display = "block";
  if (appZone) appZone.style.display = "none";
  setTicketCount(0);
  clearResult();
  showLoginMessage("Déconnecté.", "info");
}

// ===============================
//  COMPTE BILLETS NON UTILISÉS
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
//  VALIDATION BILLETS ENTRÉE
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
        showResult("Numéro étudiant requis pour le tarif étudiant.", "error");
        return;
      }

      // Vérification de l'étudiant
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
          "Numéro étudiant introuvable. L'étudiant doit être enregistré.",
          "error"
        );
        return;
      }
    }

    // Mise à jour billet
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    const montantNormal = parseInt(billet.prix || 0, 10) || 0;
    const montantEtudiant = parseInt(billet.tarif_universite || 0, 10) || 0;
    const montantPaye =
      tarifChoisi === "etudiant" ? montantEtudiant : montantNormal;

    // Log dans validations
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: billet.numero_billet,
        billet_id: billet.$id,
        date_validation: new Date().toISOString(),
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
      }
    );

    showResult(
      `Billet ${numeroBillet} VALIDÉ ✅ (${billet.type_acces} – ${formatGNF(
        montantPaye
      )})`,
      "success"
    );

    $("ticketNumber").value = "";
    $("etuNumber").value = "";
    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] Erreur validation billet entrée :", err);
    showResult("Erreur lors de la vérification (voir console).", "error");
  }
}

// ===============================
//  VALIDATION BILLETS JEUX
// ===============================
async function verifierBilletJeu() {
  clearResult();

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet interne.", "error");
    return;
  }

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

    const billet = res.documents[0];

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

    const montant = parseInt(billet.prix || 0, 10) || 0;

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: billet.numero_billet,
        billet_id: billet.$id,
        date_validation: new Date().toISOString(),
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
      }
    );

    showResult(
      `Billet interne ${numeroBillet} VALIDÉ ✅ (${billet.type_billet} – ${formatGNF(
        montant
      )})`,
      "success"
    );

    $("ticketNumber").value = "";
    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] Erreur validation billet jeu :", err);
    showResult("Erreur lors de la vérification du billet de jeu.", "error");
  }
}

// ===============================
//  RESTO / CHICHA (simple)
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
//  BIND DES BOUTONS (sans DOMContentLoaded)
// ===============================
(function initBindings() {
  console.log("[AGENT] initBindings");

  const btnLogin = $("btnLogin");
  if (btnLogin) btnLogin.onclick = (e) => { e.preventDefault(); connecterAgent(); };

  const btnLogout = $("btnLogout");
  if (btnLogout) btnLogout.onclick = (e) => { e.preventDefault(); deconnexionAgent(); };

  const btnModeBillets = $("btnModeBillets");
  if (btnModeBillets) btnModeBillets.onclick = (e) => { e.preventDefault(); switchMode("billets"); chargerNombreBillets(); };

  const btnModeResto = $("btnModeResto");
  if (btnModeResto) btnModeResto.onclick = (e) => { e.preventDefault(); switchMode("resto"); chargerProduitsResto(); };

  const btnBilletsEntree = $("btnBilletsEntree");
  if (btnBilletsEntree) btnBilletsEntree.onclick = (e) => { e.preventDefault(); switchBilletsSubMode("ENTREE"); };

  const btnBilletsJeux = $("btnBilletsJeux");
  if (btnBilletsJeux) btnBilletsJeux.onclick = (e) => { e.preventDefault(); switchBilletsSubMode("JEU"); };

  const validateBtn = $("validateBtn");
  if (validateBtn) {
    validateBtn.onclick = (e) => {
      e.preventDefault();
      console.log("[AGENT] Clic sur Valider le billet, sous-mode =", currentBilletsSubMode);
      if (currentBilletsSubMode === "ENTREE") verifierBilletEntree();
      else verifierBilletJeu();
    };
  }

  const restoSelect = $("restoProduit");
  if (restoSelect) restoSelect.onchange = majAffichageMontantResto;

  const restoQte = $("restoQuantite");
  if (restoQte) restoQte.oninput = majAffichageMontantResto;

  const btnRestoVente = $("btnRestoVente");
  if (btnRestoVente) btnRestoVente.onclick = (e) => { e.preventDefault(); enregistrerVenteResto(); };

  // état initial
  updateBilletsSubUI();
})();
