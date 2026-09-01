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

  global.CalypsoTicketWorkflow = Object.freeze({
    states,
    normalizeStatus,
    canSell,
    canConfirm,
    getSaleRefusal,
    getConfirmationRefusal
  });
})(typeof window !== "undefined" ? window : globalThis);
