console.log("[ADMIN] admin-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                // billets d'entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne"; // billets jeux internes
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";        // historique validations
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";            // étudiants
const APPWRITE_AGENTS_TABLE_ID = "agents";                  // agents

// =====================================
//  Initialisation du client Appwrite
// =====================================

if (typeof Appwrite === "undefined") {
  console.error(
    "[ADMIN] Appwrite SDK non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@13.0.0\"></script>"
  );
}

const adminClient = new Appwrite.Client();
adminClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const adminDB = new Appwrite.Databases(adminClient);

// Helpers DOM
function $(id) {
  return document.getElementById(id);
}

// Format monnaie
function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

function getImportType() {
  const r = document.querySelector('input[name="importType"]:checked');
  return r ? r.value : "entree";
}

// =====================================
//  ÉTAT GLOBAL ADMIN
// =====================================

let currentAdmin = null;
let adminCurrentMode = "saisie"; // "saisie" ou "gestion"

// =====================================
//  UI Connexion Admin
// =====================================

function showAdminLoginMessage(text, type) {
  const el = $("admin-login-message");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    type === "success" ? "#16a34a" :
    type === "error"   ? "#b91c1c" :
    "#6b7280";
}

function appliquerEtatConnexionAdmin(admin) {
  currentAdmin = admin;

  const loginCard = $("admin-login-card");
  const appZone  = $("admin-app-zone");
  const nameEl  = $("admin-connected-name");
  const roleEl  = $("admin-connected-role");

  if (admin) {
    if (loginCard) loginCard.style.display = "none";
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = admin.nom || admin.login || "";
    if (roleEl) roleEl.textContent = admin.role || "";

    // Mode par défaut : saisie
    switchAdminMode("saisie");

    // Charger les stats (optionnel)
    chargerStatsValidations();
  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone) appZone.style.display = "none";

    if (nameEl) nameEl.textContent = "";
    if (roleEl) roleEl.textContent = "";

    showAdminLoginMessage("Non connecté.", "info");
  }
}

async function adminLogin() {
  const login = $("adminLogin")?.value.trim();
  const password = $("adminPassword")?.value.trim();

  if (!login || !password) {
    showAdminLoginMessage("Veuillez saisir le login admin et le mot de passe.", "error");
    return;
  }

  showAdminLoginMessage("Vérification en cours...", "info");

  try {
    const res = await adminDB.listDocuments(
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
      showAdminLoginMessage("Identifiants invalides ou agent inactif.", "error");
      return;
    }

    const agent = res.documents[0];
    const roleStr = (agent.role || "").toLowerCase();

    if (!roleStr.includes("admin")) {
      showAdminLoginMessage("Accès refusé : rôle 'admin' requis.", "error");
      return;
    }

    showAdminLoginMessage("Connexion administrateur réussie.", "success");
    appliquerEtatConnexionAdmin(agent);
  } catch (err) {
    console.error("[ADMIN] Erreur connexion admin :", err);
    showAdminLoginMessage("Erreur lors de la connexion (voir console).", "error");
  }
}

function adminLogout() {
  appliquerEtatConnexionAdmin(null);
}

// =====================================
//  SWITCH MODE (Saisie / Gestion)
// =====================================

function switchAdminMode(mode) {
  adminCurrentMode = mode;

  const btnSaisie  = $("btnAdminModeSaisie");
  const btnGestion = $("btnAdminModeGestion");
  const zoneSaisie = $("admin-zone-saisie");
  const zoneGestion= $("admin-zone-gestion");

  if (btnSaisie)  btnSaisie.classList.toggle("active", mode === "saisie");
  if (btnGestion) btnGestion.classList.toggle("active", mode === "gestion");

  if (zoneSaisie)  zoneSaisie.style.display  = mode === "saisie"  ? "block" : "none";
  if (zoneGestion) zoneGestion.style.display = mode === "gestion" ? "block" : "none";
}

// =====================================
//  1. IMPORT CSV BILLETS
// =====================================

