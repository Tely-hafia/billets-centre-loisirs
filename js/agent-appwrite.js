console.log("[AGENT] agent-appwrite.js chargé - VERSION COMPLETE AVEC AFFILIATION RESERVATION");

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
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

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
let restoProduitsCache = [];
let restoPanier = [];
let restoLoaded = false;
let currentMode = "billets";
let currentBilletsSubMode = "ENTREE";
let lastVenteNumber = 0;
let lastVerifiedEtudiant = null;

// ===============================
//  UI MODES
// ===============================

function updateTarifEtudiantVisibility() {
  const etuZone   = $("etu-zone");
  const tarifZone = $("tarif-zone");
  const radioEtu  = $("tarif-etudiant");

  if (currentBilletsSubMode === "ENTREE") {
    if (tarifZone) tarifZone.style.display = "block";

    if (etuZone) {
      etuZone.style.display =
        radioEtu && radioEtu.checked ? "block" : "none";
    }
  } else {
    if (tarifZone) tarifZone.style.display = "none";
    if (etuZone) etuZone.style.display = "none";
  }
}

function switchMode(mode) {
  currentMode = mode;

  const modeBillets = $("mode-billets");
  const modeResto   = $("mode-resto");
  const modeLabel   = $("mode-label");

  if (modeBillets) modeBillets.style.display = mode === "billets" ? "block" : "none";
  if (modeResto) modeResto.style.display = mode === "resto" ? "block" : "none";

  if (modeLabel) {
    modeLabel.textContent =
      mode === "billets" ? "Contrôle billets" : "Restauration / Chicha";
  }

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
        "Mode : billets d'entrée. Saisir le numéro du billet attribué au client.";
    } else {
      hint.textContent =
        "Mode : billets jeux internes. Saisir le numéro du ticket de jeu attribué au client.";
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
      roleStr.includes("interne") ||
      roleStr.includes("reservation") ||
      roleStr.includes("réservation");

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

    if (canBillets) {
      switchMode("billets");
      switchBilletsSubMode("ENTREE");
    } else {
      switchMode("resto");
    }
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

    const nb = res.documents ? res.documents.length : 0;
    setTicketCount(nb);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
  }
}

