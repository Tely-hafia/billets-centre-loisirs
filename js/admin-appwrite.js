console.log("[ADMIN] admin-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                // billets d'entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne";// billets jeux internes
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";        // historique validations
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto"; // ventes resto/chicha

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

function getImportType() {
  const r = document.querySelector('input[name="importType"]:checked');
  return r ? r.value : "entree";
}

// Format monnaie
function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

// =====================================
//  1. IMPORT CSV
// =====================================

async function importerCSVDansBillets(file) {
  if (!file) {
    alert("Veuillez choisir un fichier CSV.");
    return;
  }

  const typeImport = getImportType(); // "entree" ou "interne";
  console.log("[ADMIN] Import type =", typeImport);

  const reader = new FileReader();

  reader.onload = async (e) => {
    const text = e.target.result;
    const lignes = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lignes.length <= 1) {
      alert("Le fichier CSV semble vide.");
      return;
    }

    const header = lignes[0].split(";").map((h) => h.trim());
    console.log("[ADMIN] En-têtes CSV :", header);

    let count = 0;

    if (typeImport === "entree") {
      // ======== BILLETS D'ENTRÉE ========
      const idxNumero = header.indexOf("numero_billet");
      const idxType = header.indexOf("type_acces");
      const idxPrix = header.indexOf("prix");
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
      const idxStatut = header.indexOf("statut");

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
        const statut =
          idxStatut !== -1 && cols[idxStatut]
            ? cols[idxStatut].trim()
            : "Non utilisé";

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix: prix,
          statut: statut
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
    const status = $("importStatus");
    if (status) {
      status.textContent = `Import terminé. Billets créés : ${count}`;
    }
  };

  reader.readAsText(file, "UTF-8");
}

// =====================================
//  Helpers dates / périodes
// =====================================

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriodRange(value) {
  const now = new Date();
  const end = now.toISOString();
  let start = null;

  if (value === "7d") {
    const d = startOfToday();
    d.setDate(d.getDate() - 6);
    start = d.toISOString();
  } else if (value === "30d") {
    const d = startOfToday();
    d.setDate(d.getDate() - 29);
    start = d.toISOString();
  } else if (value === "thisMonth") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    start = d.toISOString();
  } else if (value === "thisYear") {
    const d = new Date(now.getFullYear(), 0, 1);
    start = d.toISOString();
  } else if (value === "all") {
    start = null; // pas de filtre
  }

  return { start, end };
}

function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const monthName = d.toLocaleString("fr-FR", { month: "long" });
  return { week: weekNo, year: d.getUTCFullYear(), monthName };
}

function getPeriodKeyLabel(dateObj, group) {
  if (!(dateObj instanceof Date) || isNaN(dateObj)) {
    return { key: "inconnu", label: "Inconnu" };
  }

  if (group === "jour") {
    const key = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
    const label = dateObj.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "short"
    });
    return { key, label };
  }

  if (group === "mois") {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth(); // 0-11
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const label = dateObj.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
    return { key, label };
  }

  // par défaut : semaine
  const info = getISOWeekInfo(dateObj);
  const key = `${info.year}-W${String(info.week).padStart(2, "0")}`;
  const label = `Semaine ${info.week} – ${info.monthName} ${info.year}`;
  return { key, label };
}

// =====================================
//  2. STATS à partir de "validations" + ventes_resto
// =====================================

