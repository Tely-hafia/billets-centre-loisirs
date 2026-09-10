const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("l'administration permet de gérer le menu sans chargement automatique", () => {
  const html = read("admin.html");
  const source = read("js/resto-admin.js");

  assert.match(html, /id="admin-resto-menu"/);
  assert.match(html, /id="btnLoadRestoMenu"/);
  assert.match(html, /id="restoMenuForm"/);
  assert.match(html, /id="restoMenuCode"/);
  assert.match(html, /id="restoMenuLabel"/);
  assert.match(html, /id="restoMenuCategory"/);
  assert.match(html, /id="restoMenuPrice"/);
  assert.match(html, /id="restoMenuImage"/);
  assert.match(html, /js\/resto-admin\.js\?v=2/);
  assert.match(source, /btnLoadRestoMenu[^\n]+addEventListener\("click", loadMenu\)/);
  assert.doesNotMatch(source, /DOMContentLoaded[\s\S]{0,250}loadMenu\(\)/);
});

test("les produits utilisent la table et le bucket existants", () => {
  const source = read("js/resto-admin.js");
  const config = read("js/appwrite-config.js");

  assert.match(source, /config\.tables\?\.menuResto/);
  assert.match(source, /config\.buckets\?\.contenuMedia/);
  assert.match(source, /db\.createDocument/);
  assert.match(source, /db\.updateDocument/);
  assert.match(source, /db\.deleteDocument\(databaseId, tableId, product\.\$id\)/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /restoAction = "delete"/);
  assert.match(source, /Les anciennes ventes resteront conservées/);
  assert.match(source, /storage\.createFile/);
  assert.match(source, /storage\.deleteFile/);
  assert.match(source, /"image\/webp"/);
  assert.match(source, /image_file_id/);
  assert.match(config, /menuResto: "menu_resto"/);
  assert.match(config, /contenuMedia: "69222b6c00245678b63c"/);
});

test("le poste restauration affiche les images et conserve une seule lecture du menu", () => {
  const source = read("js/agent-appwrite.js");

  assert.match(source, /produit\.image_file_id/);
  assert.match(source, /restoProductImageUrl/);
  assert.match(source, /resto-product-quantity/);
  assert.match(source, /Appwrite\.Query\.equal\("actif", true\)/);
  const loader = source.match(/async function chargerProduitsResto\(\)[\s\S]*?\n}\n\nasync function initialiserDernierNumeroVente/)?.[0] || "";
  assert.equal((loader.match(/listDocuments\(/g) || []).length, 1);
});

test("la commande sur place exige une des douze tables", () => {
  const html = read("agent.html");
  const source = read("js/agent-appwrite.js");
  const tableInputs = [...html.matchAll(/name="restoTable" value="(\d+)"/g)].map((match) => Number(match[1]));

  assert.deepEqual(tableInputs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.match(html, /12 tables · 4 chaises par table/);
  assert.match(source, /numeroTable < 1 \|\| numeroTable > 12/);
  assert.match(source, /saleData\.numero_table = numeroTable/);
  assert.match(source, /resto-receipt-table/);
  assert.match(source, /paiement\.monnaieRendue/);
});

test("le panier mobile reste dans l'en-tête et non dans une barre basse fixe", () => {
  const html = read("agent.html");
  const styles = read("css/app-v2.css");
  const cartRule = styles.match(/\.resto-cart-summary\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(html, /id="btnRestoCartSummary"/);
  assert.match(html, /aria-controls="restoCartPanel"/);
  assert.doesNotMatch(cartRule, /position:\s*fixed/);
  assert.match(styles, /#mode-resto \.resto-products-grid \{ grid-template-columns: repeat\(2/);
  assert.match(styles, /#mode-resto \.resto-categories-tabs[\s\S]*?overflow-x: auto/);
});

test("la migration documente uniquement les deux colonnes nécessaires", () => {
  const migration = read("docs/APPWRITE_MIGRATION.md");
  assert.match(migration, /`menu_resto` \| `image_file_id`/);
  assert.match(migration, /`ventes_resto` \| `numero_table`/);
  assert.match(migration, /Aucune nouvelle base/i);
});
