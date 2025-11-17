// =====================================
//  Configuration Appwrite
// =====================================

// ⚠️ Laisse ces valeurs si elles sont déjà correctes.
// Sinon adapte avec tes vrais IDs de projet / base / tables.

const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";
const APPWRITE_ETUDIANTS_TABLE_ID = "etudiants";

// Identifiants simples pour la phase test
const AGENT_ID = "AGENT_TEST";
const POSTE_ID = "POSTE_PRINCIPAL";

// =====================================
//  Initialisation du client Appwrite
// =====================================

const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const databases = new Appwrite.Databases(client);

// =====================================
//  Cache local des billets
// =====================================

let billetsMap = new Map(); // clé = numero_billet, valeur = billet

function $(id) {
  return document.getElementById(id);
}

function setTicketCount(n) {
  const el = $("ticketCount");
  if (el) el.textContent = n.toString();
}

function showMessage(text, type = "info") {
  const zone = $("result-message");
  if (!zone) {
    alert(text);
    return;
  }

  zone.textContent = text;
  zone.className = "message"; // reset
  zone.classList.add(`message-${type}`); // message-info / -success / -error (à styliser)
}

// Sauvegarde locale (optionnel, pour un peu d'offline)
function sauvegarderBilletsLocaux(billets) {
  try {
    localStorage.setItem("billets_cache", JSON.stringify(billets));
  } catch (e) {
    console.warn("Impossible de sauvegarder les billets localement :", e);
  }
}

function chargerBilletsLocaux() {
  try {
    const raw = localStorage.getItem("billets_cache");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Impossible de lire les billets locaux :", e);
    return [];
  }
}

// =====================================
//  Chargement des billets depuis Appwrite
// =====================================

async function chargerBilletsDepuisAppwrite() {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.limit(10000)]
    );

    const docs = res.documents || [];

    const billets = docs.map((doc) => ({
      id: doc.$id,
      numero_billet: doc.numero_billet,
      date_acces: doc.date_acces,
      type_acces: doc.type_acces,
      prix: doc.prix,
      tarif_universite: doc.tarif_universite,
      statut: doc.statut,
      semaine_code: doc.semaine_code
    }));

    billetsMap = new Map();
    billets.forEach((b) => {
      if (b.numero_billet) billetsMap.set(b.numero_billet, b);
    });

    sauvegarderBilletsLocaux(billets);
    setTicketCount(billets.length);

    console.log("[AGENT] Billets chargés depuis Appwrite :", billets.length);
  } catch (err) {
    console.error("[AGENT] Erreur chargement billets Appwrite :", err);
    // On retombe sur le cache local
    const billets = chargerBilletsLocaux();
    billetsMap = new Map();
    billets.forEach((b) => {
      if (b.numero_billet) billetsMap.set(b.numero_billet, b);
    });
    setTicketCount(billets.length);
  }
}

// =====================================
//  Vérification d'un étudiant
// =====================================

async function verifierEtudiant(numeroEtudiant) {
  try {
    const res = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_ETUDIANTS_TABLE_ID,
      [
        Appwrite.Query.equal("numero_etudiant", [numeroEtudiant]),
        Appwrite.Query.limit(1)
      ]
    );

    if (!res.documents || res.documents.length === 0) {
      return null;
    }

    return res.documents[0];
  } catch (err) {
    console.error("[AGENT] Erreur recherche étudiant :", err);
    return null;
  }
}

// =====================================
//  Validation d'un billet
// =====================================

