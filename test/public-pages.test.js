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
  assert.doesNotMatch(html, /galleryPause|Mettre en pause/);
  assert.doesNotMatch(html, /Nos Expériences Uniques/);
  assert.doesNotMatch(html, /Informations Pratiques/);
  assert.doesNotMatch(html, /Accès Professionnel/);
  assert.match(html, /class="footer-team-access"[^>]*>Espace équipe<\/a>/);
  assert.doesNotMatch(html.match(/<nav class="public-nav"[\s\S]*?<\/nav>/)?.[0] || "", /connexion\.html|Administration|Espace équipe/);
});

test("les événements ont une grande image recadrée et un badge de date", () => {
  const source = read("js/gallery.js");
  const styles = read("css/app-v2.css");

  assert.match(source, /upcoming-event-date-badge/);
  assert.match(source, /toLocaleString\("fr-FR", \{ day: "2-digit" \}\)/);
  assert.match(source, /toLocaleString\("fr-FR", \{ month: "short" \}\)/);
  assert.match(styles, /\.upcoming-event-visual img\s*\{[\s\S]*?object-fit:\s*cover/);
  assert.match(styles, /\.upcoming-event-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px, 38%\) minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.upcoming-event-card \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test("le carrousel défile toutes les six secondes seulement lorsqu'il est visible", () => {
  const source = read("js/gallery.js");
  assert.doesNotMatch(source, /galleryPause|pauseButton|Mettre en pause/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /!document\.hidden && visible/);
  assert.match(source, /6000/);
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
