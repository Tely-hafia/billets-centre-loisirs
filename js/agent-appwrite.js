console.log("[AGENT] agent-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";
const APPWRITE_AGENTS_TABLE_ID = "agents";

// =====================================
//  Initialisation Appwrite
// =====================================

if (typeof Appwrite === "undefined") {
  console.error(
    "[AGENT] Appwrite SDK non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@21.4.0\"></script>"
  );
}

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

// Tables (relational DB)
const tablesDB = new Appwrite.TablesDB(client);

// =====================================
//  État courant
// =====================================

let currentAgent = null; // {id, code, nom, poste}

// =====================================
//  Helpers DOM
// =====================================

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
  const zone = $("login-message");
  if (!zone) return;

  zone.textContent = text;
  zone.className = "message";
  zone.classList.add(`message-${type}`);
}

// Affichage login / validation selon connexion
function updateUIForAgent() {
  const loginSection = $("loginSection");
  const validationSection = $("validationSection");
  const agentInfo = $("agentInfo");

  if (currentAgent) {
    if (loginSection) loginSection.style.display = "none";
    if (validationSection) validationSection.style.display = "block";

    if (agentInfo) {
      agentInfo.style.display = "block";
      const posteLabel =
        currentAgent.poste === "entree"
          ? "Poste entrée"
          : currentAgent.poste === "interne"
          ? "Poste interne"
          : currentAgent.poste;
      agentInfo.textContent = `Connecté : ${currentAgent.code} (${posteLabel})`;
    }
  } else {
    if (loginSection) loginSection.style.display = "block";
    if (validationSection) validationSection.style.display = "none";
    if (agentInfo) {
      agentInfo.style.display = "none";
      agentInfo.textContent = "";
    }
  }
}

// =====================================
//  Chargement du nombre de billets
// =====================================

async function chargerNombreBillets() {
  try {
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [Appwrite.Query.limit(10000)]
    });

    const nb = res.rows ? res.rows.length : 0;
    setTicketCount(nb);
    console.log("[AGENT] Billets chargés :", nb);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets :", err);
  }
}

// =====================================
//  Connexion agent
// =====================================

