import { describe, expect, it } from 'vitest';
import { productCatalog } from './index.js';

describe('local product catalogue metadata', () => {
  it('marks every entry as per-100g nutrition with canonical values', () => {
    expect(productCatalog.length).toBeGreaterThan(0);
    expect(productCatalog.every(product => (
      product.nutritionBasis === '100g'
      && product.per100g
      && Number.isFinite(product.per100g.calories)
      && Number.isFinite(product.per100g.protein)
      && Number.isFinite(product.per100g.fat)
      && Number.isFinite(product.per100g.carbs)
    ))).toBe(true);
  });

  it('does not claim numeric confidence for products without a verifiable source', () => {
    const unsourcedProducts = productCatalog.filter(product => !product.barcode && !product.sourceUrl);

    expect(unsourcedProducts.length).toBeGreaterThan(0);
    expect(unsourcedProducts.every(product => (
      product.confidence === null
      && product.dataQuality === 'reference'
      && product.warning
    ))).toBe(true);
  });
});
