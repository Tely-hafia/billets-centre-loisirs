(function initCalypsoTicketWorkflow(global) {
  "use strict";

  const states = Object.freeze({
    AVAILABLE: "available",
    SOLD: "sold",
    CONFIRMED: "confirmed",
    UNKNOWN: "unknown"
  });

  function normalizeStatus(value) {
    const status = String(value || "").trim().toLocaleLowerCase("fr");

    if (["disponible", "non utilisé", "non utilise"].includes(status)) {
      return states.AVAILABLE;
    }

    if (status === "vendu") return states.SOLD;

    if (["entrée confirmée", "entree confirmee", "validé", "valide"].includes(status)) {
      return states.CONFIRMED;
    }

    return states.UNKNOWN;
  }

  function canSell(status) {
    return normalizeStatus(status) === states.AVAILABLE;
  }

  function canConfirm(status) {
    return normalizeStatus(status) === states.SOLD;
  }

  function getSaleRefusal(status) {
    const normalized = normalizeStatus(status);
    if (normalized === states.SOLD) return "Ce billet a déjà été vendu.";
    if (normalized === states.CONFIRMED) return "Ce billet a déjà servi à une entrée.";
    if (normalized === states.UNKNOWN) return "Le statut de ce billet doit être vérifié par l’administrateur.";
    return "";
  }

  function getConfirmationRefusal(status) {
    const normalized = normalizeStatus(status);
    if (normalized === states.AVAILABLE) return "Billet non vendu : entrée refusée.";
    if (normalized === states.CONFIRMED) return "Double utilisation : ce billet a déjà été confirmé.";
    if (normalized === states.UNKNOWN) return "Statut inconnu : contrôle administratif requis.";
    return "";
  }

  function getTicketPrice(ticket, tariff = "normal") {
    if (!ticket) return 0;
    const value = tariff === "etudiant" ? ticket.tarif_universite : ticket.prix;
    const price = Number(value || 0);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  function getCartTotal(items) {
    return (items || []).reduce((total, item) => total + getTicketPrice(item), 0);
  }

  function getCashChange(total, received) {
    const amountDue = Number(total || 0);
    const amountReceived = Number(received);
    if (!Number.isFinite(amountReceived) || amountReceived < amountDue) return null;
    return amountReceived - amountDue;
  }

  global.CalypsoTicketWorkflow = Object.freeze({
    states,
    normalizeStatus,
    canSell,
    canConfirm,
    getSaleRefusal,
    getConfirmationRefusal,
    getTicketPrice,
    getCartTotal,
    getCashChange
  });
})(typeof window !== "undefined" ? window : globalThis);
