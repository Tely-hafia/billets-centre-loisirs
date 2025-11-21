console.log("[ADMIN] admin-appwrite.js chargé - VERSION STATS BILLETS + RESTO");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                 // billets d'entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne"; // billets jeux internes
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";         // historique validations
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";             // étudiants
const APPWRITE_AGENTS_TABLE_ID = "agents";                   // agents
const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";      // menu resto (pour libellés)
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";  // ventes resto

// =====================================
//  Initialisation du client Appwrite
// =====================================

if (typeof Appwrite === "undefined") {
  console.error(
    '[ADMIN] Appwrite SDK non chargé. Vérifie la balise <script src="https://cdn.jsdelivr.net/npm/appwrite@13.0.0"></script>'
  );
}

const adminClient = new Appwrite.Client();
adminClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const adminDB = new Appwrite.Databases(adminClient);

// =====================================
//  Helpers DOM / format
// =====================================

function $(id) {
  return document.getElementById(id);
}

function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

function getImportType() {
  const r = document.querySelector('input[name="importType"]:checked');
  return r ? r.value : "entree";
}

// Helpers messages
function showAdminLoginMessage(text, type) {
  const el = $("admin-login-message");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    type === "success" ? "#16a34a" :
    type === "error"   ? "#b91c1c" :
    "#6b7280";
}

function showAdminEtuMessage(text, type) {
  const msg = $("admin-etu-message");
  if (!msg) {
    alert(text);
    return;
  }

  msg.style.display = "block";
  msg.textContent   = text;
  msg.className     = "message";

  if (type === "success") {
    msg.classList.add("message-success");
  } else if (type === "error") {
    msg.classList.add("message-error");
  } else {
    msg.classList.add("message-info");
  }
}

function showAdminAgentMessage(text, type) {
  const msg = $("admin-agent-message");
  if (!msg) {
    alert(text);
    return;
  }

  msg.style.display = "block";
  msg.textContent   = text;
  msg.className     = "message";

  if (type === "success") {
    msg.classList.add("message-success");
  } else if (type === "error") {
    msg.classList.add("message-error");
  } else {
    msg.classList.add("message-info");
  }
}

// =====================================
//  ÉTAT GLOBAL ADMIN
// =====================================

let currentAdmin = null;
let adminCurrentMode = "saisie"; // "saisie" ou "gestion"
let menuRestoCache = null;       // pour les libellés dans les stats resto

// =====================================
//  Connexion Admin
// =====================================

function appliquerEtatConnexionAdmin(admin) {
  currentAdmin = admin;

  const loginCard = $("admin-login-card");
  const appZone   = $("admin-app-zone");
  const nameEl    = $("admin-connected-name");
  const roleEl    = $("admin-connected-role");

  if (admin) {
    if (loginCard) loginCard.style.display = "none";
    if (appZone)   appZone.style.display   = "block";

    if (nameEl) nameEl.textContent = admin.nom || admin.login || "";
    if (roleEl) roleEl.textContent = admin.role || "";

    switchAdminMode("saisie");

    // Charger les stats par défaut
    chargerStatsValidations();
    chargerStatsResto();
  } else {
    if (loginCard) loginCard.style.display = "block";
    if (appZone)   appZone.style.display   = "none";

    if (nameEl) nameEl.textContent = "";
    if (roleEl) roleEl.textContent = "";

    showAdminLoginMessage("Non connecté.", "info");
  }
}

