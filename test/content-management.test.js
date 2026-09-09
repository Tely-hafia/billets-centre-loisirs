const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("l’administration propose le contenu sans le charger automatiquement", () => {
  const html = read("admin.html");
  const source = read("js/content-admin.js");
  const admin = read("js/admin-appwrite.js");

  assert.match(html, /id="btnAdminModeContent"/);
  assert.match(html, /id="btnLoadSiteContent"/);
  assert.match(html, /id="eventContentForm"/);
  assert.match(html, /id="galleryContentForm"/);
  assert.match(html, /id="alertContentForm"/);
  assert.match(html, /Envoyer l’alerte/);
  assert.match(html, /id="galleryDisplayMode"/);
  assert.match(admin, /switchAdminMode\("content"\)/);
  assert.match(source, /btnLoadSiteContent[^\n]+addEventListener\("click", loadContent\)/);
  assert.match(source, /type_contenu: "alert"/);
  assert.match(source, /saveDocument\("alert"/);
  assert.doesNotMatch(source, /DOMContentLoaded[\s\S]{0,300}loadContent\(\)/);
});

test("les médias sont compressés et les suppressions nettoient les fichiers", () => {
  const source = read("js/content-admin.js");
  assert.match(source, /maxSide = 1600/);
  assert.match(source, /"image\/webp"/);
  assert.match(source, /320 \* 1024/);
  assert.match(source, /storage\.createFile/);
  assert.match(source, /storage\.deleteFile/);
});

test("le contenu public utilise une lecture commune et un cache de dix minutes", () => {
  const source = read("js/public-content.js");
  const html = read("index.html");
  assert.match(source, /CACHE_TTL = 10 \* 60 \* 1000/);
  assert.match(source, /MAX_GALLERY_IMAGES = 24/);
  assert.equal((source.match(/listDocuments\(/g) || []).length, 1);
  assert.doesNotMatch(source, /setInterval|subscribe|Realtime/);
  assert.match(html, /js\/public-content\.js\?v=2/);
  assert.match(html, /id="upcomingEventsList"/);
});

test("l’installation PWA est discrète sur la connexion et le choix du poste", () => {
  const pwa = read("js/pwa.js");
  for (const page of ["connexion.html", "postes.html"]) {
    assert.match(read(page), /pwa-install-host/);
  }
  assert.match(pwa, /showInstallAction\(\);/);
  assert.match(pwa, /showManualInstallHint/);
  assert.match(pwa, /appinstalled/);
  assert.match(pwa, /isStandalone\(\)/);
});

test("la migration utilise la base existante et un seul bucket", () => {
  const config = read("js/appwrite-config.js");
  const migration = read("docs/APPWRITE_MIGRATION.md");
  assert.match(config, /contenuSite: "contenu_site"/);
  assert.match(config, /contenuMedia: "69222b6c00245678b63c"/);
  assert.match(migration, /Ne créez pas une deuxième base de données/);
  assert.match(migration, /réutilisez le bucket existant/);
  assert.match(migration, /une seule lecture/);
});
