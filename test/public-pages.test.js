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
  assert.match(html, /Événements à venir/);
  assert.match(html, /upcoming-event-card/);
  assert.doesNotMatch(html, /Nos Expériences Uniques/);
  assert.doesNotMatch(html, /Informations Pratiques/);
  assert.doesNotMatch(html, /Accès Professionnel/);
  assert.match(html, /class="footer-team-access"[^>]*>Espace équipe<\/a>/);
  assert.doesNotMatch(html.match(/<nav class="public-nav"[\s\S]*?<\/nav>/)?.[0] || "", /connexion\.html|Administration|Espace équipe/);
});

test("les pages publiques proposent les accès importants en haut", () => {
  for (const page of ["index.html", "experiences.html", "contact.html"]) {
    const html = read(page);
    const nav = html.match(/<nav class="public-nav"[\s\S]*?<\/nav>/)?.[0] || "";

    assert.match(nav, /experiences\.html/);
    assert.match(nav, /contact\.html/);
    assert.match(nav, /Réserver/);
    assert.doesNotMatch(nav, /connexion\.html/);
    assert.match(html, /class="footer-team-access"[^>]*href="connexion\.html"/);
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
  assert.match(contact, /contact-hero/);
  assert.match(contact, /assets\/icons\/calypso-officiel\.png/);
  assert.match(contact, /Voir l’itinéraire/);
});

test("le logo officiel est utilisé dans les en-têtes", () => {
  for (const page of ["index.html", "experiences.html", "contact.html", "connexion.html", "admin.html", "agent.html"]) {
    assert.match(read(page), /class="brand-logo" src="assets\/icons\/calypso-officiel\.png"/);
  }
});
