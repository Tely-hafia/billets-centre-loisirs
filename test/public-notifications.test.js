const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("l'accueil ne présente plus de carte permanente d'activation", () => {
  const html = read("index.html");
  assert.doesNotMatch(html, /public-notifications-card|btnEnablePublicNotifications|Ne manquez pas les prochains événements/);
  assert.match(html, /js\/public-notifications\.js\?v=2/);
});

test("l'autorisation est proposée dans le démarrage installé et seulement après un clic", () => {
  const startup = read("js/startup.js");
  const clickHandlerIndex = startup.indexOf('enableButton.addEventListener("click"');
  const permissionIndex = startup.indexOf("Notification.requestPermission()");

  assert.ok(clickHandlerIndex >= 0);
  assert.ok(permissionIndex > clickHandlerIndex);
  assert.equal((startup.match(/Notification\.requestPermission\(\)/g) || []).length, 1);
  assert.match(startup, /isPublicApp/);
  assert.match(startup, /isStandalone/);
  assert.match(startup, /Activer les notifications/);
  assert.match(startup, /Plus tard/);
  assert.doesNotMatch(read("js/public-notifications.js"), /Notification\.requestPermission/);
});

test("les notifications réutilisent le contenu commun sans nouvelle requête distante", () => {
  const source = read("js/public-notifications.js");
  const gallery = read("js/gallery.js");

  assert.match(source, /localStorage\.getItem/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /calypso:public-content-loaded/);
  assert.match(gallery, /CalypsoPublicContent\?\.load\(\)/);
  assert.match(gallery, /calypso:public-content-loaded/);
  assert.doesNotMatch(source, /listDocuments|CalypsoPublicContent\.load|Realtime|subscribe|setInterval/);
  assert.match(source, /36 \* 60 \* 60 \* 1000/);
  assert.match(source, /notifiedEventIds/);
  assert.match(source, /remindedEventIds/);
  assert.match(source, /assets\/icons\/calypso-officiel\.png/);
});

test("les alertes administrateur apparaissent à l'ouverture sans lecture supplémentaire", () => {
  const source = read("js/public-notifications.js");
  const content = read("js/public-content.js");

  assert.match(content, /type_contenu === "alert"/);
  assert.match(content, /alerts/);
  assert.match(source, /showOpeningAlert/);
  assert.match(source, /publicOpeningAlert/);
  assert.match(source, /seenAlertVersions/);
  assert.match(source, /notifiedAlertVersions/);
  assert.equal((content.match(/listDocuments\(/g) || []).length, 1);
  assert.doesNotMatch(source, /listDocuments|Realtime|subscribe|setInterval/);
});
