const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("l'accueil présente une activation de notifications clairement facultative", () => {
  const html = read("index.html");
  assert.match(html, /Ne manquez pas les prochains événements/);
  assert.match(html, /id="btnEnablePublicNotifications"/);
  assert.match(html, /Activer les notifications/);
  assert.match(html, /activation est facultative/);
  assert.match(html, /id="publicNotificationsStatus"/);
  assert.match(html, /js\/public-notifications\.js\?v=1/);
});

test("l'autorisation de notification est demandée uniquement après un clic", () => {
  const source = read("js/public-notifications.js");
  const clickHandlerIndex = source.indexOf('button?.addEventListener("click"');
  const permissionIndex = source.indexOf("Notification.requestPermission()");

  assert.ok(clickHandlerIndex >= 0);
  assert.ok(permissionIndex > clickHandlerIndex);
  assert.equal((source.match(/Notification\.requestPermission\(\)/g) || []).length, 1);
  assert.match(source, /Notifications activées/);
  assert.match(source, /Notifications refusées/);
  assert.match(source, /ne sont pas compatibles/);
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
