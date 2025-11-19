console.log("[ADMIN] admin-appwrite.js chargé");

// =====================================
//  Configuration Appwrite
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                 // billets d'entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne"; // billets jeux internes
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";         // historique validations
const APPWRITE_MENU_RESTO_COLLECTION_ID = "menu_resto";      // catalogue produits
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

// Format monnaie
function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

// =====================================
// 1. IMPORT CSV
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
// 2. STATS à partir de "validations" + "ventes_resto"
// =====================================

// Calcule la période sélectionnée
function getDateRangeFromUI() {
  const range = $("stats-range") ? $("stats-range").value : "week";
  const now = new Date();
  let from = null;
  let to = null;

  // normaliser "to" à la fin de la journée
  function endOfDay(d) {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  if (range === "today") {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    from = today;
    to = endOfDay(today);
  } else if (range === "week") {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    from = new Date(today);
    from.setDate(from.getDate() - 6); // 7 jours glissants
    to = endOfDay(today);
  } else if (range === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = endOfDay(now);
  } else if (range === "year") {
    from = new Date(now.getFullYear(), 0, 1);
    to = endOfDay(now);
  } else if (range === "custom") {
    const fromStr = $("stats-from")?.value;
    const toStr = $("stats-to")?.value;
    if (!fromStr || !toStr) {
      return { error: "Veuillez sélectionner une date de début et de fin." };
    }
    from = new Date(fromStr + "T00:00:00");
    to = endOfDay(new Date(toStr + "T00:00:00"));
    if (from > to) {
      return { error: "La date de début doit être avant la date de fin." };
    }
  } else {
    // "all"
    return { fromIso: null, toIso: null };
  }

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString()
  };
}

async function chargerStatsValidations() {
  const msg = $("stats-message");
  if (msg) {
    msg.textContent = "Chargement des stats...";
    msg.className = "message message-info";
  }

  const rangeInfo = getDateRangeFromUI();
  if (rangeInfo.error) {
    if (msg) {
      msg.textContent = rangeInfo.error;
      msg.className = "message message-warning";
    }
    return;
  }

  const { fromIso, toIso } = rangeInfo;

  try {
    // =======================
    // 2.1 Validations (billets)
    // =======================
    const queries = [Appwrite.Query.limit(10000)];
    if (fromIso && toIso) {
      queries.push(Appwrite.Query.greaterThanEqual("date_validation", fromIso));
      queries.push(Appwrite.Query.lessThanEqual("date_validation", toIso));
    }

    const res = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      queries
    );

    const docs = res.documents || [];
    console.log("[ADMIN] Validations récupérées :", docs.length);

    const totalValidations = docs.length;

    let recetteTotale = 0;
    let recetteNormal = 0;
    let recetteEtudiant = 0;

    const parType = {};   // { type_acces: { count, montant } }
    const parBillet = {}; // { labelBillet: { count, montant } }
    const parJour = {};   // { YYYY-MM-DD: { count, montant } }

    docs.forEach((d) => {
      const montant = parseInt(d.montant_paye || 0, 10) || 0;
      recetteTotale += montant;

      if (d.tarif_applique === "normal") {
        recetteNormal += montant;
      } else if (d.tarif_applique === "etudiant") {
        recetteEtudiant += montant;
      }

      const typeAcces = d.type_acces || "Non renseigné";
      if (!parType[typeAcces]) {
        parType[typeAcces] = { count: 0, montant: 0 };
      }
      parType[typeAcces].count += 1;
      parType[typeAcces].montant += montant;

      const labelBillet =
        (d.type_acces || "").trim() && (d.type_billet || "").trim()
          ? `${d.type_acces} – ${d.type_billet}`
          : d.type_acces || d.type_billet || "Autre";

      if (!parBillet[labelBillet]) {
        parBillet[labelBillet] = { count: 0, montant: 0 };
      }
      parBillet[labelBillet].count += 1;
      parBillet[labelBillet].montant += montant;

      const dateVal = d.date_validation || "";
      if (dateVal) {
        const jour = dateVal.substring(0, 10); // YYYY-MM-DD
        if (!parJour[jour]) {
          parJour[jour] = { count: 0, montant: 0 };
        }
        parJour[jour].count += 1;
        parJour[jour].montant += montant;
      }
    });

    // Mise à jour des totaux
    const elCount = $("stat-validations-count");
    const elTotal = $("stat-revenue-total");
    const elNormal = $("stat-revenue-normal");
    const elEtu = $("stat-revenue-etudiant");

    if (elCount) elCount.textContent = totalValidations.toString();
    if (elTotal) elTotal.textContent = formatGNF(recetteTotale);
    if (elNormal) elNormal.textContent = formatGNF(recetteNormal);
    if (elEtu) elEtu.textContent = formatGNF(recetteEtudiant);

    // Tableau "Détail par type d'accès"
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

          tbodyType.appendChild(row);
        });
      }
    }

    // Tableau "Top billets les plus vendus"
    const tbodyTopBillets = $("stats-top-billets-body");
    if (tbodyTopBillets) {
      tbodyTopBillets.innerHTML = "";
      const entries = Object.entries(parBillet);
      entries.sort((a, b) => b[1].count - a[1].count);
      const top = entries.slice(0, 5);

      if (top.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucun billet sur cette période.";
        row.appendChild(td);
        tbodyTopBillets.appendChild(row);
      } else {
        top.forEach(([label, data]) => {
          const row = document.createElement("tr");

          const tdLabel = document.createElement("td");
          tdLabel.textContent = label;

          const tdCount = document.createElement("td");
          tdCount.textContent = data.count.toString();

          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(data.montant);

          row.appendChild(tdLabel);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);

          tbodyTopBillets.appendChild(row);
        });
      }
    }

    // Tableau "Jours avec le plus d'entrées"
    const tbodyTopDays = $("stats-top-days-body");
    if (tbodyTopDays) {
      tbodyTopDays.innerHTML = "";
      const entriesDays = Object.entries(parJour);
      entriesDays.sort((a, b) => b[1].count - a[1].count);
      const topDays = entriesDays.slice(0, 7); // Top 7 jours

      if (topDays.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucun jour avec des validations sur cette période.";
        row.appendChild(td);
        tbodyTopDays.appendChild(row);
      } else {
        topDays.forEach(([jour, data]) => {
          const row = document.createElement("tr");

          const tdDate = document.createElement("td");
          const d = new Date(jour + "T00:00:00");
          tdDate.textContent = d.toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          });

          const tdCount = document.createElement("td");
          tdCount.textContent = data.count.toString();

          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(data.montant);

          row.appendChild(tdDate);
          row.appendChild(tdCount);
          row.appendChild(tdMontant);

          tbodyTopDays.appendChild(row);
        });
      }
    }

    // =======================
    // 2.2 Stats RESTO / CHICHA
    // =======================
    await chargerStatsResto(fromIso, toIso);

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

