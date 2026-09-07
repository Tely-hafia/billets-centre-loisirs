const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.Appwrite = {
  Query: {
    limit: value => `limit:${value}`,
    orderAsc: value => `asc:${value}`,
    cursorAfter: value => `after:${value}`
  }
};
require("../js/data-access.js");
require("../js/receipts.js");

test("le cache regroupe les requêtes simultanées et n'enregistre pas les erreurs", async () => {
  let calls = 0;
  const cache = CalypsoData.createCache(() => 1_000);
  const loader = async () => { calls += 1; return { ok: true }; };
  const [first, second] = await Promise.all([cache.read("same", loader), cache.read("same", loader)]);
  assert.deepEqual(first, { ok: true });
  assert.equal(first, second);
  assert.equal(calls, 1);

  let failures = 0;
  await assert.rejects(cache.read("failure", async () => { failures += 1; throw new Error("no"); }));
  await assert.rejects(cache.read("failure", async () => { failures += 1; throw new Error("no"); }));
  assert.equal(failures, 2);
});

test("la pagination Appwrite ne tronque pas une liste supérieure à 250 lignes", async () => {
  const pages = [
    Array.from({ length: 250 }, (_, i) => ({ $id: `A${String(i).padStart(3, "0")}` })),
    [{ $id: "B000" }]
  ];
  let calls = 0;
  const db = { listDocuments: async (_database, _table, queries) => {
    const page = pages[calls++];
    if (calls === 2) assert.ok(queries.some(query => query === "after:A249"));
    return { documents: page };
  }};
  const result = await CalypsoData.listAll(db, "db", "table");
  assert.equal(result.documents.length, 251);
  assert.equal(calls, 2);
});

test("les identifiants d'événements sont déterministes", async () => {
  const first = await CalypsoData.eventId("sale", "ticket-42");
  const second = await CalypsoData.eventId("sale", "ticket-42");
  const other = await CalypsoData.eventId("sale", "ticket-43");
  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.match(first, /^sal-[a-f0-9]{32}$/);
});

test("un reçu QR groupe de 1 à 30 billets et refuse doublons ou données étrangères", () => {
  const tickets = Array.from({ length: 30 }, (_, i) => ({
    mode: i % 3 ? "ENTREE" : "JEU",
    documentId: `ticket-${i}`,
    numero_billet: `26-${String(i + 1).padStart(4, "0")}`
  }));
  assert.deepEqual(CalypsoReceipts.decode(CalypsoReceipts.encode(tickets)), tickets);
  assert.throws(() => CalypsoReceipts.encode([]), /1 à 30/);
  assert.throws(() => CalypsoReceipts.decode("https://example.com"), /reçu Calypço/);
  assert.throws(() => CalypsoReceipts.decode(CalypsoReceipts.encode([tickets[0], tickets[0]])), /deux fois/);
});

test("le QR est généré localement sans service d'image externe", () => {
  const qrcode = require("../js/vendor/qrcode.js");
  const qr = qrcode(0, "M");
  qr.addData(CalypsoReceipts.encode([{ mode: "ENTREE", documentId: "ticket-1", numero_billet: "26-0001" }]));
  qr.make();
  assert.match(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }), /^<svg/);
  assert.equal(typeof require("../js/vendor/jsQR.js"), "function");
  const receiptSource = fs.readFileSync(path.join(__dirname, "..", "js", "receipts.js"), "utf8");
  assert.doesNotMatch(receiptSource, /api\.qrserver|chart\.googleapis|quickchart/i);
});

test("les refus Appwrite ne sont jamais présentés comme une réussite", () => {
  assert.match(CalypsoData.errorMessage({ code: 403, message: "not authorized" }, "Ouverture de caisse"), /refusée par Appwrite/);
  assert.match(CalypsoData.errorMessage({ code: 403, message: "not authorized" }, "Ouverture de caisse"), /Aucune réussite n’est confirmée/);
});
