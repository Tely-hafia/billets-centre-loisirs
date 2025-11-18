// ======================================================
//  Configuration Appwrite
// ======================================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_COLLECTION_ID = "billets";
const APPWRITE_VALIDATIONS_COLLECTION_ID = "validations";
const APPWRITE_AGENTS_COLLECTION_ID = "agents";
const APPWRITE_ETUDIANTS_COLLECTION_ID = "etudiants";

// Pas de persistance : tout est en mémoire
let billetsMap = {};        // numero_billet -> document billet
let currentAgent = null;    // agent connecté

// ======================================================
//  Initialisation Appwrite
// ======================================================

const client = new Appwrite.Client();

client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const databases = new Appwrite.Databases(client);

// ======================================================
//  Helpers DOM
// ======================================================

function $(id) {
  return document.getElementById(id);
}

function setTicketCount(n) {
  const el = $("ticketCount");
  if (el) el.textContent = n.toString();
}

function showMessage(text, type = "info") {
  const zone = $("result-message");
  if (!zone) {
    alert(text);
    return;
  }

  zone.textContent = text;
  zone.className = "message";
  zone.classList.add(`message-${type}`);
}

function showLoginMessage(text, type = "info") {
  const zone = $("loginMessage");
  if (!zone) {
    alert(text);
    return;
  }

  zone.textContent = text;
  zone.className = "message";
  zone.classList.add(`message-${type}`);
}

// Carte de résumé de validation
function showValidationDetails(details) {
  const card = $("validationSummary");
  if (!card) return;

  card.style.display = "block";

  const set = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  set("valNumBillet", details.numero || "");
  set("valTypeAcces", details.typeAcces || "");
  set("valTarifChoisi", details.tarifLabel || "");
  set(
    "valTarifNormal",
    details.tarifNormal != null
      ? details.tarifNormal.toLocaleString("fr-FR") + " GNF"
      : "—"
  );
  set(
    "valTarifEtudiant",
    details.tarifEtudiant != null
      ? details.tarifEtudiant.toLocaleString("fr-FR") + " GNF"
      : "—"
  );
  set(
    "valMontantPaye",
    details.montantPaye != null
      ? details.montantPaye.toLocaleString("fr-FR") + " GNF"
      : "—"
  );
  set("valNumeroEtudiant", details.numeroEtudiant || "—");
}

// ======================================================
//  Chargement des billets
// ======================================================

async function chargerBilletsDepuisAppwrite() {
  try {
    console.log("[AGENT] Chargement billets depuis Appwrite…");

    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_COLLECTION_ID,
      [Appwrite.Query.limit(10000)]
    );

    billetsMap = {};
    const docs = res.documents || [];
    docs.forEach((doc) => {
      if (doc.numero_billet) {
        billetsMap[doc.numero_billet] = doc;
      }
    });

    console.log("[AGENT] Billets chargés :", docs.length);
    setTicketCount(docs.length);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
    showMessage(
      "Impossible de charger les billets depuis le serveur (voir console).",
      "error"
    );
  }
}

function findBillet(numero) {
  return billetsMap[numero] || null;
}

// ======================================================
//  Gestion Agent : login / logout / UI
// ======================================================

function logoutAgent() {
  currentAgent = null;
  updateUIForAgent();
  showLoginMessage("Vous êtes déconnecté.", "info");
}

