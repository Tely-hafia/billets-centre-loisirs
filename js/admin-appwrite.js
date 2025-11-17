// =====================================
//  ADMIN + APPWRITE
//  - Import CSV -> Appwrite (table billets)
//  - Statistiques des billets
//  - Effacer tous les billets
// =====================================

// Config Appwrite
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6919c99200348d6d8afe';
const APPWRITE_DATABASE_ID = '6919ca20001ab6e76866';
const APPWRITE_BILLETS_TABLE_ID = 'billets';

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const databases = new Appwrite.Databases(client);

function $(id) {
  return document.getElementById(id);
}

function parseCsvLine(line, separator = ',') {
  return line.split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
}

// --------------------------
// IMPORT CSV -> APPWRITE
// --------------------------
async function importerCsv() {
  const fileInput = $('csvFile');
  const status = $('importStatus');

  if (!fileInput || !fileInput.files.length) {
    if (status) status.textContent = '❌ Aucun fichier sélectionné.';
    return;
  }

  const file = fileInput.files[0];
  const text = await file.text();

  // Détection ; ou ,
  const firstLine = text.split('\n')[0];
  const sep = firstLine.includes(';') ? ';' : ',';

  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    if (status) status.textContent = '❌ Fichier CSV vide ou incorrect.';
    return;
  }

  const headers = parseCsvLine(lines[0], sep);

  function getValue(cols, name) {
    const idx = headers.indexOf(name);
    if (idx === -1) return '';
    return cols[idx] ?? '';
  }

  let imported = 0;

  if (status) status.textContent = '⏳ Import en cours vers Appwrite...';

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    const numero_billet    = getValue(cols, 'numero_billet');
    const date_acces       = getValue(cols, 'date_acces');
    const type_acces       = getValue(cols, 'type_acces');
    const prix             = parseInt(getValue(cols, 'prix') || '0', 10);
    const tarif_universite = parseInt(getValue(cols, 'tarif_universite') || '0', 10);
    const statut           = getValue(cols, 'statut') || 'Non utilisé';
    const semaine_code     = getValue(cols, 'semaine_code') || '';

    if (!numero_billet) continue;

    try {
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_TABLE_ID,
        Appwrite.ID.unique(),
        {
          numero_billet,
          date_acces,
          type_acces,
          prix,
          tarif_universite,
          statut,
          semaine_code
        }
      );
      imported++;
    } catch (err) {
      console.error('Erreur import billet CSV ligne', i, err);
    }
  }

  if (status) status.textContent = `✅ Import terminé : ${imported} billets envoyés sur Appwrite.`;

  // Mettre à jour les stats après import
  chargerStatsBillets();
}

// --------------------------
// CHARGER LES STATS
// --------------------------
async function chargerStatsBillets() {
  const status = $('statsStatus');
  const tbodyJours = document.querySelector('#tableStatsJours tbody');
  if (!tbodyJours) return;

  if (status) status.textContent = '⏳ Chargement des stats depuis Appwrite...';
  tbodyJours.innerHTML = '';

  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const docs = res.documents || [];

    // Stats globales
    let total = docs.length;
    let nbValides = 0;
    let nbNonUtilises = 0;
    let totalPrix = 0;
    let totalUniv = 0;

    // Stats par jour
    const parJour = {}; // {date: {nb, prix, univ}}

    for (const d of docs) {
      const statut = d.statut || 'Non utilisé';
      const prix = Number(d.prix || 0);
      const univ = Number(d.tarif_universite || 0);
      const date = d.date_acces || 'Inconnue';

      if (statut === 'Validé') nbValides++;
      else nbNonUtilises++;

      totalPrix += prix;
      totalUniv += univ;

      if (!parJour[date]) {
        parJour[date] = { nb: 0, prix: 0, univ: 0 };
      }
      parJour[date].nb += 1;
      parJour[date].prix += prix;
      parJour[date].univ += univ;
    }

    // Injecter dans le DOM
    $('statTotalBillets').textContent = total.toString();
    $('statBilletsValides').textContent = nbValides.toString();
    $('statBilletsNonUtilises').textContent = nbNonUtilises.toString();
    $('statRecetteTotale').textContent = totalPrix.toLocaleString('fr-FR');
    $('statRecetteUniversite').textContent = totalUniv.toLocaleString('fr-FR');

    const dates = Object.keys(parJour).sort();
    if (!dates.length) {
      tbodyJours.innerHTML = "<tr><td colspan='4'>Aucun billet trouvé.</td></tr>";
    } else {
      for (const date of dates) {
        const info = parJour[date];
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${date}</td>
          <td>${info.nb}</td>
          <td>${info.prix.toLocaleString('fr-FR')} GNF</td>
          <td>${info.univ.toLocaleString('fr-FR')} GNF</td>
        `;
        tbodyJours.appendChild(tr);
      }
    }

    if (status) status.textContent = `✅ Stats mises à jour (${total} billets).`;

  } catch (err) {
    console.error('Erreur chargement stats Appwrite :', err);
    if (status) status.textContent = '❌ Erreur lors du chargement des stats.';
  }
}

// --------------------------
// EFFACER TOUS LES BILLETS
// --------------------------
async function effacerTousLesBillets() {
  const status = $('statsStatus');

  const ok = confirm(
    "⚠️ ATTENTION : ceci va supprimer TOUS les billets de la base Appwrite.\n\n" +
    "Utilisez cela uniquement avant d'importer une nouvelle semaine.\n\n" +
    "Confirmer la suppression ?"
  );
  if (!ok) return;

  if (status) status.textContent = '⏳ Suppression de tous les billets...';

  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const docs = res.documents || [];
    let deleted = 0;

    for (const d of docs) {
      try {
        await databases.deleteDocument(APPWRITE_DATABASE_ID, APPWRITE_BILLETS_TABLE_ID, d.$id);
        deleted++;
      } catch (err) {
        console.error('Erreur suppression billet', d.$id, err);
      }
    }

    if (status) status.textContent = `✅ Suppression terminée : ${deleted} billets effacés.`;

    // Mettre à jour les stats après suppression
    chargerStatsBillets();

  } catch (err) {
    console.error('Erreur lors de la suppression globale :', err);
    if (status) status.textContent = '❌ Erreur lors de la suppression des billets.';
  }
}

// --------------------------
// INIT
// --------------------------
document.addEventListener('DOMContentLoaded', () => {
  const btnImport = $('btnImportCsv');
  const btnStats = $('btnRefreshStats');
  const btnDelete = $('btnDeleteBillets');

  if (btnImport) {
    btnImport.addEventListener('click', (e) => {
      e.preventDefault();
      importerCsv();
    });
  }

  if (btnStats) {
    btnStats.addEventListener('click', (e) => {
      e.preventDefault();
      chargerStatsBillets();
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener('click', (e) => {
      e.preventDefault();
      effacerTousLesBillets();
    });
  }

  // Charger les stats au démarrage
  chargerStatsBillets();
});

