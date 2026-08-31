(function initInvitePage() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const teamId = params.get("teamId");
  const membershipId = params.get("membershipId");
  const userId = params.get("userId");
  const secret = params.get("secret");

  function showMessage(text, type = "info") {
    const element = $("inviteMessage");
    element.style.display = "block";
    element.className = `message message-${type}`;
    element.textContent = text;
  }

  async function acceptInvite() {
    const button = $("btnAcceptInvite");

    if (
      teamId !== CalypsoConfig.staffTeamId ||
      !membershipId ||
      !userId ||
      !secret
    ) {
      showMessage("Ce lien d’invitation est incomplet ou invalide.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Activation en cours...";

    try {
      await CalypsoAppwrite.teams.updateMembershipStatus(
        teamId,
        membershipId,
        userId,
        secret
      );

      showMessage("Invitation acceptée. Votre accès est maintenant activé.", "success");
      $("passwordSetupZone").style.display = "block";
      button.style.display = "none";
    } catch (error) {
      console.error("[INVITE] Erreur activation :", error);
      showMessage(error?.message || "Impossible d’accepter cette invitation.", "error");
      button.disabled = false;
      button.textContent = "Accepter l’invitation";
    }
  }

  async function sendPasswordLink() {
    const email = $("inviteEmail").value.trim();
    const button = $("btnSendPasswordLink");

    if (!email) {
      showMessage("Veuillez saisir l’adresse e-mail invitée.", "error");
      return;
    }

    button.disabled = true;

    try {
      const resetUrl = new URL("reset-password.html", window.location.href).toString();
      await CalypsoAppwrite.account.createRecovery(email, resetUrl);
      showMessage(
        "Le lien de création du mot de passe a été envoyé. Consultez votre e-mail.",
        "success"
      );
    } catch (error) {
      console.error("[INVITE] Erreur récupération :", error);
      showMessage(error?.message || "Impossible d’envoyer le lien.", "error");
      button.disabled = false;
    }
  }

  $("btnAcceptInvite").addEventListener("click", acceptInvite);
  $("btnSendPasswordLink").addEventListener("click", sendPasswordLink);
})();
