import { atbProducts } from './atbProducts.js';
import { ukrainianProductSeeds } from '../ukrainianProductSeeds.js';
import { everydayUkrainianProducts } from './everydayUkrainianProducts.js';
import { expandedUkrainianProducts } from './expandedUkrainianProducts.js';
import { importedProducts } from './importedProducts.js';

export const productCatalog = [
  ...ukrainianProductSeeds,
  ...atbProducts,
  ...expandedUkrainianProducts,
  ...everydayUkrainianProducts,
  ...importedProducts
];
