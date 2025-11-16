const ADMIN_PASSWORD = "admin26!"; 

const STORAGE_KEY = "billets_centre_loisirs";
const VALIDATION_KEY = "billets_validations";

// Charger billets
function loadTickets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

// Sauver billets
function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function updateTicketCount() {
  document.getElementById("ticketCount").textContent = loadTickets().length;
}

// Charger validations
function loadValidations() {
  const raw = localStorage.getItem(VALIDATION_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

// Exporter les validations
function exportValidationsCSV() {
  const rows = loadValidations();
  if (rows.length === 0) {
    alert("Aucune validation enregistrée.");
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
  a.click();

  URL.revokeObjectURL(url);
}

// Parser CSV importé
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase());

  const tickets = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter);
    if (cols.length < 1) continue;

    const ticket = {};
    headers.forEach((h, idx) => ticket[h] = cols[idx] || "");

    tickets.push(ticket);
  }

  return tickets;
}

document.addEventListener("DOMContentLoaded", () => {

  // Mot de passe admin
  const pwd = prompt("Mot de passe administrateur :");
  if (pwd !== ADMIN_PASSWORD) {
    document.body.innerHTML = "<p style='padding:20px;font-size:1.2rem;'>Accès refusé.</p>";
    return;
  }

  // Afficher contenu
  document.getElementById("adminContent").style.display = "block";
  updateTicketCount();

  // Import CSV
  document.getElementById("btnImport").onclick = () => {
    const file = document.getElementById("csvFileInput").files[0];
    if (!file) return alert("Choisissez un fichier CSV.");

    const reader = new FileReader();
    reader.onload = (e) => {
      const tickets = parseCSV(e.target.result);
      saveTickets(tickets);
      updateTicketCount();
      document.getElementById("importStatus").textContent = `Import réussi : ${tickets.length} billets chargés.`;
    };
    reader.readAsText(file, "UTF-8");
  };

  // Effacer stockage
  document.getElementById("btnClear").onclick = () => {
    if (!confirm("Effacer tous les billets et validations ?")) return;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(VALIDATION_KEY);
    updateTicketCount();
    alert("Stockage vidé !");
  };

  // Export validations
  document.getElementById("btnExport").onclick = () => {
    exportValidationsCSV();
  };
});
