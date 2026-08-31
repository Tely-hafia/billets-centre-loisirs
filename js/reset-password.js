(function initResetPasswordPage() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  const secret = params.get("secret");

  function showMessage(text, type = "info") {
    const element = $("resetMessage");
    element.style.display = "block";
    element.className = `message message-${type}`;
    element.textContent = text;
  }

  async function resetPassword() {
    const password = $("newPassword").value;
    const confirmation = $("newPasswordConfirm").value;
    const button = $("btnResetPassword");

    if (!userId || !secret) {
      showMessage("Ce lien de récupération est incomplet ou expiré.", "error");
      return;
    }

    if (password.length < 8) {
      showMessage("Le mot de passe doit contenir au moins 8 caractères.", "error");
      return;
    }

    if (password !== confirmation) {
      showMessage("Les deux mots de passe ne correspondent pas.", "error");
      return;
    }

    button.disabled = true;

    try {
      await CalypsoAppwrite.account.updateRecovery(
        userId,
        secret,
        password,
        confirmation
      );

      showMessage("Mot de passe enregistré. Redirection vers la connexion...", "success");
      window.setTimeout(() => {
        window.location.href = "agent.html";
      }, 1500);
    } catch (error) {
      console.error("[RESET] Erreur mot de passe :", error);
      showMessage(error?.message || "Impossible de modifier le mot de passe.", "error");
      button.disabled = false;
    }
  }

  $("btnResetPassword").addEventListener("click", resetPassword);
})();