async function importerCSVDansBillets(file) {
  const status = $("importStatus");
  if (!file) {
    if (status) status.textContent = "Veuillez choisir un fichier CSV.";
    return;
  }

  const typeImport = getImportType(); // "entree" ou "interne"
  console.log("[ADMIN] Import type =", typeImport);

  const reader = new FileReader();

  reader.onload = async (e) => {
    const text = e.target.result;
    const lignes = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lignes.length <= 1) {
      if (status) status.textContent = "Le fichier CSV semble vide.";
      return;
    }

    const header = lignes[0].split(";").map((h) => h.trim());
    console.log("[ADMIN] En-têtes CSV :", header);

    let count = 0;

    if (typeImport === "entree") {
      // ======== BILLETS D'ENTRÉE ========
      const idxNumero = header.indexOf("numero_billet");
      const idxType   = header.indexOf("type_acces");
      const idxPrix   = header.indexOf("prix");
      const idxTarifUni = header.indexOf("tarif_universite");
      const idxStatut = header.indexOf("statut");

      if (idxNumero === -1 || idxType === -1) {
        alert(
          "Pour les billets d'entrée, le CSV doit contenir au minimum : numero_billet;type_acces"
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeAcces = cols[idxType] ? cols[idxType].trim() : "";
        if (!numero || !typeAcces) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;
        const tarifUni =
          idxTarifUni !== -1
            ? parseInt(cols[idxTarifUni].trim() || "0", 10) || 0
            : 0;
        const statut =
          idxStatut !== -1 && cols[idxStatut]
            ? cols[idxStatut].trim()
            : "Non utilisé";

        const doc = {
          numero_billet: numero,
          type_acces: typeAcces,
          prix: prix,
          tarif_universite: tarifUni,
          statut: statut
        };

        try {
          await adminDB.createDocument(
            APPWRITE_DATABASE_ID,
            APPWRITE_BILLETS_TABLE_ID,
            Appwrite.ID.unique(),
            doc
          );
          count++;
        } catch (err) {
          console.error("[ADMIN] Erreur création billet entrée ligne", i, err);
        }
      }

      alert(`Import billets d'entrée terminé : ${count} billets créés.`);

    } else {
      // ======== BILLETS INTERNES (JEUX) ========
      const idxNumero = header.indexOf("numero_billet");
      const idxTypeBillet = header.indexOf("type_billet");
      const idxPrix = header.indexOf("prix");

      if (idxNumero === -1 || idxTypeBillet === -1) {
        alert(
          "Pour les billets internes, le CSV doit contenir au minimum : numero_billet;type_billet"
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeBillet = cols[idxTypeBillet]
          ? cols[idxTypeBillet].trim()
          : "";
        if (!numero || !typeBillet) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix: prix,
          statut: "Non utilisé" // par défaut pour éviter les erreurs de colonne requise
        };

        try {
          await adminDB.createDocument(
            APPWRITE_DATABASE_ID,
            APPWRITE_BILLETS_INTERNE_TABLE_ID,
            Appwrite.ID.unique(),
            doc
          );
          count++;
        } catch (err) {
          console.error("[ADMIN] Erreur création billet interne ligne", i, err);
        }
      }

      alert(`Import billets internes terminé : ${count} billets créés.`);
    }

    console.log("[ADMIN] Import CSV terminé. Billets créés :", count);
    if (status) status.textContent = `Import terminé. Billets créés : ${count}`;
  };

  reader.readAsText(file, "UTF-8");
}

// =====================================
//  2. STATS à partir de "validations"
// =====================================