async function loginAgent() {
  const codeInput = $("agentCode");
  const passInput = $("agentPassword");

  if (!codeInput || !passInput) {
    alert("Problème HTML : champs login introuvables.");
    return;
  }

  const code = codeInput.value.trim();
  const password = passInput.value.trim();

  if (!code || !password) {
    showLoginMessage("Veuillez saisir le code agent et le mot de passe.", "error");
    return;
  }

  showLoginMessage("Connexion en cours...", "info");

  try {
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_AGENTS_TABLE_ID,
      queries: [
        Appwrite.Query.equal("code", [code]),
        Appwrite.Query.equal("password", [password]),
        Appwrite.Query.limit(1)
      ]
    });

    if (!res.rows || res.rows.length === 0) {
      showLoginMessage("Code ou mot de passe incorrect.", "error");
      currentAgent = null;
      updateUIForAgent();
      return;
    }

    const ag = res.rows[0];
    currentAgent = {
      id: ag.$id,
      code: ag.code,
      nom: ag.nom,
      poste: ag.poste
    };

    // Mémoriser dans localStorage
    localStorage.setItem("centre_loisirs_agent", JSON.stringify(currentAgent));

    showLoginMessage("Connexion réussie.", "success");
    console.log("[AGENT] Connecté :", currentAgent);

    updateUIForAgent();
  } catch (err) {
    console.error("[AGENT] Erreur login agent :", err);
    showLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function loadAgentFromStorage() {
  try {
    const raw = localStorage.getItem("centre_loisirs_agent");
    if (!raw) return;
    const ag = JSON.parse(raw);
    if (ag && ag.code && ag.poste) {
      currentAgent = ag;
      console.log("[AGENT] Agent restauré depuis localStorage :", currentAgent);
    }
  } catch (err) {
    console.warn("[AGENT] Impossible de restaurer l'agent depuis localStorage :", err);
  }
}

// =====================================
//  Vérification / validation d'un billet
// =====================================

async function verifierBillet() {
  if (!currentAgent) {
    showMessage("Veuillez vous connecter en tant qu'agent.", "error");
    return;
  }

  const input = $("ticketNumber");
  if (!input) {
    alert("Champ ticketNumber introuvable dans la page.");
    return;
  }

  const numero = input.value.trim();

  if (!numero) {
    showMessage("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  // Tarif choisi
  const tarifRadios = document.querySelectorAll('input[name="tarif"]');
  let tarifChoisi = "normal";
  tarifRadios.forEach((r) => {
    if (r.checked) tarifChoisi = r.value;
  });

  console.log("[AGENT] Vérification billet...", numero);
  console.log("[AGENT] Tarif choisi :", tarifChoisi);

  showMessage("Vérification en cours...", "info");

  try {
    // 1. Recherche du billet
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [
        Appwrite.Query.equal("numero_billet", [numero]),
        Appwrite.Query.limit(1)
      ]
    });

    if (!res.rows || res.rows.length === 0) {
      showMessage(`Billet ${numero} introuvable.`, "error");
      return;
    }

    const billet = res.rows[0];

    if (billet.statut === "Validé") {
      showMessage(`Billet ${numero} déjà VALIDÉ ❌`, "error");
      return;
    }

    // Déterminer les tarifs
    const tarifNormal = billet.prix || 0;
    const tarifEtudiant = billet.tarif_universite || 0;

    let tarifApplique = "normal";
    let montantPaye = tarifNormal;
    let numeroEtudiant = null;

    if (tarifChoisi === "etudiant") {
      // Numéro étudiant obligatoire
      const studentInput = $("studentNumber");
      const numEtu = studentInput ? studentInput.value.trim() : "";

      if (!numEtu) {
        showMessage(
          "Impossible d'appliquer un tarif étudiant sans numéro étudiant.",
          "error"
        );
        return;
      }

      // Vérification de l'étudiant dans la table "etudiants"
      const etuRes = await tablesDB.listRows({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_ETUDIANTS_TABLE_ID,
        queries: [
          Appwrite.Query.equal("numero_etudiant", [numEtu]),
          Appwrite.Query.limit(1)
        ]
      });

      if (!etuRes.rows || etuRes.rows.length === 0) {
        showMessage(
          `Numéro étudiant ${numEtu} introuvable dans la liste des étudiants.`,
          "error"
        );
        return;
      }

      // OK, on applique le tarif étudiant
      tarifApplique = "etudiant";
      montantPaye = tarifEtudiant || tarifNormal;
      numeroEtudiant = numEtu;
    }

    // 2. Mettre à jour le billet -> statut = Validé
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      rowId: billet.$id,
      data: {
        statut: "Validé"
      }
    });

    console.log(
      "[AGENT] Billet mis à jour dans Appwrite :",
      billet.numero_billet
    );

    // 3. Enregistrer la validation
    const nowIso = new Date().toISOString();

    const validationData = {
      numero_billet: billet.numero_billet,
      billet_id: billet.$id,
      date_validation: nowIso,
      type_acces: billet.type_acces || "",
      tarif_normal: tarifNormal,
      tarif_etudiant: tarifEtudiant,
      tarif_applique: tarifApplique,
      montant_paye: montantPaye,
      agent_id: currentAgent.code,
      poste_id: currentAgent.poste,
      numero_etudiant: numeroEtudiant
    };

    console.log("[AGENT] Création validation :", validationData);

    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_VALIDATIONS_TABLE_ID,
      rowId: Appwrite.ID.unique(),
      data: validationData
    });

    // 4. Message succès
    const typeAcces = billet.type_acces || "";
    const dateAcces = billet.date_acces || "";

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces} – ${dateAcces})\nTarif : ${
        tarifApplique === "etudiant" ? "Étudiant" : "Normal"
      } – Montant payé : ${montantPaye} GNF`,
      "success"
    );

    // On vide le champ billet (et étudiant)
    input.value = "";
    const studentInput = $("studentNumber");
    if (studentInput) studentInput.value = "";

    // On met à jour le compteur
    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] Erreur lors de la vérification :", err);
    showMessage("Erreur lors de la vérification (voir console).", "error");
  }
}

// =====================================
//  Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded");

  // Restaurer l'agent depuis localStorage (si déjà connecté)
  loadAgentFromStorage();
  updateUIForAgent();

  // Login bouton
  const loginBtn = $("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      loginAgent();
    });
  }

  // Validation bouton
  const btn = $("validateBtn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // Validation avec Entrée dans le champ billet
  const input = $("ticketNumber");
  if (input) {
    input.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBillet();
      }
    });
  }

  // Affichage champ étudiant selon radio bouton
  const tarifRadios = document.querySelectorAll('input[name="tarif"]');
  const studentRow = $("studentRow");
  tarifRadios.forEach((r) => {
    r.addEventListener("change", () => {
      if (!studentRow) return;
      if (r.value === "etudiant" && r.checked) {
        studentRow.style.display = "flex";
      } else if (r.value === "normal" && r.checked) {
        studentRow.style.display = "none";
      }
    });
  });

  // Charger le nombre de billets au démarrage
  chargerNombreBillets();
});

