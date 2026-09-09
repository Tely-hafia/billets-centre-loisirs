(function initPublicNotifications() {
  "use strict";

  const STORAGE_KEY = "calypso-public-notifications-v1";
  const NEAR_EVENT_WINDOW = 36 * 60 * 60 * 1000;
  const CONTENT_EVENT = "calypso:public-content-loaded";
  let loadedEvents = [];
  let loadedAlerts = [];

  function defaultState() {
    return {
      enabled: false,
      initialized: false,
      knownEventIds: [],
      notifiedEventIds: [],
      remindedEventIds: [],
      seenAlertVersions: [],
      notifiedAlertVersions: []
    };
  }

  function readState() {
    try {
      const state = { ...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
      for (const key of ["knownEventIds", "notifiedEventIds", "remindedEventIds", "seenAlertVersions", "notifiedAlertVersions"]) {
        if (!Array.isArray(state[key])) state[key] = [];
      }
      return state;
    } catch (_) {
      return defaultState();
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* stockage indisponible */ }
  }

  function eventId(event) {
    return String(event.$id || `${event.date_evenement || "date-inconnue"}:${event.titre || "evenement"}`);
  }

  function alertVersion(alert) {
    return `${alert.$id || alert.titre}:${alert.$updatedAt || alert.date_evenement || "version-inconnue"}`;
  }

  function upcomingEvents(events) {
    const now = Date.now();
    return events
      .filter((event) => new Date(event.date_evenement).getTime() >= now)
      .sort((a, b) => new Date(a.date_evenement).getTime() - new Date(b.date_evenement).getTime());
  }

  function formatEventDate(event) {
    return new Date(event.date_evenement).toLocaleString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function notificationsEnabled() {
    return "Notification" in window
      && "serviceWorker" in navigator
      && Notification.permission === "granted"
      && readState().enabled;
  }

  async function showLocalNotification(title, body, tag) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: "./assets/icons/calypso-officiel.png",
        badge: "./assets/icons/calypso-officiel.png",
        tag,
        data: { url: new URL("./index.html#evenements", window.location.href).href }
      });
      return true;
    } catch (error) {
      console.warn("[NOTIFICATIONS PUBLIQUES] Notification locale indisponible :", error);
      return false;
    }
  }

  function showOpeningAlert(alert, version) {
    if (document.getElementById("publicOpeningAlert")) return;

    const overlay = document.createElement("div");
    overlay.id = "publicOpeningAlert";
    overlay.className = "public-opening-alert";
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "publicOpeningAlertTitle");

    const card = document.createElement("section");
    card.className = "public-opening-alert-card";
    const label = document.createElement("p");
    label.className = "section-kicker";
    label.textContent = "🔔 Message du Calypço";
    const title = document.createElement("h2");
    title.id = "publicOpeningAlertTitle";
    title.textContent = alert.titre;
    const body = document.createElement("p");
    body.textContent = alert.description || "Une nouvelle information est disponible au Calypço.";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn-primary";
    close.textContent = "J’ai compris";
    close.addEventListener("click", () => {
      const state = readState();
      state.seenAlertVersions = [...new Set([...state.seenAlertVersions, version])].slice(-100);
      saveState(state);
      overlay.remove();
    });
    card.append(label, title, body, close);
    overlay.append(card);
    document.body.append(overlay);
    close.focus();
  }

  async function checkAdminAlerts(alerts) {
    const state = readState();
    const alert = alerts.find((item) => !state.seenAlertVersions.includes(alertVersion(item)));
    if (!alert) return;

    const version = alertVersion(alert);
    showOpeningAlert(alert, version);

    if (notificationsEnabled() && !state.notifiedAlertVersions.includes(version)) {
      const shown = await showLocalNotification(
        alert.titre,
        alert.description || "Nouveau message du Calypço.",
        `calypso-alert-${encodeURIComponent(version)}`
      );
      if (shown) {
        const current = readState();
        current.notifiedAlertVersions = [...new Set([...current.notifiedAlertVersions, version])].slice(-100);
        saveState(current);
      }
    }
  }

  async function checkEvents(events) {
    if (!notificationsEnabled()) return;

    const state = readState();
    const upcoming = upcomingEvents(events);
    const ids = upcoming.map(eventId);
    if (!state.initialized) {
      state.initialized = true;
      state.knownEventIds = ids.slice(-200);
      saveState(state);
      return;
    }

    const now = Date.now();
    const known = new Set(state.knownEventIds);
    const notified = new Set(state.notifiedEventIds);
    const reminded = new Set(state.remindedEventIds);
    const newEvent = upcoming.find((event) => !known.has(eventId(event)) && !notified.has(eventId(event)));
    const nearEvent = upcoming.find((event) => {
      const id = eventId(event);
      const delay = new Date(event.date_evenement).getTime() - now;
      return delay >= 0 && delay <= NEAR_EVENT_WINDOW && !reminded.has(id);
    });
    const selected = newEvent || nearEvent;
    const kind = newEvent ? "new" : "near";

    state.knownEventIds = Array.from(new Set([...state.knownEventIds, ...ids])).slice(-200);
    if (selected) {
      const title = kind === "new" ? "Nouvel événement au Calypço" : "Un événement approche au Calypço";
      const shown = await showLocalNotification(
        title,
        `${selected.titre} · ${formatEventDate(selected)}`,
        `calypso-event-${encodeURIComponent(eventId(selected))}`
      );
      if (shown) {
        const id = eventId(selected);
        if (kind === "new") state.notifiedEventIds = [...state.notifiedEventIds, id].slice(-200);
        else state.remindedEventIds = [...state.remindedEventIds, id].slice(-200);
      }
    }
    saveState(state);
  }

  function checkLoadedContent() {
    checkAdminAlerts(loadedAlerts);
    checkEvents(loadedEvents);
  }

  window.addEventListener(CONTENT_EVENT, (event) => {
    loadedEvents = Array.isArray(event.detail?.events) ? event.detail.events : [];
    loadedAlerts = Array.isArray(event.detail?.alerts) ? event.detail.alerts : [];
    checkLoadedContent();
  });

  window.addEventListener("calypso:notification-preference-changed", checkLoadedContent);
})();
