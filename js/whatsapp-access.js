(function () {
  "use strict";
  document.getElementById("shareAgentAccess")?.addEventListener("click", () => {
    const phone = document.getElementById("shareAgentPhone").value.replace(/[\s().-]/g, "").replace(/^\+/, "").replace(/^00/, "");
    const message = document.getElementById("shareAgentStatus");
    if (!/^[1-9]\d{7,14}$/.test(phone)) {
      message.textContent = "Saisissez le numéro international complet, par exemple +224…";
      return;
    }
    const url = new URL("connexion.html", window.location.href).href;
    const text = "Bonjour, voici l’accès à votre poste Calypço : " + url + ". Connectez-vous avec votre compte déjà activé. Ne partagez pas votre mot de passe.";
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
    message.textContent = "Le message est préparé dans WhatsApp. Vérifiez le destinataire puis envoyez-le vous-même.";
  });
})();
