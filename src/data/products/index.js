import { atbProducts } from './atbProducts.js';
import { coreFoodProducts } from './coreFoodProducts.js';
import { ukrainianProductSeeds } from '../ukrainianProductSeeds.js';
import { everydayUkrainianProducts } from './everydayUkrainianProducts.js';
import { expandedUkrainianProducts } from './expandedUkrainianProducts.js';
import { importedProducts } from './importedProducts.js';
import { retailUkrainianProducts } from './retailUkrainianProducts.js';

const rawProductCatalog = [
  ...ukrainianProductSeeds,
  ...coreFoodProducts,
  ...atbProducts,
  ...expandedUkrainianProducts,
  ...everydayUkrainianProducts,
  ...retailUkrainianProducts,
  ...importedProducts
];

const UNSOURCED_WARNING = 'Довідкове усереднене значення. Перевірте КБЖВ на етикетці конкретного продукту.';

export const productCatalog = rawProductCatalog.map(product => {
  const hasVerifiableSource = Boolean(product.barcode || product.sourceUrl);
  const per100g = product.per100g || {
    calories: Number(product.calories) || 0,
    protein: Number(product.protein) || 0,
    fat: Number(product.fat) || 0,
    carbs: Number(product.carbs) || 0
  };

  return {
    ...product,
    nutritionBasis: '100g',
    per100g,
    dataQuality: product.dataQuality || (hasVerifiableSource ? 'database' : 'reference'),
    confidence: hasVerifiableSource ? product.confidence ?? null : null,
    warning: product.warning || (hasVerifiableSource ? '' : UNSOURCED_WARNING)
  };
});
