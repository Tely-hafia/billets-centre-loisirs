const STORAGE_KEY = "billets_centre_loisirs";

// --- Charger les billets depuis localStorage ---
function loadTickets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// --- Sauvegarder les billets ---
function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

// --- Mise à jour du compteur ---
function updateTicketCount() {
  document.getElementById("ticketCount").textContent = loadTickets().length;
}

// --- Parser CSV ---
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase());

  const tickets = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = cols[idx] ? cols[idx].trim() : ""));
    if (obj["numero_billet"]) tickets.push(obj);
  }

  return tickets;
}

// --- Au chargement de la page ---
document.addEventListener("DOMContentLoaded", () => {
  updateTicketCount();

  document.getElementById("btnImport").onclick = () => {
    const file = document.getElementById("csvFileInput").files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      const tickets = parseCSV(e.target.result);
      saveTickets(tickets);
      updateTicketCount();
      document.getElementById("importStatus").textContent =
        `${tickets.length} billets importés`;
    };
    reader.readAsText(file);
  };

  document.getElementById("btnClear").onclick = () => {
    localStorage.removeItem(STORAGE_KEY);
    updateTicketCount();
    alert("Billets effacés");
  };

  document.getElementById("btnCheck").onclick = () => {
    const num = document.getElementById("ticketNumberInput").value.trim();
    const resultDiv = document.getElementById("checkResult");
    const tickets = loadTickets();

    if (!num) {
      resultDiv.textContent = "Saisir un numéro de billet.";
      resultDiv.className = "result error";
      return;
    }

    const t = tickets.find(x => x.numero_billet === num);

    if (!t) {
      resultDiv.textContent = "Billet introuvable.";
      resultDiv.className = "result error";
      return;
    }

    if (t.statut?.toLowerCase() === "validé" || t.statut?.toLowerCase() === "valide") {
      resultDiv.textContent = `Billet ${num} déjà validé.`;
      resultDiv.className = "result warn";
    } else {
      resultDiv.textContent = `Billet ${num} VALIDE : ${t.type_acces}`;
      resultDiv.className = "result ok";
    }
  };
});
