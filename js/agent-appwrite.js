// =====================================
//  Configuration Appwrite (les mêmes que pour agent)
// =====================================

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6919c99200348d6d8afe';
const APPWRITE_DATABASE_ID = '6919ca20001ab6e76866';
const APPWRITE_BILLETS_TABLE_ID = 'billets';
const APPWRITE_VALIDATIONS_TABLE_ID = 'validations';

const clientAdmin = new Appwrite.Client();
clientAdmin
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const tablesDBAdmin = new Appwrite.TablesDB(clientAdmin);

// Petit helper
function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

// =====================================
//  Charger les stats (billets + validations)
// =====================================

async function chargerStatsAdmin() {
  try {
    // Nombre de billets
    const billetsRes = await tablesDBAdmin.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [
        Appwrite.Query.limit(10000)
      ]
    });
    const nbBillets = billetsRes.rows ? billetsRes.rows.length : 0;
    setText('admin-nb-billets', nbBillets);

    // Nombre de validations
    const valRes = await tablesDBAdmin.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_VALIDATIONS_TABLE_ID,
      queries: [
        Appwrite.Query.limit(10000)
      ]
    });
    const nbVal = valRes.rows ? valRes.rows.length : 0;
    setText('admin-nb-validations', nbVal);

  } catch (err) {
    console.error('Erreur chargement stats admin :', err);
    const zone = $('admin-message');
    if (zone) {
      zone.textContent = 'Erreur lors du chargement des stats (voir console).';
    }
  }
}

// Lancer automatiquement au chargement de la page admin
document.addEventListener('DOMContentLoaded', () => {
  chargerStatsAdmin();
});