// Stats resto
async function chargerStatsResto(fromIso, toIso) {
  const queriesVentes = [Appwrite.Query.limit(10000)];
  if (fromIso && toIso) {
    queriesVentes.push(Appwrite.Query.greaterThanEqual("date_vente", fromIso));
    queriesVentes.push(Appwrite.Query.lessThanEqual("date_vente", toIso));
  }

  try {
    const ventesRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VENTES_RESTO_COLLECTION_ID,
      queriesVentes
    );

    const ventes = ventesRes.documents || [];

    const parProduit = {}; // code_produit -> { qte, montant }

    let totalResto = 0;

    ventes.forEach((v) => {
      const code = v.code_produit || "INCONNU";
      const qte = parseInt(v.quantite || 0, 10) || 0;
      const montant = parseInt(v.montant_total || 0, 10) || 0;
      totalResto += montant;

      if (!parProduit[code]) {
        parProduit[code] = { qte: 0, montant: 0 };
      }
      parProduit[code].qte += qte;
      parProduit[code].montant += montant;
    });

    const elResto = $("stat-revenue-resto");
    if (elResto) elResto.textContent = formatGNF(totalResto);

    // On récupère le libellé des produits
    const menuRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_MENU_RESTO_COLLECTION_ID,
      [Appwrite.Query.limit(200)]
    );
    const menuDocs = menuRes.documents || [];
    const labelByCode = {};
    menuDocs.forEach((p) => {
      labelByCode[p.code_produit] = p.libelle || p.code_produit;
    });

    const tbodyTopResto = $("stats-top-resto-body");
    if (tbodyTopResto) {
      tbodyTopResto.innerHTML = "";
      const entries = Object.entries(parProduit);
      entries.sort((a, b) => b[1].qte - a[1].qte);
      const top = entries.slice(0, 5);

      if (top.length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune vente resto/chicha sur cette période.";
        row.appendChild(td);
        tbodyTopResto.appendChild(row);
      } else {
        top.forEach(([code, data]) => {
          const row = document.createElement("tr");

          const tdProd = document.createElement("td");
          const label = labelByCode[code] || code;
          tdProd.textContent = `${label} (${code})`;

          const tdQte = document.createElement("td");
          tdQte.textContent = data.qte.toString();

          const tdMontant = document.createElement("td");
          tdMontant.textContent = formatGNF(data.montant);

          row.appendChild(tdProd);
          row.appendChild(tdQte);
          row.appendChild(tdMontant);

          tbodyTopResto.appendChild(row);
        });
      }
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats resto :", err);
    const tbodyTopResto = $("stats-top-resto-body");
    if (tbodyTopResto) {
      tbodyTopResto.innerHTML = "";
      const row = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "Erreur lors du chargement des stats resto (voir console).";
      row.appendChild(td);
      tbodyTopResto.appendChild(row);
    }
  }
}

// =====================================
// 3. Nettoyage des BILLETS (pas validations)
// =====================================

async function effacerTousLesBillets() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets d'entrée ET les billets internes ?\n" +
    "(Les validations et les ventes resto NE seront PAS effacées.)"
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
      "Tous les billets (entrée + internes) ont été supprimés.\n" +
      "Les validations et les ventes resto sont conservées."
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
// 4. Initialisation des événements
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

  const rangeSelect = $("stats-range");
  if (rangeSelect) {
    rangeSelect.addEventListener("change", () => {
      const customRow = $("stats-custom-range");
      if (!customRow) return;
      customRow.style.display =
        rangeSelect.value === "custom" ? "flex" : "none";
    });
  }

  // Charger une première fois (semaine glissante)
  chargerStatsValidations();
});

