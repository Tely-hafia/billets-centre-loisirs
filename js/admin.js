const ADMIN_PASSWORD = "admin26!"; 

const STORAGE_KEY = "billets_centre_loisirs";
const VALIDATION_KEY = "billets_validations";

// ---- Utilitaires stockage ----

function loadTickets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function loadValidations() {
  const raw = localStorage.getItem(VALIDATION_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function updateTicketCount() {
  const el = document.getElementById("ticketCount");
  if (!el) return;
  el.textContent = loadTickets().length;
}

// ---- Export des validations ----

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

// ---- Parser CSV des billets ----
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

// ---- Résumé du jour ----

function renderDailySummary(dateStr) {
  const resumeContent = document.getElementById("resumeContent");
  if (!resumeContent) return;

  const validations = loadValidations();
  const tickets = loadTickets();

  if (!validations.length) {
    resumeContent.innerHTML = "Aucune validation enregistrée.";
    return;
  }

  // Filtre sur date de validation (YYYY-MM-DD)
  let filtered = validations;
  if (dateStr) {
    filtered = validations.filter(v => {
      const d = (v.date_validation || "").slice(0, 10);
      return d === dateStr;
    });
  }

  if (!filtered.length) {
    resumeContent.innerHTML = "Aucune validation pour cette date.";
    return;
  }

  let total = 0;
  const perType = {};

  filtered.forEach(v => {
    total++;
    const t = tickets.find(tt => tt.numero_billet === v.numero_billet);
    const type = v.type_acces || (t ? t.type_acces : "Type inconnu");

    if (!perType[type]) {
      perType[type] = { count: 0, totalPrix: 0, totalUniv: 0 };
    }
    perType[type].count++;

    if (t) {
      const prix = Number(String(t.prix).replace(",", ".")) || 0;
      const univ = Number(String(t.tarif_universite).replace(",", ".")) || 0;
      perType[type].totalPrix += prix;
      perType[type].totalUniv += univ;
    }
  });

  let rowsHtml = "";
  Object.keys(perType).forEach(type => {
    const info = perType[type];
    rowsHtml += `
      <tr>
        <td>${type}</td>
        <td>${info.count}</td>
        <td>${info.totalPrix}</td>
        <td>${info.totalUniv}</td>
      </tr>
    `;
  });

  resumeContent.innerHTML = `
    <p><strong>Total billets validés :</strong> ${total}</p>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Type d'accès</th>
          <th>Nombre</th>
          <th>Total prix</th>
          <th>Total tarif université</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

// ---- Initialisation ----

document.addEventListener("DOMContentLoaded", () => {
  // Mot de passe admin
  const pwd = prompt("Mot de passe administrateur :");
  if (pwd !== ADMIN_PASSWORD) {
    document.body.innerHTML = "<p style='padding:20px;font-size:1.1rem;'>Accès refusé.</p>";
    return;
  }

  // Afficher le contenu
  const main = document.getElementById("adminContent");
  if (main) main.style.display = "block";

  updateTicketCount();

  const btnImport = document.getElementById("btnImport");
  const csvFileInput = document.getElementById("csvFileInput");
  const importStatus = document.getElementById("importStatus");
  const btnClear = document.getElementById("btnClear");
  const btnExport = document.getElementById("btnExport");
  const btnResume = document.getElementById("btnResume");
  const resumeDate = document.getElementById("resumeDate");

  // Import CSV
  if (btnImport) {
    btnImport.onclick = () => {
      const file = csvFileInput.files[0];
      if (!file) {
        alert("Choisissez un fichier CSV.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const tickets = parseCSV(e.target.result);
        saveTickets(tickets);
        updateTicketCount();
        importStatus.textContent = `Import réussi : ${tickets.length} billets chargés.`;
      };
      reader.readAsText(file, "UTF-8");
    };
  }

  // Effacer stockage
  if (btnClear) {
    btnClear.onclick = () => {
      if (!confirm("Effacer tous les billets et validations ?")) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VALIDATION_KEY);
      updateTicketCount();
      alert("Stockage vidé !");
      const resumeContent = document.getElementById("resumeContent");
      if (resumeContent) resumeContent.innerHTML = "";
    };
  }

  // Export validations
  if (btnExport) {
    btnExport.onclick = () => exportValidationsCSV();
  }

  // Résumé du jour
  if (resumeDate && btnResume) {
    // Mettre aujourd'hui par défaut
    const today = new Date().toISOString().slice(0, 10);
    resumeDate.value = today;

    btnResume.onclick = () => {
      const d = resumeDate.value;
      renderDailySummary(d);
    };
  }
});
