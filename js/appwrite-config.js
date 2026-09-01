(function initCalypsoConfig(global) {
  "use strict";

  global.CalypsoConfig = Object.freeze({
    endpoint: "https://fra.cloud.appwrite.io/v1",
    projectId: "6919c99200348d6d8afe",
    databaseId: "6919ca20001ab6e76866",
    staffTeamId: "calypco_staff",
    tables: Object.freeze({
      agents: "agents",
      billets: "billets",
      billetsInterne: "billets_interne",
      validations: "validations",
      etudiants: "etudiants",
      menuResto: "menu_resto",
      ventesResto: "ventes_resto",
      reservations: "reservation",
      sessionsCaisse: "sessions_caisse",
      mouvementsCaisse: "mouvements_caisse"
    }),
    staffRoles: Object.freeze({
      admin: "admin",
      gerant: "gerant",
      controle: "controle",
      billets: "billets",
      resto: "resto"
    }),
    paymentMethods: Object.freeze({
      especes: "especes",
      orangeMoney: "orange_money",
      mtnMoney: "mtn_money"
    }),
    ticketStatuses: Object.freeze({
      disponible: "Disponible",
      vendu: "Vendu",
      confirme: "Entrée confirmée",
      legacyDisponible: "Non utilisé",
      legacyConfirme: "Validé"
    })
  });
})(window);
