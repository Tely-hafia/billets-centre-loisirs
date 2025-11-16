// =====================================
//  Configuration Appwrite  (À MODIFIER)
// =====================================

// ⚠️ REMPLACE les 5 constantes ci-dessous par tes valeurs Appwrite ⚠️
// Tu les trouves dans la console Appwrite (Overview + Databases + Tables).

const APPWRITE_ENDPOINT = 'https://<REGION>.cloud.appwrite.io/v1'; // ex : https://eu-west-1.cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = '<PROJECT_ID>';           // ex : 6719c9xxxxxxxxxxxx
const APPWRITE_DATABASE_ID = '<DATABASE_ID>';         // ex : 6919ca2000xxxxxxx
const APPWRITE_BILLETS_TABLE_ID = '<BILLETS_TABLE_ID>';
const APPWRITE_VALIDATIONS_TABLE_ID = '<VALIDATIONS_TABLE_ID>';

// Identifiants simples pour la phase test
const AGENT_ID = 'AGENT_TEST';
const POSTE_ID = 'POSTE_PRINCIPAL';

// =====================================
//  Initialisation du client Appwrite
// =====================================

const client = new Appwrite.Client();

client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const tablesDB = new Appwrite.TablesDB(client);

// =====================================
//  Helpers DOM
// =====================================

function $(id) {
  return document.getElementById(id);
}

function setTicketCount(n) {
  const el = $('ticketCount');
  if (el) el.textContent = n.toString();
}

function showMessage(text, type = 'info') {
  const zone = $('result-message');
  if (!zone) {
    alert(text);
    return;
  }

  zone.textContent = text;
  zone.className = 'message'; // reset
  zone.classList.add(`message-${type}`); // à styliser dans ton CSS
}

// =====================================
//  Chargement du nombre de billets
// =====================================

async function chargerNombreBillets() {
  try {
    // On limite à 10 000 pour ne pas exploser
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [
        Appwrite.Query.limit(10000)
      ]
    });

    const nb = res.rows ? res.rows.length : 0;
    setTicketCount(nb);
  } catch (err) {
    console.error('Erreur chargement billets :', err);
    // On ne bloque pas l’app pour ça
  }
}

// =====================================
//  Vérification d'un billet
// =====================================

async function verifierBillet() {
  const input = $('ticketNumber');
  if (!input) {
    alert("Champ ticketNumber introuvable dans la page.");
    return;
  }

  const numero = input.value.trim();

  if (!numero) {
    showMessage("Veuillez saisir un numéro de billet.", 'error');
    return;
  }

  showMessage("Vérification en cours...", 'info');

  try {
    // 1. Recherche du billet par numero_billet
    const res = await tablesDB.listRows({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      queries: [
        Appwrite.Query.equal('numero_billet', [numero]),
        Appwrite.Query.limit(1)
      ]
    });

    if (!res.rows || res.rows.length === 0) {
      showMessage(`Billet ${numero} introuvable.`, 'error');
      return;
    }

    const billet = res.rows[0];

    // 2. Si déjà validé
    if (billet.statut === 'Validé') {
      showMessage(`Billet ${numero} déjà VALIDÉ ❌`, 'error');
      return;
    }

    // 3. Mettre à jour le billet -> statut = Validé
    await tablesDB.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_BILLETS_TABLE_ID,
      rowId: billet.$id,
      data: {
        statut: 'Validé'
      }
    });

    // 4. Enregistrer la validation dans la table "validations"
    const nowIso = new Date().toISOString();

    await tablesDB.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_VALIDATIONS_TABLE_ID,
      rowId: Appwrite.ID.unique(),
      data: {
        numero_billet: numero,
        date_validation: nowIso,
        agent_id: AGENT_ID,
        poste_id: POSTE_ID,
        appareil_id: 'WEB',
        mode: 'online',
        source: 'agent-web'
      }
    });

    // 5. Afficher le succès
    const typeAcces = billet.type_acces || '';
    const dateAcces = billet.date_acces || '';

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      'success'
    );

    // On vide le champ
    input.value = '';

    // On met à jour le compteur (optionnel)
    chargerNombreBillets();

  } catch (err) {
    console.error('Erreur lors de la vérification :', err);
    showMessage("Erreur lors de la vérification (voir console).", 'error');
  }
}

// =====================================
//  Initialisation des événements
// =====================================

document.addEventListener('DOMContentLoaded', () => {
  // Bouton vérifier
  const btn = $('validateBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // Validation avec Entrée dans le champ
  const input = $('ticketNumber');
  if (input) {
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        verifierBillet();
      }
    });
  }

  // Charger le nombre de billets au démarrage
  chargerNombreBillets();
});
