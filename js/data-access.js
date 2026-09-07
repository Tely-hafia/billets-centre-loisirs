(function (global) {
  "use strict";
  function createCache(now = Date.now) {
    const entries = new Map();
    return {
      read(key, loader, ttl = 60000) {
        const previous = entries.get(key);
        if (previous && (previous.pending || previous.expires > now())) return previous.promise;
        const entry = { pending: true, expires: 0 };
        entry.promise = Promise.resolve().then(loader).then(value => {
          entry.pending = false;
          entry.expires = now() + ttl;
          return value;
        }, error => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        });
        entries.set(key, entry);
        if (entries.size > 20) entries.delete(entries.keys().next().value);
        return entry.promise;
      },
      clear() { entries.clear(); }
    };
  }
  const cache = createCache();
  async function listAll(db, database, table, filters = []) {
    const documents = [];
    let cursor;
    for (;;) {
      const queries = [...filters, global.Appwrite.Query.limit(250), global.Appwrite.Query.orderAsc("$id")];
      if (cursor) queries.push(global.Appwrite.Query.cursorAfter(cursor));
      const result = await db.listDocuments(database, table, queries);
      const page = result.documents || [];
      documents.push(...page);
      if (page.length < 250) return { documents, total: documents.length };
      const next = page[page.length - 1].$id;
      if (cursor === next) throw new Error("Pagination interrompue : les données ne sont pas complètes.");
      cursor = next;
    }
  }
  function cachedList(db, database, table, filters = []) {
    return cache.read(JSON.stringify([database, table, filters]), () => listAll(db, database, table, filters));
  }
  async function eventId(kind, ticketId) {
    const digest = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(kind + ":" + ticketId));
    return kind.slice(0, 3) + "-" + Array.from(new Uint8Array(digest)).slice(0, 16).map(n => n.toString(16).padStart(2, "0")).join("");
  }
  function errorMessage(error, operation) {
    if ([401, 403].includes(Number(error?.code)) || /not authorized/i.test(error?.message || "")) {
      return `${operation} refusée par Appwrite. L’administrateur doit vérifier les droits de l’équipe et de la table concernée. Aucune réussite n’est confirmée.`;
    }
    if (Number(error?.code) === 429) return "Trop de requêtes rapprochées. Patientez avant de réessayer.";
    return error?.message || `${operation} impossible.`;
  }
  global.CalypsoData = Object.freeze({ createCache, cache, listAll, cachedList, eventId, errorMessage });
})(typeof window !== "undefined" ? window : globalThis);
