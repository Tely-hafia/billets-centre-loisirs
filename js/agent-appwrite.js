// ======================================================
//  Configuration Appwrite  (à adapter avec tes valeurs)
// ======================================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";        // ton ID projet
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";       // ta base "centre_loisirs"

// Dans l'interface Appwrite, ce sont les IDs des collections
const APPWRITE_BILLETS_COLLECTION_ID = "billets";
const APPWRITE_VALIDATIONS_COLLECTION_ID = "validations";
const APPWRITE_AGENTS_COLLECTION_ID = "agents";
const APPWRITE_ETUDIANTS_COLLECTION_ID = "etudiants";

const AGENT_LOCALSTORAGE_KEY = "centre_loisirs_agent";

// ======================================================
//  Initialisation Appwrite
// ======================================================

const client = new Appwrite.Client();

client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

// Ici on utilise Databases (collections/documents)
const databases = new Appwrite.Databases(client);

// ======================================================
//  État local
// ======================================================

let billetsMap = {};        // numero_billet -> billet (document)
let currentAgent = null;    // agent connecté { id, login, nom, role }

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

// ======================================================
//  Chargement des billets (depuis Appwrite)
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

function loadAgentFromStorage() {
  try {
    const raw = localStorage.getItem(AGENT_LOCALSTORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj && obj.login) {
      currentAgent = obj;
      console.log("[AGENT] Agent restauré depuis localStorage :", currentAgent);
    }
  } catch (e) {
    console.warn("[AGENT] Impossible de restaurer l'agent depuis localStorage.");
  }
}

function saveAgentToStorage() {
  if (!currentAgent) {
    localStorage.removeItem(AGENT_LOCALSTORAGE_KEY);
    return;
  }
  localStorage.setItem(AGENT_LOCALSTORAGE_KEY, JSON.stringify(currentAgent));
}

function logoutAgent() {
  currentAgent = null;
  saveAgentToStorage();
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

    saveAgentToStorage();

    showLoginMessage("Connexion réussie.", "success");
    console.log("[AGENT] Connecté :", currentAgent);

    updateUIForAgent();
  } catch (err) {
    console.error("[AGENT] Erreur login agent :", err);
    showLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function updateUIForAgent() {
  const loginSection = $("loginSection");
  const validationSection = $("validationSection");
  const billetsSection = $("billetsSection");
  const agentInfo = $("agentInfo");
  const logoutBtn = $("btnLogout");

  if (currentAgent) {
    if (loginSection) loginSection.style.display = "none";
    if (validationSection) validationSection.style.display = "block";
    if (billetsSection) billetsSection.style.display = "block";

    if (agentInfo) {
      agentInfo.style.display = "block";
      agentInfo.textContent = `Connecté : ${currentAgent.login} (${currentAgent.role})`;
    }

    if (logoutBtn) logoutBtn.style.display = "inline-block";
  } else {
    if (loginSection) loginSection.style.display = "block";
    if (validationSection) validationSection.style.display = "none";
    if (billetsSection) billetsSection.style.display = "none";

    if (agentInfo) {
      agentInfo.style.display = "none";
      agentInfo.textContent = "";
    }

    if (logoutBtn) logoutBtn.style.display = "none";
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
    // 1. On récupère le billet (cache ou Appwrite)
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

    // 4. Si tarif étudiant -> vérif etudiant
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

    // 5. Mettre à jour le billet (statut)
    await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_COLLECTION_ID,
      billet.$id,
      {
        statut: "Validé"
      }
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

    // 7. Succès
    const typeAcces = billet.type_acces || "";
    const msgDetail =
      tarifChoisi === "etudiant"
        ? `Tarif étudiant appliqué (${montantPaye} GNF).`
        : `Tarif normal appliqué (${montantPaye} GNF).`;

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces})  -  ${msgDetail}`,
      "success"
    );

    input.value = "";
    const studentInput = $("studentNumber");
    if (studentInput) studentInput.value = "";
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

  // Restaurer l'agent si déjà connecté
  loadAgentFromStorage();
  updateUIForAgent();

  // Événements connexion / déconnexion
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

  // Validation billet
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

  // Charger les billets depuis Appwrite
  chargerBilletsDepuisAppwrite();
});

