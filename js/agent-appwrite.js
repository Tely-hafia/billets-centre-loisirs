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
    "[AGENT] Appwrite SDK non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@13.0.0\"></script>"
  );
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);

// ===============================
//  VARIABLES GLOBALES
// ===============================

let currentAgent = null;
let produitsMenu = [];

// ===============================
//  HELPERS DOM
// ===============================

function $(id) {
  return document.getElementById(id);
}

function showResult(selector, text, type) {
  const zone = $(selector);
  if (!zone) return;

  zone.style.display = "block";
  zone.textContent = text;
  zone.className = "result";
  if (type === "success") zone.classList.add("ok");
  else if (type === "error") zone.classList.add("error");
  else if (type === "warn") zone.classList.add("warn");
}

function clearResult(selector) {
  const zone = $(selector);
  if (!zone) return;
  zone.style.display = "none";
  zone.textContent = "";
  zone.className = "result";
}

function showLoginMessage(text, type) {
  const zone = $("login-message");
  if (!zone) return;
  zone.textContent = text || "";
  zone.className = "status";
  if (!text) return;
  if (type === "success") zone.style.color = "#16a34a";
  else if (type === "error") zone.style.color = "#b91c1c";
  else zone.style.color = "#6b7280";
}

function setTicketCount(n) {
  const el = $("ticketCount");
  if (el) el.textContent = String(n);
}

function getTarifChoisi() {
  const normal = $("tarif-normal");
  const etu = $("tarif-etudiant");
  if (etu && etu.checked) return "etudiant";
  return "normal";
}

// ===============================
//  GESTION DE LA NAVIGATION
// ===============================

function changerMode(mode) {
  // Masquer tous les modes
  document.querySelectorAll('.mode-content').forEach(el => {
    el.style.display = 'none';
  });
  
  // Désactiver tous les boutons
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activer le mode sélectionné
  $(`mode-${mode}`).style.display = 'block';
  $(`btn-mode-${mode}`).classList.add('active');
  
  // Réinitialiser les messages
  clearResult('result-message');
  clearResult('result-message-interne');
  clearResult('result-message-restaurant');
}

// ===============================
//  ÉTAT DE CONNEXION
// ===============================

const cardLogin = $("card-login");
const agentZone = $("agent-zone");
const agentInfoP = $("agent-connected-info");
const agentNameEl = $("agent-connected-name");

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  if (agent) {
    // On montre la zone agent
    if (cardLogin) cardLogin.style.display = "none";
    if (agentZone) agentZone.style.display = "block";

    if (agentInfoP && agentNameEl) {
      agentInfoP.style.display = "block";
      agentNameEl.textContent = `${agent.login} (${agent.role || ""})`;
    }

    // Charger les données
    chargerNombreBillets();
    chargerMenuRestaurant();
    
    // Mode par défaut
    changerMode('entree');
  } else {
    // Déconnexion → retour à la page de login
    if (cardLogin) cardLogin.style.display = "block";
    if (agentZone) agentZone.style.display = "none";

    if (agentInfoP) agentInfoP.style.display = "none";
    setTicketCount(0);
  }

  clearResult('result-message');
  clearResult('result-message-interne');
  clearResult('result-message-restaurant');
}

// ===============================
//  CHARGEMENT DES DONNÉES
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

async function chargerMenuRestaurant() {
  try {
    const res = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [Appwrite.Query.equal("actif", [true])]
    );

    produitsMenu = res.documents || [];
    const select = $("#produitSelect");
    select.innerHTML = '<option value="">Choisir un produit...</option>';
    
    produitsMenu.forEach(produit => {
      const option = document.createElement('option');
      option.value = produit.code_product;
      option.textContent = `${produit.libelle} - ${produit.prix_unitaire.toLocaleString()} GNF`;
      option.dataset.prix = produit.prix_unitaire;
      select.appendChild(option);
    });

    // Écouter les changements pour calculer le total
    select.addEventListener('change', calculerTotal);
    $("#quantite").addEventListener('input', calculerTotal);
    
  } catch (err) {
    console.error("[AGENT] Erreur chargement menu :", err);
  }
}

