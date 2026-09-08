(function initPublicContent() {
  "use strict";

  const CACHE_KEY = "calypso-public-content-v1";
  const CACHE_TTL = 10 * 60 * 1000;
  const MAX_GALLERY_IMAGES = 24;
  let memoryPromise = null;

  function emptyContent() {
    return { gallery: [], events: [], mode: "random", fetchedAt: 0 };
  }

  function readCache(allowExpired = false) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !Array.isArray(cached.gallery) || !Array.isArray(cached.events)) return null;
      if (!allowExpired && Date.now() - Number(cached.fetchedAt || 0) > CACHE_TTL) return null;
      return cached;
    } catch (_) {
      return null;
    }
  }

  function writeCache(content) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(content)); } catch (_) { /* cache indisponible */ }
  }

  function fileUrl(fileId) {
    if (!fileId) return "";
    const config = window.CalypsoConfig;
    const endpoint = String(config?.endpoint || "").replace(/\/$/, "");
    const bucketId = config?.buckets?.contenuMedia || "contenu_media";
    return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(config?.projectId || "")}`;
  }

  function normalize(documents) {
    const active = documents.filter((doc) => doc.actif !== false);
    const setting = active.find((doc) => doc.type_contenu === "setting" && doc.categorie === "gallery_display");
    const gallery = active
      .filter((doc) => doc.type_contenu === "gallery" && doc.image_file_id)
      .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
      .slice(0, MAX_GALLERY_IMAGES);
    const events = active
      .filter((doc) => doc.type_contenu === "event" && doc.titre && doc.date_evenement)
      .sort((a, b) => String(a.date_evenement).localeCompare(String(b.date_evenement)));
    return {
      gallery,
      events,
      mode: setting?.description === "manual" ? "manual" : "random",
      fetchedAt: Date.now()
    };
  }

  async function fetchContent() {
    const config = window.CalypsoConfig;
    const db = window.CalypsoAppwrite?.databases;
    const tableId = config?.tables?.contenuSite;
    if (!config || !db || !tableId || !window.Appwrite) return readCache(true) || emptyContent();

    try {
      // Une seule lecture pour la galerie, les événements et leur réglage commun.
      const result = await db.listDocuments(config.databaseId, tableId, [Appwrite.Query.limit(100)]);
      const content = normalize(result.documents || []);
      writeCache(content);
      return content;
    } catch (error) {
      console.warn("[CONTENU PUBLIC] Données distantes indisponibles, utilisation du cache ou du contenu intégré :", error);
      return readCache(true) || emptyContent();
    }
  }

  function load() {
    const cached = readCache(false);
    if (cached) return Promise.resolve(cached);
    if (!memoryPromise) memoryPromise = fetchContent();
    return memoryPromise;
  }

  window.CalypsoPublicContent = Object.freeze({ load, fileUrl, cacheKey: CACHE_KEY });
})();
