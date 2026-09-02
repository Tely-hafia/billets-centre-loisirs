(function initConnexionEquipe() {
  "use strict";

  const ACCESS_KEY = "calypso_access_granted";

  function destinationFor(context) {
    const roles = context?.roles || [];
    if (roles.includes(CalypsoConfig.staffRoles.admin)) return "admin.html";
    if (roles.includes(CalypsoConfig.staffRoles.gerant) || roles.includes(CalypsoConfig.staffRoles.billets)) {
      return "agent.html?poste=billets";
    }
    if (roles.includes(CalypsoConfig.staffRoles.controle)) return "agent.html?poste=controle";
    if (roles.includes(CalypsoConfig.staffRoles.resto)) return "agent.html?poste=resto";
    throw new Error("Aucun poste n’est attribué à ce compte.");
  }

  function showMessage(text, type = "info") {
    const element = document.getElementById("staffLoginMessage");
    if (!element) return;
    element.textContent = text || "";
    element.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#15803d" : "#64748b";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("staffLoginForm");
    const button = document.getElementById("btnStaffLogin");
    sessionStorage.removeItem(ACCESS_KEY);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("staffEmail")?.value.trim() || "";
      const password = document.getElementById("staffPassword")?.value || "";
      if (!email || !password) {
        showMessage("Saisissez votre e-mail et votre mot de passe.", "error");
        return;
      }

      button.disabled = true;
      button.textContent = "Connexion…";
      showMessage("Vérification du compte…");
      try {
        const context = await CalypsoAuth.login(email, password, []);
        const destination = destinationFor(context);
        sessionStorage.setItem(ACCESS_KEY, "1");
        showMessage("Connexion réussie. Ouverture de votre poste…", "success");
        window.location.assign(destination);
      } catch (error) {
        console.error("[CONNEXION] Échec :", error);
        const limited = error?.code === 429 || /rate limit/i.test(error?.message || "");
        showMessage(
          limited
            ? "Trop de tentatives rapprochées. Attendez quelques minutes, puis réessayez une seule fois."
            : error?.message || "Connexion impossible.",
          "error"
        );
      } finally {
        button.disabled = false;
        button.textContent = "Se connecter";
      }
    });
  });
})();
