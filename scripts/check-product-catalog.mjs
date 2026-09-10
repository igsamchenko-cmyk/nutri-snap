import { catalogDiagnostics, productCatalog } from '../src/data/products/index.js';

const { inputCount, outputCount, duplicateCount, invalidCount, invalidEntries } = catalogDiagnostics;

console.log(`Product catalogue: ${outputCount} unique entries from ${inputCount} rows.`);
console.log(`Merged duplicates: ${duplicateCount}. Invalid entries: ${invalidCount}.`);

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