async function chargerStatsValidations() {
  const msg = $("stats-message");
  if (msg) {
    msg.textContent = "Chargement des stats...";
    msg.className = "message message-info";
  }

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const docs = res.documents || [];
    console.log("[ADMIN] Validations récupérées :", docs.length);

    const totalValidations = docs.length;

    let recetteTotale = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;

    const parType = {}; // { type_acces: { count, montant } }

    docs.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") {
        recetteNormal += montant;
      } else if (d.tarif_applique === "etudiant") {
        recetteEtudiant += montant;
      }

      const type = d.type_acces || "Non renseigné";
      if (!parType[type]) {
        parType[type] = { count: 0, montant: 0 };
      }
      parType[type].count += 1;
      parType[type].montant += montant;
    });

    const elCount  = $("stat-validations-count");
    const elTotal  = $("stat-revenue-total");
    const elNormal = $("stat-revenue-normal");
    const elEtu    = $("stat-revenue-etudiant");

    if (elCount)  elCount.textContent  = totalValidations.toString();
    if (elTotal)  elTotal.textContent  = formatGNF(recetteTotale);
    if (elNormal) elNormal.textContent = formatGNF(recetteNormal);
    if (elEtu)    elEtu.textContent    = formatGNF(recetteEtudiant);

    const tbody = $("stats-type-body");
    if (tbody) {
      tbody.innerHTML = "";

      const types = Object.keys(parType);
      if (types.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour le moment.";
        row.appendChild(td);
        tbody.appendChild(row);
      } else {
        types.forEach((type) => {
          const row = document.createElement("tr");

          const tdType = document.createElement("td");
          tdType.textContent = type;

          const tdCount = document.createElement("td");
          tdCount.textContent = parType[type].count.toString();

          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(parType[type].montant);

          row.appendChild(tdType);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);

          tbody.appendChild(row);
        });
      }
    }

    if (msg) {
      msg.textContent = "Stats mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent = "Erreur lors du chargement des stats (voir console).";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  3. Nettoyage des BILLETS (pas validations)
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\n(Les validations NE seront PAS effacées.)"
  );
  if (!ok) return;

  try {
    // billets d'entrée
    const billetsRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const billets = billetsRes.documents || [];

    for (const b of billets) {
      try {
        await adminDB.deleteDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_BILLETS_TABLE_ID,
          b.$id
        );
      } catch (err) {
        console.error("[ADMIN] Erreur suppression billet", b.$id, err);
      }
    }

    // billets internes
    const biRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const billetsInt = biRes.documents || [];

    for (const bi of billetsInt) {
      try {
        await adminDB.deleteDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_BILLETS_INTERNE_TABLE_ID,
          bi.$id
        );
      } catch (err) {
        console.error("[ADMIN] Erreur suppression billet interne", bi.$id, err);
      }
    }

    alert(
      "Tous les billets (entrée + internes) ont été supprimés.\nLes validations sont conservées."
    );
    console.log(
      "[ADMIN] Nettoyage billets terminé. Entrée:",
      billets.length,
      "Internes:",
      billetsInt.length
    );
  } catch (err) {
    console.error("[ADMIN] Erreur lors du nettoyage des billets :", err);
    alert("Erreur lors du nettoyage (voir console).");
  }
}

// =====================================
//  4. SAISIE : étudiants & agents
// =====================================
// Génère un numéro étudiant de la forme UNIV-XX-1234
function genererNumeroEtudiant(universite) {
  // On récupère seulement les lettres de l'université
  const letters = (universite || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();

  // Deux premières lettres, ou "ET" si on ne trouve rien
  const codeEcole = (letters.slice(0, 2) || "ET");

  // 4 chiffres aléatoires
  const randomDigits = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");

  return `UNIV-${codeEcole}-${randomDigits}`;
}

async function creerEtudiantDepuisAdmin() {
  const nom    = $("admin-etu-nom")?.value.trim();
  const prenom = $("admin-etu-prenom")?.value.trim();
  const univ   = $("admin-etu-universite")?.value.trim();
  const email  = $("admin-etu-email")?.value.trim();
  const tel    = $("admin-etu-telephone")?.value.trim();
  const actif  = $("admin-etu-actif")?.checked ?? true;
  const msg    = $("admin-etu-message");

  // Champs obligatoires
  if (!nom || !prenom || !univ) {
    if (msg) {
      msg.textContent = "Veuillez remplir au minimum université, nom et prénom.";
      msg.style.color = "#b91c1c";
    }
    return;
  }

  // Numéro étudiant généré automatiquement
  const numero = genererNumeroEtudiant(univ);

  try {
    const nowIso = new Date().toISOString();
    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_etudiant: numero,
        nom: nom,
        prenom: prenom,
        universite: univ,
        "e-mail": email || "",
        telephone: tel || "",
        actif: !!actif,
        date_creation: nowIso
      }
    );

    if (msg) {
      msg.textContent =
        `Étudiant enregistré avec succès. Numéro généré : ${numero}`;
      msg.style.color = "#16a34a";
    }

    // Reset des champs (sauf le message)
    $("admin-etu-universite").value = "";
    $("admin-etu-nom").value = "";
    $("admin-etu-prenom").value = "";
    $("admin-etu-email").value = "";
    $("admin-etu-telephone").value = "";
    $("admin-etu-actif").checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création étudiant :", err);
    if (msg) {
      msg.textContent =
        "Erreur lors de l'enregistrement de l'étudiant (voir console).";
      msg.style.color = "#b91c1c";
    }
  }
}


