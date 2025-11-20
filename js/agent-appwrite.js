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
  console.error("[AGENT] Appwrite SDK non chargé. Vérifie le script CDN.");
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
    type === "error"   ? "#b91c1c" :
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

let currentAgent = null;
let restoProduitsCache = [];
let currentMode = "billets";          // "billets" ou "resto"
let currentBilletsSubMode = "ENTREE"; // "ENTREE" ou "JEU"
let lastVerifiedStudent = null;       // {numero, nom, prenom, universite}

// ===============================
//  UI : billets / étudiant
// ===============================

function clearStudentInfo() {
  lastVerifiedStudent = null;
  const info = $("etu-info");
  if (info) {
    info.style.display = "none";
    info.textContent = "";
  }
}

function updateTarifEtudiantVisibility() {
  const tarifZone = $("tarif-zone");
  const etuZone   = $("etu-zone");
  const radioEtu  = $("tarif-etudiant");

  // En mode JEU → on cache tout ce qui concerne tarif / étudiants
  if (currentBilletsSubMode === "JEU") {
    if (tarifZone) tarifZone.style.display = "none";
    if (etuZone) etuZone.style.display = "none";
    clearStudentInfo();
    return;
  }

  // Mode ENTREE → on affiche la zone tarif
  if (tarifZone) tarifZone.style.display = "block";

  if (!etuZone) return;

  // Champ étudiant visible uniquement si radio "étudiant" cochée
  if (radioEtu && radioEtu.checked) {
    etuZone.style.display = "block";
  } else {
    etuZone.style.display = "none";
    clearStudentInfo();
    const etuInput = $("etuNumber");
    if (etuInput) etuInput.value = "";
  }
}

// ===============================
//  CONNEXION / ETAT AGENT
// ===============================

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  const loginCard = $("card-login");
  const appZone   = $("app-zone");

  const nameEl = $("agent-connected-name");
  const roleEl = $("agent-connected-role");
  const btnModeBillets = $("btnModeBillets");
  const btnModeResto   = $("btnModeResto");

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

    // Mode par défaut selon rôle
    if (canBillets) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
      chargerNombreBillets();
    } else if (canResto) {
      switchMode("resto");
    }
  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";

    if (btnModeBillets) btnModeBillets.style.display = "inline-flex";
    if (btnModeResto) btnModeResto.style.display = "inline-flex";

    setTicketCount(0);
    clearResult();
    clearStudentInfo();
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
//  MODES PRINCIPAUX
// ===============================

function switchMode(mode) {
  currentMode = mode;

  const modeBillets = $("mode-billets");
  const modeResto   = $("mode-resto");
  const modeLabel   = $("mode-label");

  if (modeBillets) modeBillets.style.display = mode === "billets" ? "block" : "none";
  if (modeResto)   modeResto.style.display   = mode === "resto"   ? "block" : "none";

  if (modeLabel) {
    modeLabel.textContent =
      mode === "billets" ? "Contrôle billets" : "Restauration / Chicha";
  }

  if (mode === "resto") {
    chargerProduitsResto();
  } else {
    chargerNombreBillets();
  }
}

function switchBilletsSubMode(mode) {
  currentBilletsSubMode = mode;

  const btnEntree = $("btnBilletsEntree");
  const btnJeux   = $("btnBilletsJeux");
  const hint      = $("billetsSubHint");

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

  updateTarifEtudiantVisibility();
  chargerNombreBillets();
}

// ===============================
//  BILLETS : COMPTE & VALIDATION
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