function calculerTotal() {
  const select = $("#produitSelect");
  const quantite = $("#quantite");
  const totalEl = $("#montantTotal");
  
  if (!select || !quantite || !totalEl) return;
  
  const produit = select.options[select.selectedIndex];
  const prix = parseInt(produit.dataset.prix || 0);
  const qte = parseInt(quantite.value || 1);
  
  const total = prix * qte;
  totalEl.textContent = total.toLocaleString() + " GNF";
}

// ===============================
//  CONNEXION / DÉCONNEXION AGENT
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
//  VALIDATION BILLET (MODE ENTRÉE)
// ===============================

async function verifierBilletEntree() {
  clearResult('result-message');

  if (!currentAgent) {
    showResult("result-message", "Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumber")?.value.trim();
  const numeroEtu = $("etuNumber")?.value.trim();
  const tarifChoisi = getTarifChoisi();

  if (!numeroBillet) {
    showResult("result-message", "Veuillez saisir un numéro de billet.", "error");
    return;
  }

  // 1) Rechercher le billet
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
      showResult("result-message", `Billet ${numeroBillet} introuvable.`, "error");
      return;
    }

    billet = res.documents[0];

    if (billet.statut === "Validé") {
      showResult("result-message", `Billet ${numeroBillet} déjà VALIDÉ ❌`, "error");
      return;
    }

    // Si tarif étudiant → vérifier le numéro étudiant
    if (tarifChoisi === "etudiant") {
      if (!numeroEtu) {
        showResult("result-message", "Pour le tarif étudiant, le numéro étudiant est obligatoire.", "error");
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
          showResult("result-message",
            "Numéro étudiant introuvable. L'étudiant doit être enregistré par l'administrateur.",
            "error"
          );
          return;
        }
      } catch (errCheck) {
        console.error("[AGENT] Erreur vérification étudiant :", errCheck);
        showResult("result-message",
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

    // Affichage succès
    const typeAcces = billet.type_acces || "";
    const dateAcces = billet.date_acces || "";
    showResult("result-message",
      `Billet ${numeroBillet} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      "success"
    );

    // Vider le champ et mettre à jour le compteur
    $("ticketNumber").value = "";
    chargerNombreBillets();

  } catch (err) {
    console.error("[AGENT] ERREUR validation billet :", err);
    showResult("result-message", "Erreur lors de la vérification (voir console).", "error");
    return;
  }

  // 2) Journalisation dans "validations"
  try {
    const nowIso = new Date().toISOString();

    const montantNormal = parseInt(billet.prix || 0, 10) || 0;
    const montantEtudiant = parseInt(billet.tarif_universite || 0, 10) || 0;
    const montantPaye = tarifChoisi === "etudiant" ? montantEtudiant : montantNormal;

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: billet.numero_billet,
        billet_id: billet.$id,
        date_validation: nowIso,
        type_acces: billet.type_acces || "",
        tarif_normal: montantNormal,
        tarif_etudiant: montantEtudiant,
        tarif_applique: tarifChoisi,
        montant_paye: montantPaye,
        agent_id: currentAgent?.$id || "",
        poste_id: currentAgent?.role || "",
        numero_etudiant: numeroEtu || ""
      }
    );
  } catch (logErr) {
    console.warn("[AGENT] Erreur enregistrement validation :", logErr);
  }
}

// ===============================
//  VALIDATION BILLET (MODE INTERNE)
// ===============================

async function verifierBilletInterne() {
  clearResult('result-message-interne');

  if (!currentAgent) {
    showResult("result-message-interne", "Veuillez d'abord vous connecter.", "error");
    return;
  }

  const numeroBillet = $("ticketNumberInterne")?.value.trim();

  if (!numeroBillet) {
    showResult("result-message-interne", "Veuillez saisir un numéro de billet.", "error");
    return;
  }

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
      showResult("result-message-interne", `Billet ${numeroBillet} introuvable.`, "error");
      return;
    }

    const billet = res.documents[0];

    if (billet.statut === "Validé") {
      showResult("result-message-interne", `Billet ${numeroBillet} déjà VALIDÉ ❌`, "error");
      return;
    }

    // Validation interne (jeux) - pas de changement de statut pour l'instant
    const typeAcces = billet.type_acces || "";
    showResult("result-message-interne",
      `Billet ${numeroBillet} VALIDÉ pour jeux internes ✅ (${typeAcces})`,
      "success"
    );

    // Vider le champ
    $("ticketNumberInterne").value = "";

  } catch (err) {
    console.error("[AGENT] Erreur validation interne :", err);
    showResult("result-message-interne", "Erreur lors de la validation (voir console).", "error");
  }
}

// ===============================
//  VENTE RESTAURANT (MODE RESTAURANT)
// ===============================

async function enregistrerVenteRestaurant() {
  clearResult('result-message-restaurant');

  if (!currentAgent) {
    showResult("result-message-restaurant", "Veuillez d'abord vous connecter.", "error");
    return;
  }

  const produitSelect = $("#produitSelect");
  const quantiteInput = $("#quantite");
  
  const codeProduit = produitSelect.value;
  const quantite = parseInt(quantiteInput.value || 1);

  if (!codeProduit) {
    showResult("result-message-restaurant", "Veuillez sélectionner un produit.", "error");
    return;
  }

  if (quantite < 1) {
    showResult("result-message-restaurant", "La quantité doit être au moins 1.", "error");
    return;
  }

  try {
    // Trouver le produit sélectionné
    const produit = produitsMenu.find(p => p.code_product === codeProduit);
    if (!produit) {
      showResult("result-message-restaurant", "Produit non trouvé.", "error");
      return;
    }

    const montantTotal = produit.prix_unitaire * quantite;
    const nowIso = new Date().toISOString();

    // Générer un numéro de ticket unique
    const numeroTicket = "R" + Date.now();

    // Enregistrer la vente
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      Appwrite.ID.unique(),
      {
        numero_ticket: numeroTicket,
        date_vente: nowIso,
        code_produit: codeProduit,
        quantite: quantite,
        montant_total: montantTotal,
        agent_id: currentAgent.login,
        poste_id: currentAgent.role
      }
    );

    showResult("result-message-restaurant",
      `Vente enregistrée ✅\nTicket: ${numeroTicket}\n${quantite}x ${produit.libelle}\nTotal: ${montantTotal.toLocaleString()} GNF`,
      "success"
    );

    // Réinitialiser le formulaire
    produitSelect.selectedIndex = 0;
    quantiteInput.value = 1;
    $("#montantTotal").textContent = "0 GNF";

  } catch (err) {
    console.error("[AGENT] Erreur enregistrement vente :", err);
    showResult("result-message-restaurant", "Erreur lors de l'enregistrement (voir console).", "error");
  }
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded");

  // État initial : déconnecté
  appliquerEtatConnexion(null);

  // Navigation entre les modes
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const mode = btn.dataset.mode;
      changerMode(mode);
    });
  });

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

  // Validation Entrée
  const btnValidate = $("validateBtn");
  if (btnValidate) {
    btnValidate.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBilletEntree();
    });
  }

  // Validation Interne
  const btnValidateInterne = $("validateBtnInterne");
  if (btnValidateInterne) {
    btnValidateInterne.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBilletInterne();
    });
  }

  // Vente Restaurant
  const btnVenteRestaurant = $("btnVenteRestaurant");
  if (btnVenteRestaurant) {
    btnVenteRestaurant.addEventListener("click", (e) => {
      e.preventDefault();
      enregistrerVenteRestaurant();
    });
  }

  // Validation par Entrée dans les champs
  const inputTicket = $("ticketNumber");
  if (inputTicket) {
    inputTicket.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBilletEntree();
      }
    });
  }

  const inputTicketInterne = $("ticketNumberInterne");
  if (inputTicketInterne) {
    inputTicketInterne.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBilletInterne();
      }
    });
  }
});
