import { describe, expect, it } from 'vitest';
import { catalogDiagnostics, normalizeProductSearchText, productCatalog } from './index.js';
import { getCatalogIdentity } from './catalogPipeline.js';
import {
  loadExtendedProductCatalog,
  OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META,
} from './extendedCatalog.js';

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

  it('rejects invalid records and merges duplicate catalogue entries', () => {
    expect(catalogDiagnostics.invalidCount).toBe(0);
    expect(catalogDiagnostics.duplicateCount).toBeGreaterThan(0);
    expect(catalogDiagnostics.outputCount).toBe(productCatalog.length);
    expect(productCatalog.length).toBeLessThan(catalogDiagnostics.inputCount);

    const identities = productCatalog.map(getCatalogIdentity);
    expect(new Set(identities).size).toBe(productCatalog.length);
    expect(new Set(productCatalog.map(product => product.id)).size).toBe(productCatalog.length);
  });

  it('builds searchable text from aliases and normalizes punctuation', () => {
    const oatmeal = productCatalog.find(product => product.name === 'Вівсянка суха');

    expect(oatmeal.searchText).toContain('геркулес');
    expect(normalizeProductSearchText('Молоко 2,5%')).toBe(normalizeProductSearchText('молоко 2.5 %'));
  });

  it('keeps raw, dry, cooked and frozen products as distinct states', () => {
    expect(productCatalog.find(product => product.name === 'Картопля сира')?.preparationState).toBe('raw');
    expect(productCatalog.find(product => product.name === 'Гречка суха')?.preparationState).toBe('dry');
    expect(productCatalog.find(product => product.name === 'Гречка варена')?.preparationState).toBe('cooked');
    expect(productCatalog.find(product => product.name === 'Броколі заморожена')?.preparationState).toBe('frozen');
  });

  it('stores per-serving examples as per-100g nutrition while retaining the default portion', () => {
    const egg = productCatalog.find(product => product.name === 'Яйце куряче 1 шт' && product.brand === 'Базовий продукт');
    const banana = productCatalog.find(product => product.name === 'Банан 1 шт');
    const sugar = productCatalog.find(product => product.name === 'Цукор 1 ч. л.');

    expect(egg).toMatchObject({ calories: 144, weight: 50, nutritionBasis: '100g' });
    expect(banana).toMatchObject({ calories: 89, weight: 120, nutritionBasis: '100g' });
    expect(sugar).toMatchObject({ calories: 400, carbs: 100, weight: 5, nutritionBasis: '100g' });
  });

  it('loads a dated Ukrainian Open Food Facts snapshot with unique barcodes', async () => {
    const { products } = await loadExtendedProductCatalog();

    expect(OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META.count).toBe(products.length);
    expect(products.length).toBeGreaterThanOrEqual(2500);
    expect(new Set(products.map(product => product.barcode)).size).toBe(products.length);
  });
});
