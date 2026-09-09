(function initCalypsoStartup() {
  "use strict";

  const SPLASH_SESSION_KEY = "calypso-splash-shown-v1";
  const NOTIFICATION_STATE_KEY = "calypso-public-notifications-v1";
  const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "";
  const isPublicApp = manifestHref.includes("manifest-public.webmanifest");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone);

  try {
    if (sessionStorage.getItem(SPLASH_SESSION_KEY) === "1") return;
    sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
  } catch (_) { /* session indisponible */ }

  const splash = document.createElement("div");
  splash.id = "calypsoSplash";
  splash.className = "calypso-splash";
  splash.setAttribute("role", "status");
  splash.setAttribute("aria-label", "Ouverture de Calypço");
  splash.innerHTML = `
    <div class="calypso-splash-stage" aria-hidden="true">
      <div class="calypso-splash-logo-frame">
        <img src="assets/icons/calypso-officiel.png" alt="" width="620" height="620" />
        <span class="calypso-splash-wave"></span>
      </div>
    </div>
    <section class="calypso-notification-onboarding" aria-labelledby="calypsoNotificationOnboardingTitle" hidden>
      <p class="calypso-splash-eyebrow">Restez informé</p>
      <h1 id="calypsoNotificationOnboardingTitle">Recevoir les alertes du Calypço ?</h1>
      <p>L’administrateur pourra vous prévenir des nouveautés lorsque vous ouvrirez l’application. Ce choix reste facultatif.</p>
      <div class="calypso-splash-actions">
        <button id="btnStartupNotifications" type="button" class="btn-secondary">Activer les notifications</button>
        <button id="btnSkipStartupNotifications" type="button" class="btn-link">Plus tard</button>
      </div>
      <p id="startupNotificationStatus" class="calypso-splash-status" role="status" aria-live="polite"></p>
    </section>`;
  document.documentElement.classList.add("has-calypso-splash");
  document.body.prepend(splash);

  function readNotificationState() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFICATION_STATE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveNotificationState(values) {
    try {
      const current = readNotificationState();
      localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify({ ...current, ...values }));
    } catch (_) { /* stockage indisponible */ }
  }

  function notificationsCanBeOffered() {
    if (!isPublicApp || !isStandalone || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
    const state = readNotificationState();
    return Notification.permission === "default" && !state.onboardingChoice;
  }

  function closeSplash() {
    splash.classList.add("is-leaving");
    window.setTimeout(() => {
      splash.remove();
      document.documentElement.classList.remove("has-calypso-splash");
    }, 260);
  }

  function showNotificationChoice() {
    const panel = splash.querySelector(".calypso-notification-onboarding");
    const stage = splash.querySelector(".calypso-splash-stage");
    const enableButton = splash.querySelector("#btnStartupNotifications");
    const skipButton = splash.querySelector("#btnSkipStartupNotifications");
    const status = splash.querySelector("#startupNotificationStatus");
    if (!panel || !stage || !enableButton || !skipButton || !status) return closeSplash();

    splash.classList.add("is-asking");
    stage.setAttribute("aria-hidden", "true");
    panel.hidden = false;

    enableButton.addEventListener("click", async () => {
      enableButton.disabled = true;
      skipButton.disabled = true;
      try {
        const permission = await Notification.requestPermission();
        saveNotificationState({
          enabled: permission === "granted",
          onboardingChoice: permission
        });
        window.dispatchEvent(new CustomEvent("calypso:notification-preference-changed"));
        status.textContent = permission === "granted"
          ? "Notifications activées."
          : "Notifications non activées. Vous pourrez modifier ce choix dans les réglages du navigateur.";
      } catch (_) {
        saveNotificationState({ enabled: false, onboardingChoice: "unavailable" });
        status.textContent = "Les notifications ne sont pas compatibles avec ce navigateur.";
      }
      window.setTimeout(closeSplash, 700);
    });

    skipButton.addEventListener("click", () => {
      saveNotificationState({ enabled: false, onboardingChoice: "later" });
      closeSplash();
    });
  }

  let animationReady = false;
  let applicationReady = document.readyState === "complete";
  let startupCompleted = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function continueWhenReady() {
    if (startupCompleted || !animationReady || !applicationReady) return;
    startupCompleted = true;
    if (notificationsCanBeOffered()) showNotificationChoice();
    else closeSplash();
  }

  window.addEventListener("load", () => {
    applicationReady = true;
    continueWhenReady();
  }, { once: true });

  window.setTimeout(() => {
    animationReady = true;
    continueWhenReady();
  }, reducedMotion ? 650 : 2300);

  window.setTimeout(() => {
    applicationReady = true;
    animationReady = true;
    continueWhenReady();
  }, 3000);
})();
