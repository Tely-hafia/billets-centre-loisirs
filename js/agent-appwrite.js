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
//  HELPERS DOM
// ===============================

function $(id) {
  return document.getElementById(id);
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
//  ÉTAT DE CONNEXION
// ===============================

let currentAgent = null; // ⚠️ Pas de localStorage → pas de session persistante

const cardLogin = $("card-login");
const agentZone = $("agent-zone");
const agentInfoP = $("agent-connected-info");
const agentNameEl = $("agent-connected-name");

function appliquerEtatConnexion(agent) {
  currentAgent = agent;

  if (agent) {
    // On montre la zone billets + validation
    if (cardLogin) cardLogin.style.display = "none";
    if (agentZone) agentZone.style.display = "block";

    if (agentInfoP && agentNameEl) {
      agentInfoP.style.display = "block";
      agentNameEl.textContent = `${agent.login} (${agent.role || ""})`;
    }

    // Charger les billets disponibles
    chargerNombreBillets();
  } else {
    // Déconnexion → retour à la page de login
    if (cardLogin) cardLogin.style.display = "block";
    if (agentZone) agentZone.style.display = "none";

    if (agentInfoP) agentInfoP.style.display = "none";
    setTicketCount(0);
  }

  clearResult();
}

// ===============================
//  CHARGER NOMBRE DE BILLET "DISPONIBLES"
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
    // On laisse l'affichage existant, on ne bloque pas l'agent
  }
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
//  VALIDATION BILLET
// ===============================

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

  // 1) PARTIE CRITIQUE : rechercher + mettre à jour le billet
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

    // Si tarif étudiant → vérifier le numéro étudiant dans la collection "etudiants"
    if (tarifChoisi === "etudiant") {
      if (!numeroEtu) {
        showResult("Pour le tarif étudiant, le numéro étudiant est obligatoire.", "error");
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

    // Mise à jour du billet : statut = Validé
    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    // Affichage succès immédiat pour l'agent
    const typeAcces = billet.type_acces || "";
    const dateAcces = billet.date_acces || "";
    showResult(
      `Billet ${numeroBillet} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      "success"
    );

    // On vide le champ numéro de billet
    const ticketInput = $("ticketNumber");
    if (ticketInput) ticketInput.value = "";

    // On met à jour le compteur
    chargerNombreBillets();
  } catch (err) {
    console.error("[AGENT] ERREUR critique validation billet :", err);
    showResult("Erreur lors de la vérification (voir console).", "error");
    return;
  }

  // 2) PARTIE NON CRITIQUE : journalisation dans "validations"
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
    // On NE casse PAS l'affichage pour l'agent
    console.warn("[AGENT] Erreur lors de l'enregistrement de la validation :", logErr);
  }
}

// ===============================
//  INIT
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[AGENT] DOMContentLoaded");

  // Etat initial : déconnecté
  appliquerEtatConnexion(null);

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

  // Validation
  const btnValidate = $("validateBtn");
  if (btnValidate) {
    btnValidate.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // Validation par Entrée dans le champ billet
  const inputTicket = $("ticketNumber");
  if (inputTicket) {
    inputTicket.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBillet();
      }
    });
  }
});
