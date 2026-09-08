const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const agentHtml = fs.readFileSync(path.resolve(__dirname, "../agent.html"), "utf8");
const adminHtml = fs.readFileSync(path.resolve(__dirname, "../admin.html"), "utf8");
const agentSource = fs.readFileSync(path.resolve(__dirname, "../js/agent-appwrite.js"), "utf8");
const adminSource = fs.readFileSync(path.resolve(__dirname, "../js/admin-appwrite.js"), "utf8");
const connexionHtml = fs.readFileSync(path.resolve(__dirname, "../connexion.html"), "utf8");
const connexionSource = fs.readFileSync(path.resolve(__dirname, "../js/connexion.js"), "utf8");

test("la caisse agent accepte uniquement les espèces", () => {
  assert.doesNotMatch(agentHtml, /Orange Money|MTN Money/);
  assert.match(agentHtml, /Espèces reçues/);
  assert.match(agentSource, /moyenPaiement: CalypsoConfig\.paymentMethods\.especes/);
});

test("la connexion attend explicitement le clic de l'utilisateur", () => {
  assert.match(connexionHtml, /id="staffLoginForm"/);
  assert.match(connexionSource, /form\?\.addEventListener\("submit"/);
  assert.doesNotMatch(connexionSource, /CalypsoAuth\.restore/);
  assert.match(agentSource, /sessionStorage\.getItem\("calypso_access_granted"\)/);
  assert.match(adminSource, /sessionStorage\.getItem\("calypso_access_granted"\)/);
});

test("la caisse journalise ouverture et clôture explicites", () => {
  assert.match(agentHtml, /Espèces reçues pour démarrer/);
  assert.match(agentHtml, /cashActual/);
  assert.match(agentHtml, /cashCloseComment/);
  assert.match(agentSource, /fermeture: closingTime/);
  assert.match(agentHtml, /id="cashOpeningRecorded"/);
  assert.match(agentHtml, /id="cashSalesRecorded"/);
  assert.match(agentHtml, /Caisse par service/);
  assert.match(agentHtml, /id="cashOpeningFloat"[^>]+placeholder="Saisir le fonds reçu"/);
  assert.doesNotMatch(agentHtml, /id="cashOpeningFloat"[^>]+value=/);
  assert.match(agentSource, /Appwrite\.ID\.unique\(\)/);
  assert.doesNotMatch(agentSource, /getDayKey|isPreviousCashSession/);
  assert.match(agentSource, /Régularisation automatique d’une ancienne session restée ouverte/);
  assert.match(agentSource, /markCashClosedThrough\(closingTime, cashPoste\)/);
  assert.match(agentSource, /Promise\.allSettled\(legacySessions\.map/);
  assert.match(agentSource, /Vous pouvez ouvrir une nouvelle caisse/);
});

test("le reçu billets peut être fermé et disparaît après impression", () => {
  assert.match(agentHtml, /id="btnCloseTicketReceipt"/);
  assert.match(agentSource, /window\.addEventListener\("afterprint", fermerRecuBillets\)/);
  assert.match(agentSource, /receipt\.hidden = true/);
});

test("l'administration sépare le jour, l'historique, les billets et l'équipe", () => {
  assert.match(adminHtml, /Aujourd’hui/);
  assert.match(adminHtml, />\s*Comptabilité\s*</);
  assert.match(adminHtml, /Gestion des billets/);
  assert.match(adminHtml, /Équipe et accès/);
  assert.match(adminHtml, /id="reservationStartDate"/);
  assert.doesNotMatch(adminHtml, /id="admin-history-filter"/);
  assert.match(adminSource, /admin-delete-ticket/);
});

test("le tableau de bord admin reste synthétique", () => {
  assert.doesNotMatch(adminHtml, /dashboard-welcome|Activité d’aujourd’hui/);
  assert.doesNotMatch(adminHtml, /Caisses de la période|Mouvements à approuver|Journal des actions par agent/);
  assert.match(adminHtml, /id="dashboardPeriod"/);
  assert.match(adminHtml, /Journal quotidien des agents/);
  assert.match(adminHtml, /Fonds de caisse/);
  assert.match(adminHtml, /Recette billets internes/);
  assert.match(adminHtml, /Alertes à vérifier/);
  assert.match(adminSource, /cashSessionDocs/);
  assert.match(adminSource, /buildAgentAlertCounts/);
});

test("les stocks entrée et interne se gèrent sans filtre quotidien", () => {
  assert.doesNotMatch(adminHtml, /id="ticketManagementPeriod"/);
  assert.match(adminHtml, /id="ticketManagementType"/);
  assert.match(adminHtml, /id="btnDeleteDisplayedTickets"/);
  assert.match(adminSource, /supprimerBilletsInutilisesAffiches/);
});

test("le poste billets affiche le prix Appwrite avant le panier", () => {
  assert.match(agentHtml, /id="ticketPreviewType"/);
  assert.match(agentHtml, /id="ticketPreviewPrice"/);
  assert.match(agentHtml, /id="btnAddTicket"/);
  assert.match(agentHtml, /id="btnValidateTicketCart"/);
  assert.match(agentSource, /CalypsoTicketWorkflow\.getTicketPrice\(billet, tarifChoisi\)/);
});

test("une permission refusée ne crée jamais une fausse caisse locale", () => {
  assert.doesNotMatch(agentSource, /createLocalCashSession|localFallback|saveLocalCashSession/);
  assert.match(agentSource, /CalypsoData\.errorMessage\(error, "Ouverture de caisse"\)/);
});

test("l'annulation et le remboursement restent réservés à l'administration", () => {
  assert.doesNotMatch(agentHtml, /Annuler \/ rembourser|Remboursement/);
  assert.match(adminHtml, /id="btnAdminRefund"/);
  assert.match(adminSource, /type: "REMBOURSEMENT"/);
  assert.match(adminSource, /approbateur_id: currentAdmin\.\$id/);
});