async function adminLogin() {
  const login    = $("adminLogin")?.value.trim();
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

    const agent   = res.documents[0];
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
//  Modes (Saisie / Gestion)
// =====================================

function switchAdminMode(mode) {
  adminCurrentMode = mode;

  const btnSaisie   = $("btnAdminModeSaisie");
  const btnGestion  = $("btnAdminModeGestion");
  const zoneSaisie  = $("admin-zone-saisie");
  const zoneGestion = $("admin-zone-gestion");

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
    const text   = e.target.result;
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
      const idxNumero   = header.indexOf("numero_billet");
      const idxType     = header.indexOf("type_acces");
      const idxPrix     = header.indexOf("prix");
      const idxTarifUni = header.indexOf("tarif_universite");
      const idxStatut   = header.indexOf("statut");

      if (idxNumero === -1 || idxType === -1) {
        alert(
          "Pour les billets d'entrée, le CSV doit contenir au minimum : numero_billet;type_acces"
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero    = cols[idxNumero].trim();
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
      const idxNumero     = header.indexOf("numero_billet");
      const idxTypeBillet = header.indexOf("type_billet");
      const idxPrix       = header.indexOf("prix");

      if (idxNumero === -1 || idxTypeBillet === -1) {
        alert(
          "Pour les billets internes, le CSV doit contenir au minimum : numero_billet;type_billet"
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero    = cols[idxNumero].trim();
        const typeBillet= cols[idxTypeBillet] ? cols[idxTypeBillet].trim() : "";
        if (!numero || !typeBillet) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix: prix,
          statut: "Non utilisé"
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
//  2. Helper période (billets + resto)
// =====================================

/**
 * Calcule la période en fonction du select + éventuellement des dates choisies.
 * Retourne { fromIso, toIso, errorText }
 */
function computePeriodRange(periodValue, startDateStr, endDateStr) {
  let from = null;
  let to   = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (periodValue) {
    case "today":
      from = new Date(today);
      to   = new Date(today);
      to.setHours(23, 59, 59, 999);
      break;

    case "yesterday": {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      from = new Date(y);
      to   = new Date(y);
      to.setHours(23, 59, 59, 999);
      break;
    }

    case "this_week": {
      // semaine en cours (lundi -> dimanche)
      const d = new Date(today);
      const day = d.getDay(); // 0 = dimanche, 1 = lundi...
      const diffMonday = (day + 6) % 7; // combien de jours à enlever pour arriver au lundi
      d.setDate(d.getDate() - diffMonday);
      from = new Date(d);
      to   = new Date(from);
      to.setDate(to.getDate() + 6);
      to.setHours(23, 59, 59, 999);
      break;
    }

    case "last_7_days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      from = d;
      to   = new Date(today);
      to.setHours(23, 59, 59, 999);
      break;
    }

    case "this_month": {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      from = d;
      to   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      to.setHours(23, 59, 59, 999);
      break;
    }

    case "last_month": {
      const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      from = d;
      to   = new Date(today.getFullYear(), today.getMonth(), 0);
      to.setHours(23, 59, 59, 999);
      break;
    }

    case "custom": {
      if (!startDateStr || !endDateStr) {
        return {
          fromIso: null,
          toIso: null,
          errorText: "Veuillez choisir une date de début et une date de fin."
        };
      }
      const s = new Date(startDateStr + "T00:00:00");
      const e = new Date(endDateStr + "T23:59:59");
      if (e < s) {
        return {
          fromIso: null,
          toIso: null,
          errorText: "La date de fin doit être supérieure ou égale à la date de début."
        };
      }
      from = s;
      to   = e;
      break;
    }

    default:
      // "all" ou valeur inconnue => pas de filtre
      return { fromIso: null, toIso: null, errorText: null };
  }

  return {
    fromIso: from ? from.toISOString() : null,
    toIso:   to   ? to.toISOString()   : null,
    errorText: null
  };
}

// =====================================
//  3. STATS BILLETS (collection validations)
// =====================================

async function chargerStatsValidations() {
  const msg   = $("stats-billets-message");
  const perEl = $("statsBilletsPeriod");
  const startEl = $("statsBilletsDateStart");
  const endEl   = $("statsBilletsDateEnd");

  if (msg) {
    msg.textContent = "Chargement des stats billets...";
    msg.className = "message message-info";
  }

  const periodValue = perEl ? perEl.value : "today";
  const startStr = startEl ? startEl.value : "";
  const endStr   = endEl ? endEl.value   : "";

  const { fromIso, toIso, errorText } = computePeriodRange(periodValue, startStr, endStr);

  if (errorText) {
    if (msg) {
      msg.textContent = errorText;
      msg.className = "message message-error";
    }
    return;
  }

  const queries = [Appwrite.Query.limit(10000)];

  if (fromIso) {
    queries.push(Appwrite.Query.greaterThanEqual("date_validation", fromIso));
  }
  if (toIso) {
    queries.push(Appwrite.Query.lessThanEqual("date_validation", toIso));
  }

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      queries
    );

    const docs = res.documents || [];
    console.log("[ADMIN] Validations récupérées (billets) :", docs.length);

    const totalValidations = docs.length;
    let recetteTotale   = 0;
    let recetteNormal   = 0;
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
      parType[type].count   += 1;
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
        const td  = document.createElement("td");
        td.colSpan    = 3;
        td.textContent= "Aucune validation pour la période sélectionnée.";
        row.appendChild(td);
        tbody.appendChild(row);
      } else {
        types.forEach((type) => {
          const row = document.createElement("tr");

          const tdType    = document.createElement("td");
          const tdCount   = document.createElement("td");
          const tdMontant = document.createElement("td");

          tdType.textContent    = type;
          tdCount.textContent   = parType[type].count.toString();
          tdMontant.textContent = formatGNF(parType[type].montant);

          row.appendChild(tdType);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);
          tbody.appendChild(row);
        });
      }
    }

    if (msg) {
      msg.textContent = "Stats billets mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent = "Erreur lors du chargement des stats billets (voir console).";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  4. STATS RESTAURATION (ventes_resto)
// =====================================

async function chargerStatsResto() {
  const msg   = $("stats-resto-message");
  const perEl = $("statsRestoPeriod");
  const startEl = $("statsRestoDateStart");
  const endEl   = $("statsRestoDateEnd");

  if (msg) {
    msg.textContent = "Chargement des stats restauration...";
    msg.className = "message message-info";
  }

  const periodValue = perEl ? perEl.value : "today";
  const startStr = startEl ? startEl.value : "";
  const endStr   = endEl ? endEl.value   : "";

  const { fromIso, toIso, errorText } = computePeriodRange(periodValue, startStr, endStr);

  if (errorText) {
    if (msg) {
      msg.textContent = errorText;
      msg.className = "message message-error";
    }
    return;
  }

  const queries = [Appwrite.Query.limit(10000)];

  if (fromIso) {
    queries.push(Appwrite.Query.greaterThanEqual("date_vente", fromIso));
  }
  if (toIso) {
    queries.push(Appwrite.Query.lessThanEqual("date_vente", toIso));
  }

  try {
    // Charger les ventes
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      queries
    );

    const ventes = res.documents || [];
    console.log("[ADMIN] Ventes resto récupérées :", ventes.length);

    // Charger le menu pour avoir les libellés (cache)
    if (!menuRestoCache) {
      const menuRes = await adminDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_MENU_RESTO_COLLECTION_ID,
        [Appwrite.Query.limit(200)]
      );
      menuRestoCache = menuRes.documents || [];
    }

    const labelByCode = {};
    menuRestoCache.forEach((p) => {
      labelByCode[p.code_produit] = p.libelle || p.code_produit;
    });

    // Agrégations
    const commandesSet = new Set();          // numero_vente
    let totalPlats     = 0;                  // somme des quantités
    let totalRecette   = 0;                  // somme des montants

    const parProduit = {}; // { code_produit: { qte, montant } }

    ventes.forEach((v) => {
      const code = v.code_produit || "INCONNU";
      const qte  = parseInt(v.quantite || 0, 10) || 0;
      const mnt  = parseInt(v.montant_total || 0, 10) || 0;

      if (v.numero_vente) {
        commandesSet.add(v.numero_vente);
      }

      totalPlats   += qte;
      totalRecette += mnt;

      if (!parProduit[code]) {
        parProduit[code] = { qte: 0, montant: 0 };
      }
      parProduit[code].qte     += qte;
      parProduit[code].montant += mnt;
    });

    const nbTickets = commandesSet.size;

    // Maj des tuiles
    const elTickets = $("stat-resto-tickets");
    const elPlats   = $("stat-resto-plats");
    const elRecette = $("stat-resto-revenue");

    if (elTickets) elTickets.textContent = nbTickets.toString();
    if (elPlats)   elPlats.textContent   = totalPlats.toString();
    if (elRecette) elRecette.textContent = formatGNF(totalRecette);

    // Tableau détail par produit
    const tbody = $("stats-resto-body");
    if (tbody) {
      tbody.innerHTML = "";

      const codes = Object.keys(parProduit);
      if (codes.length === 0) {
        const row = document.createElement("tr");
        const td  = document.createElement("td");
        td.colSpan = 4;
        td.textContent = "Aucune vente pour la période sélectionnée.";
        row.appendChild(td);
        tbody.appendChild(row);
      } else {
        codes.forEach((code) => {
          const row = document.createElement("tr");

          const tdCode   = document.createElement("td");
          const tdLabel  = document.createElement("td");
          const tdQte    = document.createElement("td");
          const tdMnt    = document.createElement("td");

          tdCode.textContent  = code;
          tdLabel.textContent = labelByCode[code] || code;
          tdQte.textContent   = parProduit[code].qte.toString();
          tdMnt.textContent   = formatGNF(parProduit[code].montant);

          row.appendChild(tdCode);
          row.appendChild(tdLabel);
          row.appendChild(tdQte);
          row.appendChild(tdMnt);
          tbody.appendChild(row);
        });
      }
    }

    if (msg) {
      msg.textContent = "Stats restauration mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats resto :", err);
    if (msg) {
      msg.textContent = "Erreur lors du chargement des stats restauration (voir console).";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  5. Nettoyage des BILLETS (pas validations)
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
//  6. SAISIE : étudiants & agents
// =====================================

// Génère un numéro étudiant de la forme UNIV-XX-1234
function genererNumeroEtudiant(universite) {
  const clean = (universite || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // enlève les accents
    .toUpperCase()
    .replace(/[^A-Z]/g, "");          // garde seulement les lettres

  const codeEcole = clean.slice(0, 2) || "XX";
  const randomDigits = Math.floor(1000 + Math.random() * 9000);

  return `UNIV-${codeEcole}-${randomDigits}`;
}

async function creerEtudiantDepuisAdmin() {
  const univEl = $("admin-etu-universite");
  const nomEl  = $("admin-etu-nom");
  const preEl  = $("admin-etu-prenom");
  const mailEl = $("admin-etu-email");
  const telEl  = $("admin-etu-telephone");
  const actEl  = $("admin-etu-actif");

  if (!univEl || !nomEl || !preEl) {
    console.error("[ADMIN] Formulaire étudiant mal configuré dans le HTML.");
    alert("Problème de configuration du formulaire étudiant (voir console).");
    return;
  }

  const universite = univEl.value.trim();
  const nom        = nomEl.value.trim();
  const prenom     = preEl.value.trim();
  const email      = (mailEl?.value || "").trim();
  const telephone  = (telEl?.value || "").trim();
  const actif      = !!(actEl && actEl.checked);

  if (!universite || !nom || !prenom) {
    showAdminEtuMessage(
      "Veuillez remplir au minimum université, nom et prénom.",
      "error"
    );
    return;
  }

  const numero = genererNumeroEtudiant(universite);

  try {
    const nowIso = new Date().toISOString();

    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_etudiant: numero,
        nom,
        prenom,
        universite,
        "e-mail": email || null,
        telephone: telephone || null,
        actif,
        date_creation: nowIso
      }
    );

    showAdminEtuMessage(
      `Étudiant enregistré avec succès. Numéro généré : ${numero}`,
      "success"
    );

    univEl.value = "";
    nomEl.value  = "";
    preEl.value  = "";
    if (mailEl) mailEl.value = "";
    if (telEl)  telEl.value  = "";
    if (actEl)  actEl.checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création étudiant :", err);
    showAdminEtuMessage(
      "Erreur lors de l'enregistrement de l'étudiant (voir console).",
      "error"
    );
  }
}

async function creerAgentDepuisAdmin() {
  const loginEl = $("admin-agent-login");
  const pwdEl   = $("admin-agent-password");
  const nomEl   = $("admin-agent-nom");
  const roleEl  = $("admin-agent-role");
  const actEl   = $("admin-agent-actif");

  const login = loginEl?.value.trim();
  const pwd   = pwdEl?.value.trim();
  const nom   = nomEl?.value.trim() || "";
  const role  = roleEl?.value.trim();
  const actif = !!(actEl && actEl.checked);

  if (!login || !pwd || !role) {
    showAdminAgentMessage(
      "Veuillez remplir au minimum login, mot de passe et rôle.",
      "error"
    );
    return;
  }

  try {
    await adminDB.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_AGENTS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        login,
        mot_de_passe: pwd,
        nom,
        role,
        actif
      }
    );

    showAdminAgentMessage("Agent créé avec succès.", "success");

    if (loginEl) loginEl.value = "";
    if (pwdEl)   pwdEl.value   = "";
    if (nomEl)   nomEl.value   = "";
    if (roleEl)  roleEl.value  = "";
    if (actEl)   actEl.checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création agent :", err);
    showAdminAgentMessage(
      "Erreur lors de la création de l'agent (voir console).",
      "error"
    );
  }
}

// =====================================
//  7. Initialisation des événements
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
  const csvInput     = $("csvFile");
  if (btnImportCsv && csvInput) {
    btnImportCsv.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  // Stats billets
  const refreshStatsBilletsBtn = $("refreshStatsBilletsBtn");
  if (refreshStatsBilletsBtn) {
    refreshStatsBilletsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsValidations();
    });
  }

  // Changement de période billets
  const billetsPeriodSelect = $("statsBilletsPeriod");
  if (billetsPeriodSelect) {
    billetsPeriodSelect.addEventListener("change", () => {
      chargerStatsValidations();
    });
  }
  const billetsStart = $("statsBilletsDateStart");
  const billetsEnd   = $("statsBilletsDateEnd");
  if (billetsStart) billetsStart.addEventListener("change", () => chargerStatsValidations());
  if (billetsEnd)   billetsEnd.addEventListener("change", () => chargerStatsValidations());

  // Stats resto
  const refreshStatsRestoBtn = $("refreshStatsRestoBtn");
  if (refreshStatsRestoBtn) {
    refreshStatsRestoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsResto();
    });
  }

  const restoPeriodSelect = $("statsRestoPeriod");
  if (restoPeriodSelect) {
    restoPeriodSelect.addEventListener("change", () => {
      chargerStatsResto();
    });
  }
  const restoStart = $("statsRestoDateStart");
  const restoEnd   = $("statsRestoDateEnd");
  if (restoStart) restoStart.addEventListener("change", () => chargerStatsResto());
  if (restoEnd)   restoEnd.addEventListener("change", () => chargerStatsResto());

  // Toggle "Billets" / "Restauration" dans la zone stats
  const btnShowBillets = $("btnShowStatsBillets");
  const btnShowResto   = $("btnShowStatsResto");
  const cardBillets    = $("card-stats-billets");
  const cardResto      = $("card-stats-resto");

  function setStatsTab(tab) {
    if (!cardBillets || !cardResto) return;

    const isBillets = tab === "billets";
    cardBillets.style.display = isBillets ? "block" : "none";
    cardResto.style.display   = isBillets ? "none"  : "block";

    if (btnShowBillets) btnShowBillets.classList.toggle("active-tab", isBillets);
    if (btnShowResto)   btnShowResto.classList.toggle("active-tab", !isBillets);
  }

  if (btnShowBillets) {
    btnShowBillets.addEventListener("click", (e) => {
      e.preventDefault();
      setStatsTab("billets");
    });
  }
  if (btnShowResto) {
    btnShowResto.addEventListener("click", (e) => {
      e.preventDefault();
      setStatsTab("resto");
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
