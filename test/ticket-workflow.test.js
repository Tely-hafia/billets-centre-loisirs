const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../js/ticket-workflow.js"),
  "utf8"
);
const fixture = {};
vm.runInNewContext(source, fixture);
const workflow = fixture.CalypsoTicketWorkflow;

test("reconnaît les anciens et nouveaux statuts de billet", () => {
  assert.equal(workflow.normalizeStatus("Non utilisé"), "available");
  assert.equal(workflow.normalizeStatus("Disponible"), "available");
  assert.equal(workflow.normalizeStatus("Vendu"), "sold");
  assert.equal(workflow.normalizeStatus("Validé"), "confirmed");
  assert.equal(workflow.normalizeStatus("Entrée confirmée"), "confirmed");
});

test("le gérant vend uniquement un billet disponible", () => {
  assert.equal(workflow.canSell("Disponible"), true);
  assert.equal(workflow.canSell("Vendu"), false);
  assert.match(workflow.getSaleRefusal("Validé"), /déjà servi/);
});

test("le contrôleur confirme uniquement un billet vendu", () => {
  assert.equal(workflow.canConfirm("Vendu"), true);
  assert.equal(workflow.canConfirm("Non utilisé"), false);
  assert.match(workflow.getConfirmationRefusal("Non utilisé"), /non vendu/);
  assert.match(workflow.getConfirmationRefusal("Entrée confirmée"), /Double utilisation/);
});

test("calcule le prix Appwrite et le total du panier", () => {
  const ticket = { prix: 40000, tarif_universite: 25000 };
  assert.equal(workflow.getTicketPrice(ticket, "normal"), 40000);
  assert.equal(workflow.getTicketPrice(ticket, "etudiant"), 25000);
  assert.equal(workflow.getCartTotal([{ prix: 40000 }, { prix: 15000 }]), 55000);
});

test("calcule la monnaie uniquement si les espèces suffisent", () => {
  assert.equal(workflow.getCashChange(55000, 60000), 5000);
  assert.equal(workflow.getCashChange(55000, 50000), null);
});
