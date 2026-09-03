const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.resolve(__dirname, "../admin.html"), "utf8");
const source = fs.readFileSync(path.resolve(__dirname, "../js/admin-appwrite.js"), "utf8");

test("le tableau de bord admin est synthétique", () => {
  assert.doesNotMatch(html, /dashboard-welcome|Activité d’aujourd’hui/);
  assert.doesNotMatch(html, /Caisses de la période|Mouvements à approuver|Journal des actions par agent/);
  assert.match(html, /id="dashboardPeriod"/);
  assert.match(html, /value="today"/);
  assert.match(html, /value="week"/);
  assert.match(html, /value="month"/);
  assert.match(html, /value="year"/);
});

test("le journal affiche une ligne synthétique par agent et par jour", () => {
  assert.match(html, /Journal quotidien des agents/);
  assert.match(html, /<th>Date<\/th>/);
  assert.match(html, /<th>Ouverture<\/th>/);
  assert.match(html, /<th>Fermeture<\/th>/);
  assert.match(html, /<th>Agent<\/th>/);
  assert.match(html, /<th>Fonds de caisse<\/th>/);
  assert.match(html, /<th>Billets vendus<\/th>/);
  assert.match(html, /<th>Recette billets<\/th>/);
  assert.match(html, /<th>Recette billets internes<\/th>/);
  assert.match(html, /<th>Anomalies<\/th>/);
  assert.match(source, /buildAgentAlertCounts/);
  assert.match(source, /cashSessionDocs/);
});

test("les billets inutilisés chargés restent modifiables et supprimables", () => {
  assert.match(html, /id="ticketManagementPeriod"/);
  assert.match(html, /value="day"/);
  assert.match(html, /value="week"/);
  assert.match(html, /id="btnDeleteDisplayedTickets"/);
  assert.match(source, /supprimerBilletsInutilisesAffiches/);
  assert.match(source, /CalypsoTicketWorkflow\.canSell/);
});
