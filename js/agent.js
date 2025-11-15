// mêmes clés que côté admin
const STORAGE_KEY = "billets_centre_loisirs";
const VALIDATION_KEY = "billets_validations";

function loadTickets() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
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
  } catch {
    return [];
  }
}

function saveValidations(list) {
  localStorage.setItem(VALIDATION_KEY, JSON.stringify(list));
}

function updateTicketCount() {
  document.getElementById("ticketCount").textContent = loadTickets().length;
}

document.addEventListener("DOMContentLoaded", () => {
  const ticketNumberInput = document.getElementById("ticketNumberInput");
  const btnCheck = document.getElementById("btnCheck");
  const checkResult = document.getElementById("checkResult");

  updateTicketCount();

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
      checkResult.textContent = "Aucun billet chargé sur cet appareil. Demandez à l'administrateur.";
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

    if (statut === "validé" || statut === "valide") {
      checkResult.innerHTML = `
        Billet <strong>${ticket.numero_billet}</strong> trouvé.<br />
        <strong>ATTENTION :</strong> ce billet est déjà validé.<br />
        Type : ${ticket.type_acces || "-"} – Date : ${ticket.date_acces || "-"}.
      `;
      checkResult.classList.add("warn");
      return;
    }

    // Validation du billet
    ticket.statut = "Validé";
    const now = new Date();

    // mettre à jour la liste principale
    saveTickets(tickets);

    // journal de validation
    const validations = loadValidations();
    validations.push({
      numero_billet: ticket.numero_billet,
      date_acces: ticket.date_acces,
      type_acces: ticket.type_acces,
      date_validation: now.toISOString()
    });
    saveValidations(validations);

    // afficher OK
    checkResult.innerHTML = `
      Billet <strong>${ticket.numero_billet}</strong> VALIDÉ !<br />
      Type : ${ticket.type_acces || "-"}<br />
      Date d'accès : ${ticket.date_acces || "-"}<br />
      Heure de validation : ${now.toLocaleString()}
    `;
    checkResult.classList.add("ok");
  });
});
