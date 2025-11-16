//// =====================================
//  ADMIN + APPWRITE
//  - Import CSV -> Appwrite (table billets)
//  - Affichage des billets depuis Appwrite
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

    const billetData = {
      numero_billet,
      date_acces,
      type_acces,
      prix,
      tarif_universite,
      statut,
      semaine_code
    };

    try {
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_BILLETS_TABLE_ID,
        Appwrite.ID.unique(),
        billetData
      );
      imported++;
    } catch (err) {
      console.error('Erreur import billet CSV ligne', i, err);
    }
  }

  if (status) status.textContent = `✅ Import terminé : ${imported} billets envoyés sur Appwrite.`;

  // Recharger la liste pour vérifier
  chargerBilletsServeur();
}

// --------------------------
// AFFICHAGE BILLETS (depuis Appwrite)
// --------------------------

async function chargerBilletsServeur() {
  const tbody = document.querySelector('#tableBillets tbody');
  if (!tbody) return;

  tbody.innerHTML = "<tr><td colspan='5'>⏳ Chargement depuis Appwrite...</td></tr>";

  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const billets = res.documents || [];

    tbody.innerHTML = '';

    if (!billets.length) {
      tbody.innerHTML = "<tr><td colspan='5'>Aucun billet trouvé sur le serveur.</td></tr>";
      return;
    }

    for (const billet of billets) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${billet.numero_billet || ''}</td>
        <td>${billet.date_acces || ''}</td>
        <td>${billet.type_acces || ''}</td>
        <td>${billet.statut || ''}</td>
        <td>${billet.semaine_code || ''}</td>
      `;
      tbody.appendChild(tr);
    }

  } catch (err) {
    console.error('Erreur chargement billets Appwrite :', err);
    tbody.innerHTML = "<tr><td colspan='5'>❌ Erreur chargement billets.</td></tr>";
  }
}

// --------------------------
// INIT
// --------------------------

document.addEventListener('DOMContentLoaded', () => {
  const btnImport = $('btnImportCsv');
  const btnLoad = $('btnLoadBillets');

  if (btnImport) {
    btnImport.addEventListener('click', (e) => {
      e.preventDefault();
      importerCsv();
    });
  }

  if (btnLoad) {
    btnLoad.addEventListener('click', (e) => {
      e.preventDefault();
      chargerBilletsServeur();
    });
  }

  // Charger automatiquement les billets à l'ouverture
  chargerBilletsServeur();
});
