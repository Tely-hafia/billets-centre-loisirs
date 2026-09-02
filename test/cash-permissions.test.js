const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const agentSource = fs.readFileSync(
  path.join(__dirname, "..", "js", "agent-appwrite.js"),
  "utf8"
);

test("Appwrite attribue automatiquement la caisse à l'agent qui l'ouvre", () => {
  const start = agentSource.indexOf("async function ouvrirCaisse()");
  const end = agentSource.indexOf("async function ajouterMouvementCaisse()", start);
  const ouvrirCaisseSource = agentSource.slice(start, end);

  assert.match(ouvrirCaisseSource, /db\.createDocument\(/);
  assert.doesNotMatch(ouvrirCaisseSource, /Appwrite\.Permission/);
});
