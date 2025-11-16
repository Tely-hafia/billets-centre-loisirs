// =====================================
//  AGENT – Appwrite + cache local
// =====================================

const LOCAL_STORAGE_KEY = 'billets_centre_loisirs';

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6919c99200348d6d8afe';
const APPWRITE_DATABASE_ID = '6919ca20001ab6e76866';
const APPWRITE_BILLETS_TABLE_ID = 'billets';
const APPWRITE_VALIDATIONS_TABLE_ID = 'validations';

const AGENT_ID = 'AGENT_TEST';
const POSTE_ID = 'POSTE_PRINCIPAL';

// --- Appwrite client ---
const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const databases = new Appwrite.Databases(client);

let billetsMap = new Map();

// --- Helpers DOM ---
function $(id) {
  return document.getElementById(id);
}

function showMessage(text, type = 'info') {
  const zone = $('result-message');
  if (!zone) {
    alert(text);
    return;
  }
  zone.textContent = text;
  zone.className = 'message';
  zone.classList.add(`message-${type}`);
}

function setTicketCount(n) {
  const el = $('ticketCount');
  if (el) el.textContent = n.toString();
}

// --- Cache local ---
function chargerBilletsDepuisLocal() {
  const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Erreur parse billets localStorage', e);
    return [];
  }
}

function sauvegarderBilletsLocaux(billets) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(billets));
}

// --- Initialisation billets à partir du cache ---
function initialiserBilletsDepuisLocal() {
  const billets = chargerBilletsDepuisLocal();
  billetsMap = new Map();
  for (const b of billets) {
    billetsMap.set(b.numero_billet, b);
  }
  console.log('[AGENT] Billets en cache local :', billetsMap.size);
  setTicketCount(billetsMap.size);
}

// --- Synchro depuis Appwrite ---
async function synchroniserBilletsDepuisServeur() {
  console.log('[AGENT] Synchronisation depuis Appwrite…');

  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const docs = res.documents || [];
    console.log('[AGENT] Billets reçus depuis Appwrite :', docs.length);

    const billets = docs.map(doc => ({
      numero_billet: doc.numero_billet,
      date_acces: doc.date_acces,
      type_acces: doc.type_acces,
      prix: doc.prix,
      tarif_universite: doc.tarif_universite,
      statut: doc.statut,
      semaine_code: doc.semaine_code
    }));

    sauvegarderBilletsLocaux(billets);

    billetsMap = new Map();
    for (const b of billets) {
      billetsMap.set(b.numero_billet, b);
    }

    setTicketCount(billetsMap.size);
    console.log('[AGENT] Billets disponibles après synchro :', billetsMap.size);

  } catch (err) {
    console.error('[AGENT] ERREUR synchro billets depuis Appwrite :', err);
    showMessage("Impossible de synchroniser les billets depuis le serveur (mode cache).", 'error');
  }
}

// --- Vérification d'un billet ---
async function verifierBillet() {
  const input = $('ticketNumber');
  if (!input) {
    alert("Champ ticketNumber introuvable.");
    return;
  }

  const numero = input.value.trim();
  if (!numero) {
    showMessage("Veuillez saisir un numéro de billet.", 'error');
    return;
  }

  const billet = billetsMap.get(numero);

  if (!billet) {
    showMessage(`Billet ${numero} introuvable dans les billets chargés.`, 'error');
    return;
  }

  if (billet.statut === 'Validé') {
    showMessage(`Billet ${numero} déjà VALIDÉ ❌`, 'error');
    return;
  }

  // MAJ locale
  billet.statut = 'Validé';
  billetsMap.set(numero, billet);
  sauvegarderBilletsLocaux(Array.from(billetsMap.values()));

  showMessage(
    `Billet ${numero} VALIDÉ ✅ (${billet.type_acces || ''} – ${billet.date_acces || ''})`,
    'success'
  );

  input.value = '';

  // Envoi de la validation à Appwrite (si réseau OK)
  try {
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
    console.log('[AGENT] Validation envoyée à Appwrite pour', numero);
  } catch (err) {
    console.error('[AGENT] ERREUR envoi validation Appwrite :', err);
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  console.log('[AGENT] Script agent-appwrite chargé, DOM prêt.');

  // 1) lire le cache local
  initialiserBilletsDepuisLocal();

  // 2) tenter la synchro Appwrite
  synchroniserBilletsDepuisServeur();

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
});
