// --- Clés de stockage local ---
const STORAGE_KEY = "billets_centre_loisirs";    // billets importés
const VALIDATION_KEY = "billets_validations";    // journal des validations

// --- Chargement / sauvegarde des billets ---

function loadTickets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Erreur de lecture des billets :", e);
    return [];
  }
}

function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function updateTicketCount() {
  document.getElementById("ticketCount").textContent = loadTickets().length;
}

// --- Chargement / sauvegarde des validations ---

function loadValidations() {
  const raw = localStorage.getItem(VALIDATION_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Erreur de lecture des validations :", e);
    return [];
  }
}

function saveValidations(list) {
  localStorage.setItem(VALIDATION_KEY, JSON.stringify(list));
}

// --- Parser le CSV exporté depuis Excel ---
// Colonnes attendues :
// numero_billet,date_acces,type_acces,prix,tarif_universite,statut

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());

  const tickets = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(delimiter).map(c => c.trim());
    const obj = {};

    headers.forEach((h, idx) => {
      obj[h] = cols[idx] || "";
    });

    if (!obj["numero_billet"]) continue;

    tickets.push({
      numero_billet: obj["numero_billet"],
      date_acces: obj["date_acces"] || "",
      type_acces: obj["type_acces"] || "",
      prix: obj["prix"] || "",
      tarif_universite: obj["tarif_universite"] || "",
      statut: obj["statut"] || "Non utilisé"
    });
  }

  return tickets;
}

// --- Export des validations en CSV ---

function exportValidationsCSV() {
  const rows = loadValidations();
  if (rows.length === 0) {
    alert("Aucune validation enregistrée sur ce navigateur.");
    return;
  }

  let csv = "numero_billet,date_acces,type_acces,date_validation\n";
  rows.forEach(r => {
    csv += `${r.numero_billet},${r.date_acces},${r.type_acces},${r.date_validation}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "validations.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

// --- Code exécuté au chargement de la page ---

document.addEventListener("DOMContentLoaded", () => {
  const csvFileInput = document.getElementById("csvFileInput");
  const btnImport = document.getElementById("btnImport");
  const importStatus = document.getElementById("importStatus");
  const btnClear = document.getElementById("btnClear");
  const ticketNumberInput = document.getElementById("ticketNumberInput");
  const btnCheck = document.getElementById("btnCheck");
  const checkResult = document.getElementById("checkResult");
  const btnExport = document.getElementById("btnExport");

  // Mise à jour du compteur au démarrage
  updateTicketCount();

  // --- Import CSV ---
  btnImport.addEventListener("click", () => {
    const file = csvFileInput.files[0];
    if (!file) {
      importStatus.textContent = "Veuillez sélectionner un fichier CSV.";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const tickets = parseCSV(content);
        saveTickets(tickets);
        updateTicketCount();
        importStatus.textContent = `Import réussi : ${tickets.length} billets chargés.`;
      } catch (err) {
        console.error(err);
        importStatus.textContent = "Erreur lors de l'import du fichier.";
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  // --- Effacer billets + validations ---
  btnClear.addEventListener("click", () => {
    if (confirm("Effacer tous les billets et validations stockés dans ce navigateur ?")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VALIDATION_KEY);
      updateTicketCount();
      checkResult.textContent = "";
      checkResult.className = "result";
      importStatus.textContent = "Billets et validations effacés du stockage local.";
    }
  });

  // --- Vérifier / valider un billet ---
  btnCheck.addEventListener("click", () => {
    const num = ticketNumberInput.value.trim();
    checkResult.className = "result";

    if (!num) {
      checkResult.textContent = "Veuillez saisir un numéro de billet.";
      checkResult.classList.add("error");
      return;
    }

    const tickets = loadTickets();
    if (tickets.length === 0) {
      checkResult.textContent = "Aucun billet chargé. Importez d'abord un fichier CSV.";
      checkResult.classList.add("error");
      return;
    }

    const ticket = tickets.find(t => t.numero_billet === num);

    if (!ticket) {
      checkResult.textContent = `Billet ${num} introuvable.`;
      checkResult.classList.add("error");
      return;
    }

    const statut = (ticket.statut || "").toLowerCase();

    // --- Cas déjà validé ---
    if (statut === "validé" || statut === "valide") {
      checkResult.innerHTML = `
        Billet <strong>${ticket.numero_billet}</strong> trouvé.<br />
        <strong>ATTENTION :</strong> ce billet est déjà validé.<br />
        Type : ${ticket.type_acces || "-"} – Date : ${ticket.date_acces || "-"}.
      `;
      checkResult.classList.add("warn");
      return;
    }

    // --- Validation du billet (première fois) ---
    ticket.statut = "Validé";

    // Mise à jour du tableau principal
    saveTickets(tickets);

    // Ajout au journal de validations
    const now = new Date();
    const validations = loadValidations();
    validations.push({
      numero_billet: ticket.numero_billet,
      date_acces: ticket.date_acces,
      type_acces: ticket.type_acces,
      date_validation: now.toISOString()
    });
    saveValidations(validations);

    // Affichage
    checkResult.innerHTML = `
      Billet <strong>${ticket.numero_billet}</strong> VALIDÉ !<br />
      Type : ${ticket.type_acces || "-"}<br />
      Date d'accès : ${ticket.date_acces || "-"}<br />
      Heure de validation : ${now.toLocaleString()}
    `;
    checkResult.classList.add("ok");
  });

  // --- Exporter les validations ---
  btnExport.addEventListener("click", exportValidationsCSV);
});
