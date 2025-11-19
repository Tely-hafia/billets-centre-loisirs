cconsole.log("[AGENT] agent-appwrite.js chargé");

// =======================================
// CONFIG APPWRITE
// =======================================
const APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6919c99200348d6d8afe";
const APPWRITE_DATABASE_ID = "6919ca20001ab6e76866";

const APPWRITE_BILLETS_TABLE_ID = "billets";                 // billets entrée
const APPWRITE_BILLETS_INTERNE_TABLE_ID = "billets_interne"; // billets jeux
const APPWRITE_VALIDATIONS_TABLE_ID = "validations";         // validations
const APPWRITE_PRODUITS_TABLE_ID = "produits_resto";         // resto/chicha

// =======================================
// INIT SDK
// =======================================
const client = new Appwrite.Client();
client.setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);

const db = new Appwrite.Databases(client);
const acc = new Appwrite.Account(client);

// =======================================
// Helpers DOM
// =======================================
function $(id) {
  return document.getElementById(id);
}

function showResult(msg, type) {
  const zone = $("result-message");
  zone.style.display = "block";
  zone.className = "result " + type;
  zone.textContent = msg;
}

function showResto(msg, type) {
  const zone = $("restoResult");
  zone.style.display = "block";
  zone.className = "result " + type;
  zone.textContent = msg;
}

function formatGNF(n) {
  return (Number(n) || 0).toLocaleString("fr-FR") + " GNF";
}

// =======================================
// LOGIN AGENT
// =======================================
let currentAgent = null;

$("btnLogin").addEventListener("click", async () => {
  const login = $("agentLogin").value.trim();
  const pass = $("agentPassword").value.trim();

  if (!login || !pass) {
    $("login-message").textContent = "Veuillez remplir tous les champs.";
    $("login-message").className = "message-error";
    return;
  }

  try {
    await acc.createEmailSession(login, pass);
    currentAgent = await acc.get();

    $("agent-connected-name").textContent = currentAgent.name;
    $("agent-connected-role").textContent = currentAgent.prefs?.role || "agent";

    $("card-login").style.display = "none";
    $("app-zone").style.display = "block";

  } catch (err) {
    $("login-message").textContent = "Erreur de connexion.";
    $("login-message").className = "message-error";
  }
});

// =======================================
// LOGOUT
// =======================================
$("btnLogout").addEventListener("click", async () => {
  await acc.deleteSessions();
  location.reload();
});

// =======================================
// MODE (Billets / Resto)
// =======================================
let currentMode = "BILLETS";
$("btnModeBillets").onclick = () => {
  currentMode = "BILLETS";
  $("mode-label").textContent = "Contrôle billets";
  $("mode-billets").style.display = "block";
  $("mode-resto").style.display = "none";
};
$("btnModeResto").onclick = () => {
  currentMode = "RESTO";
  $("mode-label").textContent = "Restauration / Chicha";
  $("mode-billets").style.display = "none";
  $("mode-resto").style.display = "block";
};

// =======================================
// SUBMODE (Entrée / Jeux internes)
// =======================================
let currentBilletsSubMode = "ENTREE";

$("btnBilletsEntree").onclick = () => {
  currentBilletsSubMode = "ENTREE";
  $("btnBilletsEntree").classList.add("active-submode");
  $("btnBilletsJeux").classList.remove("active-submode");

  $("billetsSubHint").textContent =
    "Mode : billets d’entrée (bracelets). Saisir le numéro imprimé sur le bracelet.";
};

$("btnBilletsJeux").onclick = () => {
  currentBilletsSubMode = "JEU";
  $("btnBilletsJeux").classList.add("active-submode");
  $("btnBilletsEntree").classList.remove("active-submode");

  $("billetsSubHint").textContent =
    "Mode : billets JEUX internes. Saisir le numéro imprimé sur le ticket.";
};

// =======================================
// CHARGER PRODUITS RESTO/CHICHA
// =======================================
async function chargerProduits() {
  try {
    const r = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_PRODUITS_TABLE_ID,
      [Appwrite.Query.limit(100)]
    );

    const sel = $("restoProduit");
    sel.innerHTML = "";

    r.documents.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.$id;
      opt.textContent = `${p.nom} – ${formatGNF(p.prix)}`;
      opt.dataset.prix = p.prix;
      sel.appendChild(opt);
    });

  } catch (err) {
    showResto("Erreur chargement produits.", "error");
  }
}

chargerProduits();

