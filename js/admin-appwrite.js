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
//  Helpers CSV
// =====================================

// détecte le séparateur le plus probable sur la 1ère ligne
function detectDelimiter(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  if (semi === 0 && comma === 0) return ";";
  return semi >= comma ? ";" : ",";
}

// normalise un nom de colonne pour faire les indexOf de manière robuste
function normalizeHeaderName(h) {
  if (!h) return "";
  return h
    .replace(/^\uFEFF/, "")       // enlève BOM UTF-8 éventuelle
    .replace(/^\"|\"$/g, "")      // enlève guillemets de début/fin
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")         // espaces → underscore
    .replace(/[^a-z0-9_]/g, "_"); // enlève les caractères exotiques
}

// renvoie l’index d’une colonne parmi une liste de noms possibles
function findColumnIndex(headersNorm, possibleNames) {
  for (const name of possibleNames) {
    const idx = headersNorm.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

// =====================================
//  1. IMPORT CSV
// =====================================

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

    // découpe des lignes, on enlève les vides
    const lignes = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lignes.length <= 1) {
      alert("Le fichier CSV semble vide (aucune ligne de données).");
      return;
    }

    // détection séparateur
    const delimiter = detectDelimiter(lignes[0]);
    console.log("[ADMIN] Délimiteur détecté pour le CSV :", delimiter);

    // préparation en-têtes
    const rawHeaders = lignes[0].split(delimiter);
    const headersNorm = rawHeaders.map(normalizeHeaderName);

    console.log("[ADMIN] En-têtes CSV brutes :", rawHeaders);
    console.log("[ADMIN] En-têtes CSV normalisées :", headersNorm);

    let count = 0;

    if (typeImport === "entree") {
      // ======== BILLETS D'ENTRÉE ========
      const idxNumero = findColumnIndex(headersNorm, ["numero_billet", "num_billet", "numero"]);
      const idxType   = findColumnIndex(headersNorm, ["type_acces", "type_acces_entree", "type"]);
      const idxPrix   = findColumnIndex(headersNorm, ["prix", "tarif", "montant"]);
      const idxTarifUni = findColumnIndex(headersNorm, ["tarif_universite", "tarif_etu", "tarif_etudiant"]);
      const idxStatut = findColumnIndex(headersNorm, ["statut", "status"]);

      if (idxNumero === -1 || idxType === -1) {
        alert(
          "Pour les billets d'entrée, le CSV doit contenir au minimum les colonnes : numero_billet ; type_acces\n" +
          "En-têtes détectées : " + rawHeaders.join(" | ")
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(delimiter);
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeAcces = cols[idxType] ? cols[idxType].trim() : "";
        if (!numero || !typeAcces) continue;

        const prix =
          idxPrix !== -1 ? parseInt((cols[idxPrix] || "0").replace(/\D/g, ""), 10) || 0 : 0;
        const tarifUni =
          idxTarifUni !== -1 ? parseInt((cols[idxTarifUni] || "0").replace(/\D/g, ""), 10) || 0 : 0;
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
          console.error("[ADMIN] Erreur création billet entrée ligne", i + 1, err);
        }
      }

      alert(`Import billets d'entrée terminé : ${count} billets créés.`);

    } else {
      // ======== BILLETS INTERNES (JEUX) ========
      const idxNumero = findColumnIndex(headersNorm, ["numero_billet", "num_billet", "numero"]);
      const idxTypeBillet = findColumnIndex(headersNorm, ["type_billet", "type", "jeu", "type_jeu"]);
      const idxPrix = findColumnIndex(headersNorm, ["prix", "tarif", "montant"]);

      if (idxNumero === -1 || idxTypeBillet === -1) {
        alert(
          "Pour les billets internes, le CSV doit contenir au minimum les colonnes : numero_billet ; type_billet\n" +
          "En-têtes détectées : " + rawHeaders.join(" | ")
        );
        return;
      }

      for (let i = 1; i < lignes.length; i++) {
        const cols = lignes[i].split(delimiter);
        if (!cols[idxNumero]) continue;

        const numero = cols[idxNumero].trim();
        const typeBillet = cols[idxTypeBillet] ? cols[idxTypeBillet].trim() : "";
        if (!numero || !typeBillet) continue;

        const prix =
          idxPrix !== -1 ? parseInt((cols[idxPrix] || "0").replace(/\D/g, ""), 10) || 0 : 0;

        const doc = {
          numero_billet: numero,
          type_billet: typeBillet,
          prix: prix
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
          console.error("[ADMIN] Erreur création billet interne ligne", i + 1, err);
        }
      }

      alert(`Import billets internes terminé : ${count} billets créés.`);
    }

    console.log("[ADMIN] Import CSV terminé. Billets créés :", count);
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

    const elCount = $("stat-validations-count");
    const elTotal = $("stat-revenue-total");
    const elNormal = $("stat-revenue-normal");
    const elEtu = $("stat-revenue-etudiant");

    if (elCount) elCount.textContent = totalValidations.toString();
    if (elTotal) elTotal.textContent = formatGNF(recetteTotale);
    if (elNormal) elNormal.textContent = formatGNF(recetteNormal);
    if (elEtu) elEtu.textContent = formatGNF(recetteEtudiant);

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
//  4. Initialisation des événements
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

  chargerStatsValidations();
});
