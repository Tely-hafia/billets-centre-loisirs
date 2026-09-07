(async function () {
  "use strict";
  if (sessionStorage.getItem("calypso_access_granted") !== "1") {
    window.location.replace("connexion.html");
    return;
  }
  try {
    const admin = await CalypsoAuth.restore([CalypsoConfig.staffRoles.admin]);
    document.getElementById("postStatus").textContent = admin.nom + " — choisissez l’espace à ouvrir.";
    document.getElementById("postLinks").hidden = false;
  } catch (error) {
    document.getElementById("postStatus").textContent = error?.message || "Accès indisponible.";
  }
})();
