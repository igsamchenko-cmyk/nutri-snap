import { catalogDiagnostics, productCatalog } from '../src/data/products/index.js';
import { buildProductCatalog } from '../src/data/products/catalogPipeline.js';
import {
  loadExtendedProductCatalog,
  OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META
} from '../src/data/products/extendedCatalog.js';

const { inputCount, outputCount, duplicateCount, invalidCount, invalidEntries } = catalogDiagnostics;
const extendedCatalogBuild = await loadExtendedProductCatalog();
const extendedProducts = extendedCatalogBuild.products;
const combinedCatalogBuild = buildProductCatalog([...productCatalog, ...extendedProducts]);

console.log(`Product catalogue: ${outputCount} unique entries from ${inputCount} rows.`);
console.log(`Merged duplicates: ${duplicateCount}. Invalid entries: ${invalidCount}.`);
console.log(`Open Food Facts snapshot: ${extendedProducts.length} valid entries.`);

if (invalidCount > 0) {
  invalidEntries.slice(0, 20).forEach(entry => {
    console.error(`${entry.id || entry.name}: ${entry.errors.join(', ')}`);
  });
  process.exitCode = 1;
}

if (new Set(productCatalog.map(product => product.id)).size !== productCatalog.length) {
  console.error('Product catalogue contains duplicate IDs after normalization.');
  process.exitCode = 1;
}

if (extendedCatalogBuild.diagnostics.invalidCount > 0) {
  console.error(`Open Food Facts snapshot contains ${extendedCatalogBuild.diagnostics.invalidCount} invalid entries.`);
  process.exitCode = 1;
}

if (extendedProducts.length !== OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META.count) {
  console.error('Open Food Facts snapshot metadata does not match its normalized product count.');
  process.exitCode = 1;
}

if (combinedCatalogBuild.products.length !== OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META.combinedCount) {
  console.error('Combined product catalogue metadata does not match the deduplicated product count.');
  process.exitCode = 1;
}
