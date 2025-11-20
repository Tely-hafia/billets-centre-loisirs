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
  console.error(
    "[AGENT] Appwrite SDK non chargé. Vérifie le script CDN appwrite@13.0.0."
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
let restoProduitsCache = [];    // produits actifs menu_resto
let restoPanier = [];           // [{code_produit, libelle, prix_unitaire, quantite}]
let currentMode = "billets";    // "billets" ou "resto"
let currentBilletsSubMode = "ENTREE"; // "ENTREE" ou "JEU"
let restoLoaded = false;

// ===============================
//  UI MODES
// ===============================

function updateTarifEtudiantVisibility() {
  const etuZone   = $("etu-zone");
  const tarifZone = $("tarif-zone");

  if (currentBilletsSubMode === "ENTREE") {
    if (etuZone)   etuZone.style.display   = "block";
    if (tarifZone) tarifZone.style.display = "block";
  } else {
    if (etuZone)   etuZone.style.display   = "none";
    if (tarifZone) tarifZone.style.display = "none";
  }
}

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

  // chargement du menu resto une seule fois
  if (mode === "resto" && !restoLoaded) {
    restoLoaded = true;
    chargerProduitsResto();
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
//  CONNEXION / ETAT AGENT
// ===============================

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  const loginCard = $("card-login");
  const appZone   = $("app-zone");
  const nameEl    = $("agent-connected-name");
  const roleEl    = $("agent-connected-role");
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
    if (appZone)   appZone.style.display   = "block";

    if (nameEl) nameEl.textContent = agent.login || "";
    if (roleEl) roleEl.textContent = agent.role  || "";

    if (btnModeBillets) {
      btnModeBillets.style.display = canBillets ? "inline-flex" : "none";
    }
    if (btnModeResto) {
      btnModeResto.style.display = canResto ? "inline-flex" : "none";
    }

    if (canBillets) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
    } else {
      switchMode("resto");
    }
  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone)   appZone.style.display   = "none";

    if (btnModeBillets) btnModeBillets.style.display = "inline-flex";
    if (btnModeResto)   btnModeResto.style.display   = "inline-flex";

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

async function verifierBillet() {
  clearResult();

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  const numeroEtu    = $("etuNumber")?.value.trim();
  const tarifChoisi  = getTarifChoisi();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  // ======== MODE ENTREE ========
  if (currentBilletsSubMode === "ENTREE") {
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
              Appwrite.Query.equal("actif", true),
              Appwrite.Query.limit(1)
            ]
          );

          if (!etuRes.documents || etuRes.documents.length === 0) {
            showResult(
              "Numéro étudiant introuvable ou inactif. L'étudiant doit être enregistré par l'administrateur.",
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

      // Met à jour le billet : statut = Validé
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

      const montantNormal   = parseInt(billet.prix || 0, 10) || 0;
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
        poste_id: "ENTREE",
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

    return;
  }

  // ======== MODE JEU (billets internes) ========
  if (currentBilletsSubMode === "JEU") {
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

      // Vérifier s'il existe déjà une validation INTERNE pour ce billet
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
        showResult(
          `Billet jeu ${numeroBillet} déjà utilisé ❌`,
          "error"
        );
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

    return;
  }
}

// ===============================
//  RESTO / CHICHA – MENU + PANIER
// ===============================

// Charge les produits actifs depuis menu_resto
async function chargerProduitsResto() {
  const catSelect  = $("restoCategorie");
  const prodSelect = $("restoProduit");

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
    console.log("[AGENT] Produits resto chargés :", restoProduitsCache.length);

    // Remplir la liste des catégories
    if (catSelect) {
      const categories = Array.from(
        new Set(
          restoProduitsCache
            .map((p) => p.categorie || "Autre")
        )
      ).sort();

      catSelect.innerHTML = '<option value="">Toutes les catégories</option>';
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        catSelect.appendChild(opt);
      });
    }

    // Remplir la liste de produits (toutes catégories par défaut)
    filtrerProduitsParCategorie();
  } catch (err) {
    console.error("[AGENT] Erreur chargement menu resto :", err);
    if (prodSelect) {
      prodSelect.innerHTML =
        '<option value="">Erreur de chargement du menu</option>';
    }
  }
}

// Filtre les produits selon la catégorie sélectionnée
function filtrerProduitsParCategorie() {
  const catSelect  = $("restoCategorie");
  const prodSelect = $("restoProduit");
  if (!prodSelect) return;

  const categorie = catSelect ? catSelect.value : "";

  const produitsFiltres = restoProduitsCache.filter((p) =>
    !categorie || (p.categorie || "Autre") === categorie
  );

  prodSelect.innerHTML = '<option value="">Choisir un produit...</option>';

  produitsFiltres.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.code_produit;
    opt.textContent =
      `${p.libelle} – ${formatMontantGNF(p.prix_unitaire)}`;
    prodSelect.appendChild(opt);
  });

  majMontantLigneResto();
}

// Met à jour le montant de la ligne (produit + qté)
function majMontantLigneResto() {
  const prodSelect = $("restoProduit");
  const qteInput   = $("restoQuantite");
  const montantEl  = $("restoMontant");
  if (!prodSelect || !qteInput || !montantEl) return;

  const produit = restoProduitsCache.find(
    (p) => p.code_produit === prodSelect.value
  );

  const prix = produit ? Number(produit.prix_unitaire) || 0 : 0;
  const qte  = parseInt(qteInput.value || "1", 10) || 1;

  const total = prix * qte;
  montantEl.textContent = "Montant : " + formatMontantGNF(total);
}