// Vérifier fiche étudiant
async function verifierEtudiant() {
  clearStudentInfo();

  const numero = $("etuNumber")?.value.trim();
  const info = $("etu-info");

  if (!numero) {
    if (info) {
      info.style.display = "block";
      info.textContent = "Saisir un numéro étudiant.";
      info.className = "result warn";
    }
    return;
  }

  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_etudiant", numero),
        Appwrite.Query.equal("actif", true),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      if (info) {
        info.style.display = "block";
        info.textContent =
          "Numéro étudiant introuvable ou inactif. Vérifier avec l'administration.";
        info.className = "result error";
      }
      return;
    }

    const etu = res.documents[0];
    lastVerifiedStudent = {
      numero: numero,
      nom: etu.nom || "",
      prenom: etu.prenom || "",
      universite: etu.universite || ""
    };

    if (info) {
      info.style.display = "block";
      info.className = "result ok";
      info.textContent =
        `OK : ${lastVerifiedStudent.prenom} ${lastVerifiedStudent.nom} – ${lastVerifiedStudent.universite}`;
    }
  } catch (err) {
    console.error("[AGENT] Erreur vérification étudiant :", err);
    if (info) {
      info.style.display = "block";
      info.className = "result error";
      info.textContent =
        "Erreur lors de la vérification de l'étudiant (voir console).";
    }
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

  // Vérification supplémentaire en mode étudiant
  if (currentBilletsSubMode === "ENTREE" && tarifChoisi === "etudiant") {
    if (!numeroEtu) {
      showResult("Numéro étudiant requis pour le tarif étudiant.", "error");
      return;
    }
    if (!lastVerifiedStudent || lastVerifiedStudent.numero !== numeroEtu) {
      showResult("Veuillez d'abord vérifier la fiche de l'étudiant.", "error");
      return;
    }
  }

  if (currentBilletsSubMode === "ENTREE") {
    return verifierBilletEntree(numeroBillet, tarifChoisi, numeroEtu);
  } else {
    return verifierBilletJeu(numeroBillet);
  }
}

// ENTREE
async function verifierBilletEntree(numeroBillet, tarifChoisi, numeroEtu) {
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

    // Met à jour le billet : Validé
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
    console.error("[AGENT] ERREUR critique validation billet entrée :", err);
    showResult("Erreur lors de la vérification (voir console).", "error");
    return;
  }

  // Journalisation (non bloquant)
  try {
    const nowIso = new Date().toISOString();

    const montantNormal = parseInt(billet.prix || 0, 10) || 0;
    const montantEtudiant = parseInt(billet.tarif_universite || 0, 10) || 0;
    const montantPaye =
      tarifChoisi === "etudiant" ? montantEtudiant : montantNormal;

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
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
        poste_id: "ENTREE",
        numero_etudiant: numeroEtu || ""
      }
    );
  } catch (logErr) {
    console.warn(
      "[AGENT] Erreur lors de l'enregistrement de la validation entrée :",
      logErr
    );
  }
}

// JEU
async function verifierBilletJeu(numeroBillet) {
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
      showResult(`Billet jeu ${numeroBillet} introuvable.`, "error");
      return;
    }

    const billet = res.documents[0];

    // Vérifier s'il est déjà utilisé dans validations
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
        numero_etudiant: ""
      }
    );

    // Met à jour le billet interne : Validé
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    showResult(
      `Billet jeu ${numeroBillet} VALIDÉ ✅ (${billet.type_billet} – ${formatMontantGNF(montant)})`,
      "success"
    );

    const ticketInput = $("ticketNumber");
    if (ticketInput) ticketInput.value = "";

    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] Erreur validation billet jeu interne :", err);
    showResult(
      "Erreur lors de la vérification du billet de jeu (voir console).",
      "error"
    );
  }
}

// ===============================
//  RESTO / CHICHA  (PANIER)
// ===============================

// Chargement des produits depuis la collection "menu_resto"
async function chargerProduitsResto() {
  const categorieSelect = $("restoCategorie");
  const produitSelect   = $("restoProduit");

  if (!categorieSelect || !produitSelect) return;

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

    // Construire la liste des catégories
    const categories = Array.from(
      new Set(
        restoProduitsCache.map((p) => (p.categorie || "Autre").trim())
      )
    ).sort();

    categorieSelect.innerHTML = '<option value="">Toutes les catégories...</option>';
    categories.forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      categorieSelect.appendChild(opt);
    });

    remplirListeProduitsResto();
  } catch (err) {
    console.error("[AGENT] Erreur chargement menu resto :", err);
    const select = $("restoProduit");
    if (select) {
      select.innerHTML = '<option value="">Erreur de chargement du menu</option>';
    }
  }
}

