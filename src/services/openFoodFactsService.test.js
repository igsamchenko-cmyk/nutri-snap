import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProductByBarcode } from './openFoodFactsService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Open Food Facts normalization', () => {
  it('keeps per-100g nutrition separate from package weight', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          code: '4820000000000',
          product_name_uk: 'Тестовий йогурт',
          brands: 'Тест',
          quantity: '500 g',
          nutriments: {
            'energy-kcal_100g': 100,
            proteins_100g: 5,
            fat_100g: 2,
            carbohydrates_100g: 15
          }
        }
      })
    }));

    const product = await getProductByBarcode('4820000000000');

    expect(product).toMatchObject({
      weight: 500,
      packageWeight: 500,
      nutritionBasis: '100g',
      per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 }
    });
  });
});