// Rend le tableau du panier à l'écran
function renderRestoPanier() {
  const tbody   = $("restoPanierBody");
  const totalEl = $("restoPanierTotal");
  if (!tbody || !totalEl) return;

  tbody.innerHTML = "";
  let total = 0;

  if (restoPanier.length === 0) {
    const row = document.createElement("tr");
    const td  = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "Panier vide pour l’instant.";
    row.appendChild(td);
    tbody.appendChild(row);
    totalEl.textContent = "0 GNF";
    return;
  }

  restoPanier.forEach((item, index) => {
    const tr = document.createElement("tr");

    const montant = (Number(item.prix_unitaire) || 0) * item.quantite;
    total += montant;

    const tdLib = document.createElement("td");
    tdLib.textContent = item.libelle;

    const tdQte = document.createElement("td");
    tdQte.textContent = String(item.quantite);

    const tdPU = document.createElement("td");
    tdPU.textContent = (Number(item.prix_unitaire) || 0).toLocaleString("fr-FR");

    const tdMontant = document.createElement("td");
    tdMontant.textContent = montant.toLocaleString("fr-FR");

    const tdDel = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.textContent = "✕";
    btnDel.style.padding = "0.25rem 0.6rem";
    btnDel.style.fontSize = "0.8rem";
    btnDel.className = "btn-danger";
    btnDel.addEventListener("click", () => {
      restoPanier.splice(index, 1);
      renderRestoPanier();
    });
    tdDel.appendChild(btnDel);

    tr.appendChild(tdLib);
    tr.appendChild(tdQte);
    tr.appendChild(tdPU);
    tr.appendChild(tdMontant);
    tr.appendChild(tdDel);

    tbody.appendChild(tr);
  });

  totalEl.textContent = formatMontantGNF(total);
}

// Ajoute le produit sélectionné au panier
function ajouterProduitAuPanier() {
  const prodSelect = $("restoProduit");
  const qteInput   = $("restoQuantite");
  const msg        = $("restoResult");

  if (!prodSelect || !qteInput || !msg) return;

  msg.style.display = "none";

  if (!prodSelect.value) {
    msg.style.display = "block";
    msg.className = "result warn";
    msg.textContent = "Choisissez un produit avant d'ajouter au panier.";
    return;
  }

  let qte = parseInt(qteInput.value || "1", 10);
  if (!qte || qte <= 0) qte = 1;

  const produit = restoProduitsCache.find(
    (p) => p.code_produit === prodSelect.value
  );

  if (!produit) {
    msg.style.display = "block";
    msg.className = "result error";
    msg.textContent = "Produit introuvable (menu non chargé).";
    return;
  }

  const existant = restoPanier.find(
    (item) => item.code_produit === produit.code_produit
  );

  if (existant) {
    existant.quantite += qte;
  } else {
    restoPanier.push({
      code_produit: produit.code_produit,
      libelle: produit.libelle,
      prix_unitaire: Number(produit.prix_unitaire) || 0,
      quantite: qte
    });
  }

  qteInput.value = "1";
  majMontantLigneResto();
  renderRestoPanier();
}

// Enregistre la vente (toutes les lignes du panier) dans ventes_resto
async function enregistrerVenteResto() {
  const msg = $("restoResult");
  if (!msg) return;

  msg.style.display = "block";

  if (!currentAgent) {
    msg.className = "result error";
    msg.textContent = "Veuillez vous connecter avant d'enregistrer une vente.";
    return;
  }

  if (restoPanier.length === 0) {
    msg.className = "result warn";
    msg.textContent = "Le panier est vide. Ajoutez au moins un produit.";
    return;
  }

  const numeroVente =
    "V-" + Date.now().toString(36).toUpperCase().slice(-6);
  const nowIso = new Date().toISOString();

  let totalGlobal = 0;

  try {
    for (const item of restoPanier) {
      const montant = (Number(item.prix_unitaire) || 0) * item.quantite;
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
          poste_id: currentAgent.role || "resto_chicha"
        }
      );
    }

    msg.className = "result ok";
    msg.textContent =
      `Vente enregistrée – N° ${numeroVente}, montant ${formatMontantGNF(totalGlobal)}.`;

    // reset panier + montant
    restoPanier = [];
    renderRestoPanier();
    const qteInput = $("restoQuantite");
    if (qteInput) qteInput.value = "1";
    majMontantLigneResto();

  } catch (err) {
    console.error("[AGENT] Erreur enregistrement vente resto :", err);
    msg.className = "result error";
    msg.textContent =
      "Erreur lors de l'enregistrement de la vente (voir console).";
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
  const btnLogin  = $("btnLogin");
  const btnLogout = $("btnLogout");

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

  // Modes principaux
  const btnModeBillets = $("btnModeBillets");
  const btnModeResto   = $("btnModeResto");

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
  const btnBilletsJeux   = $("btnBilletsJeux");

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

  // Validation billet
  const btnCheckTicket = $("btnCheckTicket");
  if (btnCheckTicket) {
    btnCheckTicket.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // RESTO : filtres + panier + validation
  const restoCategorie = $("restoCategorie");
  const restoProduit   = $("restoProduit");
  const restoQuantite  = $("restoQuantite");
  const btnRestoAdd    = $("btnRestoAdd");
  const btnRestoValider= $("btnRestoValider");

  if (restoCategorie) {
    restoCategorie.addEventListener("change", () => {
      filtrerProduitsParCategorie();
    });
  }

  if (restoProduit) {
    restoProduit.addEventListener("change", () => {
      majMontantLigneResto();
    });
  }

  if (restoQuantite) {
    restoQuantite.addEventListener("input", () => {
      majMontantLigneResto();
    });
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
