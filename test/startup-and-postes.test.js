const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("les deux applications chargent le démarrage animé", () => {
  for (const page of ["index.html", "experiences.html", "contact.html", "connexion.html", "postes.html", "agent.html", "admin.html", "accept-invite.html", "reset-password.html", "offline.html"]) {
    assert.match(read(page), /js\/startup\.js\?v=1/, `${page} doit charger le démarrage`);
  }

  const source = read("js/startup.js");
  const styles = read("css/app-v2.css");
  assert.match(source, /assets\/icons\/calypso-officiel\.png/);
  assert.match(source, /2300/);
  assert.match(source, /applicationReady/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(styles, /@keyframes calypso-logo-reveal/);
  assert.match(styles, /@keyframes calypso-wave-flow/);
  assert.match(styles, /\.calypso-splash-wave/);
});

test("Changer de poste reste réservé à l'administrateur", () => {
  const agentHtml = read("agent.html");
  const agentSource = read("js/agent-appwrite.js");
  const adminHtml = read("admin.html");

  assert.match(agentHtml, /id="agentAdminPostLink" href="postes\.html"[^>]*hidden/);
  assert.match(agentSource, /agentAdminPostLink"\)\.hidden = !isAdmin/);
  assert.match(adminHtml, /href="postes\.html"[^>]*>Changer de poste</);
  assert.match(read("js/postes.js"), /restore\(\[CalypsoConfig\.staffRoles\.admin\]\)/);
});
