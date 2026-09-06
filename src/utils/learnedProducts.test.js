// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLearnedProducts,
  mergeLearnedProducts,
  saveLearnedProduct
} from './learnedProducts';

beforeEach(() => {
  const values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    clear: () => values.clear()
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('learned products', () => {
  it('preserves nutrition basis and quality metadata', () => {
    saveLearnedProduct({
      name: 'Йогурт',
      brand: 'Тест',
      barcode: '4820000000000',
      calories: 150,
      protein: 7.5,
      fat: 3,
      carbs: 22.5,
      weight: 150,
      packageWeight: 500,
      nutritionBasis: '100g',
      per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 },
      sourceLabel: 'Open Food Facts',
      dataQuality: 'database',
      confidence: 91,
      warning: 'Перевірте етикетку'
    }, 'barcode');

    expect(getLearnedProducts()[0]).toMatchObject({
      barcode: '4820000000000',
      packageWeight: 500,
      nutritionBasis: '100g',
      per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 },
      sourceLabel: 'Open Food Facts',
      dataQuality: 'database',
      confidence: 91,
      warning: 'Перевірте етикетку'
    });
  });

  it('keeps products with the same name and brand when barcodes differ', () => {
    const products = mergeLearnedProducts([
      { name: 'Йогурт', brand: 'Тест', barcode: '111', calories: 100 },
      { name: 'Йогурт', brand: 'Тест', barcode: '222', calories: 120 }
    ]);

    expect(products).toHaveLength(2);
    expect(products.map(product => product.barcode).sort()).toEqual(['111', '222']);
  });
});
