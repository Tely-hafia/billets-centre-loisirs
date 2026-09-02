const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("le manifeste PWA contient les informations d'installation", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));

  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /connexion\.html/);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));

  manifest.icons.forEach((icon) => {
    assert.ok(fs.existsSync(path.join(root, icon.src)), `${icon.src} doit exister`);
  });
});

test("les pages professionnelles chargent le manifeste et le gestionnaire PWA", () => {
  for (const page of ["connexion.html", "agent.html", "admin.html", "accept-invite.html", "reset-password.html"]) {
    const html = read(page);
    assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
    assert.match(html, /src="js\/pwa\.js\?v=1"/);
  }
});

test("le service worker exclut les origines distantes du cache", () => {
  const source = read("service-worker.js");

  assert.match(source, /url\.origin !== self\.location\.origin/);
  assert.match(source, /request\.method !== "GET"/);
  assert.match(source, /offline\.html/);
});

test("les interfaces principales utilisent des identifiants HTML uniques", () => {
  for (const page of ["index.html", "agent.html", "admin.html"]) {
    const ids = [...read(page).matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual(duplicates, [], `${page} contient des identifiants dupliqués`);
  }
});
