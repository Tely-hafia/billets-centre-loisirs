console.log("[ADMIN] admin-appwrite.js chargé");

// =====================================
//  Configuration Appwrite (mêmes valeurs que côté agent)
// =====================================

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";

// =====================================
//  Initialisation du client Appwrite
// =====================================

if (typeof Appwrite === "undefined") {
  console.error(
    "[ADMIN] Appwrite SDK non chargé. Vérifie la balise <script src=\"https://cdn.jsdelivr.net/npm/appwrite@21.4.0\"></script>"
  );
}

const adminClient = new Appwrite.Client();
adminClient.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const adminDB = new Appwrite.Databases(adminClient);

// Helper DOM
function $(id) {
  return document.getElementById(id);
}

// Petit helper format
function formatGNF(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("fr-FR") + " GNF";
}

// =====================================
//  1. IMPORT CSV -> billets (version simple)
// =====================================

async function importerCSVDansBillets(file) {
  if (!file) {
    alert("Veuillez choisir un fichier CSV.");
    return;
  }

  const reader = new FileReader();

  reader.onload = async (e) => {
    const text = e.target.result;
    const lignes = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lignes.length <= 1) {
      alert("Le fichier CSV semble vide.");
      return;
    }

    // On suppose que la première ligne est l'en-tête
    const header = lignes[0].split(";").map((h) => h.trim());
    console.log("[ADMIN] En-têtes CSV :", header);

    // On cherche les colonnes attendues
    const idxNumero = header.indexOf("numero_billet");
    const idxDate = header.indexOf("date_acces");
    const idxType = header.indexOf("type_acces");
    const idxPrix = header.indexOf("prix");
    const idxTarifUni = header.indexOf("tarif_universite");
    const idxStatut = header.indexOf("statut");
    const idxSemaine = header.indexOf("semaine_code");

    if (idxNumero === -1 || idxDate === -1 || idxType === -1) {
      alert(
        "Le CSV doit contenir au minimum les colonnes : numero_billet, date_acces, type_acces."
      );
      return;
    }

    let count = 0;

    for (let i = 1; i < lignes.length; i++) {
      const cols = lignes[i].split(";");

      if (!cols[idxNumero]) continue; // ligne vide

      const doc = {
        numero_billet: cols[idxNumero].trim(),
        date_acces: cols[idxDate] ? cols[idxDate].trim() : "",
        type_acces: cols[idxType] ? cols[idxType].trim() : "",
        prix: idxPrix !== -1 ? parseInt(cols[idxPrix].trim() || "0", 10) || 0 : 0,
        tarif_universite:
          idxTarifUni !== -1
            ? parseInt(cols[idxTarifUni].trim() || "0", 10) || 0
            : 0,
        statut: idxStatut !== -1 ? cols[idxStatut].trim() : "Non utilisé",
        semaine_code: idxSemaine !== -1 ? cols[idxSemaine].trim() : ""
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
        console.error("[ADMIN] Erreur création billet pour la ligne", i, err);
      }
    }

    alert(`Import terminé : ${count} billets créés.`);
    console.log("[ADMIN] Import CSV terminé. Billets créés :", count);
  };

  reader.readAsText(file, "UTF-8");
}

// =====================================
//  2. STATS à partir de la collection "validations"
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

    // Totaux simples
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

    // Mise à jour DOM
    const elCount = $("stat-validations-count");
    const elTotal = $("stat-revenue-total");
    const elNormal = $("stat-revenue-normal");
    const elEtu = $("stat-revenue-etudiant");

    if (elCount) elCount.textContent = totalValidations.toString();
    if (elTotal) elTotal.textContent = formatGNF(recetteTotale);
    if (elNormal) elNormal.textContent = formatGNF(recetteNormal);
    if (elEtu) elEtu.textContent = formatGNF(recetteEtudiant);

    // Tableau par type d'accès
    const tbody = $("stats-type-body");
    if (tbody) {
      tbody.innerHTML = "";

      Object.keys(parType).forEach((type) => {
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

      if (Object.keys(parType).length === 0) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.textContent = "Aucune validation pour le moment.";
        row.appendChild(td);
        tbody.appendChild(row);
      }
    }

    if (msg) {
      msg.textContent = "Stats mises à jour.";
      msg.className = "message message-success";
    }
  } catch (err) {
    console.error("[ADMIN] Erreur chargement stats validations :", err);
    if (msg) {
      msg.textContent =
        "Erreur lors du chargement des stats (voir console).";
      msg.className = "message message-error";
    }
  }
}

// =====================================
//  3. Nettoyage des données
// =====================================

async function effacerToutesLesDonnees() {
  const ok = confirm(
    "CONFIRMATION : effacer TOUS les billets et validations ?"
  );
  if (!ok) return;

  try {
    // 1. Supprimer tous les billets
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

    // 2. Supprimer toutes les validations
    const valRes = await adminDB.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );
    const validations = valRes.documents || [];

    for (const v of validations) {
      try {
        await adminDB.deleteDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_VALIDATIONS_TABLE_ID,
          v.$id
        );
      } catch (err) {
        console.error("[ADMIN] Erreur suppression validation", v.$id, err);
      }
    }

    alert("Toutes les données billets + validations ont été supprimées.");
    console.log(
      "[ADMIN] Nettoyage terminé. Billets supprimés :",
      billets.length,
      "Validations supprimées :",
      validations.length
    );

    // On rafraîchit les stats (qui devraient être à zéro)
    chargerStatsValidations();
  } catch (err) {
    console.error("[ADMIN] Erreur lors du nettoyage des données :", err);
    alert("Erreur lors du nettoyage (voir console).");
  }
}

// =====================================
//  4. Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[ADMIN] DOMContentLoaded");

  // Import CSV
  const csvInput = $("csvFile");        // <-- même ID que dans le HTML
  const importBtn = $("btnImportCsv");  // <-- même ID que dans le HTML

  if (importBtn && csvInput) {
    importBtn.addEventListener("click", (e) => {
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

  // Nettoyage (bouton rouge qui supprime billets + validations)
  const clearDataBtn = $("clearDataBtn");
  if (clearDataBtn) {
    clearDataBtn.addEventListener("click", (e) => {
      e.preventDefault();
      effacerToutesLesDonnees();
    });
  }

  // Charger les stats automatiquement au démarrage
  chargerStatsValidations();
});
