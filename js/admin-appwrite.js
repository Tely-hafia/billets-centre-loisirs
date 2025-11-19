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
  if (msg) {
    msg.textContent = "Chargement des stats...";
  }

  const periodSelect = $("stats-period");
  const groupSelect = $("stats-group");
  const periodValue = periodSelect ? periodSelect.value : "7d";
  const groupValue = groupSelect ? groupSelect.value : "semaine";

  const { start, end } = getPeriodRange(periodValue);

  const queriesValidations = [];
  const queriesVentes = [];

  if (start) {
    queriesValidations.push(Appwrite.Query.greaterThanEqual("date_validation", start));
    queriesVentes.push(Appwrite.Query.greaterThanEqual("date_vente", start));
  }
  if (end) {
    queriesValidations.push(Appwrite.Query.lessThanEqual("date_validation", end));
    queriesVentes.push(Appwrite.Query.lessThanEqual("date_vente", end));
  }

  queriesValidations.push(Appwrite.Query.limit(10000));
  queriesVentes.push(Appwrite.Query.limit(10000));

  try {
    const [valRes, ventesRes] = await Promise.all([
      adminDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_VALIDATIONS_TABLE_ID,
        queriesValidations
      ),
      adminDB.listDocuments(
        APPWRITE_DATABASE_ID,
        APPWRITE_VENTES_RESTO_COLLECTION_ID,
        queriesVentes
      )
    ]);

    const validations = valRes.documents || [];
    const ventes = ventesRes.documents || [];

    console.log(
      "[ADMIN] Stats – validations:", validations.length,
      "ventes resto:", ventes.length
    );

    // ---- RÉSUMÉ GLOBAL ----
    const totalValidations = validations.length;

    let recetteTotaleBillets = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;
    let recetteResto = 0;

    const parType = {};   // { libelle: { count, montant } }
    const parPeriode = {}; // { key: { label, count, montant } }

    validations.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotaleBillets += montant;

      if (d.tarif_applique === "etudiant") {
        recetteEtudiant += montant;
      } else {
        recetteNormal += montant;
      }

      const type =
        d.type_acces ||
        d.type_billet ||
        "Non renseigné";

      if (!parType[type]) {
        parType[type] = { count: 0, montant: 0 };
      }
      parType[type].count += 1;
      parType[type].montant += montant;

      // Périodes pour histogramme (on ignore éventuellement les validations sans date)
      if (d.date_validation) {
        const dateObj = new Date(d.date_validation);
        const { key, label } = getPeriodKeyLabel(dateObj, groupValue);
        if (!parPeriode[key]) {
          parPeriode[key] = { label, count: 0, montant: 0 };
        }
        parPeriode[key].count += 1;
        parPeriode[key].montant += montant;
      }
    });

    ventes.forEach((v) => {
      const m = parseInt(v.montant_total || 0, 10) || 0;
      recetteResto += m;
    });

    // ---- MAJ TUILES ----
    const elCount = $("stat-validations-count");
    const elTotal = $("stat-revenue-total");
    const elNormal = $("stat-revenue-normal");
    const elEtu = $("stat-revenue-etudiant");
    const elResto = $("stat-revenue-resto");

    if (elCount) elCount.textContent = totalValidations.toString();
    if (elTotal) elTotal.textContent = formatGNF(recetteTotaleBillets);
    if (elNormal) elNormal.textContent = formatGNF(recetteNormal);
    if (elEtu) elEtu.textContent = formatGNF(recetteEtudiant);
    if (elResto) elResto.textContent = formatGNF(recetteResto);

    // ---- HISTOGRAMME ----
    const chart = $("stats-chart");
    const chartEmpty = $("stats-chart-empty");
    if (chart) chart.innerHTML = "";

    const periodeKeys = Object.keys(parPeriode);

    if (chart && chartEmpty) {
      if (periodeKeys.length === 0) {
        chart.style.display = "none";
        chartEmpty.style.display = "block";
      } else {
        chart.style.display = "flex";
        chartEmpty.style.display = "none";

        // tri chronologique
        periodeKeys.sort(); // format YYYY-MM-DD, YYYY-MM, YYYY-Wxx -> tri OK

        let maxCount = 0;
        periodeKeys.forEach((k) => {
          if (parPeriode[k].count > maxCount) maxCount = parPeriode[k].count;
        });
        if (maxCount <= 0) maxCount = 1;

        periodeKeys.forEach((key) => {
          const p = parPeriode[key];
          const bar = document.createElement("div");
          bar.className = "chart-bar";

          const inner = document.createElement("div");
          inner.className = "chart-bar-inner";
          const h = 10 + (p.count / maxCount) * 90; // 10% min
          inner.style.height = h + "%";

          const label = document.createElement("div");
          label.className = "chart-bar-label";
          label.textContent = p.label;

          const value = document.createElement("div");
          value.className = "chart-bar-value";
          value.textContent = p.count.toString();

          bar.appendChild(inner);
          bar.appendChild(value);
          bar.appendChild(label);

          chart.appendChild(bar);
        });
      }
    }

    // ---- TABLEAU TOP TYPES D'ACCÈS / BILLETS ----
    const tbodyType = $("stats-type-body");
    if (tbodyType) {
      tbodyType.innerHTML = "";
      const types = Object.keys(parType);

      if (types.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour la période sélectionnée.";
        row.appendChild(td);
        tbodyType.appendChild(row);
      } else {
        types
          .sort((a, b) => parType[b].montant - parType[a].montant)
          .forEach((type) => {
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

            tbodyType.appendChild(row);
          });
      }
    }

    // ---- TABLEAU TOP PÉRIODES ----
    const tbodyPeriode = $("stats-period-body");
    if (tbodyPeriode) {
      tbodyPeriode.innerHTML = "";

      if (periodeKeys.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour la période sélectionnée.";
        row.appendChild(td);
        tbodyPeriode.appendChild(row);
      } else {
        // tri par volume décroissant
        const sortedKeys = [...periodeKeys].sort(
          (a, b) => parPeriode[b].count - parPeriode[a].count
        );

        sortedKeys.slice(0, 10).forEach((key) => {
          const p = parPeriode[key];
          const row = document.createElement("tr");

          const tdLabel = document.createElement("td");
          tdLabel.textContent = p.label;

          const tdCount = document.createElement("td");
          tdCount.textContent = p.count.toString();

          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(p.montant);

          row.appendChild(tdLabel);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);

          tbodyPeriode.appendChild(row);
        });
      }
    }

    if (msg) {
      msg.textContent = "Stats mises à jour.";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent = "Erreur lors du chargement des stats (voir console).";
    }
  }
}