// Remplir le select des produits selon la catégorie
function remplirListeProduitsResto() {
  const categorieSelect = $("restoCategorie");
  const produitSelect   = $("restoProduit");

  if (!produitSelect) return;

  const cat = categorieSelect ? categorieSelect.value : "";

  const produitsFiltres = restoProduitsCache.filter((p) => {
    const c = (p.categorie || "Autre").trim();
    return !cat || c === cat;
  });

  produitSelect.innerHTML = '<option value="">Choisir un produit...</option>';

  produitsFiltres.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.code_produit;
    opt.textContent = `${p.libelle} – ${formatMontantGNF(p.prix_unitaire)}`;
    opt.dataset.prix = p.prix_unitaire;
  });

  majAffichageMontantResto();
}

// Montant de la ligne en cours (produit + quantité)
function majAffichageMontantResto() {
  const produitSelect = $("restoProduit");
  const qteInput      = $("restoQuantite");
  const montantEl     = $("restoMontant");

  if (!produitSelect || !qteInput || !montantEl) return;

  const opt = produitSelect.selectedOptions[0];
  const qte = parseInt(qteInput.value || "1", 10);

  if (!opt || !opt.dataset.prix || !qte || qte <= 0) {
    montantEl.textContent = "Montant ligne : 0 GNF";
    return;
  }

  const prix = Number(opt.dataset.prix || 0);
  const total = prix * qte;

  montantEl.textContent = "Montant ligne : " + formatMontantGNF(total);
}

// Ajouter la ligne courante au panier
function ajouterProduitAuPanier() {
  const produitSelect = $("restoProduit");
  const qteInput      = $("restoQuantite");
  const resultZone    = $("restoResult");

  if (!produitSelect || !qteInput || !resultZone) return;

  const code = produitSelect.value;
  const qte  = parseInt(qteInput.value || "1", 10);

  resultZone.style.display = "block";

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

  const produit = restoProduitsCache.find((p) => p.code_produit === code);
  if (!produit) {
    resultZone.textContent = "Produit introuvable.";
    resultZone.className = "result error";
    return;
  }

  const prix = Number(produit.prix_unitaire || 0);
  const total = prix * qte;

  // Si le produit existe déjà dans le panier -> on cumule
  const exist = restoPanier.find((l) => l.code === code);
  if (exist) {
    exist.quantite += qte;
    exist.total += total;
  } else {
    restoPanier.push({
      code: code,
      libelle: produit.libelle,
      prix: prix,
      quantite: qte,
      total: total
    });
  }

  // Reset quantité à 1
  qteInput.value = "1";
  majAffichageMontantResto();
  rafraichirPanierUI();

  resultZone.textContent = "Produit ajouté au panier.";
  resultZone.className = "result ok";
}

// Rafraîchit l'affichage du tableau panier
function rafraichirPanierUI() {
  const zone       = $("restoPanierZone");
  const tbody      = $("restoPanierBody");
  const totalSpan  = $("restoPanierTotal");
  const btnValider = $("btnRestoValider");

  if (!zone || !tbody || !totalSpan) return;

  tbody.innerHTML = "";

  if (restoPanier.length === 0) {
    zone.style.display = "none";
    totalSpan.textContent = "0 GNF";
    if (btnValider) btnValider.disabled = true;
    return;
  }

  zone.style.display = "block";
  if (btnValider) btnValider.disabled = false;

  let totalPanier = 0;

  restoPanier.forEach((item, index) => {
    totalPanier += item.total;

    const tr = document.createElement("tr");

    const tdLib = document.createElement("td");
    tdLib.textContent = item.libelle;

    const tdQte = document.createElement("td");
    tdQte.textContent = item.quantite.toString();

    const tdPrix = document.createElement("td");
    tdPrix.textContent = formatMontantGNF(item.prix);

    const tdTotal = document.createElement("td");
    tdTotal.textContent = formatMontantGNF(item.total);

    const tdDel = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.textContent = "×";
    btnDel.style.padding = "0.3rem 0.6rem";
    btnDel.style.fontSize = "0.9rem";
    btnDel.addEventListener("click", () => supprimerLignePanier(index));
    tdDel.appendChild(btnDel);

    tr.appendChild(tdLib);
    tr.appendChild(tdQte);
    tr.appendChild(tdPrix);
    tr.appendChild(tdTotal);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });

  totalSpan.textContent = formatMontantGNF(totalPanier);
}

