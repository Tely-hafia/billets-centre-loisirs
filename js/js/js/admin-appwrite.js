// ======================
// CONFIG APPWRITE
// ======================

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6919c99200348d6d8afe';
const APPWRITE_DATABASE_ID = '6919ca20001ab6e76866';
const APPWRITE_BILLETS_TABLE_ID = 'billets';

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const tablesDB = new Appwrite.TablesDB(client);

// ======================
// IMPORT CSV
// ======================

document.getElementById('btnImportCsv').addEventListener('click', async () => {

  const fileInput = document.getElementById('csvFile');
  const status = document.getElementById('importStatus');

  if (!fileInput.files.length) {
    status.textContent = "❌ Aucun fichier sélectionné.";
    return;
  }

  const file = fileInput.files[0];

  status.textContent = "⏳ Lecture du CSV...";

  const text = await file.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  // Suppose que ton CSV a : numero_billet,date_acces,prix,tarif_universite,statut,semaine_code,type_acces
  const headers = lines[0].split(',');

  status.textContent = "⏳ Import en cours...";

  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');

    const billetData = {
      numero_billet: cols[0],
      date_acces: cols[1],
      prix: parseInt(cols[2]),
      tarif_universite: parseInt(cols[3]),
      statut: cols[4],
      semaine_code: cols[5],
      type_acces: cols[6]
    };

    try {
      await tablesDB.createRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_BILLETS_TABLE_ID,
        rowId: Appwrite.ID.unique(),
        data: billetData
      });

      imported++;

    } catch (err) {
      console.error("Erreur ligne CSV", i, err);
    }
  }

  status.textContent = `✅ Import terminé : ${imported} billets ajoutés.`;
});

// ======================
// AFFICHAGE DES BILLETS
// ======================

document.getElementById('btnLoadBillets').addEventListener('click', async () => {
  const tbody = document.querySelector('#tableBillets tbody');
  tbody.innerHTML = "<tr><td colspan='5'>⏳ Chargement...</td></tr>";

  try {
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [Appwrite.Query.limit(10000)]
    });

    tbody.innerHTML = "";

    for (const row of res.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.numero_billet}</td>
        <td>${row.date_acces}</td>
        <td>${row.type_acces}</td>
        <td>${row.statut}</td>
        <td>${row.semaine_code}</td>
      `;
      tbody.appendChild(tr);
    }

  } catch (err) {
    console.error(err);
    tbody.innerHTML = "<tr><td colspan='5'>❌ Erreur chargement billets</td></tr>";
  }
});
