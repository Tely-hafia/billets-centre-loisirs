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
      reservations: "reservation"
    }),
    staffRoles: Object.freeze({
      admin: "admin",
      billets: "billets",
      resto: "resto"
    })
  });
})(window);
