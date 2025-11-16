// --- Configuration ---
const ADMIN_PASSWORD = "hafia2025"; // change le mot de passe ici
const STORAGE_KEY = "billets_centre_loisirs";    // billets importés
const VALIDATION_KEY = "billets_validations";    // journal des validations

// --- Utilitaires stockage ---
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

function updateTicketCount() {
  const el = document.getElementById("ticketCount");
  if (el) el.textContent = loadTickets().length;
}

// --- Parser CSV ---
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

// --- Export validations CSV ---
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

// --- Statistiques par jour ---
function getUniqueDates() {
  const tickets = loadTickets();
  const set = new Set();
  tickets.forEach(t => {
    if (t.date_acces) set.add(t.date_acces);
  });
  return Array.from(set).sort(); // tri alphabétique (suffisant pour nos dates texte)
}

function populateDateFilter() {
  const select = document.getElementById("dateFilter");
  if (!select) return;

  const dates = getUniqueDates();
  select.innerHTML = "";

  if (dates.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Aucune date (pas de billets)";
    select.appendChild(opt);
    return;
  }

  dates.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  });
}

function refreshStatsForSelectedDate() {
  const select = document.getElementById("dateFilter");
  const statsBox = document.getElementById("statsBox");
  const validatedList = document.getElementById("validatedList");
  if (!select || !statsBox || !validatedList) return;

  const selected = select.value;
  const tickets = loadTickets().filter(t => t.date_acces === selected);
  const validations = loadValidations().filter(v => v.date_acces === selected);

  if (!selected || tickets.length === 0) {
    statsBox.innerHTML = "<em>Aucun billet pour cette date.</em>";
    validatedList.innerHTML = "";
    return;
  }

  const total = tickets.length;
  const validatedCount = tickets.filter(t =>
    (t.statut || "").toLowerCase().startsWith("valid")
  ).length;
  const nonUsed = total - validatedCount;

  statsBox.innerHTML = `
    <p><strong>Date :</strong> ${selected}</p>
    <p>Total billets émis : <strong>${total}</strong></p>
    <p>Billets validés : <strong>${validatedCount}</strong></p>
    <p>Billets non utilisés : <strong>${nonUsed}</strong></p>
  `;

  // Liste des billets validés (limité à 100 pour éviter un pavé énorme)
  if (validatedCount === 0) {
    validatedList.innerHTML = "<em>Aucun billet validé pour cette date.</em>";
  } else {
    let html = "<table style='width:100%;font-size:0.85rem;border-collapse:collapse;'>";
    html += "<thead><tr><th style='text-align:left;'>N° billet</th><th style='text-align:left;'>Type</th><th style='text-align:left;'>Heure validation</th></tr></thead><tbody>";

    const byNum = new Map();
    validations.forEach(v => {
      byNum.set(v.numero_billet, v);
    });

    tickets
      .filter(t => (t.statut || "").toLowerCase().startsWith("valid"))
      .forEach(t => {
        const v = byNum.get(t.numero_billet);
        const dateVal = v ? new Date(v.date_validation).toLocaleTimeString() : "-";
        html += `<tr>
          <td>${t.numero_billet}</td>
          <td>${t.type_acces || "-"}</td>
          <td>${dateVal}</td>
        </tr>`;
      });

    html += "</tbody></table>";
    validatedList.innerHTML = html;
  }
}

// --- Initialisation de l'interface admin (une fois connecté) ---
function initAdminUI() {
  const csvFileInput = document.getElementById("csvFileInput");
  const btnImport = document.getElementById("btnImport");
  const importStatus = document.getElementById("importStatus");
  const btnClear = document.getElementById("btnClear");
  const ticketNumberInput = document.getElementById("ticketNumberInput");
  const btnCheck = document.getElementById("btnCheck");
  const checkResult = document.getElementById("checkResult");
  const btnExport = document.getElementById("btnExport");
  const btnRefreshStats = document.getElementById("btnRefreshStats");

  updateTicketCount();
  populateDateFilter();
  refreshStatsForSelectedDate();

  // Import CSV
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
        localStorage.removeItem(VALIDATION_KEY); // on remet les validations à zéro pour la nouvelle semaine
        updateTicketCount();
        populateDateFilter();
        refreshStatsForSelectedDate();
        importStatus.textContent = `Import réussi : ${tickets.length} billets chargés.`;
      } catch (err) {
        console.error(err);
        importStatus.textContent = "Erreur lors de l'import du fichier.";
      }
    };
    reader.readAsText(file, "UTF-8");
  });

  // Effacer billets + validations
  btnClear.addEventListener("click", () => {
    if (confirm("Effacer tous les billets et validations stockés dans ce navigateur ?")) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VALIDATION_KEY);
      updateTicketCount();
      populateDateFilter();
      refreshStatsForSelectedDate();
      checkResult.textContent = "";
      checkResult.className = "result";
      importStatus.textContent = "Billets et validations effacés du stockage local.";
    }
  });

  // Vérification test
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

    if (statut.startsWith("valid")) {
      checkResult.innerHTML = `
        Billet <strong>${ticket.numero_billet}</strong> trouvé.<br />
        <strong>ATTENTION :</strong> ce billet est déjà validé.<br />
        Type : ${ticket.type_acces || "-"} – Date : ${ticket.date_acces || "-"}.
      `;
      checkResult.classList.add("warn");
      return;
    }

    ticket.statut = "Validé";
    const now = new Date();
    saveTickets(tickets);

    const validations = loadValidations();
    validations.push({
      numero_billet: ticket.numero_billet,
      date_acces: ticket.date_acces,
      type_acces: ticket.type_acces,
      date_validation: now.toISOString()
    });
    saveValidations(validations);

    checkResult.innerHTML = `
      Billet <strong>${ticket.numero_billet}</strong> VALIDÉ (test admin) !<br />
      Type : ${ticket.type_acces || "-"}<br />
      Date d'accès : ${ticket.date_acces || "-"}<br />
      Heure de validation : ${now.toLocaleString()}
    `;
    checkResult.classList.add("ok");

    refreshStatsForSelectedDate();
  });

  // Export validations
  btnExport.addEventListener("click", exportValidationsCSV);

  // Stats pour la date choisie
  btnRefreshStats.addEventListener("click", refreshStatsForSelectedDate);
  document.getElementById("dateFilter").addEventListener("change", refreshStatsForSelectedDate);
}

// --- Gestion du login admin ---
document.addEventListener("DOMContentLoaded", () => {
  const loginBox = document.getElementById("adminLogin");
  const adminContent = document.getElementById("adminContent");
  const btnLogin = document.getElementById("btnLogin");
  const adminPass = document.getElementById("adminPass");
  const loginMsg = document.getElementById("loginMsg");

  adminContent.style.display = "none";

  btnLogin.addEventListener("click", () => {
    const pass = adminPass.value.trim();
    if (pass === ADMIN_PASSWORD) {
      loginBox.style.display = "none";
      adminContent.style.display = "block";
      initAdminUI();
    } else {
      loginMsg.textContent = "Mot de passe incorrect.";
      loginMsg.classList.add("error");
    }
  });
});