// =======================================
// AFFICHAGE MONTANT RESTO
// =======================================
$("restoProduit").onchange = () => {
  const opt = $("restoProduit").selectedOptions[0];
  if (!opt) return;

  const prix = Number(opt.dataset.prix || 0);
  const qte = Number($("restoQuantite").value || 1);
  $("restoMontant").textContent = "Montant : " + formatGNF(prix * qte);
};

$("restoQuantite").oninput = () => $("restoProduit").onchange();

// =======================================
// ENREGISTRER VENTE RESTO
// =======================================
$("btnRestoVente").onclick = async () => {
  const opt = $("restoProduit").selectedOptions[0];
  if (!opt) {
    showResto("Choisissez un produit.", "error");
    return;
  }

  const prix = Number(opt.dataset.prix || 0);
  const qte = Number($("restoQuantite").value || 1);

  try {
    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: "",
        billet_id: "",
        date_validation: new Date().toISOString(),
        type_acces: "RESTO",
        type_billet: opt.textContent,
        tarif_normal: prix,
        tarif_etudiant: 0,
        montant_paye: prix * qte,
        tarif_applique: "normal",
        agent_id: currentAgent.$id,
        poste_id: "RESTO",
        numero_etudiant: "",
        code_offre: ""
      }
    );

    showResto("Vente enregistrée ✔", "success");
  } catch (err) {
    showResto("Erreur enregistrement vente.", "error");
  }
};

// =======================================
// VALIDATION DES BILLETS
// =======================================
$("btnCheckTicket").onclick = verifierBillet;

async function verifierBillet() {
  const numero = $("ticketNumber").value.trim();

  if (!numero) {
    showResult("Saisir un numéro.", "error");
    return;
  }

  if (currentBilletsSubMode === "ENTREE") {
    return verifierBilletEntree(numero);
  } else {
    return verifierBilletJeu(numero);
  }
}

// =======================================
// 1. BILLET ENTRÉE
// =======================================
async function verifierBilletEntree(numero) {
  try {
    const r = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      [Appwrite.Query.equal("numero_billet", numero)]
    );

    if (r.total === 0) {
      showResult("Billet inconnu ❌", "error");
      return;
    }

    const billet = r.documents[0];

    if (billet.statut === "Validé") {
      showResult("Billet déjà utilisé ❌", "error");
      return;
    }

    const tarif = document.querySelector('input[name="tarif"]:checked').value;

    const montant =
      tarif === "normal"
        ? billet.prix
        : billet.tarif_universite || billet.prix;

    const etu = $("etuNumber").value.trim();

    if (tarif === "etudiant" && !etu) {
      showResult("Numéro étudiant requis.", "error");
      return;
    }

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: numero,
        billet_id: billet.$id,
        date_validation: new Date().toISOString(),
        type_acces: billet.type_acces,
        type_billet: billet.type_acces,
        code_offre: billet.code_offre || "",
        tarif_normal: billet.prix,
        tarif_etudiant: billet.tarif_universite,
        tarif_applique: tarif,
        montant_paye: montant,
        agent_id: currentAgent.$id,
        poste_id: "ENTREE",
        numero_etudiant: etu
      }
    );

    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    showResult("Billet validé ✔", "success");

  } catch (e) {
    showResult("Erreur validation billet (voir console).", "error");
    console.error(e);
  }
}

// =======================================
// 2. BILLET JEUX INTERNES
// =======================================
async function verifierBilletJeu(numero) {
  try {
    const r = await db.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      [Appwrite.Query.equal("numero_billet", numero)]
    );

    if (r.total === 0) {
      showResult("Billet interne inconnu ❌", "error");
      return;
    }

    const billet = r.documents[0];

    if (billet.statut === "Validé") {
      showResult("Billet déjà utilisé ❌", "error");
      return;
    }

    const montant = billet.prix || 0;

    await db.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_VALIDATIONS_TABLE_ID,
      Appwrite.ID.unique(),
      {
        numero_billet: numero,
        billet_id: billet.$id,
        date_validation: new Date().toISOString(),
        type_acces: "JEU",
        type_billet: billet.type_billet,
        tarif_normal: montant,
        tarif_etudiant: 0,
        tarif_applique: "normal",
        montant_paye: montant,
        agent_id: currentAgent.$id,
        poste_id: "INTERNE",
        numero_etudiant: "",
        code_offre: billet.code_offre || ""
      }
    );

    await db.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_BILLETS_INTERNE_TABLE_ID,
      billet.$id,
      { statut: "Validé" }
    );

    showResult("Billet de jeu validé ✔", "success");

  } catch (e) {
    showResult("Erreur lors de la vérification du billet de jeu.", "error");
    console.error(e);
  }
}
