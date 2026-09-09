(function initPublicNotifications() {
  "use strict";

  const STORAGE_KEY = "calypso-public-notifications-v1";
  const NEAR_EVENT_WINDOW = 36 * 60 * 60 * 1000;
  const CONTENT_EVENT = "calypso:public-content-loaded";
  let loadedEvents = [];
  let hasLoadedContent = false;

  function defaultState() {
    return {
      enabled: false,
      initialized: false,
      knownEventIds: [],
      notifiedEventIds: [],
      remindedEventIds: []
    };
  }

  function readState() {
    try {
      return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
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

  function isSupported() {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  function updateStatus() {
    const status = document.getElementById("publicNotificationsStatus");
    const button = document.getElementById("btnEnablePublicNotifications");
    if (!status || !button) return;

    if (!isSupported()) {
      status.textContent = "Les notifications ne sont pas compatibles avec ce navigateur.";
      button.hidden = true;
      return;
    }

    if (Notification.permission === "denied") {
      status.textContent = "Notifications refusées. Vous pouvez modifier ce choix dans les réglages du navigateur.";
      button.hidden = true;
      return;
    }

    if (Notification.permission === "granted" && readState().enabled) {
      status.textContent = "Notifications activées sur cet appareil.";
      button.hidden = true;
      return;
    }

    status.textContent = "Notifications non activées — vous gardez le contrôle.";
    button.hidden = false;
  }

  async function showEventNotification(event, kind) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const title = kind === "new" ? "Nouvel événement au Calypço" : "Un événement approche au Calypço";
      await registration.showNotification(title, {
        body: `${event.titre} · ${formatEventDate(event)}`,
        icon: "./assets/icons/calypso-officiel.png",
        badge: "./assets/icons/calypso-officiel.png",
        tag: `calypso-event-${eventId(event)}`,
        data: { url: new URL("./index.html#evenements", window.location.href).href }
      });
      return true;
    } catch (error) {
      console.warn("[NOTIFICATIONS PUBLIQUES] Notification locale indisponible :", error);
      return false;
    }
  }

  async function checkEvents(events) {
    if (!isSupported() || Notification.permission !== "granted") return;

    const state = readState();
    if (!state.enabled) return;

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
    if (selected && await showEventNotification(selected, kind)) {
      const id = eventId(selected);
      if (kind === "new") state.notifiedEventIds = [...state.notifiedEventIds, id].slice(-200);
      else state.remindedEventIds = [...state.remindedEventIds, id].slice(-200);
    }
    saveState(state);
  }

  function enableOnClick() {
    const button = document.getElementById("btnEnablePublicNotifications");
    button?.addEventListener("click", async () => {
      if (!isSupported()) {
        updateStatus();
        return;
      }

      const permission = await Notification.requestPermission();
      const state = readState();
      state.enabled = permission === "granted";
      if (state.enabled && !state.initialized && hasLoadedContent) {
        state.initialized = true;
        state.knownEventIds = upcomingEvents(loadedEvents).map(eventId).slice(-200);
      }
      saveState(state);
      updateStatus();
      if (state.enabled && hasLoadedContent) checkEvents(loadedEvents);
    });
  }

  window.addEventListener(CONTENT_EVENT, (event) => {
    hasLoadedContent = true;
    loadedEvents = Array.isArray(event.detail?.events) ? event.detail.events : [];
    checkEvents(loadedEvents);
  });

  document.addEventListener("DOMContentLoaded", () => {
    updateStatus();
    enableOnClick();
  });
})();
