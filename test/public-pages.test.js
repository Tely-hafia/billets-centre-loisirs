const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("l'accueil se concentre sur la galerie Calypço", () => {
  const html = read("index.html");

  assert.match(html, /Découvrez le Calypço/);
  assert.match(html, /id="carouselTrack"/);
  assert.doesNotMatch(html, /Nos Expériences Uniques/);
  assert.doesNotMatch(html, /Informations Pratiques/);
  assert.doesNotMatch(html, /Accès Professionnel/);
});

test("les pages publiques proposent les accès importants en haut", () => {
  for (const page of ["index.html", "experiences.html", "contact.html"]) {
    const html = read(page);
    const nav = html.match(/<nav class="public-nav"[\s\S]*?<\/nav>/)?.[0] || "";

    assert.match(nav, /experiences\.html/);
    assert.match(nav, /contact\.html/);
    assert.match(nav, /Réserver/);
    assert.match(nav, /agent\.html/);
    assert.match(nav, /admin\.html/);
  }
});

test("les contenus détaillés sont rangés dans les pages dédiées", () => {
  const experiences = read("experiences.html");
  const contact = read("contact.html");

  assert.match(experiences, /Gaming & E-sport/);
  assert.match(experiences, /Piscine & détente/);
  assert.match(experiences, /Détente & restauration/);
  assert.match(contact, /10h – 02h/);
  assert.match(contact, /Postuler/);
  assert.match(contact, /Nous trouver/);
});
