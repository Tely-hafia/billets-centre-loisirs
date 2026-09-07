(function (global) {
  "use strict";
  let selected = [], busy = false, context;
  const $ = id => document.getElementById(id);
  function message(text, type = "info") { const el = $("control-result"); el.style.display = "block"; el.className = "result " + type; el.textContent = text; }
  function checkRole() { if (!context?.allowed()) throw new Error("Votre rôle ne permet pas de contrôler les entrées."); if (!navigator.onLine) throw new Error("Internet est nécessaire pour vérifier la vente."); }
  async function lookup(items) {
    const { databaseId: database, tables } = CalypsoConfig; const db = CalypsoAppwrite.databases; const entries = items.filter(item => item.mode === "ENTREE"); if (!entries.length) return [];
    const [stock, journal] = await Promise.all([
      CalypsoData.listAll(db, database, tables.billets, [Appwrite.Query.equal("$id", entries.map(item => item.documentId))]),
      CalypsoData.listAll(db, database, tables.validations, [Appwrite.Query.equal("numero_billet", entries.map(item => item.numero_billet))])
    ]);
    const sessionIds = [...new Set(journal.documents.filter(d => d.poste_id === "VENTE_ENTREE" && d.session_caisse_id).map(d => d.session_caisse_id))];
    const refunds = sessionIds.length ? await CalypsoData.listAll(db, database, tables.mouvementsCaisse, [Appwrite.Query.equal("session_id", sessionIds), Appwrite.Query.equal("type", "REMBOURSEMENT"), Appwrite.Query.equal("statut", "APPROUVE")]) : { documents: [] };
    return entries.map(item => {
      const ticket = stock.documents.find(d => d.$id === item.documentId && d.numero_billet === item.numero_billet);
      const events = journal.documents.filter(d => d.billet_id === item.documentId || (!d.billet_id && d.numero_billet === item.numero_billet)); const sale = events.find(d => d.poste_id === "VENTE_ENTREE");
      let error = !ticket ? "Billet inconnu" : CalypsoTicketWorkflow.getConfirmationRefusal(ticket.statut);
      if (!error && !sale) error = "Vente introuvable"; if (events.some(d => d.poste_id === "CONTROLE_ENTREE")) error = "Entrée déjà confirmée";
      if (refunds.documents.some(d => d.session_id === sale?.session_caisse_id && String(d.motif || "").includes(`[VENTE:${item.numero_billet}]`))) error = "Billet remboursé : entrée refusée";
      return { ...item, ticket, sale, error };
    });
  }
  function render(rows, internalCount = 0) {
    const body = $("controlChecks"); body.replaceChildren();
    rows.forEach(row => { const li = document.createElement("li"); li.textContent = `${row.numero_billet} — ${row.error || "Vendu, prêt pour l’entrée"}`; body.append(li); });
    if (internalCount) { const li = document.createElement("li"); li.textContent = internalCount + " billet(s) de jeux internes : ne donnent pas droit à une entrée."; body.append(li); }
    selected = rows.filter(row => !row.error).map(row => ({ mode: "ENTREE", documentId: row.documentId, numero_billet: row.numero_billet }));
    $("btnConfirmChecked").hidden = selected.length === 0; $("btnConfirmChecked").textContent = `Confirmer ${selected.length} entrée(s)`;
  }
  async function verify(value, isQR = false) {
    if (busy) return; busy = true; selected = []; $("btnConfirmChecked").hidden = true; $("controlChecks").replaceChildren();
    try {
      checkRole(); message("Vérification dans Appwrite…"); let items;
      if (isQR) items = CalypsoReceipts.decode(value);
      else { if (!value?.trim()) throw new Error("Saisissez le numéro du billet."); const result = await CalypsoAppwrite.databases.listDocuments(CalypsoConfig.databaseId, CalypsoConfig.tables.billets, [Appwrite.Query.equal("numero_billet", value.trim()), Appwrite.Query.limit(2)]); if (result.documents.length !== 1) throw new Error("Billet inconnu ou numéro ambigu : demandez le reçu QR au gérant."); const ticket = result.documents[0]; items = [{ mode: "ENTREE", documentId: ticket.$id, numero_billet: ticket.numero_billet }]; }
      const rows = await lookup(items); render(rows, items.filter(item => item.mode !== "ENTREE").length); message(selected.length ? "Vérifiez le groupe, puis confirmez les entrées autorisées." : "Aucune entrée ne peut être confirmée.", selected.length ? "ok" : "error");
    } catch (error) { message(CalypsoData.errorMessage(error, "Vérification"), "error"); } finally { busy = false; }
  }
  async function confirm() {
    if (busy || !selected.length) return; busy = true; $("btnConfirmChecked").disabled = true; let completed = 0; const warnings = [];
    try {
      checkRole(); const rows = await lookup(selected);
      for (const row of rows) {
        if (row.error) { warnings.push(`${row.numero_billet} : ${row.error}`); continue; } const ticket = row.ticket;
        await CalypsoAppwrite.databases.createDocument(CalypsoConfig.databaseId, CalypsoConfig.tables.validations, await CalypsoData.eventId("ctl", ticket.$id), {
          numero_billet: ticket.numero_billet, billet_id: ticket.$id, date_validation: new Date().toISOString(), type_acces: ticket.type_acces || "", type_billet: ticket.type_billet || "", code_offre: ticket.code_offre || "ENTREE", tarif_normal: Number(ticket.prix || 0), tarif_etudiant: Number(ticket.tarif_universite || 0), tarif_applique: "controle", montant_paye: 0, agent_id: context.agent().$id, poste_id: "CONTROLE_ENTREE", numero_etudiant: "", moyen_paiement: "especes", montant_recu: 0, monnaie_rendue: 0
        }); completed += 1;
        try { await CalypsoAppwrite.databases.updateDocument(CalypsoConfig.databaseId, CalypsoConfig.tables.billets, ticket.$id, { statut: CalypsoConfig.ticketStatuses.confirme }); }
        catch (_) { warnings.push(`${ticket.numero_billet} : entrée enregistrée, statut du stock à synchroniser par l’administrateur`); }
      }
      message(`${completed} entrée(s) confirmée(s). ${warnings.join(" · ")}`, warnings.length ? "error" : "ok");
    } catch (error) { message(`${completed} entrée(s) enregistrée(s). ` + CalypsoData.errorMessage(error, "Confirmation"), "error"); }
    finally { busy = false; selected = []; $("btnConfirmChecked").disabled = false; $("btnConfirmChecked").hidden = true; $("controlTicketNumber").value = ""; $("controlChecks").replaceChildren(); }
  }
  function init(options) {
    context = options;
    $("btnScanReceipt").addEventListener("click", () => { if (busy) return; selected = []; $("btnConfirmChecked").hidden = true; CalypsoReceipts.startCamera(value => verify(value, true), error => message(error.message, "error")); });
    $("btnStopScanner").addEventListener("click", CalypsoReceipts.stopCamera); $("btnConfirmChecked").addEventListener("click", confirm);
    $("controlTicketNumber").addEventListener("input", () => { selected = []; $("btnConfirmChecked").hidden = true; });
  }
  global.CalypsoAccess = Object.freeze({ init, verify });
})(window);
