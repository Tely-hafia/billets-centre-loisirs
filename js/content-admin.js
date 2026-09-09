(function initContentAdmin() {
  "use strict";

  const config = window.CalypsoConfig;
  const appwrite = window.CalypsoAppwrite;
  if (!config || !appwrite || !window.Appwrite) return;

  const databaseId = config.databaseId;
  const tableId = config.tables?.contenuSite;
  const bucketId = config.buckets?.contenuMedia;
  const db = appwrite.databases;
  const storage = appwrite.storage;
  const state = { loaded: false, documents: [] };
  const publicCacheKey = "calypso-public-content-v2";

  const $ = (id) => document.getElementById(id);

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fileViewUrl(fileId) {
    if (!fileId) return "";
    const endpoint = String(config.endpoint || "").replace(/\/$/, "");
    return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(config.projectId)}`;
  }

  function clearPublicCache() {
    try { localStorage.removeItem(publicCacheKey); } catch (_) { /* stockage indisponible */ }
  }

  function showMessage(text, type = "info") {
    const node = $("siteContentMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `message message-${type}`;
  }

  function friendlyError(error) {
    const message = String(error?.message || error || "Erreur inconnue");
    if (/not authorized|unauthorized|permission/i.test(message) || error?.code === 401) {
      return "Accès refusé par Appwrite. Vérifiez les permissions de la table contenu_site et du stockage média pour l’équipe d’administration.";
    }
    if (/collection|table|bucket|not found|could not be found/i.test(message) || error?.code === 404) {
      return "Configuration Appwrite incomplète : vérifiez la table contenu_site et le stockage média configuré dans l’application.";
    }
    return message;
  }

  function formatEventDate(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "Date non renseignée";
    return date.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  }

  function toLocalDateTime(value) {
    const date = new Date(value || 0);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderItem(doc, kind) {
    const isEvent = kind === "event";
    const isAlert = kind === "alert";
    const image = doc.image_file_id
      ? `<img class="content-admin-thumb" src="${fileViewUrl(doc.image_file_id)}" alt="" loading="lazy" decoding="async" />`
      : `<div class="content-admin-thumb content-admin-thumb-empty" aria-hidden="true">${isAlert ? "🔔" : isEvent ? "📅" : "🖼️"}</div>`;
    const meta = isAlert
      ? `Alerte clients · ${formatEventDate(doc.$updatedAt || doc.date_evenement)}`
      : isEvent
        ? formatEventDate(doc.date_evenement)
        : `${escapeHTML(doc.categorie || "Général")} · position ${Number(doc.ordre) || 0}`;
    return `
      <article class="content-admin-item">
        ${image}
        <div class="content-admin-item-body">
          <div class="content-admin-item-title"><strong>${escapeHTML(doc.titre || "Sans titre")}</strong><span class="${doc.actif ? "badge-success" : "badge-muted"}">${doc.actif ? "Visible" : "Masqué"}</span></div>
          <small>${meta}</small>
          ${(isEvent || isAlert) && doc.description ? `<p>${escapeHTML(doc.description)}</p>` : ""}
        </div>
        <div class="content-admin-actions">
          <button type="button" class="btn-secondary" data-content-action="edit" data-content-kind="${kind}" data-content-id="${escapeHTML(doc.$id)}">Modifier</button>
          <button type="button" class="btn-secondary" data-content-action="toggle" data-content-kind="${kind}" data-content-id="${escapeHTML(doc.$id)}">${doc.actif ? "Masquer" : "Publier"}</button>
          <button type="button" class="btn-danger" data-content-action="delete" data-content-kind="${kind}" data-content-id="${escapeHTML(doc.$id)}">Supprimer</button>
        </div>
      </article>`;
  }

  function renderLists() {
    const alerts = state.documents
      .filter((doc) => doc.type_contenu === "alert")
      .sort((a, b) => String(b.$updatedAt || b.date_evenement || "").localeCompare(String(a.$updatedAt || a.date_evenement || "")));
    const events = state.documents
      .filter((doc) => doc.type_contenu === "event")
      .sort((a, b) => String(a.date_evenement || "").localeCompare(String(b.date_evenement || "")));
    const gallery = state.documents
      .filter((doc) => doc.type_contenu === "gallery")
      .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    const setting = state.documents.find((doc) => doc.type_contenu === "setting" && doc.categorie === "gallery_display");

    const alertList = $("alertContentList");
    const eventList = $("eventContentList");
    const galleryList = $("galleryContentList");
    if (alertList) alertList.innerHTML = alerts.length ? alerts.map((doc) => renderItem(doc, "alert")).join("") : '<p class="empty-state">Aucune alerte enregistrée.</p>';
    if (eventList) eventList.innerHTML = events.length ? events.map((doc) => renderItem(doc, "event")).join("") : '<p class="empty-state">Aucun événement enregistré.</p>';
    if (galleryList) galleryList.innerHTML = gallery.length ? gallery.map((doc) => renderItem(doc, "gallery")).join("") : '<p class="empty-state">Aucune photo enregistrée.</p>';
    if ($("galleryDisplayMode")) $("galleryDisplayMode").value = setting?.description === "manual" ? "manual" : "random";
  }

  async function loadContent() {
    const button = $("btnLoadSiteContent");
    if (!tableId || !bucketId) {
      showMessage("Configuration du contenu absente dans appwrite-config.js.", "error");
      return;
    }
    button && (button.disabled = true);
    showMessage("Chargement du contenu…", "info");
    try {
      const response = await db.listDocuments(databaseId, tableId, [
        Appwrite.Query.limit(100)
      ]);
      state.documents = response.documents || [];
      state.loaded = true;
      renderLists();
      showMessage(`${state.documents.filter((doc) => doc.type_contenu !== "setting").length} élément(s) chargé(s).`, "success");
    } catch (error) {
      console.error("[CONTENU] Chargement impossible :", error);
      showMessage(friendlyError(error), "error");
    } finally {
      button && (button.disabled = false);
    }
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
      image.src = url;
    });
  }

  async function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Compression de l’image impossible.")), "image/webp", quality);
    });
  }

  async function compressImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Choisissez une image valide.");
    const image = await loadImage(file);
    const maxSide = 1600;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);

    let quality = 0.8;
    let blob = await canvasBlob(canvas, quality);
    while (blob.size > 320 * 1024 && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, quality);
    }
    const baseName = String(file.name || "calypso").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "calypso";
    return new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: Date.now() });
  }

  async function uploadImage(file) {
    const compressed = await compressImage(file);
    const uploaded = await storage.createFile(bucketId, Appwrite.ID.unique(), compressed);
    return uploaded.$id;
  }

  async function deleteFileQuietly(fileId) {
    if (!fileId) return;
    try { await storage.deleteFile(bucketId, fileId); } catch (error) { console.warn("[CONTENU] Ancienne image non supprimée :", error); }
  }

  function upsertState(document) {
    const index = state.documents.findIndex((item) => item.$id === document.$id);
    if (index >= 0) state.documents[index] = document;
    else state.documents.push(document);
    state.loaded = true;
    renderLists();
    clearPublicCache();
  }

  function resetEventForm() {
    $("eventContentForm")?.reset();
    if ($("eventContentId")) $("eventContentId").value = "";
    if ($("eventContentActive")) $("eventContentActive").checked = true;
    if ($("btnCancelEventEdit")) $("btnCancelEventEdit").hidden = true;
  }

  function resetAlertForm() {
    $("alertContentForm")?.reset();
    if ($("alertContentId")) $("alertContentId").value = "";
    if ($("alertContentActive")) $("alertContentActive").checked = true;
    if ($("btnCancelAlertEdit")) $("btnCancelAlertEdit").hidden = true;
  }

  function resetGalleryForm() {
    $("galleryContentForm")?.reset();
    if ($("galleryContentId")) $("galleryContentId").value = "";
    if ($("galleryContentActive")) $("galleryContentActive").checked = true;
    if ($("galleryContentOrder")) $("galleryContentOrder").value = "0";
    if ($("btnCancelGalleryEdit")) $("btnCancelGalleryEdit").hidden = true;
  }

  async function saveDocument(kind, form) {
    const isEvent = kind === "event";
    const isAlert = kind === "alert";
    const idField = isAlert ? "alertContentId" : isEvent ? "eventContentId" : "galleryContentId";
    const id = $(idField)?.value || "";
    const oldDocument = state.documents.find((doc) => doc.$id === id);
    const fileInput = isAlert ? null : $(isEvent ? "eventContentImage" : "galleryContentImage");
    const file = fileInput?.files?.[0];
    if (!isEvent && !isAlert && !id && !file) {
      showMessage("Choisissez une photo pour la galerie.", "error");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    showMessage("Enregistrement en cours…", "info");
    let newFileId = "";
    try {
      if (file) newFileId = await uploadImage(file);
      const data = isAlert ? {
        type_contenu: "alert",
        titre: $("alertContentTitle").value.trim(),
        description: $("alertContentDescription").value.trim(),
        categorie: "public_alert",
        date_evenement: new Date().toISOString(),
        image_file_id: "",
        actif: $("alertContentActive").checked,
        ordre: 0
      } : isEvent ? {
        type_contenu: "event",
        titre: $("eventContentTitle").value.trim(),
        description: $("eventContentDescription").value.trim(),
        categorie: "",
        date_evenement: new Date($("eventContentDate").value).toISOString(),
        image_file_id: newFileId || oldDocument?.image_file_id || "",
        actif: $("eventContentActive").checked,
        ordre: 0
      } : {
        type_contenu: "gallery",
        titre: $("galleryContentTitle").value.trim(),
        description: "",
        categorie: $("galleryContentCategory").value,
        image_file_id: newFileId || oldDocument?.image_file_id || "",
        actif: $("galleryContentActive").checked,
        ordre: Number($("galleryContentOrder").value) || 0
      };

      const document = id
        ? await db.updateDocument(databaseId, tableId, id, data)
        : await db.createDocument(databaseId, tableId, Appwrite.ID.unique(), data);
      if (newFileId && oldDocument?.image_file_id && oldDocument.image_file_id !== newFileId) {
        await deleteFileQuietly(oldDocument.image_file_id);
      }
      upsertState(document);
      if (isAlert) resetAlertForm();
      else if (isEvent) resetEventForm();
      else resetGalleryForm();
      showMessage(isAlert ? "Alerte envoyée." : isEvent ? "Événement enregistré." : "Photo enregistrée.", "success");
    } catch (error) {
      if (newFileId) await deleteFileQuietly(newFileId);
      console.error("[CONTENU] Enregistrement impossible :", error);
      showMessage(friendlyError(error), "error");
    } finally {
      submit.disabled = false;
    }
  }

  function editDocument(document, kind) {
    if (kind === "alert") {
      $("alertContentId").value = document.$id;
      $("alertContentTitle").value = document.titre || "";
      $("alertContentDescription").value = document.description || "";
      $("alertContentActive").checked = Boolean(document.actif);
      $("btnCancelAlertEdit").hidden = false;
      $("admin-content-alerts").open = true;
      $("alertContentTitle").focus();
    } else if (kind === "event") {
      $("eventContentId").value = document.$id;
      $("eventContentTitle").value = document.titre || "";
      $("eventContentDate").value = toLocalDateTime(document.date_evenement);
      $("eventContentDescription").value = document.description || "";
      $("eventContentActive").checked = Boolean(document.actif);
      $("btnCancelEventEdit").hidden = false;
      $("admin-content-events").open = true;
      $("eventContentTitle").focus();
    } else {
      $("galleryContentId").value = document.$id;
      $("galleryContentTitle").value = document.titre || "";
      $("galleryContentCategory").value = document.categorie || "Général";
      $("galleryContentOrder").value = String(Number(document.ordre) || 0);
      $("galleryContentActive").checked = Boolean(document.actif);
      $("btnCancelGalleryEdit").hidden = false;
      $("admin-content-gallery").open = true;
      $("galleryContentTitle").focus();
    }
  }

  async function handleListAction(button) {
    const id = button.dataset.contentId;
    const kind = button.dataset.contentKind;
    const action = button.dataset.contentAction;
    const document = state.documents.find((doc) => doc.$id === id);
    if (!document) return;
    if (action === "edit") { editDocument(document, kind); return; }

    button.disabled = true;
    try {
      if (action === "toggle") {
        const updated = await db.updateDocument(databaseId, tableId, id, { actif: !document.actif });
        upsertState(updated);
        showMessage(updated.actif ? "Contenu publié." : "Contenu masqué.", "success");
      } else if (action === "delete") {
        const confirmed = window.confirm(`Supprimer définitivement « ${document.titre || "ce contenu"} » ?`);
        if (!confirmed) return;
        await db.deleteDocument(databaseId, tableId, id);
        await deleteFileQuietly(document.image_file_id);
        state.documents = state.documents.filter((item) => item.$id !== id);
        renderLists();
        clearPublicCache();
        showMessage("Contenu supprimé.", "success");
      }
    } catch (error) {
      console.error("[CONTENU] Action impossible :", error);
      showMessage(friendlyError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  async function saveGalleryMode() {
    const button = $("btnSaveGalleryMode");
    button.disabled = true;
    try {
      const existing = state.documents.find((doc) => doc.type_contenu === "setting" && doc.categorie === "gallery_display");
      const data = {
        type_contenu: "setting",
        titre: "Mode galerie",
        description: $("galleryDisplayMode").value === "manual" ? "manual" : "random",
        categorie: "gallery_display",
        image_file_id: "",
        actif: true,
        ordre: 0
      };
      const document = existing
        ? await db.updateDocument(databaseId, tableId, existing.$id, data)
        : await db.createDocument(databaseId, tableId, Appwrite.ID.unique(), data);
      upsertState(document);
      showMessage("Mode de défilement enregistré.", "success");
    } catch (error) {
      console.error("[CONTENU] Mode galerie non enregistré :", error);
      showMessage(friendlyError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("btnLoadSiteContent")?.addEventListener("click", loadContent);
    $("alertContentForm")?.addEventListener("submit", (event) => { event.preventDefault(); saveDocument("alert", event.currentTarget); });
    $("eventContentForm")?.addEventListener("submit", (event) => { event.preventDefault(); saveDocument("event", event.currentTarget); });
    $("galleryContentForm")?.addEventListener("submit", (event) => { event.preventDefault(); saveDocument("gallery", event.currentTarget); });
    $("btnCancelAlertEdit")?.addEventListener("click", resetAlertForm);
    $("btnCancelEventEdit")?.addEventListener("click", resetEventForm);
    $("btnCancelGalleryEdit")?.addEventListener("click", resetGalleryForm);
    $("btnSaveGalleryMode")?.addEventListener("click", saveGalleryMode);
    $("alertContentList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-content-action]");
      if (button) handleListAction(button);
    });
    $("eventContentList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-content-action]");
      if (button) handleListAction(button);
    });
    $("galleryContentList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-content-action]");
      if (button) handleListAction(button);
    });
  });
})();