async function verifierBillet() {
  const inputBillet = $("ticketNumber");
  if (!inputBillet) {
    alert("Champ ticketNumber introuvable dans la page.");
    return;
  }

  const numero = inputBillet.value.trim();

  // Tarif sélectionné
  const radiosTarif = document.querySelectorAll('input[name="tarif"]');
  let tarifApplique = "normal";
  radiosTarif.forEach((r) => {
    if (r.checked) tarifApplique = r.value;
  });

  const inputEtudiant = $("studentNumber");
  const numeroEtudiant = inputEtudiant ? inputEtudiant.value.trim() : "";

  if (!numero) {
    showMessage("Veuillez saisir un numéro de billet.", "error");
    return;
  }

  if (tarifApplique === "etudiant" && !numeroEtudiant) {
    showMessage(
      "Impossible d'appliquer un tarif étudiant sans numéro étudiant.",
      "error"
    );
    return;
  }

  showMessage("Vérification en cours...", "info");

  try {
    // 1. Rechercher le billet dans le cache (alimenté par Appwrite)
    const billet = billetsMap.get(numero);
    if (!billet) {
      showMessage(`Billet ${numero} introuvable.`, "error");
      return;
    }

    if (billet.statut === "Validé") {
      showMessage(`Billet ${numero} déjà VALIDÉ ❌`, "error");
      return;
    }

    // 2. Si tarif étudiant, vérifier l'étudiant dans Appwrite
    let etuDoc = null;
    if (tarifApplique === "etudiant") {
      etuDoc = await verifierEtudiant(numeroEtudiant);
      if (!etuDoc) {
        showMessage(
          `Numéro étudiant ${numeroEtudiant} introuvable. Tarif étudiant refusé.`,
          "error"
        );
        return;
      }
    }

    // 3. Déterminer les montants
    const tarifNormal = parseInt(billet.prix || 0, 10) || 0;
    const tarifEtudiant = parseInt(billet.tarif_universite || 0, 10) || 0;

    let montantPaye = tarifNormal;
    if (tarifApplique === "etudiant") {
      montantPaye = tarifEtudiant;
    }

    // 4. Mettre à jour localement le billet
    billet.statut = "Validé";
    billetsMap.set(numero, billet);
    sauvegarderBilletsLocaux(Array.from(billetsMap.values()));

    const typeAcces = billet.type_acces || "";
    const dateAcces = billet.date_acces || "";

    showMessage(
      `Billet ${numero} VALIDÉ ✅ (${typeAcces} – ${dateAcces})`,
      "success"
    );

    inputBillet.value = "";
    if (inputEtudiant) inputEtudiant.value = "";

    // 5. Mettre à jour le billet dans Appwrite (statut = Validé)
    try {
      if (billet.id) {
        await databases.updateDocument(
          APPWRITE_DATABASE_ID,
          APPWRITE_BILLETS_TABLE_ID,
          billet.id,
          {
            statut: "Validé"
          }
        );
        console.log("[AGENT] Billet mis à jour dans Appwrite :", numero);
      } else {
        console.warn("[AGENT] billet.id manquant pour", numero);
      }
    } catch (err) {
      console.error("[AGENT] ERREUR update billet Appwrite :", err);
    }

    // 6. Enregistrer la validation dans la table "validations"
    try {
      const nowIso = new Date().toISOString();

      const dataValidation = {
        numero_billet: numero,
        billet_id: billet.id || "",
        date_validation: nowIso,
        type_acces: typeAcces,
        tarif_normal: tarifNormal,
        tarif_etudiant: tarifEtudiant,
        tarif_applique: tarifApplique,
        montant_paye: montantPaye,
        agent_id: AGENT_ID,
        poste_id: POSTE_ID,
        numero_etudiant:
          tarifApplique === "etudiant" ? numeroEtudiant : "" // obligatoire côté logique, pas côté schéma
      };

      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_VALIDATIONS_TABLE_ID,
        Appwrite.ID.unique(),
        dataValidation
      );

      console.log("[AGENT] Validation enregistrée dans Appwrite :", dataValidation);
    } catch (err) {
      console.error("[AGENT] ERREUR validation Appwrite :", err);
      // On n'empêche pas l'entrée (le billet est déjà valide), mais on logue l'erreur
    }
  } catch (err) {
    console.error("[AGENT] Erreur lors de la vérification :", err);
    showMessage("Erreur lors de la vérification (voir console).", "error");
  }
}

// =====================================
//  Initialisation des événements
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  // Afficher / cacher le champ "numéro étudiant" selon le tarif
  const radiosTarif = document.querySelectorAll('input[name="tarif"]');
  const studentRow = $("studentRow");

  radiosTarif.forEach((r) => {
    r.addEventListener("change", () => {
      if (studentRow) {
        if (r.value === "etudiant" && r.checked) {
          studentRow.style.display = "flex";
        } else if (r.value === "normal" && r.checked) {
          studentRow.style.display = "none";
        }
      }
    });
  });

  // Bouton "Valider"
  const btn = $("validateBtn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      verifierBillet();
    });
  }

  // Validation avec Entrée dans le champ billet
  const input = $("ticketNumber");
  if (input) {
    input.addEventListener("keyup", (e) => {
      if (e.key === "Enter") {
        verifierBillet();
      }
    });
  }

  // Charger les billets au démarrage
  chargerBilletsDepuisAppwrite();
});
