import { atbProducts } from './atbProducts.js';
import { coreFoodProducts } from './coreFoodProducts.js';
import { ukrainianProductSeeds } from '../ukrainianProductSeeds.js';
import { everydayUkrainianProducts } from './everydayUkrainianProducts.js';
import { expandedUkrainianProducts } from './expandedUkrainianProducts.js';
import { importedProducts } from './importedProducts.js';
import { retailUkrainianProducts } from './retailUkrainianProducts.js';
import { buildProductCatalog } from './catalogPipeline.js';

const rawProductCatalog = [
  ...ukrainianProductSeeds,
  ...coreFoodProducts,
  ...atbProducts,
  ...expandedUkrainianProducts,
  ...everydayUkrainianProducts,
  ...retailUkrainianProducts,
  ...importedProducts
];

const catalogBuild = buildProductCatalog(rawProductCatalog);

export const productCatalog = catalogBuild.products;
export const catalogDiagnostics = catalogBuild.diagnostics;
export { normalizeProductSearchText } from './catalogPipeline.js';
export {
  ALL_PRODUCT_TYPES,
  PRODUCT_TYPES,
  getProductTaxonomySearchAliases,
  inferProductType
} from './productType.js';