async function loginAgent() {
  const codeInput = $("agentCode");
  const passInput = $("agentPassword");

  if (!codeInput || !passInput) {
    alert("Problème HTML : champs de connexion introuvables.");
    return;
  }

  const login = codeInput.value.trim();
  const password = passInput.value.trim();

  if (!login || !password) {
    showLoginMessage(
      "Veuillez saisir le code agent et le mot de passe.",
      "error"
    );
    return;
  }

  showLoginMessage("Connexion en cours…", "info");

  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_COLLECTION_ID,
      [
        Appwrite.Query.equal("login", [login]),
        Appwrite.Query.equal("mot_de_passe", [password]),
        Appwrite.Query.equal("actif", [true]),
        Appwrite.Query.limit(1)
      ]
    );

    const docs = res.documents || [];

    if (docs.length === 0) {
      showLoginMessage(
        "Identifiants incorrects ou agent inactif.",
        "error"
      );
      currentAgent = null;
      updateUIForAgent();
      return;
    }

    const ag = docs[0];
    currentAgent = {
      id: ag.$id,
      login: ag.login,
      nom: ag.nom,
      role: ag.role
    };

    showLoginMessage("Connexion réussie.", "success");
    console.log("[AGENT] Connecté :", currentAgent);

    // Recharger les billets après connexion
    await chargerBilletsDepuisAppwrite();
    
    updateUIForAgent();
  } catch (err) {
    console.error("[AGENT] Erreur login agent :", err);
    showLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function updateUIForAgent() {
  const loginSection = $("loginSection");
  const dashboardSection = $("dashboardSection");
  const agentInfo = $("agentInfo");
  const logoutBtn = $("btnLogout");
  const loginBtn = $("btnLogin");

  if (currentAgent) {
    // Mode connecté : afficher le dashboard, masquer le formulaire de connexion
    if (loginSection) {
      loginSection.style.display = "block"; // On garde la section mais on réduit son importance
      loginSection.style.opacity = "0.7";
    }
    if (dashboardSection) {
      dashboardSection.style.display = "block";
    }
    if (agentInfo) {
      agentInfo.style.display = "block";
      agentInfo.textContent = `Connecté : ${currentAgent.login} (${currentAgent.role})`;
    }
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (loginBtn) loginBtn.style.display = "none";

    // Masquer les champs de connexion
    const agentCode = $("agentCode");
    const agentPassword = $("agentPassword");
    if (agentCode) agentCode.style.display = "none";
    if (agentPassword) agentPassword.style.display = "none";

    // Mettre à jour les labels
    const labels = loginSection.querySelectorAll('label[for="agentCode"], label[for="agentPassword"]');
    labels.forEach(label => label.style.display = "none");

  } else {
    // Mode déconnecté : afficher uniquement le formulaire de connexion
    if (loginSection) {
      loginSection.style.display = "block";
      loginSection.style.opacity = "1";
    }
    if (dashboardSection) dashboardSection.style.display = "none";
    if (agentInfo) {
      agentInfo.style.display = "none";
      agentInfo.textContent = "";
    }
    if (logoutBtn) logoutBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "inline-block";

    // Afficher les champs de connexion
    const agentCode = $("agentCode");
    const agentPassword = $("agentPassword");
    if (agentCode) {
      agentCode.style.display = "block";
      agentCode.value = "";
    }
    if (agentPassword) {
      agentPassword.style.display = "block";
      agentPassword.value = "";
    }

    // Afficher les labels
    const labels = loginSection.querySelectorAll('label[for="agentCode"], label[for="agentPassword"]');
    labels.forEach(label => label.style.display = "block");
  }
}

// ======================================================
//  Vérification Étudiant
// ======================================================

async function verifierEtudiant(numeroEtudiant) {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_COLLECTION_ID,
      [
        Appwrite.Query.equal("numero_etudiant", [numeroEtudiant]),
        Appwrite.Query.equal("actif", [true]),
        Appwrite.Query.limit(1)
      ]
    );

    const docs = res.documents || [];
    if (docs.length === 0) return null;
    return docs[0];
  } catch (err) {
    console.error("[AGENT] Erreur vérification étudiant :", err);
    return null;
  }
}

// ======================================================
//  Vérification & validation d'un billet
// ======================================================

