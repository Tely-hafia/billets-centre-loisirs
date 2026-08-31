(function initCalypsoAppwrite(global) {
  "use strict";

  if (typeof global.Appwrite === "undefined") {
    throw new Error("Le SDK Appwrite n'est pas chargé.");
  }

  if (!global.CalypsoConfig) {
    throw new Error("La configuration Appwrite n'est pas chargée.");
  }

  const client = new global.Appwrite.Client();
  client
    .setEndpoint(global.CalypsoConfig.endpoint)
    .setProject(global.CalypsoConfig.projectId);

  global.CalypsoAppwrite = Object.freeze({
    client,
    account: new global.Appwrite.Account(client),
    teams: new global.Appwrite.Teams(client),
    databases: new global.Appwrite.Databases(client)
  });
})(window);
