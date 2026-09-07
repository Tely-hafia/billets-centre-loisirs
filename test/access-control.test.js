const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "access-control.js"), "utf8");
const agent = fs.readFileSync(path.join(__dirname, "..", "js", "agent-appwrite.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "agent.html"), "utf8");

test("le contrôle accepte la saisie manuelle et le reçu QR groupé", () => {
  assert.match(html, /id="controlTicketNumber"/);
  assert.match(html, /id="btnScanReceipt"/);
  assert.match(html, /id="qrVideo"/);
  assert.match(html, /id="btnConfirmChecked"/);
  assert.match(source, /CalypsoReceipts\.decode\(value\)/);
});

test("un billet doit avoir une vente avant toute confirmation", () => {
  assert.match(source, /if \(!error && !sale\) error = "Vente introuvable"/);
  assert.match(source, /Entrée déjà confirmée/);
  assert.match(source, /Billet remboursé : entrée refusée/);
  assert.match(source, /getConfirmationRefusal\(ticket\.statut\)/);
});

test("le contrôle relit l'état avant d'écrire et utilise un identifiant déterministe", () => {
  const confirmStart = source.indexOf("async function confirm()");
  const confirmSource = source.slice(confirmStart);
  assert.match(confirmSource, /const rows = await lookup\(selected\)/);
  assert.match(confirmSource, /await CalypsoData\.eventId\("ctl", ticket\.\$id\)/);
  assert.match(confirmSource, /updateDocument/);
});

test("une caisse contrôle n'est jamais ouverte et le poste admin suit le mode choisi", () => {
  assert.match(agent, /function getCashPoste\(\) \{\s*return currentMode === "resto" \? "RESTO" : "GERANT";/);
  assert.match(agent, /currentMode !== "controle"/);
  assert.match(agent, /currentMode === "controle"/);
});