async function verifierBillet() {
  const input = $("ticketNumber");

  if (!currentAgent) {
    showMessage("Veuillez d'abord vous connecter.", "error");
    return;
  }

  if (!input) {
    alert("Champ ticketNumber introuvable.");
    return;
  }

  const numero = input.value.trim();
  if (!numero) {
    showMessage("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  showMessage("Vérification en cours…", "info");

  try {
    // 1. Récupérer le billet
    let billet = findBillet(numero);

    if (!billet) {
      const res = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_COLLECTION_ID,
        [
          Appwrite.Query.equal("numero_billet", [numero]),
          Appwrite.Query.limit(1)
        ]
      );

      const docs = res.documents || [];
      if (docs.length === 0) {
        showMessage(`Billet ${numero} introuvable.`, "error");
        return;
      }

      billet = docs[0];
      billetsMap[numero] = billet;
    }

    // 2. Déjà validé ?
    if (billet.statut === "Validé") {
      showMessage(`Billet ${numero} déjà VALIDÉ ❌`, "error");
      return;
    }

    // 3. Tarif choisi
    const normalRadio = document.querySelector(
      "input[name='tarifType'][value='normal']"
    );
    const etuRadio = document.querySelector(
      "input[name='tarifType'][value='etudiant']"
    );

    let tarifChoisi = "normal";
    if (etuRadio && etuRadio.checked) {
      tarifChoisi = "etudiant";
    } else if (normalRadio && normalRadio.checked) {
      tarifChoisi = "normal";
    }

    const tarifNormal = billet.prix || 0;
    const tarifEtudiant = billet.tarif_universite || tarifNormal;

    let tarifApplique = tarifNormal;
    let montantPaye = tarifNormal;
    let numeroEtudiant = "";

    // 4. Tarif étudiant -> vérif etudiant
    if (tarifChoisi === "etudiant") {
      let numEtu = "";
      const etuInput = $("studentNumber");
      if (etuInput) numEtu = etuInput.value.trim();

      if (!numEtu) {
        numEtu = window.prompt("Numéro étudiant :");
      }

      if (!numEtu) {
        showMessage(
          "Numéro étudiant obligatoire pour appliquer le tarif étudiant.",
          "error"
        );
        return;
      }

      const etu = await verifierEtudiant(numEtu);
      if (!etu) {
        showMessage(
          "Étudiant introuvable ou inactif. Tarif étudiant refusé.",
          "error"
        );
        return;
      }

      numeroEtudiant = numEtu;
      tarifApplique = tarifEtudiant;
      montantPaye = tarifEtudiant;
    }

    // 5. Mettre à jour le billet
    await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_COLLECTION_ID,
      billet.$id,
      { statut: "Validé" }
    );

    billet.statut = "Validé";
    billetsMap[numero] = billet;

    // 6. Enregistrer la validation
    const nowIso = new Date().toISOString();

    const validationData = {
      numero_billet: numero,
      billet_id: billet.$id,
      date_validation: nowIso,
      type_acces: billet.type_acces || "",
      tarif_normal: tarifNormal,
      tarif_etudiant: tarifEtudiant,
      tarif_applique: tarifApplique,
      montant_paye: montantPaye,
      agent_id: currentAgent.login,
      poste_id: currentAgent.role,
      numero_etudiant: numeroEtudiant
    };

    console.log("[AGENT] Création validation :", validationData);

    await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_COLLECTION_ID,
      Appwrite.ID.unique(),
      validationData
    );

    // 7. Affichage
    const typeAcces = billet.type_acces || "";
    const msgDetail =
      tarifChoisi === "etudiant"
        ? `Tarif étudiant appliqué (${montantPaye} GNF).`
        : `Tarif normal appliqué (${montantPaye} GNF).`;

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces})  -  ${msgDetail}`,
      "success"
    );

    showValidationDetails({
      numero,
      typeAcces,
      tarifLabel: tarifChoisi === "etudiant" ? "Étudiant" : "Normal",
      tarifNormal,
      tarifEtudiant,
      montantPaye,
      numeroEtudiant
    });

    input.value = "";
    const studentInput = $("studentNumber");
    if (studentInput) studentInput.value = "";

    // Actualiser le compteur de billets
    await chargerBilletsDepuisAppwrite();

  } catch (err) {
    console.error("[AGENT] Erreur lors de la vérification :", err);
    showMessage("Erreur lors de la vérification (voir console).", "error");
  }
}

// ======================================================
//  Initialisation
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] agent-appwrite.js chargé");

  updateUIForAgent();

  const btnLogin = $("btnLogin");
  if (btnLogin) {
    btnLogin.addEventListener("click", (e) => {
      e.preventDefault();
      loginAgent();
    });
  }

  const btnLogout = $("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", (e) => {
      e.preventDefault();
      logoutAgent();
    });
  }

  const btnValidate = $("validateBtn");
  if (btnValidate) {
    btnValidate.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  const ticketInput = $("ticketNumber");
  if (ticketInput) {
    ticketInput.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBillet();
      }
    });
  }

  // Charger les billets seulement si connecté
  if (currentAgent) {
    chargerBilletsDepuisAppwrite();
  }
});
