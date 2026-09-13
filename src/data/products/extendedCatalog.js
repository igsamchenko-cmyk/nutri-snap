import { buildProductCatalog } from './catalogPipeline.js';
import { OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META } from './openFoodFactsUkraineSnapshotMeta.js';

let extendedCatalogPromise;

export { OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META };

export function loadExtendedProductCatalog() {
  if (!extendedCatalogPromise) {
    extendedCatalogPromise = import('./openFoodFactsUkraineSnapshot.js')
      .then(({ openFoodFactsUkraineSnapshot }) => buildProductCatalog(openFoodFactsUkraineSnapshot));
  }

  return extendedCatalogPromise;
}
