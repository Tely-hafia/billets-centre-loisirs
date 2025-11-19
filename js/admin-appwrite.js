console.log("[ADMIN] admin-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                 // billets entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne"; // billets jeux internes
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";         // historique validations
const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";      // produits resto
const APPWRITE_VENTES_RESTO_COLLECTION_ID = "ventes_resto";  // ventes resto/chicha

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

function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

// =====================================
//  1. IMPORT CSV
// =====================================

function getImportType() {
  const r = document.querySelector('input[name="importType"]:checked');
  return r ? r.value : "entree";
}

async function importerCSVDansBillets(file) {
  if (!file) {
    alert("Veuillez choisir un fichier CSV.");
    return;
  }

  const typeImport = getImportType(); // "entree" ou "interne"
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
  };

  reader.readAsText(file, "UTF-8");
}

// =====================================
//  2. STATS avancées à partir de "validations" + "ventes_resto"
// =====================================

// cache pour export
let lastStatsValidations = [];
let lastStatsVentes = [];

let validationsChart = null;
const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

function getPeriodRange(periodValue) {
  const now = new Date();
  let start;

  if (periodValue === "7d") {
    start = new Date(now);
    start.setDate(start.getDate() - 7);
  } else if (periodValue === "30d") {
    start = new Date(now);
    start.setDate(start.getDate() - 30);
  } else if (periodValue === "thisMonth") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodValue === "thisYear") {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    // "all"
    start = new Date(2000, 0, 1);
  }

  return { start, end: now };
}

// ISO week helpers
function getISOWeek(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
}
function getISOWeekYear(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  return tmp.getUTCFullYear();
}

function formatWeekLabel(year, week, sampleDate) {
  const monthName = MONTHS_FR[sampleDate.getMonth()];
  return `Semaine ${week} – ${monthName} ${year}`;
}

