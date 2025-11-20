console.log("[AGENT] agent-appwrite.js chargé - VERSION RESTAURANT AMÉLIORÉE");

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
let restoProduitsCache = [];
let restoPanier = [];
let restoLoaded = false;
let currentMode = "billets";
let currentBilletsSubMode = "ENTREE";
let lastVenteNumber = 0;

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

  // Chargement du menu resto une seule fois
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
        "Mode : billets d'entrée (bracelets). Saisir le numéro imprimé sur le bracelet.";
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
//  RESTO - VERSION SIMPLIFIÉE
// ===============================

// Créer les onglets de catégories
function creerOngletsCategories() {
  const categoriesTabs = $("#restoCategoriesTabs");
  if (!categoriesTabs) return;

  // Récupérer toutes les catégories uniques
  const categories = Array.from(
    new Set(restoProduitsCache.map(p => p.categorie || "Autre"))
  ).sort();

  categoriesTabs.innerHTML = '';

  // Bouton "Tous"
  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "resto-category-tab active";
  allButton.textContent = "Tous les plats";
  allButton.onclick = () => {
    document.querySelectorAll('.resto-category-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    allButton.classList.add('active');
    afficherTousLesProduits();
  };
  categoriesTabs.appendChild(allButton);

  // Boutons par catégorie
  categories.forEach(categorie => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "resto-category-tab";
    button.textContent = categorie;
    button.onclick = () => {
      document.querySelectorAll('.resto-category-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      button.classList.add('active');
      filtrerProduitsParCategorie(categorie);
    };
    categoriesTabs.appendChild(button);
  });
}

// Afficher tous les produits
function afficherTousLesProduits() {
  afficherProduits(restoProduitsCache);
}

// Filtrer les produits par catégorie
function filtrerProduitsParCategorie(categorie) {
  const produitsFiltres = restoProduitsCache.filter(p => 
    (p.categorie || "Autre") === categorie
  );
  afficherProduits(produitsFiltres);
}

// Afficher les produits dans la grille
function afficherProduits(produits) {
  const productsGrid = $("#restoProductsGrid");
  if (!productsGrid) return;

  if (produits.length === 0) {
    productsGrid.innerHTML = `
      <div class="resto-loading">
        Aucun produit dans cette catégorie
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = produits.map(produit => `
    <div class="resto-product-card" onclick="ajouterProduitAuPanier('${produit.code_produit}')">
      <div class="resto-product-name">${produit.libelle}</div>
      <div class="resto-product-price">${formatMontantGNF(produit.prix_unitaire)}</div>
      <div style="margin-top: 0.5rem;">
        <button type="button" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
          + Ajouter
        </button>
      </div>
    </div>
  `).join('');
}

// Charger les produits et initialiser l'interface
async function chargerProduitsResto() {
  const productsGrid = $("#restoProductsGrid");

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

    // Vérifier si des produits sont chargés
    if (restoProduitsCache.length === 0) {
      productsGrid.innerHTML = `
        <div class="resto-loading" style="color: var(--accent-primary);">
          ❌ Aucun produit trouvé dans le menu
        </div>
      `;
      return;
    }

    // Initialiser le dernier numéro de vente
    await initialiserDernierNumeroVente();
    
    // Créer l'interface
    creerOngletsCategories();
    afficherTousLesProduits();

  } catch (err) {
    console.error("[RESTO] Erreur chargement menu :", err);
    if (productsGrid) {
      productsGrid.innerHTML = `
        <div class="resto-loading" style="color: var(--accent-primary);">
          ❌ Erreur de chargement du menu : ${err.message}
        </div>
      `;
    }
  }
}

// Initialiser le dernier numéro de vente
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
      const match = lastNum.match(/V-(\d+)/);
      if (match) {
        lastVenteNumber = parseInt(match[1]);
      }
    }
  } catch (err) {
    console.warn("[RESTO] Impossible de récupérer le dernier numéro de vente :", err);
    lastVenteNumber = 0;
  }
}

// Générer nouveau numéro de vente
function genererNumeroVente() {
  lastVenteNumber++;
  return `V-${lastVenteNumber.toString().padStart(3, '0')}`;
}

// Ajouter un produit au panier
function ajouterProduitAuPanier(codeProduit) {
  const produit = restoProduitsCache.find(p => p.code_produit === codeProduit);
  if (!produit) return;

  const existant = restoPanier.find(item => item.code_produit === codeProduit);

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

// Afficher un message temporaire
function showTempMessage(text, type) {
  const msg = $("#restoResult");
  if (!msg) return;

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "result";
  
  if (type === "success") msg.classList.add("ok");
  else if (type === "error") msg.classList.add("error");
  else if (type === "warn") msg.classList.add("warn");

  // Disparaît après 2 secondes
  setTimeout(() => {
    msg.style.display = "none";
  }, 2000);
}

// Actualiser l'affichage du panier
function actualiserPanier() {
  const cartItems = $("#restoCartItems");
  const cartCount = $("#restoCartCount");
  const cartTotal = $("#restoCartTotal");
  const validerBtn = $("#btnRestoValider");

  if (!cartItems) return;

  // Mettre à jour le compteur et le total
  const totalArticles = restoPanier.reduce((sum, item) => sum + item.quantite, 0);
  const totalMontant = restoPanier.reduce((sum, item) => sum + (item.prix_unitaire * item.quantite), 0);

  if (cartCount) cartCount.textContent = `${totalArticles} article(s)`;
  if (cartTotal) cartTotal.textContent = formatMontantGNF(totalMontant);
  if (validerBtn) validerBtn.disabled = totalArticles === 0;

  // Afficher les articles du panier
  if (restoPanier.length === 0) {
    cartItems.innerHTML = '<div class="resto-cart-empty">Panier vide</div>';
    return;
  }

  cartItems.innerHTML = restoPanier.map((item, index) => `
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
  `).join('');
}

// Modifier la quantité d'un article
function modifierQuantitePanier(index, delta) {
  if (index < 0 || index >= restoPanier.length) return;

  const newQuantity = restoPanier[index].quantite + delta;

  if (newQuantity <= 0) {
    supprimerDuPanier(index);
  } else {
    restoPanier[index].quantite = newQuantity;
    actualiserPanier();
  }
}

// Supprimer un article du panier
function supprimerDuPanier(index) {
  if (index < 0 || index >= restoPanier.length) return;
  
  const produitNom = restoPanier[index].libelle;
  restoPanier.splice(index, 1);
  actualiserPanier();
  showTempMessage(`🗑️ ${produitNom} retiré du panier`, "warn");
}

// Vider tout le panier
function viderPanier() {
  if (restoPanier.length === 0) return;
  
  if (confirm("Vider tout le panier ?")) {
    restoPanier = [];
    actualiserPanier();
    showTempMessage("🔄 Panier vidé", "warn");
  }
}

// Enregistrer la vente
async function enregistrerVenteResto() {
  const msg = $("#restoResult");
  const receipt = $("#restoReceipt");
  const receiptNumber = $("#receiptNumber");
  const receiptContent = $("#receiptContent");

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
  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || "sur_place";
  const notes = $("#restoOrderNotes")?.value.trim() || "";

  let totalGlobal = 0;

  try {
    // Enregistrer chaque ligne de vente
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
          libelle: item.libelle,
          quantite: item.quantite,
          prix_unitaire: item.prix_unitaire,
          montant_total: montant,
          type_commande: orderType,
          notes: notes,
          agent_id: currentAgent.$id,
          poste_id: currentAgent.role || "resto_chicha"
        }
      );
    }

    // Afficher le reçu
    afficherReçu(numeroVente, totalGlobal, orderType, notes);
    
    // Masquer le message temporaire
    if (msg) msg.style.display = "none";

  } catch (err) {
    console.error("[RESTO] Erreur enregistrement vente :", err);
    showTempMessage("❌ Erreur lors de l'enregistrement", "error");
  }
}

// Afficher le reçu
function afficherReçu(numeroVente, total, orderType, notes) {
  const receipt = $("#restoReceipt");
  const receiptNumber = $("#receiptNumber");
  const receiptContent = $("#receiptContent");
  const productsSide = $(".resto-products-side");

  if (!receipt) return;

  // Mettre à jour le numéro
  if (receiptNumber) receiptNumber.textContent = numeroVente;

  // Générer le contenu du reçu
  let receiptHTML = `
    <div style="margin-bottom: 1rem;">
      <div><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</div>
      <div><strong>Type:</strong> ${orderType === 'sur_place' ? 'Sur place' : 'À emporter'}</div>
      ${notes ? `<div><strong>Notes:</strong> ${notes}</div>` : ''}
    </div>
    <div style="border-bottom: 1px dashed #ccc; margin-bottom: 0.5rem;"></div>
  `;

  // Ajouter chaque article
  restoPanier.forEach(item => {
    const sousTotal = item.prix_unitaire * item.quantite;
    receiptHTML += `
      <div class="receipt-item">
        <div>${item.quantite}x ${item.libelle}</div>
        <div>${sousTotal.toLocaleString('fr-FR')} GNF</div>
      </div>
    `;
  });

  // Ajouter le total
  receiptHTML += `
    <div style="border-bottom: 1px dashed #ccc; margin: 0.5rem 0;"></div>
    <div class="receipt-item receipt-total">
      <div>TOTAL</div>
      <div>${total.toLocaleString('fr-FR')} GNF</div>
    </div>
    <div style="text-align: center; margin-top: 1rem; font-style: italic;">
      Merci pour votre commande !
    </div>
  `;

  if (receiptContent) receiptContent.innerHTML = receiptHTML;

  // Afficher le reçu et masquer les produits temporairement
  receipt.style.display = "block";
  if (productsSide) productsSide.style.display = "none";

  // Vider le panier
  restoPanier = [];
  actualiserPanier();
}

// Nouvelle commande
function nouvelleCommandeResto() {
  const receipt = $("#restoReceipt");
  const productsSide = $(".resto-products-side");
  const notes = $("#restoOrderNotes");

  // Réafficher les produits
  if (productsSide) productsSide.style.display = "block";
  if (receipt) receipt.style.display = "none";
  
  // Réinitialiser les notes
  if (notes) notes.value = "";

  showTempMessage("🆕 Nouvelle commande prête", "success");
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded - VERSION CORRIGÉE");

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

  // RESTO - Nouveaux écouteurs
  const btnRestoValider = $("#btnRestoValider");
  const btnRestoVider = $("#btnRestoVider");
  const btnRestoNouvelleCommande = $("#btnRestoNouvelleCommande");

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
});
