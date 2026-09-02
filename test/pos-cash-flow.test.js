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

test("la caisse est journalière et sa clôture n'est pas imposée à l'agent", () => {
  assert.match(agentHtml, /Espèces reçues pour démarrer/);
  assert.doesNotMatch(agentHtml, /Clôturer mon service|cashActual|cashCloseComment/);
  assert.match(agentSource, /getDayKey\(session\.ouverture \|\| session\.\$createdAt\) === getDayKey\(\)/);
});

test("l'administration sépare le jour, l'historique, les billets et l'équipe", () => {
  assert.match(adminHtml, /Aujourd’hui/);
  assert.match(adminHtml, /Historique & comptabilité/);
  assert.match(adminHtml, /Gestion des billets/);
  assert.match(adminHtml, /Équipe & accès/);
  assert.match(adminSource, /getAdminHistoryRange/);
  assert.match(adminSource, /admin-delete-ticket/);
});

test("le poste billets affiche le prix Appwrite avant le panier", () => {
  assert.match(agentHtml, /id="ticketPreviewType"/);
  assert.match(agentHtml, /id="ticketPreviewPrice"/);
  assert.match(agentHtml, /id="btnAddTicket"/);
  assert.match(agentHtml, /id="btnValidateTicketCart"/);
  assert.match(agentSource, /CalypsoTicketWorkflow\.getTicketPrice\(billet, tarifChoisi\)/);
});

test("une permission de session refusée ne bloque plus l'ouverture", () => {
  assert.match(agentSource, /permissionDenied/);
  assert.match(agentSource, /createLocalCashSession\(fonds\)/);
  assert.match(agentSource, /saveLocalCashSession\(currentCashSession\)/);
});

test("l'annulation et le remboursement restent réservés à l'administration", () => {
  assert.doesNotMatch(agentHtml, /Annuler \/ rembourser|Remboursement/);
  assert.match(adminHtml, /id="btnAdminRefund"/);
  assert.match(adminSource, /type: "REMBOURSEMENT"/);
  assert.match(adminSource, /approbateur_id: currentAdmin\.\$id/);
});
