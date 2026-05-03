console.log("[ADMIN] admin-appwrite.js chargé - VERSION AVEC HISTORIQUE RESERVATIONS");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";
const APPWRITE_AGENTS_TABLE_ID = "agents";

const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";

// ✅ Réservations accueil
const APPWRITE_RESERVATION_COLLECTION_ID = "reservation";

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

function formatDateFR(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =====================================
//  ÉTAT GLOBAL ADMIN
// =====================================

let currentAdmin = null;
let adminCurrentMode = "saisie";

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
    if (appZone) appZone.style.display = "block";

    if (nameEl) nameEl.textContent = admin.nom || admin.login || "";
    if (roleEl) roleEl.textContent = admin.role || "";

    switchAdminMode("saisie");

    chargerStatsBillets();
    chargerStatsResto();
    chargerHistoriqueReservations();
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
    showAdminLoginMessage("Erreur lors de la connexion.", "error");
  }
}

function adminLogout() {
  appliquerEtatConnexionAdmin(null);
}

// =====================================
//  SWITCH MODE
// =====================================

function switchAdminMode(mode) {
  adminCurrentMode = mode;

  const btnSaisie = $("btnAdminModeSaisie");
  const btnGestion = $("btnAdminModeGestion");
  const zoneSaisie = $("admin-zone-saisie");
  const zoneGestion = $("admin-zone-gestion");

  if (btnSaisie) btnSaisie.classList.toggle("active", mode === "saisie");
  if (btnGestion) btnGestion.classList.toggle("active", mode === "gestion");

  if (zoneSaisie) zoneSaisie.style.display = mode === "saisie" ? "block" : "none";
  if (zoneGestion) zoneGestion.style.display = mode === "gestion" ? "block" : "none";

  if (mode === "gestion") {
    chargerHistoriqueReservations();
  }
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

  const typeImport = getImportType();
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
      const idxNumero = header.indexOf("numero_billet");
      const idxType = header.indexOf("type_acces");
      const idxPrix = header.indexOf("prix");
      const idxTarifUni = header.indexOf("tarif_universite");
      const idxStatut = header.indexOf("statut");

      if (idxNumero === -1 || idxType === -1) {
        alert("Pour les billets d'entrée, le CSV doit contenir au minimum : numero_billet;type_acces");
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
          prix,
          tarif_universite: tarifUni,
          statut
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
      const idxNumero = header.indexOf("numero_billet");
      const idxTypeBillet = header.indexOf("type_billet");
      const idxPrix = header.indexOf("prix");

      if (idxNumero === -1 || idxTypeBillet === -1) {
        alert("Pour les billets internes, le CSV doit contenir au minimum : numero_billet;type_billet");
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(";");
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeBillet = cols[idxTypeBillet] ? cols[idxTypeBillet].trim() : "";

        if (!numero || !typeBillet) continue;

        const prix =
          idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0;

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix,
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
//  2. HISTORIQUE RESERVATIONS
// =====================================

function showReservationHistoryMessage(text, type = "info") {
  const msg = $("reservations-history-message");
  if (!msg) return;

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message message-" + type;
}

function clearReservationHistoryMessage() {
  const msg = $("reservations-history-message");
  if (!msg) return;

  msg.style.display = "none";
  msg.textContent = "";
  msg.className = "message";
}

async function chargerHistoriqueReservations() {
  const tbody = $("reservations-history-body");
  const filter = $("reservationFilter")?.value || "all";

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6">Chargement des réservations...</td>
    </tr>
  `;

  clearReservationHistoryMessage();

  try {
    const queries = [
      Appwrite.Query.orderDesc("$createdAt"),
      Appwrite.Query.limit(100)
    ];

    if (filter === "active") {
      queries.unshift(Appwrite.Query.equal("actif", true));
    } else if (filter === "used") {
      queries.unshift(Appwrite.Query.equal("actif", false));
    }

    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_RESERVATION_COLLECTION_ID,
      queries
    );

    const docs = res.documents || [];

    if (docs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">Aucune réservation trouvée.</td>
        </tr>
      `;
      showReservationHistoryMessage("Aucune réservation pour ce filtre.", "info");
      return;
    }

    tbody.innerHTML = docs.map((r) => {
      const numero = escapeHTML(r.numero_reservation || "-");
      const client = escapeHTML(`${r.prenom || ""} ${r.nom || ""}`.trim() || "-");
      const tel = escapeHTML(r.telephone || "-");
      const activite = escapeHTML(r.activite || "-");
      const date = formatDateFR(r.date_reservation);
      const active = r.actif !== false;

      return `
        <tr>
          <td><strong>${numero}</strong></td>
          <td>${client}</td>
          <td>${tel}</td>
          <td>${activite}</td>
          <td>${date}</td>
          <td>
            <span class="${active ? "badge-success" : "badge-muted"}">
              ${active ? "Active" : "Utilisée / désactivée"}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    showReservationHistoryMessage(
      `${docs.length} réservation(s) affichée(s).`,
      "success"
    );
  } catch (err) {
    console.error("[ADMIN] Erreur chargement réservations :", err);

    tbody.innerHTML = `
      <tr>
        <td colspan="6">Erreur lors du chargement.</td>
      </tr>
    `;

    showReservationHistoryMessage(
      "Erreur lors du chargement des réservations.",
      "error"
    );
  }
}

// =====================================
//  3. STATS : gestion de la période
// =====================================

function getSelectedPeriod() {
  const select = $("statsPeriod");
  const mode = select ? select.value : "week";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start = new Date(today);
  let end = new Date(today);
  end.setDate(end.getDate() + 1);

  if (mode === "week") {
    const day = today.getDay();
    const diff = (day + 6) % 7;
    start = new Date(today);
    start.setDate(today.getDate() - diff);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
  } else if (mode === "month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else if (mode === "custom") {
    const startInput = $("statsStartDate");
    const endInput = $("statsEndDate");

    if (!startInput?.value || !endInput?.value) {
      return { error: "custom-missing" };
    }

    start = new Date(startInput.value + "T00:00:00");
    end = new Date(endInput.value + "T00:00:00");
    end.setDate(end.getDate() + 1);
  }

  return { start, end, mode };
}

// =====================================
//  4. STATS BILLETS
// =====================================

async function chargerStatsBillets() {
  const msg = $("stats-message-billets");

  if (msg) {
    msg.style.display = "block";
    msg.textContent = "Chargement des stats billets...";
    msg.className = "message message-info";
  }

  const period = getSelectedPeriod();

  if (period.error === "custom-missing") {
    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Veuillez choisir une période personnalisée.";
      msg.className = "message message-warning";
    }
    return;
  }

  const { start, end } = period;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [
        Appwrite.Query.greaterThanEqual("date_validation", startIso),
        Appwrite.Query.lessThan("date_validation", endIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const docs = res.documents || [];

    const totalValidations = docs.length;

    let recetteTotale = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;

    const parType = {};

    docs.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") recetteNormal += montant;
      else if (d.tarif_applique === "etudiant") recetteEtudiant += montant;

      const type = d.type_acces || "Non renseigné";
      if (!parType[type]) parType[type] = { count: 0, montant: 0 };

      parType[type].count += 1;
      parType[type].montant += montant;
    });

    if ($("stat-validations-count")) $("stat-validations-count").textContent = totalValidations.toString();
    if ($("stat-revenue-total")) $("stat-revenue-total").textContent = formatGNF(recetteTotale);
    if ($("stat-revenue-normal")) $("stat-revenue-normal").textContent = formatGNF(recetteNormal);
    if ($("stat-revenue-etudiant")) $("stat-revenue-etudiant").textContent = formatGNF(recetteEtudiant);

    const tbody = $("stats-type-body");

    if (tbody) {
      const types = Object.keys(parType);

      if (types.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3">Aucune validation pour cette période.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = types.map((type) => `
          <tr>
            <td>${escapeHTML(type)}</td>
            <td>${parType[type].count}</td>
            <td>${formatGNF(parType[type].montant)}</td>
          </tr>
        `).join("");
      }
    }

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Stats billets mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats billets :", err);

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Erreur lors du chargement des stats billets.";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  5. STATS RESTAURATION
// =====================================

let restoMenuCache = null;

async function chargerMenuRestoPourStats() {
  if (restoMenuCache) return restoMenuCache;

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [Appwrite.Query.limit(200)]
    );

    restoMenuCache = res.documents || [];
    return restoMenuCache;
  } catch (err) {
    console.warn("[ADMIN] Impossible de charger le menu resto pour les stats :", err);
    restoMenuCache = [];
    return restoMenuCache;
  }
}

async function chargerStatsResto() {
  const msg = $("stats-message-resto");

  if (msg) {
    msg.style.display = "block";
    msg.textContent = "Chargement des stats restauration...";
    msg.className = "message message-info";
  }

  const period = getSelectedPeriod();

  if (period.error === "custom-missing") {
    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Veuillez choisir une période personnalisée.";
      msg.className = "message message-warning";
    }
    return;
  }

  const { start, end } = period;
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      [
        Appwrite.Query.greaterThanEqual("date_vente", startIso),
        Appwrite.Query.lessThan("date_vente", endIso),
        Appwrite.Query.limit(10000)
      ]
    );

    const docs = res.documents || [];

    const numeros = new Set();
    let totalPlats = 0;
    let totalMontant = 0;

    const parProduit = {};

    docs.forEach((d) => {
      const numeroVente = d.numero_vente || d.$id;
      numeros.add(numeroVente);

      const qte = parseInt(d.quantite || 0, 10) || 0;
      const montant = parseInt(d.montant_total || 0, 10) || 0;

      totalPlats += qte;
      totalMontant += montant;

      const code = d.code_produit || "N/A";
      if (!parProduit[code]) parProduit[code] = { qte: 0, montant: 0 };

      parProduit[code].qte += qte;
      parProduit[code].montant += montant;
    });

    if ($("stat-resto-tickets")) $("stat-resto-tickets").textContent = numeros.size.toString();
    if ($("stat-resto-plates")) $("stat-resto-plates").textContent = totalPlats.toString();
    if ($("stat-resto-total")) $("stat-resto-total").textContent = formatGNF(totalMontant);

    const menu = await chargerMenuRestoPourStats();
    const libellesByCode = {};

    menu.forEach((p) => {
      libellesByCode[p.code_produit] = p.libelle || p.code_produit;
    });

    const tbody = $("stats-resto-body");

    if (tbody) {
      const codes = Object.keys(parProduit);

      if (codes.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4">Aucune vente restauration pour cette période.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = codes.map((code) => `
          <tr>
            <td>${escapeHTML(code)}</td>
            <td>${escapeHTML(libellesByCode[code] || "")}</td>
            <td>${parProduit[code].qte}</td>
            <td>${formatGNF(parProduit[code].montant)}</td>
          </tr>
        `).join("");
      }
    }

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Stats restauration mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats restauration :", err);

    if (msg) {
      msg.style.display = "block";
      msg.textContent = "Erreur lors du chargement des stats restauration.";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  6. Nettoyage des BILLETS
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\nLes validations NE seront PAS effacées."
  );

  if (!ok) return;

  try {
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

    alert("Tous les billets ont été supprimés. Les validations sont conservées.");
  } catch (err) {
    console.error("[ADMIN] Erreur lors du nettoyage des billets :", err);
    alert("Erreur lors du nettoyage.");
  }
}

// =====================================
//  7. SAISIE : étudiants & agents
// =====================================

function showAdminEtuMessage(text, type) {
  const msg = $("admin-etu-message");

  if (!msg) {
    alert(text);
    return;
  }

  msg.style.display = "block";
  msg.textContent = text;
  msg.className = "message";

  if (type === "success") msg.classList.add("message-success");
  else if (type === "error") msg.classList.add("message-error");
  else msg.classList.add("message-info");
}

function showAdminAgentMessage(text, type) {
  const msg = $("admin-agent-message");
  if (!msg) return;

  msg.textContent = text;
  msg.className = "status";

  if (type === "success") msg.style.color = "#16a34a";
  else if (type === "error") msg.style.color = "#b91c1c";
  else msg.style.color = "#6b7280";
}

function genererNumeroEtudiant(universite) {
  const clean = (universite || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  const codeEcole = clean.slice(0, 2) || "XX";
  const randomDigits = Math.floor(1000 + Math.random() * 9000);

  return `UNIV-${codeEcole}-${randomDigits}`;
}

async function creerEtudiantDepuisAdmin() {
  const univEl = $("admin-etu-universite");
  const nomEl = $("admin-etu-nom");
  const preEl = $("admin-etu-prenom");
  const mailEl = $("admin-etu-email");
  const telEl = $("admin-etu-telephone");
  const actEl = $("admin-etu-actif");

  if (!univEl || !nomEl || !preEl) {
    alert("Problème de configuration du formulaire étudiant.");
    return;
  }

  const universite = univEl.value.trim();
  const nom = nomEl.value.trim();
  const prenom = preEl.value.trim();
  const email = (mailEl?.value || "").trim();
  const telephone = (telEl?.value || "").trim();
  const actif = !!(actEl && actEl.checked);

  if (!universite || !nom || !prenom) {
    showAdminEtuMessage("Veuillez remplir au minimum université, nom et prénom.", "error");
    return;
  }

  const numero = genererNumeroEtudiant(universite);

  try {
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
        date_creation: new Date().toISOString()
      }
    );

    showAdminEtuMessage(
      `Étudiant enregistré avec succès. Numéro généré : ${numero}`,
      "success"
    );

    univEl.value = "";
    nomEl.value = "";
    preEl.value = "";
    if (mailEl) mailEl.value = "";
    if (telEl) telEl.value = "";
    if (actEl) actEl.checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création étudiant :", err);
    showAdminEtuMessage("Erreur lors de l'enregistrement de l'étudiant.", "error");
  }
}

async function creerAgentDepuisAdmin() {
  const loginEl = $("admin-agent-login");
  const pwdEl = $("admin-agent-password");
  const nomEl = $("admin-agent-nom");
  const roleEl = $("admin-agent-role");
  const actEl = $("admin-agent-actif");

  const login = loginEl?.value.trim();
  const pwd = pwdEl?.value.trim();
  const nom = nomEl?.value.trim() || "";
  const role = roleEl?.value.trim();
  const actif = !!(actEl && actEl.checked);

  if (!login || !pwd || !role) {
    showAdminAgentMessage("Veuillez remplir au minimum login, mot de passe et rôle.", "error");
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
    if (pwdEl) pwdEl.value = "";
    if (nomEl) nomEl.value = "";
    if (roleEl) roleEl.value = "";
    if (actEl) actEl.checked = true;
  } catch (err) {
    console.error("[ADMIN] Erreur création agent :", err);
    showAdminAgentMessage("Erreur lors de la création de l'agent.", "error");
  }
}

// =====================================
//  8. Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[ADMIN] DOMContentLoaded");

  const btnAdminLogin = $("btnAdminLogin");
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

  const btnSaisie = $("btnAdminModeSaisie");
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

  const btnImportCsv = $("btnImportCsv");
  const csvInput = $("csvFile");

  if (btnImportCsv && csvInput) {
    btnImportCsv.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  const refreshStatsBtn = $("refreshStatsBtn");

  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsBillets();
      chargerStatsResto();
    });
  }

  const statsPeriodSelect = $("statsPeriod");
  const customRange = $("stats-custom-range");

  if (statsPeriodSelect && customRange) {
    const toggleCustomRange = () => {
      customRange.style.display =
        statsPeriodSelect.value === "custom" ? "flex" : "none";
    };

    statsPeriodSelect.addEventListener("change", toggleCustomRange);
    toggleCustomRange();
  }

  const billetsPanel = $("stats-billets-panel");
  const restoPanel = $("stats-resto-panel");

  const modeBillets = $("statsModeBillets");
  const modeResto = $("statsModeResto");

  const infoBillets = $("stats-info-billets");
  const infoResto = $("stats-info-resto");

  const updateStatsMode = () => {
    const mode = modeResto && modeResto.checked ? "resto" : "billets";

    if (billetsPanel) billetsPanel.style.display = mode === "billets" ? "block" : "none";
    if (restoPanel) restoPanel.style.display = mode === "resto" ? "block" : "none";

    if (infoBillets) infoBillets.style.display = mode === "billets" ? "block" : "none";
    if (infoResto) infoResto.style.display = mode === "resto" ? "block" : "none";
  };

  if (modeBillets && modeResto) {
    modeBillets.addEventListener("change", updateStatsMode);
    modeResto.addEventListener("change", updateStatsMode);
    updateStatsMode();
  }

  const btnRefreshReservations = $("btnRefreshReservations");
  const reservationFilter = $("reservationFilter");

  if (btnRefreshReservations) {
    btnRefreshReservations.addEventListener("click", (e) => {
      e.preventDefault();
      chargerHistoriqueReservations();
    });
  }

  if (reservationFilter) {
    reservationFilter.addEventListener("change", () => {
      chargerHistoriqueReservations();
    });
  }

  const clearDataBtn = $("clearDataBtn");

  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      effacerTousLesBillets();
    });
  }

  const btnCreateEtudiant = $("btnCreateEtudiant");
  const btnCreateAgent = $("btnCreateAgent");

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

  appliquerEtatConnexionAdmin(null);
});
