(function (global) {
  "use strict";
  const MAX_TICKETS = 30;
  const scripts = new Map();
  let stream = null;
  let cameraRun = 0;
  const $ = id => document.getElementById(id);
  function encode(items) {
    if (!items.length || items.length > MAX_TICKETS) throw new Error("Le reçu doit contenir de 1 à 30 billets.");
    return "CALY1:" + encodeURIComponent(JSON.stringify(items.map(item => [item.mode, item.documentId, item.numero_billet])));
  }
  function decode(value) {
    if (typeof value !== "string" || value.length > 8000 || !value.startsWith("CALY1:")) throw new Error("Ce QR n’est pas un reçu Calypço.");
    let items;
    try { items = JSON.parse(decodeURIComponent(value.slice(6))); } catch (_) { throw new Error("Reçu illisible."); }
    if (!Array.isArray(items) || !items.length || items.length > MAX_TICKETS) throw new Error("Nombre de billets invalide.");
    const seen = new Set();
    return items.map(row => {
      if (!Array.isArray(row) || row.length !== 3 || !["ENTREE", "JEU"].includes(row[0]) ||
          typeof row[1] !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(row[1]) ||
          typeof row[2] !== "string" || !row[2].trim() || row[2].length > 100) throw new Error("Billet invalide dans le reçu.");
      const key = row[0] + ":" + row[1];
      if (seen.has(key)) throw new Error("Le reçu contient deux fois le même billet.");
      seen.add(key);
      return { mode: row[0], documentId: row[1], numero_billet: row[2] };
    });
  }
  function loadScript(path) {
    if (!scripts.has(path)) scripts.set(path, new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = path; script.onload = resolve;
      script.onerror = () => { scripts.delete(path); script.remove(); reject(new Error("Chargement QR impossible. Utilisez les numéros du reçu.")); };
      document.head.append(script);
    }));
    return scripts.get(path);
  }
  async function show(items, payment) {
    const receipt = $("ticketReceipt"); if (!receipt || !items.length) return;
    receipt.hidden = false; $("ticketReceiptDate").textContent = new Date().toLocaleString("fr-FR");
    const lines = $("ticketReceiptLines"); lines.replaceChildren();
    for (const item of items) { const li = document.createElement("li"); li.textContent = `${item.numero_billet} · ${item.type} · ${Number(item.prix).toLocaleString("fr-FR")} GNF`; lines.append(li); }
    const total = items.reduce((sum, item) => sum + Number(item.prix), 0);
    $("ticketReceiptTotal").textContent = `Total : ${total.toLocaleString("fr-FR")} GNF`;
    $("ticketReceiptPayment").textContent = payment ? `Espèces reçues : ${payment.montantRecu.toLocaleString("fr-FR")} GNF · Monnaie : ${payment.monnaieRendue.toLocaleString("fr-FR")} GNF` : "Reçu partiel : seuls les billets enregistrés ci-dessus ont été vendus. Faites vérifier le règlement avant de poursuivre.";
    const container = $("ticketReceiptQR"); container.textContent = "Préparation du QR…";
    try { await loadScript("js/vendor/qrcode.js"); const qr = global.qrcode(0, "M"); qr.addData(encode(items)); qr.make(); container.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }); }
    catch (error) { container.textContent = error.message; }
  }
  function stopCamera() {
    cameraRun += 1; if (stream) stream.getTracks().forEach(track => track.stop()); stream = null;
    if (typeof document !== "undefined" && $("qrVideo")) { $("qrVideo").srcObject = null; $("qrCamera").hidden = true; }
  }
  async function startCamera(onRead, onError) {
    stopCamera(); const run = cameraRun;
    try {
      if (!global.navigator?.mediaDevices?.getUserMedia) throw new Error("Caméra indisponible. Saisissez le numéro du billet.");
      await loadScript("js/vendor/jsQR.js"); if (run !== cameraRun) return;
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 } }, audio: false });
      if (run !== cameraRun) { camera.getTracks().forEach(track => track.stop()); return; }
      stream = camera; const video = $("qrVideo"); $("qrCamera").hidden = false; video.srcObject = stream; await video.play();
      const canvas = document.createElement("canvas"); const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const tick = () => {
        if (run !== cameraRun || !stream) return;
        if (video.readyState >= 2 && video.videoWidth) {
          canvas.width = 640; canvas.height = Math.round(640 * video.videoHeight / video.videoWidth); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height); const code = global.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
          if (code) { stopCamera(); onRead(code.data); return; }
        }
        setTimeout(tick, 180);
      }; tick();
    } catch (error) { stopCamera(); onError(error); }
  }
  if (typeof document !== "undefined") { document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); }); global.addEventListener("pagehide", stopCamera); }
  global.CalypsoReceipts = Object.freeze({ encode, decode, show, startCamera, stopCamera });
})(typeof window !== "undefined" ? window : globalThis);
