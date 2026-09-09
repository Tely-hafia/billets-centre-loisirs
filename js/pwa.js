(function initCalypsoPWA() {
  "use strict";

  let installPrompt = null;
  let refreshing = false;
  const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "";
  const isPublicApp = manifestHref.includes("manifest-public.webmanifest");
  const appName = isPublicApp ? "Calypço" : "Calypço Équipe";

  function createStatusBanner() {
    if (document.getElementById("network-status")) return;

    const banner = document.createElement("div");
    banner.id = "network-status";
    banner.className = "network-status";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    document.body.prepend(banner);
  }

  function updateNetworkStatus() {
    const banner = document.getElementById("network-status");
    if (!banner) return;

    if (navigator.onLine) {
      banner.textContent = "Connexion rétablie";
      banner.className = "network-status is-online";
      window.setTimeout(() => banner.classList.remove("is-visible"), 2200);
    } else {
      banner.textContent = "Hors connexion — ventes, validations et administration indisponibles";
      banner.className = "network-status is-offline is-visible";
    }
  }

  function showUpdateBanner(registration) {
    if (document.getElementById("pwa-update")) return;

    const banner = document.createElement("div");
    banner.id = "pwa-update";
    banner.className = "pwa-update";

    const label = document.createElement("span");
    label.textContent = "Une nouvelle version de Calypço est disponible.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-primary";
    button.textContent = "Mettre à jour";
    button.addEventListener("click", () => {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    });

    banner.append(label, button);
    document.body.appendChild(banner);
  }

  function getInstallHost() {
    return document.querySelector(
      "#card-login, #admin-login-card, .pwa-install-host"
    );
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone);
  }

  function showInstallAction() {
    if (!installPrompt || isStandalone() || document.getElementById("btn-install-pwa")) return;

    const host = getInstallHost();
    if (!host) return;

    const panel = document.createElement("div");
    panel.className = "pwa-install-panel";
    panel.id = "pwa-install-action";

    const text = document.createElement("p");
    text.textContent = `Installez ${appName} sur cet appareil pour un accès rapide.`;

    const button = document.createElement("button");
    button.id = "btn-install-pwa";
    button.type = "button";
    button.className = "btn-secondary";
    button.textContent = `Installer ${appName}`;
    button.addEventListener("click", async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      panel.remove();
    });

    panel.append(text, button);
    host.appendChild(panel);
  }

  function showIOSInstallHint() {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = isStandalone();
    const host = getInstallHost();

    if (!isIOS || standalone || !host || document.getElementById("ios-install-hint")) return;

    const hint = document.createElement("p");
    hint.id = "ios-install-hint";
    hint.className = "pwa-ios-hint";
    hint.textContent = `Installer ${appName} sur iPhone : ouvrez Partager puis « Sur l’écran d’accueil ».`;
    host.appendChild(hint);
  }

  function showManualInstallHint() {
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const host = getInstallHost();
    if (!isAndroid || isIOS || isStandalone() || installPrompt || !host || document.getElementById("manual-install-hint")) return;

    const details = document.createElement("details");
    details.id = "manual-install-hint";
    details.className = "pwa-manual-hint";
    const summary = document.createElement("summary");
    summary.textContent = `Installer ${appName}`;
    const text = document.createElement("p");
    text.textContent = "Ouvrez le menu du navigateur, puis choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».";
    details.append(summary, text);
    host.appendChild(details);
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");

      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdateBanner(registration);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBanner(registration);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn("[PWA] Service worker non disponible :", error);
    }
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    document.getElementById("manual-install-hint")?.remove();
    showInstallAction();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.getElementById("pwa-install-action")?.remove();
    document.getElementById("manual-install-hint")?.remove();
    document.getElementById("ios-install-hint")?.remove();
  });

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  document.addEventListener("DOMContentLoaded", () => {
    createStatusBanner();
    updateNetworkStatus();
    showIOSInstallHint();
    showInstallAction();
    window.setTimeout(showManualInstallHint, 1500);
    registerServiceWorker();

    if (isStandalone()) {
      document.documentElement.classList.add("is-standalone");
    }
  });
})();