// =====================================
//  3. Export CSV des validations (période filtrée)
// =====================================

function convertToCSV(rows) {
  if (!rows || rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];

  rows.forEach((r) => {
    const line = headers
      .map((h) => {
        const value = r[h] != null ? String(r[h]) : "";
        return value.replace(/;/g, ",");
      })
      .join(";");
    lines.push(line);
  });

  return lines.join("\n");
}

function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exporterValidationsCourantes() {
  const periodSelect = $("stats-period");
  const periodValue = periodSelect ? periodSelect.value : "thisYear";
  const { start, end } = getPeriodRange(periodValue);

  const queries = [];
  if (start) queries.push(Appwrite.Query.greaterThanEqual("date_validation", start));
  if (end) queries.push(Appwrite.Query.lessThanEqual("date_validation", end));
  queries.push(Appwrite.Query.limit(10000));

  try {
    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      queries
    );
    const docs = res.documents || [];
    if (docs.length === 0) {
      alert("Aucune validation à exporter pour cette période.");
      return;
    }

    const rows = docs.map((d) => ({
      numero_billet: d.numero_billet || "",
      billet_id: d.billet_id || "",
      date_validation: d.date_validation || "",
      type_acces: d.type_acces || "",
      type_billet: d.type_billet || "",
      code_offre: d.code_offre || "",
      tarif_normal: d.tarif_normal || 0,
      tarif_etudiant: d.tarif_etudiant || 0,
      tarif_applique: d.tarif_applique || "",
      montant_paye: d.montant_paye || 0,
      agent_id: d.agent_id || "",
      poste_id: d.poste_id || "",
      numero_etudiant: d.numero_etudiant || "",
      mode: d.mode || "",
      source: d.source || ""
    }));

    const csv = convertToCSV(rows);
    const now = new Date();
    const suffix = now.toISOString().slice(0, 10);
    downloadCSV(`validations_${suffix}.csv`, csv);
  } catch (err) {
    console.error("[ADMIN] Erreur export validations :", err);
    alert("Erreur lors de l'export (voir console).");
  }
}

// =====================================
//  4. Nettoyage des BILLETS (pas validations)
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\n(Les validations et ventes resto/chicha NE seront PAS effacées.)"
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
      "Tous les billets (entrée + internes) ont été supprimés.\nLes validations et ventes resto/chicha sont conservées."
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
