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

// NOUVEAU : collections restauration
const APPWRITE_MENU_RESTO_COLLECTION_ID   = "menu_resto";
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";

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

// petit cache pour les libellés produits resto
let restoProduitsMap = null; // { code_produit: libelle }

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
  const appZone   = $("admin-app-zone");
  const nameEl    = $("admin-connected-name");
  const roleEl    = $("admin-connected-role");

  if (admin) {
    if (loginCard) loginCard.style.display = "none";
    if (appZone)   appZone.style.display   = "block";

    if (nameEl) nameEl.textContent = admin.nom || admin.login || "";
    if (roleEl) roleEl.textContent = admin.role || "";

    // Mode par défaut : saisie
    switchAdminMode("saisie");

    // Charger les stats (billets + resto) avec période sélectionnée
    chargerStatsBillets();
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
//  SWITCH MODE (Saisie / Gestion)
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
      const idxNumero    = header.indexOf("numero_billet");
      const idxTypeBillet= header.indexOf("type_billet");
      const idxPrix      = header.indexOf("prix");

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
//  2. STATS BILLETS (avec filtre de période)
// =====================================

// calcule début/fin pour "jour" / "semaine" / "mois"
function getDateRangeFromFilter(filterValue) {
  const now = new Date();
  let start = new Date(now);
  let end   = new Date(now);

  if (filterValue === "semaine") {
    // lundi de la semaine en cours
    const day = now.getDay(); // 0 (dimanche) → 6
    const diff = (day + 6) % 7; // nb de jours à remonter pour arriver à lundi
    start.setDate(now.getDate() - diff);
  } else if (filterValue === "mois") {
    // 1er jour du mois
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // "jour" par défaut
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return {
    fromIso: start.toISOString(),
    toIso: end.toISOString()
  };
}

async function chargerStatsBillets() {
  const msg = $("stats-message");
  const filtreEl = $("billets-range");
  const filtre = filtreEl ? filtreEl.value : "jour";
  const { fromIso, toIso } = getDateRangeFromFilter(filtre);

  if (msg) {
    msg.textContent = "Chargement des stats billets...";
    msg.className = "message message-info";
  }

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [
        Appwrite.Query.greaterThanEqual("date_validation", fromIso),
        Appwrite.Query.lessThan("date_validation", toIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const docs = res.documents || [];
    console.log("[ADMIN] Validations récupérées (filtre =", filtre, ") :", docs.length);

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
        td.textContent= "Aucune validation pour la période choisie.";
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
//  2bis. STATS RESTAURATION
// =====================================

async function chargerMapProduitsResto() {
  if (restoProduitsMap) return restoProduitsMap;

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [Appwrite.Query.limit(500)]
    );
    const docs = res.documents || [];
    const map = {};
    docs.forEach((p) => {
      map[p.code_produit] = p.libelle || p.code_produit;
    });
    restoProduitsMap = map;
    return map;
  } catch (err) {
    console.warn("[ADMIN] Impossible de charger le menu resto pour les stats :", err);
    restoProduitsMap = {};
    return restoProduitsMap;
  }
}

async function chargerStatsResto() {
  const msg = $("stats-resto-message");
  const filtreEl = $("resto-range");
  const filtre = filtreEl ? filtreEl.value : "jour";
  const { fromIso, toIso } = getDateRangeFromFilter(filtre);

  if (msg) {
    msg.textContent = "Chargement des stats restauration...";
    msg.className = "message message-info";
  }

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.greaterThanEqual("date_vente", fromIso),
        Appwrite.Query.lessThan("date_vente", toIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const ventes = res.documents || [];
    console.log("[ADMIN] Ventes resto récupérées (filtre =", filtre, ") :", ventes.length);

    if (ventes.length === 0) {
      // reset affichage
      const elTickets = $("stat-resto-tickets");
      const elPlats   = $("stat-resto-plats");
      const elTotal   = $("stat-resto-total");
      if (elTickets) elTickets.textContent = "0";
      if (elPlats)   elPlats.textContent   = "0";
      if (elTotal)   elTotal.textContent   = "0 GNF";

      const tbody = $("stats-resto-body");
      if (tbody) {
        tbody.innerHTML = "";
        const row = document.createElement("tr");
        const td  = document.createElement("td");
        td.colSpan = 4;
        td.textContent = "Aucune vente restauration pour la période choisie.";
        row.appendChild(td);
        tbody.appendChild(row);
      }

      if (msg) {
        msg.textContent = "Aucune vente pour cette période.";
        msg.className = "message message-info";
      }
      return;
    }

    // tickets = nombre de numéros de vente distincts
    const numerosSet = new Set();
    let totalPlats = 0;
    let totalMontant = 0;

    const parProduit = {}; // { code_produit: { qte, montant } }

    ventes.forEach((v) => {
      if (v.numero_vente) numerosSet.add(v.numero_vente);
      const qte = parseInt(v.quantite || 0, 10) || 0;
      const mt  = parseInt(v.montant_total || 0, 10) || 0;

      totalPlats   += qte;
      totalMontant += mt;

      const code = v.code_produit || "Inconnu";
      if (!parProduit[code]) {
        parProduit[code] = { qte: 0, montant: 0 };
      }
      parProduit[code].qte     += qte;
      parProduit[code].montant += mt;
    });

    const elTickets = $("stat-resto-tickets");
    const elPlats   = $("stat-resto-plats");
    const elTotal   = $("stat-resto-total");

    if (elTickets) elTickets.textContent = numerosSet.size.toString();
    if (elPlats)   elPlats.textContent   = totalPlats.toString();
    if (elTotal)   elTotal.textContent   = formatGNF(totalMontant);

    // Détail par produit
    const tbody = $("stats-resto-body");
    if (tbody) {
      tbody.innerHTML = "";

      const produitsMap = await chargerMapProduitsResto();

      Object.keys(parProduit).forEach((code) => {
        const row = document.createElement("tr");

        const tdCode    = document.createElement("td");
        const tdLibelle = document.createElement("td");
        const tdQte     = document.createElement("td");
        const tdMontant = document.createElement("td");

        tdCode.textContent    = code;
        tdLibelle.textContent = produitsMap[code] || code;
        tdQte.textContent     = parProduit[code].qte.toString();
        tdMontant.textContent = formatGNF(parProduit[code].montant);

        row.appendChild(tdCode);
        row.appendChild(tdLibelle);
        row.appendChild(tdQte);
        row.appendChild(tdMontant);
        tbody.appendChild(row);
      });
    }

    if (msg) {
      msg.textContent = "Stats restauration mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats restauration :", err);
    if (msg) {
      msg.textContent = "Erreur lors du chargement des stats restauration (voir console).";
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

// --- Helpers messages pour les formulaires de saisie ---

function showAdminEtuMessage(text, type) {
  const msg = document.getElementById("admin-etu-message");

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
  const msg = document.getElementById("admin-agent-message");
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

// --- Génère un numéro étudiant de la forme UNIV-XX-1234 ---

function genererNumeroEtudiant(universite) {
  const clean = (universite || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // enlève les accents
    .toUpperCase()
    .replace(/[^A-Z]/g, "");          // garde seulement les lettres

  const codeEcole = clean.slice(0, 2) || "XX";

  // 4 chiffres aléatoires entre 1000 et 9999
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

    // Reset des champs
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
  const csvInput     = $("csvFile");
  if (btnImportCsv && csvInput) {
    btnImportCsv.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  // Stats billets + resto (même bouton)
  const refreshStatsBtn = $("refreshStatsBtn");
  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsBillets();
      chargerStatsResto();
    });
  }

  // Changement de période = recharge auto
  const billetsRange = $("billets-range");
  if (billetsRange) {
    billetsRange.addEventListener("change", () => {
      chargerStatsBillets();
    });
  }

  const restoRange = $("resto-range");
  if (restoRange) {
    restoRange.addEventListener("change", () => {
      chargerStatsResto();
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