// Supprimer une ligne précise
function supprimerLignePanier(index) {
  restoPanier.splice(index, 1);
  rafraichirPanierUI();
}

// Vider totalement le panier
function viderPanierResto() {
  restoPanier = [];
  rafraichirPanierUI();
  const res = $("restoResult");
  if (res) {
    res.style.display = "block";
    res.textContent = "Panier vidé.";
    res.className = "result warn";
  }
}

// Valider le panier -> écrit dans "ventes_resto"
async function validerPanierResto() {
  const resultZone = $("restoResult");
  if (!resultZone) return;

  resultZone.style.display = "block";

  if (!currentAgent) {
    resultZone.textContent =
      "Veuillez vous connecter avant d'enregistrer une vente.";
    resultZone.className = "result error";
    return;
  }

  if (restoPanier.length === 0) {
    resultZone.textContent = "Le panier est vide.";
    resultZone.className = "result warn";
    return;
  }

  const numeroVente =
    "V-" + Date.now().toString(36).toUpperCase().slice(-6);
  const nowIso = new Date().toISOString();
  let totalGlobal = 0;

  try {
    for (const item of restoPanier) {
      totalGlobal += item.total;

      await db.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_VENTES_RESTO_COLLECTION_ID,
        Appwrite.ID.unique(),
        {
          numero_vente: numeroVente,
          date_vente: nowIso,
          code_produit: item.code,
          quantite: item.quantite,
          montant_total: item.total,
          agent_id: currentAgent.$id,
          poste_id: currentAgent.role || "resto_chicha",
          mode: "cash"
        }
      );
    }

    resultZone.textContent =
      `Vente enregistrée – N° ${numeroVente}, montant ${formatMontantGNF(totalGlobal)}.`;
    resultZone.className = "result ok";

    // Reset panier
    restoPanier = [];
    rafraichirPanierUI();

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
  updateTarifEtudiantVisibility();

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

  // Bouton validation billet
  const btnCheckTicket = $("btnCheckTicket");
  if (btnCheckTicket) {
    btnCheckTicket.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // Bouton vérification étudiant
  const btnCheckStudent = $("btnCheckStudent");
  if (btnCheckStudent) {
    btnCheckStudent.addEventListener("click", (e) => {
      e.preventDefault();
      verifierEtudiant();
    });
  }

  // Radios tarif
  const radioNormal = $("tarif-normal");
  const radioEtu = $("tarif-etudiant");
  if (radioNormal) {
    radioNormal.addEventListener("change", updateTarifEtudiantVisibility);
  }
  if (radioEtu) {
    radioEtu.addEventListener("change", updateTarifEtudiantVisibility);
  }

    // RESTO events
  const restoCategorie = $("restoCategorie");
  const restoProduit   = $("restoProduit");
  const restoQuantite  = $("restoQuantite");
  const btnRestoAdd    = $("btnRestoAdd");
  const btnRestoValider= $("btnRestoValider");

  if (restoCategorie) {
    restoCategorie.addEventListener("change", () => {
      remplirSelectProduits();
    });
  }
  if (restoProduit) {
    restoProduit.addEventListener("change", majAffichageMontantResto);
  }
  if (restoQuantite) {
    restoQuantite.addEventListener("input", majAffichageMontantResto);
  }
  if (btnRestoAdd) {
    btnRestoAdd.addEventListener("click", (e) => {
      e.preventDefault();
      ajouterProduitAuPanier();
    });
  }
  if (btnRestoValider) {
    btnRestoValider.addEventListener("click", (e) => {
      e.preventDefault();
      enregistrerVenteResto();
    });
  }

});
