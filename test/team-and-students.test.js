const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
const admin = fs.readFileSync(path.join(root, "js/admin-appwrite.js"), "utf8");
const agent = fs.readFileSync(path.join(root, "js/agent-appwrite.js"), "utf8");
const migration = fs.readFileSync(path.join(root, "docs/APPWRITE_MIGRATION.md"), "utf8");

test("la gestion étudiant charge uniquement une recherche ciblée", () => {
  assert.match(html, /id="studentSearchMode"/);
  assert.match(html, /id="studentSearchResults" hidden/);
  assert.match(html, /Date de naissance/);
  assert.match(admin, /Query\.search\(field, value\)/);
  assert.match(admin, /Query\.limit\(10\)/);
});

test("la carte étudiant inclut photo, rentrée, QR et impression", () => {
  assert.match(html, /capture="user"/);
  assert.match(html, /id="studentCardQR"/);
  assert.match(admin, /CALYETU1:/);
  assert.match(admin, /compressStudentPhoto/);
  assert.match(admin, /printStudentCard/);
});

test("le tarif étudiant exige une carte renouvelée pour la rentrée", () => {
  assert.match(agent, /isStudentCardCurrent/);
  assert.match(agent, /hasOwnProperty\.call\(student, "annee_scolaire"\)/);
  assert.match(agent, /annee_scolaire === getCurrentStudentSchoolYear/);
  assert.match(migration, /photo_data/);
  assert.match(migration, /fulltext/);
});

test("les agents peuvent être partagés par WhatsApp et administrés", () => {
  assert.match(html, /id="btnShareAgentAccess"/);
  assert.match(html, /id="btnLoadStaff"/);
  assert.match(admin, /CalypsoAuth\.updateStaffRoles/);
  assert.match(admin, /CalypsoAuth\.deleteStaff/);
});
