import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getProductByBarcode,
  searchCachedProductsByName,
  searchProductsByName
} from './openFoodFactsService';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Open Food Facts normalization', () => {
  it('searches the accumulated local cache without contacting the remote API', async () => {
    const remoteFetch = vi.fn();
    vi.stubGlobal('fetch', remoteFetch);

    const products = await searchCachedProductsByName('кефір');

    expect(products).toEqual([]);
    expect(remoteFetch).not.toHaveBeenCalled();
  });

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
      per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 },
      sourceUrl: 'https://world.openfoodfacts.org/product/4820000000000',
      warning: expect.stringContaining('Open Food Facts')
    });
  });

  it('parses Cyrillic mass units without falling back to 100g', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          code: '4820000000001',
          product_name_uk: 'Сир',
          quantity: '500 г',
          nutriments: {
            'energy-kcal_100g': 300,
            proteins_100g: 20,
            fat_100g: 22,
            carbohydrates_100g: 2
          }
        }
      })
    }));

    const product = await getProductByBarcode('4820000000001');
    expect(product).toMatchObject({ weight: 500, packageWeight: 500, packageVolumeMl: null });
  });

  it('keeps package volume separate from serving mass', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          code: '4820000000002',
          product_name_uk: 'Сік',
          quantity: '1 л',
          nutriments: {
            'energy-kcal_100g': 45,
            proteins_100g: 0,
            fat_100g: 0,
            carbohydrates_100g: 11
          }
        }
      })
    }));

    const product = await getProductByBarcode('4820000000002');
    expect(product).toMatchObject({
      weight: 100,
      defaultPortionGrams: 100,
      packageWeight: null,
      packageVolumeMl: 1000
    });
  });

  it('converts explicitly serving-based unqualified nutrition to per 100g', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          code: '4820000000003',
          product_name_uk: 'Батончик',
          quantity: '50 g',
          serving_quantity: 50,
          nutrition_data_per: 'serving',
          nutriments: {
            'energy-kcal': 180,
            proteins: 5,
            fat: 6,
            carbohydrates: 27
          }
        }
      })
    }));

    const product = await getProductByBarcode('4820000000003');
    expect(product.per100g).toEqual({ calories: 360, protein: 10, fat: 12, carbs: 54 });
  });

  it('returns successful primary results when the fallback request fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          products: [{
            code: '4820000000004',
            product_name_uk: 'Кефір',
            nutriments: {
              'energy-kcal_100g': 50,
              proteins_100g: 3,
              fat_100g: 2.5,
              carbohydrates_100g: 4
            }
          }]
        })
      })
      .mockRejectedValueOnce(new Error('fallback unavailable')));

    const products = await searchProductsByName('кефір');
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({ name: 'Кефір', calories: 50 });
  });

  it('reports an unavailable remote search without trying to parse an HTML error page', async () => {
    const parseJson = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: parseJson
    }));

    await expect(searchProductsByName('рідкісний продукт')).rejects.toThrow('status 503');
    expect(parseJson).not.toHaveBeenCalled();
  });
});
