(function initRestoAdmin() {
  "use strict";

  const config = window.CalypsoConfig;
  const appwrite = window.CalypsoAppwrite;
  if (!config || !appwrite || !window.Appwrite) return;

  const databaseId = config.databaseId;
  const tableId = config.tables?.menuResto;
  const bucketId = config.buckets?.contenuMedia;
  const db = appwrite.databases;
  const storage = appwrite.storage;
  const state = { loaded: false, products: [] };
  let previewObjectUrl = "";

  const $ = (id) => document.getElementById(id);

  function formatGNF(value) {
    return `${(Number(value) || 0).toLocaleString("fr-FR")} GNF`;
  }

  function fileViewUrl(fileId) {
    if (!fileId) return "";
    const endpoint = String(config.endpoint || "").replace(/\/$/, "");
    return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(config.projectId)}`;
  }

  function showStatus(text, type = "info") {
    const node = $("restoMenuAdminStatus");
    if (!node) return;
    node.textContent = text;
    node.className = `message message-${type}`;
  }

  function friendlyError(error) {
    const message = String(error?.message || error || "Erreur inconnue");
    if (/image_file_id|unknown attribute[^\n]*image/i.test(message)) {
      return "Ajoutez d’abord la colonne facultative image_file_id (String, 64) à la table menu_resto dans Appwrite.";
    }
    if (/permission|unauthorized|not authorized/i.test(message) || error?.code === 401) {
      return "Accès refusé. Vérifiez que le compte possède le rôle administrateur Appwrite.";
    }
    return message;
  }

  function sortProducts(products) {
    return [...products].sort((a, b) => {
      const category = String(a.categorie || "Autre").localeCompare(String(b.categorie || "Autre"), "fr");
      return category || String(a.libelle || "").localeCompare(String(b.libelle || ""), "fr");
    });
  }

  function createProductItem(product) {
    const item = document.createElement("article");
    item.className = "content-admin-item resto-menu-admin-item";

    if (product.image_file_id) {
      const image = document.createElement("img");
      image.className = "content-admin-thumb";
      image.src = fileViewUrl(product.image_file_id);
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      item.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "content-admin-thumb content-admin-thumb-empty";
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.textContent = "🍽️";
      item.append(placeholder);
    }

    const body = document.createElement("div");
    body.className = "content-admin-item-body";
    const title = document.createElement("div");
    title.className = "content-admin-item-title";
    const name = document.createElement("strong");
    name.textContent = product.libelle || "Produit sans nom";
    const badge = document.createElement("span");
    badge.className = product.actif ? "badge-success" : "badge-muted";
    badge.textContent = product.actif ? "Disponible" : "Masqué";
    title.append(name, badge);
    const meta = document.createElement("small");
    meta.textContent = `${product.categorie || "Autre"} · ${product.code_produit || "Sans code"} · ${formatGNF(product.prix_unitaire)}`;
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "content-admin-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn-secondary";
    edit.dataset.restoAction = "edit";
    edit.dataset.restoId = product.$id;
    edit.textContent = "Modifier";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = product.actif ? "btn-danger" : "btn-secondary";
    toggle.dataset.restoAction = "toggle";
    toggle.dataset.restoId = product.$id;
    toggle.textContent = product.actif ? "Masquer" : "Réactiver";
    actions.append(edit, toggle);
    item.append(body, actions);
    return item;
  }

  function renderProducts() {
    const list = $("restoMenuAdminList");
    if (!list) return;
    list.replaceChildren();
    const products = sortProducts(state.products);
    if (!products.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Aucun produit enregistré. Vous pouvez créer le premier produit.";
      list.append(empty);
      return;
    }
    products.forEach((product) => list.append(createProductItem(product)));
  }

  async function loadMenu() {
    const button = $("btnLoadRestoMenu");
    if (!tableId || !bucketId) {
      showStatus("Configuration Appwrite du menu incomplète.", "error");
      return;
    }
    if (button) button.disabled = true;
    showStatus("Chargement du menu…");
    try {
      const response = await db.listDocuments(databaseId, tableId, [Appwrite.Query.limit(200)]);
      state.products = response.documents || [];
      state.loaded = true;
      if ($("restoMenuEditorFields")) $("restoMenuEditorFields").disabled = false;
      renderProducts();
      showStatus(`${state.products.length} produit(s) chargé(s).`, "success");
    } catch (error) {
      console.error("[MENU RESTO] Chargement impossible :", error);
      showStatus(friendlyError(error), "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function revokePreview() {
    if (!previewObjectUrl) return;
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
  }

  function setPreview(src) {
    const preview = $("restoMenuImagePreview");
    if (!preview) return;
    preview.src = src || "";
    preview.hidden = !src;
  }

  function resetForm() {
    revokePreview();
    $("restoMenuForm")?.reset();
    if ($("restoMenuDocumentId")) $("restoMenuDocumentId").value = "";
    if ($("restoMenuActive")) $("restoMenuActive").checked = true;
    if ($("restoMenuCode")) $("restoMenuCode").readOnly = false;
    if ($("btnCancelRestoMenuEdit")) $("btnCancelRestoMenuEdit").hidden = true;
    setPreview("");
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

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Compression de l’image impossible.")), "image/webp", quality);
    });
  }

  async function compressImage(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Choisissez une image valide.");
    const image = await loadImage(file);
    const maxSide = 1200;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.8;
    let blob = await canvasBlob(canvas, quality);
    while (blob.size > 280 * 1024 && quality > 0.5) {
      quality -= 0.08;
      blob = await canvasBlob(canvas, quality);
    }
    const base = String(file.name || "produit").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "produit";
    return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: Date.now() });
  }

  async function deleteFileQuietly(fileId) {
    if (!fileId) return;
    try { await storage.deleteFile(bucketId, fileId); } catch (error) { console.warn("[MENU RESTO] Ancienne image non supprimée :", error); }
  }

  function upsertProduct(product) {
    const index = state.products.findIndex((item) => item.$id === product.$id);
    if (index >= 0) state.products[index] = product;
    else state.products.push(product);
    renderProducts();
    window.dispatchEvent(new CustomEvent("calypso:resto-menu-changed"));
  }

  async function saveProduct(form) {
    if (!state.loaded) {
      showStatus("Chargez d’abord le menu.", "error");
      return;
    }
    const id = $("restoMenuDocumentId")?.value || "";
    const current = state.products.find((product) => product.$id === id);
    const code = String($("restoMenuCode")?.value || "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      showStatus("Le code produit accepte uniquement lettres, chiffres, tiret et soulignement.", "error");
      return;
    }
    const duplicate = state.products.find((product) => product.$id !== id && String(product.code_produit).toUpperCase() === code);
    if (duplicate) {
      showStatus(`Le code ${code} est déjà utilisé.`, "error");
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    showStatus("Enregistrement du produit…");
    let uploadedFileId = "";
    try {
      const image = $("restoMenuImage")?.files?.[0];
      if (image) {
        const compressed = await compressImage(image);
        const uploaded = await storage.createFile(bucketId, Appwrite.ID.unique(), compressed);
        uploadedFileId = uploaded.$id;
      }
      const data = {
        code_produit: code,
        libelle: String($("restoMenuLabel")?.value || "").trim(),
        categorie: String($("restoMenuCategory")?.value || "").trim(),
        prix_unitaire: Number($("restoMenuPrice")?.value || 0),
        actif: Boolean($("restoMenuActive")?.checked)
      };
      if (uploadedFileId) data.image_file_id = uploadedFileId;

      const product = id
        ? await db.updateDocument(databaseId, tableId, id, data)
        : await db.createDocument(databaseId, tableId, Appwrite.ID.unique(), data);
      if (uploadedFileId && current?.image_file_id && current.image_file_id !== uploadedFileId) {
        await deleteFileQuietly(current.image_file_id);
      }
      upsertProduct(product);
      resetForm();
      showStatus("Produit enregistré.", "success");
    } catch (error) {
      if (uploadedFileId) await deleteFileQuietly(uploadedFileId);
      console.error("[MENU RESTO] Enregistrement impossible :", error);
      showStatus(friendlyError(error), "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function editProduct(product) {
    $("restoMenuDocumentId").value = product.$id;
    $("restoMenuCode").value = product.code_produit || "";
    $("restoMenuCode").readOnly = true;
    $("restoMenuLabel").value = product.libelle || "";
    $("restoMenuCategory").value = product.categorie || "";
    $("restoMenuPrice").value = String(Number(product.prix_unitaire) || 0);
    $("restoMenuActive").checked = Boolean(product.actif);
    $("btnCancelRestoMenuEdit").hidden = false;
    setPreview(fileViewUrl(product.image_file_id));
    $("restoMenuLabel").focus();
  }

  async function toggleProduct(product, button) {
    button.disabled = true;
    try {
      const updated = await db.updateDocument(databaseId, tableId, product.$id, { actif: !product.actif });
      upsertProduct(updated);
      showStatus(updated.actif ? "Produit remis en vente." : "Produit masqué du poste restauration.", "success");
    } catch (error) {
      console.error("[MENU RESTO] Modification impossible :", error);
      showStatus(friendlyError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("btnLoadRestoMenu")?.addEventListener("click", loadMenu);
    $("restoMenuForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveProduct(event.currentTarget);
    });
    $("btnCancelRestoMenuEdit")?.addEventListener("click", resetForm);
    $("restoMenuCode")?.addEventListener("input", (event) => {
      event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    });
    $("restoMenuImage")?.addEventListener("change", (event) => {
      revokePreview();
      const file = event.target.files?.[0];
      if (!file) return setPreview("");
      previewObjectUrl = URL.createObjectURL(file);
      setPreview(previewObjectUrl);
    });
    $("restoMenuAdminList")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-resto-action]");
      if (!button) return;
      const product = state.products.find((item) => item.$id === button.dataset.restoId);
      if (!product) return;
      if (button.dataset.restoAction === "edit") editProduct(product);
      if (button.dataset.restoAction === "toggle") toggleProduct(product, button);
    });
  });
})();
