import { buildProductCatalog } from './catalogPipeline.js';
import { OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META } from './openFoodFactsUkraineSnapshotMeta.js';
import { USDA_FOOD_DATA_SNAPSHOT_META } from './usdaFoodDataSnapshotMeta.js';

let packagedCatalogPromise;
let genericCatalogPromise;
let extendedCatalogPromise;

export { OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META, USDA_FOOD_DATA_SNAPSHOT_META };

export function loadPackagedProductCatalog() {
  if (!packagedCatalogPromise) {
    packagedCatalogPromise = import('./openFoodFactsUkraineSnapshot.js')
      .then(({ openFoodFactsUkraineSnapshot }) => buildProductCatalog(openFoodFactsUkraineSnapshot));
  }
  return packagedCatalogPromise;
}

export function loadGenericProductCatalog() {
  if (!genericCatalogPromise) {
    genericCatalogPromise = import('./usdaFoodDataSnapshot.js')
      .then(({ usdaFoodDataSnapshot }) => ({
        products: usdaFoodDataSnapshot,
        diagnostics: {
          inputCount: usdaFoodDataSnapshot.length,
          outputCount: usdaFoodDataSnapshot.length,
          duplicateCount: 0,
          invalidCount: 0,
          invalidEntries: []
        }
      }));
  }
  return genericCatalogPromise;
}

export function loadExtendedProductCatalog() {
  if (!extendedCatalogPromise) {
    extendedCatalogPromise = Promise.all([
      loadPackagedProductCatalog(),
      loadGenericProductCatalog()
    ]).then(([packagedCatalog, genericCatalog]) => ({
      products: [...packagedCatalog.products, ...genericCatalog.products],
      diagnostics: {
        inputCount: packagedCatalog.diagnostics.inputCount + genericCatalog.diagnostics.inputCount,
        outputCount: packagedCatalog.products.length + genericCatalog.products.length,
        duplicateCount: packagedCatalog.diagnostics.duplicateCount,
        invalidCount: packagedCatalog.diagnostics.invalidCount,
        invalidEntries: packagedCatalog.diagnostics.invalidEntries
      }
    }));
  }

  return extendedCatalogPromise;
}
