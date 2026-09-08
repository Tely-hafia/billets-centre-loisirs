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
      mouvementsCaisse: "mouvements_caisse",
      contenuSite: "contenu_site"
    }),
    buckets: Object.freeze({
      // Le forfait gratuit autorise un seul bucket. On réutilise donc le
      // bucket historique du logo pour les médias administrables du site.
      contenuMedia: "69222b6c00245678b63c"
    }),
    staffRoles: Object.freeze({
      admin: "admin",
      gerant: "gerant",
      controle: "controle",
      billets: "billets",
      resto: "resto"
    }),
    paymentMethods: Object.freeze({
      especes: "especes"
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