async function chargerStatsValidations() {
  const msg = $("stats-message");
  const periodSelect = $("stats-period");
  const groupSelect = $("stats-group");

  if (msg) {
    msg.textContent = "Chargement des statistiques...";
    msg.className = "status";
  }

  const period = periodSelect ? periodSelect.value : "7j";
  const groupMode = groupSelect ? groupSelect.value : "semaine";

  const dateMin = getDateMinFromPeriod(period);

  try {
    // --------- 1. Récup validations (billets) ----------
    const filters = [];
    if (dateMin) {
      filters.push(
        Appwrite.Query.greaterThanEqual(
          "date_validation",
          dateMin.toISOString()
        )
      );
    }
    filters.push(Appwrite.Query.limit(10000));

    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      filters
    );
    const validations = res.documents || [];

    // --------- 2. Récup ventes resto éventuelles ----------
    let ventesResto = [];
    try {
      const filtersR = [];
      if (dateMin) {
        filtersR.push(
          Appwrite.Query.greaterThanEqual(
            "date_vente",
            dateMin.toISOString()
          )
        );
      }
      filtersR.push(Appwrite.Query.limit(10000));

      const restoRes = await adminDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_VENTES_RESTO_COLLECTION_ID,
        filtersR
      );
      ventesResto = restoRes.documents || [];
    } catch (errResto) {
      console.warn("[ADMIN] Impossible de charger ventes_resto :", errResto);
    }

    // --------- 3. Agrégations globales ----------
    let totalValidations = 0;
    let recetteTotaleBillets = 0;
    let recetteTarifNormal = 0;
    let recetteTarifEtudiant = 0;
    let recetteResto = 0;

    const parType = {};   // { type: { count, montant } }
    const parPeriode = {}; // { key: { label, count, montant } }

    validations.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      totalValidations += 1;
      recetteTotaleBillets += montant;

      if (d.tarif_applique === "etudiant") {
        recetteTarifEtudiant += montant;
      } else {
        recetteTarifNormal += montant;
      }

      const type = d.type_acces || d.type_billet || "Non renseigné";
      if (!parType[type]) parType[type] = { count: 0, montant: 0 };
      parType[type].count += 1;
      parType[type].montant += montant;

      const grp = buildGroupKey(d.date_validation, groupMode);
      if (!parPeriode[grp.key]) {
        parPeriode[grp.key] = {
          label: grp.label,
          sortKey: grp.sortKey,
          count: 0,
          montant: 0
        };
      }
      parPeriode[grp.key].count += 1;
      parPeriode[grp.key].montant += montant;
    });

    ventesResto.forEach((v) => {
      recetteResto += parseInt(v.montant_total || 0, 10) || 0;
    });

    // --------- 4. Mise à jour des tuiles ----------
    $("stat-validations-count").textContent = String(totalValidations);
    $("stat-revenue-total").textContent = formatGNF(recetteTotaleBillets);
    $("stat-revenue-normal").textContent = formatGNF(recetteTarifNormal);
    $("stat-revenue-etudiant").textContent = formatGNF(recetteTarifEtudiant);
    $("stat-revenue-resto").textContent = formatGNF(recetteResto);

    // --------- 5. Tableau Évolution des entrées ----------
    const evolBody = $("stats-evol-body");
    if (evolBody) {
      evolBody.innerHTML = "";
      const items = Object.values(parPeriode).sort((a, b) =>
        a.sortKey.localeCompare(b.sortKey)
      );
      if (items.length === 0) {
        evolBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        items.forEach((it) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${it.label}</td>
            <td>${it.count}</td>
            <td>${formatGNF(it.montant)}</td>
          `;
          evolBody.appendChild(tr);
        });
      }
    }

    // --------- 6. Tableau Top types d'accès / billets ----------
    const typeBody = $("stats-type-body");
    if (typeBody) {
      typeBody.innerHTML = "";
      const types = Object.entries(parType).sort(
        (a, b) => b[1].montant - a[1].montant
      );
      if (types.length === 0) {
        typeBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        types.forEach(([type, info]) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${type}</td>
            <td>${info.count}</td>
            <td>${formatGNF(info.montant)}</td>
          `;
          typeBody.appendChild(tr);
        });
      }
    }

    // --------- 7. Tableau Top jours / semaines ----------
    const topBody = $("stats-topdays-body");
    if (topBody) {
      topBody.innerHTML = "";
      const items = Object.values(parPeriode)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      if (items.length === 0) {
        topBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        items.forEach((it) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${it.label}</td>
            <td>${it.count}</td>
            <td>${formatGNF(it.montant)}</td>
          `;
          topBody.appendChild(tr);
        });
      }
    }

    if (msg) {
      msg.textContent = "Statistiques mises à jour.";
      msg.className = "status";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent =
        "Erreur lors du chargement des stats (voir console).";
      msg.className = "status";
    }
  }
}
function getDateMinFromPeriod(period) {
  const now = new Date();
  const d = new Date(now);

  switch (period) {
    case "7j":
      d.setDate(now.getDate() - 7);
      return d;
    case "30j":
      d.setDate(now.getDate() - 30);
      return d;
    case "thisMonth":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "thisYear":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
    default:
      return null; // pas de filtre date
  }
}

// clé + label lisible pour regroupement
function buildGroupKey(dateStr, mode) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return { key: "inconnu", label: "Date inconnue", sortKey: "9999" };

  const year = d.getFullYear();
  const month = d.toLocaleString("fr-FR", { month: "long" });
  const day = d.toLocaleDateString("fr-FR");

  if (mode === "jour") {
    return {
      key: day,
      label: day,
      sortKey: d.toISOString()
    };
  }

  if (mode === "mois") {
    const key = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: `${month} ${year}`,
      sortKey: key
    };
  }

  // mode "semaine" par défaut
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  // ISO week
  const dayNum = (tmp.getDay() + 6) % 7; // 0=lundi
  tmp.setDate(tmp.getDate() - dayNum + 3);
  const firstThursday = new Date(tmp.getFullYear(), 0, 4);
  const diff = tmp - firstThursday;
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));

  return {
    key: `${year}-W${String(week).padStart(2, "0")}`,
    label: `Semaine ${week} – ${month} ${year}`,
    sortKey: `${year}-${String(week).padStart(2, "0")}`
  };
}


// =====================================
//  3. Export CSV des validations (période filtrée)
// =====================================

async function chargerStatsValidations() {
  const msg = $("stats-message");
  const periodSelect = $("stats-period");
  const groupSelect = $("stats-group");

  if (msg) {
    msg.textContent = "Chargement des statistiques...";
    msg.className = "status";
  }

  const period = periodSelect ? periodSelect.value : "7j";
  const groupMode = groupSelect ? groupSelect.value : "semaine";

  const dateMin = getDateMinFromPeriod(period);

  try {
    // --------- 1. Récup validations (billets) ----------
    const filters = [];
    if (dateMin) {
      filters.push(
        Appwrite.Query.greaterThanEqual(
          "date_validation",
          dateMin.toISOString()
        )
      );
    }
    filters.push(Appwrite.Query.limit(10000));

    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      filters
    );
    const validations = res.documents || [];

    // --------- 2. Récup ventes resto éventuelles ----------
    let ventesResto = [];
    try {
      const filtersR = [];
      if (dateMin) {
        filtersR.push(
          Appwrite.Query.greaterThanEqual(
            "date_vente",
            dateMin.toISOString()
          )
        );
      }
      filtersR.push(Appwrite.Query.limit(10000));

      const restoRes = await adminDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_VENTES_RESTO_COLLECTION_ID,
        filtersR
      );
      ventesResto = restoRes.documents || [];
    } catch (errResto) {
      console.warn("[ADMIN] Impossible de charger ventes_resto :", errResto);
    }

    // --------- 3. Agrégations globales ----------
    let totalValidations = 0;
    let recetteTotaleBillets = 0;
    let recetteTarifNormal = 0;
    let recetteTarifEtudiant = 0;
    let recetteResto = 0;

    const parType = {};   // { type: { count, montant } }
    const parPeriode = {}; // { key: { label, count, montant } }

    validations.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      totalValidations += 1;
      recetteTotaleBillets += montant;

      if (d.tarif_applique === "etudiant") {
        recetteTarifEtudiant += montant;
      } else {
        recetteTarifNormal += montant;
      }

      const type = d.type_acces || d.type_billet || "Non renseigné";
      if (!parType[type]) parType[type] = { count: 0, montant: 0 };
      parType[type].count += 1;
      parType[type].montant += montant;

      const grp = buildGroupKey(d.date_validation, groupMode);
      if (!parPeriode[grp.key]) {
        parPeriode[grp.key] = {
          label: grp.label,
          sortKey: grp.sortKey,
          count: 0,
          montant: 0
        };
      }
      parPeriode[grp.key].count += 1;
      parPeriode[grp.key].montant += montant;
    });

    ventesResto.forEach((v) => {
      recetteResto += parseInt(v.montant_total || 0, 10) || 0;
    });

    // --------- 4. Mise à jour des tuiles ----------
    $("stat-validations-count").textContent = String(totalValidations);
    $("stat-revenue-total").textContent = formatGNF(recetteTotaleBillets);
    $("stat-revenue-normal").textContent = formatGNF(recetteTarifNormal);
    $("stat-revenue-etudiant").textContent = formatGNF(recetteTarifEtudiant);
    $("stat-revenue-resto").textContent = formatGNF(recetteResto);

    // --------- 5. Tableau Évolution des entrées ----------
    const evolBody = $("stats-evol-body");
    if (evolBody) {
      evolBody.innerHTML = "";
      const items = Object.values(parPeriode).sort((a, b) =>
        a.sortKey.localeCompare(b.sortKey)
      );
      if (items.length === 0) {
        evolBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        items.forEach((it) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${it.label}</td>
            <td>${it.count}</td>
            <td>${formatGNF(it.montant)}</td>
          `;
          evolBody.appendChild(tr);
        });
      }
    }

    // --------- 6. Tableau Top types d'accès / billets ----------
    const typeBody = $("stats-type-body");
    if (typeBody) {
      typeBody.innerHTML = "";
      const types = Object.entries(parType).sort(
        (a, b) => b[1].montant - a[1].montant
      );
      if (types.length === 0) {
        typeBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        types.forEach(([type, info]) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${type}</td>
            <td>${info.count}</td>
            <td>${formatGNF(info.montant)}</td>
          `;
          typeBody.appendChild(tr);
        });
      }
    }

    // --------- 7. Tableau Top jours / semaines ----------
    const topBody = $("stats-topdays-body");
    if (topBody) {
      topBody.innerHTML = "";
      const items = Object.values(parPeriode)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      if (items.length === 0) {
        topBody.innerHTML =
          '<tr><td colspan="3">Aucune validation pour cette période.</td></tr>';
      } else {
        items.forEach((it) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${it.label}</td>
            <td>${it.count}</td>
            <td>${formatGNF(it.montant)}</td>
          `;
          topBody.appendChild(tr);
        });
      }
    }

    if (msg) {
      msg.textContent = "Statistiques mises à jour.";
      msg.className = "status";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent =
        "Erreur lors du chargement des stats (voir console).";
      msg.className = "status";
    }
  }
}


// =====================================
//  5. Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[ADMIN] DOMContentLoaded");

  const csvInput = $("csvFile");
  const importBtn = $("btnImportCsv");

  if (importBtn && csvInput) {
    importBtn.addEventListener("click", (e) => {
      e.preventDefault();
      importerCSVDansBillets(csvInput.files[0]);
    });
  }

  const refreshStatsBtn = $("refreshStatsBtn");
  if (refreshStatsBtn) {
    refreshStatsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      chargerStatsValidations();
    });
  }

  const clearDataBtn = $("clearDataBtn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      effacerTousLesBillets();
    });
  }

  const exportBtn = $("exportValidationsBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      exporterValidationsCourantes();
    });
  }

  // chargement initial des stats
  chargerStatsValidations();
});