// ===============================
//  RESERVATION : HELPERS
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
    const resEntree = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal("reservation", numeroReservation),
        Appwrite.Query.limit(1)
      ]
    );

    if (resEntree.documents && resEntree.documents.length > 0) {
      return {
        collection: "billets",
        billet: resEntree.documents[0]
      };
    }

    const resInterne = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [
        Appwrite.Query.equal("reservation", numeroReservation),
        Appwrite.Query.limit(1)
      ]
    );

    if (resInterne.documents && resInterne.documents.length > 0) {
      return {
        collection: "billets_interne",
        billet: resInterne.documents[0]
      };
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

function resetReservationForm() {
  const useReservation = $("useReservation");
  const reservationNumber = $("reservationNumber");
  const reservationZone = $("reservation-number-zone");

  if (useReservation) useReservation.checked = false;
  if (reservationNumber) reservationNumber.value = "";
  if (reservationZone) reservationZone.style.display = "none";
}

// ===============================
//  VALIDATION BILLETS + RESERVATION
// ===============================

async function verifierBillet() {
  clearResult();

  if (!currentAgent) {
    showResult("Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  const numeroEtu    = $("etuNumber")?.value.trim();
  const tarifChoisi  = getTarifChoisi();

  const { useReservation, numeroReservation } = getReservationInfoFromForm();

  if (!numeroBillet) {
    showResult("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  let reservationDoc = null;

  if (useReservation) {
    reservationDoc = await verifierReservationActive(numeroReservation);
    if (!reservationDoc) return;

    const dejaLiee = await verifierReservationDejaLiee(numeroReservation);
    if (dejaLiee === "ERROR") return;

    if (dejaLiee) {
      showResult(
        `Cette réservation est déjà affiliée au billet ${dejaLiee.billet.numero_billet || ""}.`,
        "error"
      );
      return;
    }
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

      if (tarifChoisi === "etudiant") {
        if (!numeroEtu) {
          showResult(
            "Pour le tarif étudiant, le numéro étudiant est obligatoire.",
            "error"
          );
          return;
        }

        if (!lastVerifiedEtudiant || lastVerifiedEtudiant !== numeroEtu) {
          showResult(
            "Veuillez d'abord cliquer sur « Vérifier l'étudiant » pour ce numéro, puis valider le billet.",
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

      const updateBilletData = {
        statut: "Validé"
      };

      if (useReservation) {
        updateBilletData.reservation = numeroReservation;
      }

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

      const typeAcces = billet.type_acces || "";
      const dateAcces = billet.date_acces || "";

      showResult(
        useReservation
          ? `Billet ${numeroBillet} VALIDÉ ✅ et affilié à la réservation ${numeroReservation}`
          : `Billet ${numeroBillet} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
        "success"
      );

      const ticketInput = $("ticketNumber");
      if (ticketInput) ticketInput.value = "";

      if (useReservation) resetReservationForm();

      lastVerifiedEtudiant = null;

      chargerNombreBillets();
    } catch (err) {
      console.error("[AGENT] ERREUR critique validation billet entrée :", err);
      showResult("Erreur lors de la vérification (voir console).", "error");
      return;
    }

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

      if (useReservation) {
        validationDoc.reservation = numeroReservation;
      }

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

  // ======== MODE JEU ========
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
          numero_etudiant: "",
          reservation: useReservation ? numeroReservation : ""
        }
      );

      const updateBilletInterneData = {
        statut: "Validé"
      };

      if (useReservation) {
        updateBilletInterneData.reservation = numeroReservation;
      }

      await db.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_INTERNE_TABLE_ID,
        billet.$id,
        updateBilletInterneData
      );

      if (useReservation && reservationDoc) {
        await db.updateDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_RESERVATION_COLLECTION_ID,
          reservationDoc.$id,
          { actif: false }
        );
      }

      showResult(
        useReservation
          ? `Billet jeu ${numeroBillet} VALIDÉ ✅ et affilié à la réservation ${numeroReservation}`
          : `Billet jeu ${numeroBillet} VALIDÉ ✅ (${billet.type_billet} – ${formatMontantGNF(montant)})`,
        "success"
      );

      const ticketInput = $("ticketNumber");
      if (ticketInput) ticketInput.value = "";

      if (useReservation) resetReservationForm();

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
//  VERIFICATION SIMPLE ETUDIANT
// ===============================

async function verifierEtudiant() {
  const numeroEtu = $("etuNumber")?.value.trim();
  const zoneInfo  = $("etu-info");

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
    zoneInfo.textContent =
      "Erreur lors de la vérification du numéro étudiant (voir console).";
  }
}

// ===============================
//  RESTO
// ===============================

function creerOngletsCategories() {
  const categoriesTabs = $("restoCategoriesTabs");
  if (!categoriesTabs) return;

  const categories = Array.from(
    new Set(restoProduitsCache.map(p => p.categorie || "Autre"))
  ).sort();

  categoriesTabs.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "resto-category-tab active";
  allButton.textContent = "Tous les plats";
  allButton.onclick = () => {
    document.querySelectorAll(".resto-category-tab").forEach(tab => {
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
      document.querySelectorAll(".resto-category-tab").forEach(tab => {
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
      <div style="margin-top: 0.5rem;">
        <button type="button" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
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

  productsGrid.innerHTML =
    '<div class="resto-loading">Chargement du menu...</div>';

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
    console.log("[RESTO] Produits chargés :", restoProduitsCache.length);

    if (restoProduitsCache.length === 0) {
      productsGrid.innerHTML = `
        <div class="resto-loading" style="color: var(--accent-primary);">
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
      <div class="resto-loading" style="color: var(--accent-primary);">
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
    console.warn(
      "[RESTO] Impossible de récupérer le dernier numéro de vente :",
      err
    );
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
  const msg = $("restoResult");

  if (!currentAgent) {
    showTempMessage("❌ Veuillez vous connecter", "error");
    return;
  }

  if (restoPanier.length === 0) {
    showTempMessage("🛒 Le panier est vide", "warn");
    return;
  }

  const numeroVente = genererNumeroVente();
  const nowIso = new Date().toISOString();
  const orderType =
    document.querySelector('input[name="orderType"]:checked')?.value ||
    "sur_place";
  const notes = $("restoOrderNotes")?.value.trim() || "";

  let totalGlobal = 0;

  try {
    for (const item of restoPanier) {
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
          poste_id: currentAgent.role || "resto_chicha"
        }
      );
    }

    afficherReçu(numeroVente, totalGlobal, orderType, notes);
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
    <div style="margin-bottom: 1rem;">
      <div><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</div>
      <div><strong>Type :</strong> ${
        orderType === "sur_place" ? "Sur place" : "À emporter"
      }</div>
      ${
        notes
          ? `<div><strong>Notes :</strong> ${notes.replace(/</g, "&lt;")}</div>`
          : ""
      }
    </div>
    <div style="border-bottom: 1px dashed #ccc; margin-bottom: 0.5rem;"></div>
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
    <div style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
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
  console.log("[AGENT] DOMContentLoaded - VERSION AFFILIATION RESERVATION");

  appliquerEtatConnexion(null);
  updateTarifEtudiantVisibility();

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

  const btnCheckTicket = $("btnCheckTicket");
  if (btnCheckTicket) {
    btnCheckTicket.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
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
});
