const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("le manifeste équipe conserve son démarrage et utilise le logo officiel", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));

  assert.equal(manifest.name, "Calypço Équipe");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /connexion\.html/);
  assert.ok(manifest.icons.length > 0);

  manifest.icons.forEach((icon) => {
    assert.equal(icon.src, "assets/icons/calypso-officiel.png");
    assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} doit exister`);
  });
});

test("le manifeste public décrit l'application client et ses raccourcis", () => {
  const manifest = JSON.parse(read("manifest-public.webmanifest"));

  assert.equal(manifest.name, "Calypço – Centre de loisirs");
  assert.equal(manifest.short_name, "Calypço");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /index\.html/);
  assert.ok(manifest.icons.every((icon) => icon.src === "assets/icons/calypso-officiel.png"));
  assert.ok(manifest.shortcuts.some((shortcut) => /#evenements/.test(shortcut.url)));
  assert.ok(manifest.shortcuts.some((shortcut) => /#reservation-block/.test(shortcut.url)));
});

test("les pages professionnelles chargent le manifeste et le gestionnaire PWA", () => {
  for (const page of ["connexion.html", "postes.html", "agent.html", "admin.html", "accept-invite.html", "reset-password.html"]) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /src="js\/pwa\.js\?v=3"/);
  }
});

test("les pages publiques chargent le manifeste client et proposent l'installation", () => {
  for (const page of ["index.html", "experiences.html", "contact.html"]) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="manifest-public\.webmanifest"/);
    assert.match(html, /pwa-install-host/);
    assert.match(html, /src="js\/pwa\.js\?v=3"/);
  }

  const source = read("js/pwa.js");
  assert.match(source, /isPublicApp \? "Calypço" : "Calypço Équipe"/);
  assert.match(source, /Installer \$\{appName\}/);
  assert.match(source, /beforeinstallprompt/);
  assert.doesNotMatch(source, /installPrompt\.prompt\(\)[\s\S]{0,80}DOMContentLoaded/);
});

test("le service worker exclut les origines distantes du cache", () => {
  const source = read("service-worker.js");

  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /offline\.html/);
  assert.match(source, /calypso-equipe-v31/);
  assert.match(source, /manifest-public\.webmanifest/);
  assert.match(source, /js\/public-notifications\.js/);
  assert.match(source, /js\/startup\.js/);
  assert.match(source, /js\/resto-admin\.js/);
  assert.match(source, /assets\/icons\/calypso-officiel\.png/);
  assert.match(source, /addEventListener\("notificationclick"/);
  assert.match(source, /index\.html#evenements/);
});

test("toutes les pages utilisent des identifiants HTML uniques", () => {
  for (const page of fs.readdirSync(root).filter((file) => file.endsWith(".html"))) {
    const ids = [...read(page).matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, [], `${page} contient des identifiants dupliqués`);
  }
});

test("les pages vérifiées utilisent le logo officiel pour l'onglet et iOS", () => {
  for (const page of ["index.html", "experiences.html", "contact.html", "connexion.html", "postes.html", "agent.html", "admin.html", "accept-invite.html", "reset-password.html", "offline.html"]) {
    const html = read(page);
    assert.match(html, /rel="icon" href="assets\/icons\/calypso-officiel\.png"/);
    assert.match(html, /rel="apple-touch-icon" href="assets\/icons\/calypso-officiel\.png"/);
  }
});