function formatDayLabel(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

function formatMonthLabel(date) {
  const monthName = MONTHS_FR[date.getMonth()];
  return `${monthName} ${date.getFullYear()}`;
}

function groupForChart(validations, groupBy) {
  const bins = new Map();

  validations.forEach((v) => {
    const d = new Date(v.date_validation);
    if (isNaN(d.getTime())) return;

    let key, labelInfo;

    if (groupBy === "day") {
      key = d.toISOString().slice(0, 10);
      labelInfo = { type: "day", date: d };
    } else if (groupBy === "month") {
      key = `${d.getFullYear()}-${(d.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      labelInfo = { type: "month", date: new Date(d.getFullYear(), d.getMonth(), 1) };
    } else {
      // week (par défaut)
      const w = getISOWeek(d);
      const y = getISOWeekYear(d);
      key = `${y}-W${w.toString().padStart(2, "0")}`;
      labelInfo = { type: "week", year: y, week: w, date: d };
    }

    if (!bins.has(key)) {
      bins.set(key, { count: 0, labelInfo });
    }
    bins.get(key).count += 1;
  });

  const entries = Array.from(bins.entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  );

  const labels = [];
  const data = [];

  entries.forEach(([_, val]) => {
    const info = val.labelInfo;
    let label;

    if (info.type === "day") label = formatDayLabel(info.date);
    else if (info.type === "month") label = formatMonthLabel(info.date);
    else label = formatWeekLabel(info.year, info.week, info.date);

    labels.push(label);
    data.push(val.count);
  });

  return { labels, data };
}

function renderValidationsChart(labels, data) {
  const canvas = $("chart-validations");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (validationsChart) {
    validationsChart.destroy();
  }

  validationsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Billets validés",
          data,
          backgroundColor: "rgba(255, 107, 53, 0.8)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

async function chargerStatsValidations() {
  const msg = $("stats-message");
  if (msg) {
    msg.textContent = "Chargement des stats...";
    msg.className = "message message-info";
  }

  const periodValue = $("stats-period") ? $("stats-period").value : "7d";
  const groupBy = $("stats-groupby") ? $("stats-groupby").value : "week";
  const { start, end } = getPeriodRange(periodValue);

  try {
    // Récupérer validations (entrées + jeux)
    const valRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const allValidations = valRes.documents || [];

    // Récupérer ventes resto
    const ventesRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      [Appwrite.Query.limit(10000)]
    );
    const allVentes = ventesRes.documents || [];

    // Filtrer par période
    const startMs = start.getTime();
    const endMs = end.getTime();

    const validations = allValidations.filter((d) => {
      const t = new Date(d.date_validation).getTime();
      return !isNaN(t) && t >= startMs && t <= endMs;
    });

    const ventes = allVentes.filter((d) => {
      const t = new Date(d.date_vente).getTime();
      return !isNaN(t) && t >= startMs && t <= endMs;
    });

    lastStatsValidations = validations;
    lastStatsVentes = ventes;

    // === KPI principaux ===
    const totalValidations = validations.length;
    let recetteTotale = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;

    const parType = {}; // { type: { count, montant } }
    const parJour = {}; // { YYYY-MM-DD: { count, montant } }

    validations.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") {
        recetteNormal += montant;
      } else if (d.tarif_applique === "etudiant") {
        recetteEtudiant += montant;
      }

      const type =
        d.type_acces ||
        d.type_billet ||
        (d.poste_id === "INTERNE" ? "Jeux internes" : "Inconnu");

      if (!parType[type]) {
        parType[type] = { count: 0, montant: 0 };
      }
      parType[type].count += 1;
      parType[type].montant += montant;

      const dStr = (d.date_validation || "").slice(0, 10);
      if (!parJour[dStr]) {
        parJour[dStr] = { count: 0, montant: 0, date: new Date(dStr) };
      }
      parJour[dStr].count += 1;
      parJour[dStr].montant += montant;
    });

    // Recette resto
    let recetteResto = 0;
    ventes.forEach((v) => {
      recetteResto += parseInt(v.montant_total || 0, 10) || 0;
    });

    // Mise à jour des KPI
    if ($("stat-validations-count"))
      $("stat-validations-count").textContent = totalValidations.toString();
    if ($("stat-revenue-total"))
      $("stat-revenue-total").textContent = formatGNF(recetteTotale);
    if ($("stat-revenue-normal"))
      $("stat-revenue-normal").textContent = formatGNF(recetteNormal);
    if ($("stat-revenue-etudiant"))
      $("stat-revenue-etudiant").textContent = formatGNF(recetteEtudiant);
    if ($("stat-revenue-resto"))
      $("stat-revenue-resto").textContent = formatGNF(recetteResto);

    // === Histogramme ===
    const chartData = groupForChart(validations, groupBy);
    renderValidationsChart(chartData.labels, chartData.data);

    // === Top billets / types ===
    const tbodyTypes = $("stats-top-billets-body");
    if (tbodyTypes) {
      tbodyTypes.innerHTML = "";
      const arr = Object.entries(parType).sort(
        (a, b) => b[1].montant - a[1].montant
      );
      if (arr.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour la période sélectionnée.";
        row.appendChild(td);
        tbodyTypes.appendChild(row);
      } else {
        arr.slice(0, 10).forEach(([type, info]) => {
          const row = document.createElement("tr");
          const tdType = document.createElement("td");
          tdType.textContent = type;
          const tdCount = document.createElement("td");
          tdCount.textContent = info.count.toString();
          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(info.montant);
          row.appendChild(tdType);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);
          tbodyTypes.appendChild(row);
        });
      }
    }

    // === Jours / semaines les plus chargés ===
    const tbodyJours = $("stats-top-jours-body");
    if (tbodyJours) {
      tbodyJours.innerHTML = "";

      const entries = Object.entries(parJour).map(([k, v]) => ({
        key: k,
        ...v
      }));
      entries.sort((a, b) => b.count - a.count);

      if (entries.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour la période sélectionnée.";
        row.appendChild(td);
        tbodyJours.appendChild(row);
      } else {
        entries.slice(0, 10).forEach((item) => {
          const row = document.createElement("tr");
          const tdPeriode = document.createElement("td");
          tdPeriode.textContent = formatDayLabel(item.date);
          const tdCount = document.createElement("td");
          tdCount.textContent = item.count.toString();
          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(item.montant);
          row.appendChild(tdPeriode);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);
          tbodyJours.appendChild(row);
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
//  3. Export CSV (validations / resto / billets)
// =====================================

function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) {
    alert("Aucune donnée à exporter pour cette période.");
    return;
  }

  const header = Object.keys(rows[0]);
  const csvLines = [header.join(";")];

  rows.forEach((r) => {
    const line = header
      .map((key) => {
        const val = r[key] != null ? String(r[key]) : "";
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(";");
    csvLines.push(line);
  });

  const blob = new Blob([csvLines.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportValidationsCSV() {
  if (!lastStatsValidations || lastStatsValidations.length === 0) {
    alert("Charge d'abord les stats pour la période souhaitée.");
    return;
  }
  downloadCSV("validations_export.csv", lastStatsValidations);
}

function exportRestoCSV() {
  if (!lastStatsVentes || lastStatsVentes.length === 0) {
    alert("Charge d'abord les stats pour la période souhaitée.");
    return;
  }
  downloadCSV("ventes_resto_export.csv", lastStatsVentes);
}

async function exportBilletsCSV() {
  try {
    const billetsRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const billetsIntRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const billets = billetsRes.documents || [];
    const billetsInt = billetsIntRes.documents || [];

    const rows = [
      ...billets.map((b) => ({
        collection: "billets",
        numero_billet: b.numero_billet,
        type_acces: b.type_acces,
        prix: b.prix,
        tarif_universite: b.tarif_universite,
        statut: b.statut
      })),
      ...billetsInt.map((b) => ({
        collection: "billets_interne",
        numero_billet: b.numero_billet,
        type_billet: b.type_billet,
        prix: b.prix,
        statut: b.statut
      }))
    ];

    downloadCSV("billets_export.csv", rows);
  } catch (err) {
    console.error("[ADMIN] Erreur export billets :", err);
    alert("Erreur lors de l'export des billets (voir console).");
  }
}

// =====================================
//  4. Nettoyage des BILLETS (pas validations)
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\n(Les validations et ventes resto NE seront PAS effacées.)"
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
      "Tous les billets (entrée + internes) ont été supprimés.\nLes validations et ventes resto sont conservées."
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

  const btnExportValidations = $("btnExportValidations");
  if (btnExportValidations) {
    btnExportValidations.addEventListener("click", (e) => {
      e.preventDefault();
      exportValidationsCSV();
    });
  }

  const btnExportResto = $("btnExportResto");
  if (btnExportResto) {
    btnExportResto.addEventListener("click", (e) => {
      e.preventDefault();
      exportRestoCSV();
    });
  }

  const btnExportBillets = $("btnExportBillets");
  if (btnExportBillets) {
    btnExportBillets.addEventListener("click", (e) => {
      e.preventDefault();
      exportBilletsCSV();
    });
  }

  // Chargement initial des stats
  chargerStatsValidations();
});
