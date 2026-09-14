import { describe, expect, it } from 'vitest';
import {
  buildProductCatalog,
  inferPreparationState,
  normalizeCatalogProduct,
  normalizeProductAliases,
  validateCatalogProduct
} from './catalogPipeline.js';

const makeProduct = overrides => ({
  id: 'food-1',
  name: 'Рис варений',
  brand: 'Домашня кухня',
  calories: 130,
  protein: 2.7,
  fat: 0.3,
  carbs: 28.2,
  weight: 100,
  source: 'ua-core',
  ...overrides
});

describe('catalog quality pipeline', () => {
  it('treats missing alias collections as empty', () => {
    expect(normalizeProductAliases(null)).toEqual([]);
    expect(normalizeProductAliases(undefined)).toEqual([]);
  });

  it('infers preparation states without treating cheese as raw food', () => {
    expect(inferPreparationState({ name: 'Куряче філе сире' })).toBe('raw');
    expect(inferPreparationState({ name: 'Сир кисломолочний 5%' })).toBe('unspecified');
    expect(inferPreparationState({ name: 'Макарони варені' })).toBe('cooked');
  });

  it('adds a separate product type to normalized catalogue entries', () => {
    const product = normalizeCatalogProduct(makeProduct({ name: 'Rice noodles', aliases: ['рисова локшина'] }));

    expect(product.productType).toBe('Крупи та макарони');
    expect(product.searchText).toContain('крупи та макарони');
  });

  it('keeps taxonomy search words separate from product name aliases', () => {
    const product = normalizeCatalogProduct(makeProduct({
      name: 'Natural 2.5%',
      aliases: [],
      sourceCategories: ['en:dairies', 'en:yogurts']
    }));

    expect(product.productType).toBe('Молочне');
    expect(product.aliases).toEqual([]);
    expect(product.taxonomyAliases).toEqual(['молочне', 'йогурт']);
    expect(product.searchText).toContain('йогурт');
  });

  it('rejects impossible nutrition values', () => {
    const product = normalizeCatalogProduct(makeProduct({ protein: 120 }));

    expect(validateCatalogProduct(product)).toContain('invalid-protein');
    expect(buildProductCatalog([product]).diagnostics.invalidCount).toBe(1);
  });

  it('keeps the richer duplicate and merges aliases from both records', () => {
    const basic = makeProduct({ aliases: ['рис готовий'], source: 'ua-everyday' });
    const preferred = makeProduct({
      id: 'food-2',
      aliases: ['рис відварений'],
      supermarket: 'Сільпо',
      source: 'ua-retail'
    });
    const result = buildProductCatalog([basic, preferred]);

    expect(result.products).toHaveLength(1);
    expect(result.diagnostics.duplicateCount).toBe(1);
    expect(result.products[0]).toMatchObject({ id: 'food-2', supermarket: 'Сільпо' });
    expect(result.products[0].aliases).toEqual(expect.arrayContaining(['рис готовий', 'рис відварений']));
  });

  it('does not merge different barcodes for otherwise identical branded products', () => {
    const result = buildProductCatalog([
      makeProduct({ barcode: '111' }),
      makeProduct({ id: 'food-2', barcode: '222' })
    ]);

    expect(result.products).toHaveLength(2);
    expect(result.diagnostics.duplicateCount).toBe(0);
  });

  it('replaces an unsourced duplicate with the matching barcoded product', () => {
    const result = buildProductCatalog([
      makeProduct({ aliases: ['рис готовий'] }),
      makeProduct({
        id: 'food-2',
        barcode: '4820000000001',
        source: 'openfoodfacts',
        sourceUrl: 'https://world.openfoodfacts.org/product/4820000000001'
      })
    ]);

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ id: 'food-2', barcode: '4820000000001' });
    expect(result.products[0].aliases).toContain('рис готовий');
  });
});
