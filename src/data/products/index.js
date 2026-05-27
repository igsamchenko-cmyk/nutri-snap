import { atbProducts } from './atbProducts.js';
import { coreFoodProducts } from './coreFoodProducts.js';
import { ukrainianProductSeeds } from '../ukrainianProductSeeds.js';
import { everydayUkrainianProducts } from './everydayUkrainianProducts.js';
import { expandedUkrainianProducts } from './expandedUkrainianProducts.js';
import { importedProducts } from './importedProducts.js';
import { retailUkrainianProducts } from './retailUkrainianProducts.js';

export const productCatalog = [
  ...ukrainianProductSeeds,
  ...coreFoodProducts,
  ...atbProducts,
  ...expandedUkrainianProducts,
  ...everydayUkrainianProducts,
  ...retailUkrainianProducts,
  ...importedProducts
];
