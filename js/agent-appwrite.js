// =====================================
//  Configuration Appwrite
// =====================================

// Même config que tout à l’heure, mais on l’utilise avec Databases
const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6919c99200348d6d8afe';
const APPWRITE_DATABASE_ID = '6919ca20001ab6e76866';
const APPWRITE_BILLETS_TABLE_ID = 'billets';      // ID / slug de la table billets
const APPWRITE_VALIDATIONS_TABLE_ID = 'validations'; // ID / slug de la table validations

// Identifiants "logiques" pour la phase de test
const AGENT_ID = 'AGENT_TEST';
const POSTE_ID = 'POSTE_PRINCIPAL';

// =====================================
//  Initialisation du client Appwrite
// =====================================

const client = new Appwrite.Client();

client
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const databases = new Appwrite.Databases(client);

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
  zone.className = 'message';
  zone.classList.add(`message-${type}`); // à styliser dans ton CSS
}

// =====================================
//  Chargement du nombre de billets
// =====================================

async function chargerNombreBillets() {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const nb = res.total ?? (res.documents ? res.documents.length : 0);
    setTicketCount(nb);
  } catch (err) {
    console.error('Erreur chargement billets :', err);
    // On ne bloque pas l’appli pour ça
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
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [
        Appwrite.Query.equal('numero_billet', numero),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      showMessage(`Billet ${numero} introuvable.`, 'error');
      return;
    }

    const billet = res.documents[0];

    // 2. Si déjà validé
    if (billet.statut === 'Validé') {
      showMessage(`Billet ${numero} déjà VALIDÉ ❌`, 'error');
      return;
    }

    // 3. Mettre à jour le billet -> statut = Validé
    await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: 'Validé' }
    );

    // 4. Enregistrer la validation dans la table "validations"
    const nowIso = new Date().toISOString();

    await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: numero,
        date_validation: nowIso,
        agent_id: AGENT_ID,
        poste_id: POSTE_ID,
        appareil_id: 'WEB',
        mode: 'online',
        source: 'agent-web'
      }
    );

    // 5. Afficher le succès
    const typeAcces = billet.type_acces || '';
    const dateAcces = billet.date_acces || '';

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      'success'
    );

    input.value = '';
    chargerNombreBillets(); // mettre à jour le compteur

  } catch (err) {
    console.error('Erreur lors de la vérification :', err);
    showMessage("Erreur lors de la vérification (voir console).", 'error');
  }
}

// =====================================
//  Initialisation des événements
// =====================================

document.addEventListener('DOMContentLoaded', () => {
  const btn = $('validateBtn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  const input = $('ticketNumber');
  if (input) {
    input.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        verifierBillet();
      }
    });
  }

  chargerNombreBillets();
});