async function creerAgentDepuisAdmin() {
  const login = $("admin-agent-login")?.value.trim();
  const pwd   = $("admin-agent-password")?.value.trim();
  const nom   = $("admin-agent-nom")?.value.trim();
  const role  = $("admin-agent-role")?.value.trim();
  const actif = $("admin-agent-actif")?.checked ?? true;
  const msg   = $("admin-agent-message");

  if (!login || !pwd || !role) {
    if (msg) msg.textContent = "Veuillez remplir au minimum login, mot de passe et rôle.";
    return;
  }

  try {
    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        login: login,
        mot_de_passe: pwd,
        nom: nom || "",
        role: role,
        actif: !!actif
      }
    );

    if (msg) {
      msg.textContent = "Agent créé avec succès.";
      msg.style.color = "#16a34a";
    }

    $("admin-agent-login").value = "";
    $("admin-agent-password").value = "";
    $("admin-agent-nom").value = "";
    $("admin-agent-role").value = "";
    $("admin-agent-actif").checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création agent :", err);
    if (msg) {
      msg.textContent = "Erreur lors de la création de l'agent (voir console).";
      msg.style.color = "#b91c1c";
    }
  }
}

// =====================================
//  5. Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[ADMIN] DOMContentLoaded");

  // Connexion admin
  const btnAdminLogin  = $("btnAdminLogin");
  const btnAdminLogout = $("btnAdminLogout");

  if (btnAdminLogin) {
    btnAdminLogin.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogin();
    });
  }

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener("click", (e) => {
      e.preventDefault();
      adminLogout();
    });
  }

  // Changement de mode (saisie / gestion)
  const btnSaisie  = $("btnAdminModeSaisie");
  const btnGestion = $("btnAdminModeGestion");

  if (btnSaisie) {
    btnSaisie.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("saisie");
    });
  }
  if (btnGestion) {
    btnGestion.addEventListener("click", (e) => {
      e.preventDefault();
      switchAdminMode("gestion");
    });
  }

  // Import CSV
  const btnImportCsv = $("btnImportCsv");
  const csvInput = $("csvFile");
  if (btnImportCsv && csvInput) {
    btnImportCsv.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  // Stats
  const refreshStatsBtn = $("refreshStatsBtn");
  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsValidations();
    });
  }

  // Maintenance
  const clearDataBtn = $("clearDataBtn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      effacerTousLesBillets();
    });
  }

  // Saisie étudiants / agents
  const btnCreateEtudiant = $("btnCreateEtudiant");
  const btnCreateAgent    = $("btnCreateAgent");

  if (btnCreateEtudiant) {
    btnCreateEtudiant.addEventListener("click", (e) => {
      e.preventDefault();
      creerEtudiantDepuisAdmin();
    });
  }

  if (btnCreateAgent) {
    btnCreateAgent.addEventListener("click", (e) => {
      e.preventDefault();
      creerAgentDepuisAdmin();
    });
  }

  // Au chargement : pas d'admin connecté
  appliquerEtatConnexionAdmin(null);
});
