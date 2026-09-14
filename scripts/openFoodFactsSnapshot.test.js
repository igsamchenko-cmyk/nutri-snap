import { describe, expect, it } from 'vitest';
import {
  normalizeOpenFoodFactsProduct,
  renderSnapshotMetaModule,
  renderSnapshotModule
} from './openFoodFactsSnapshot.mjs';

const product = {
  code: '4820000000001',
  product_name: 'Вівсяні пластівці',
  product_name_uk: 'Вівсянка',
  product_name_ru: 'Овсянка',
  product_name_en: 'Oat flakes',
  product_name_pl: 'Płatki owsiane',
  categories_tags: ['en:plant-based-foods', 'en:cereals-and-their-products', 'en:oat-flakes', 'null', null],
  brands: 'Приклад, Example',
  stores: 'Сільпо, Novus',
  completeness: 0.8,
  last_modified_t: 1700000000,
  data_quality_errors_tags: [],
  nutriments: {
    'energy-kcal_100g': 370,
    proteins_100g: 12.5,
    fat_100g: 6.2,
    carbohydrates_100g: 61
  }
};

describe('Open Food Facts Ukraine snapshot generator', () => {
  it('keeps complete nutrition and language aliases', () => {
    expect(normalizeOpenFoodFactsProduct(product)).toMatchObject({
      barcode: '4820000000001',
      name: 'Вівсянка',
      brand: 'Приклад',
      supermarket: 'Сільпо',
      calories: 370,
      aliases: ['Вівсяні пластівці', 'Овсянка', 'Oat flakes', 'Płatki owsiane'],
      sourceCategories: ['en:plant-based-foods', 'en:cereals-and-their-products', 'en:oat-flakes'],
      source: 'openfoodfacts'
    });
  });

  it('derives kcal from kJ when kcal is absent', () => {
    const normalized = normalizeOpenFoodFactsProduct({
      ...product,
      nutriments: { ...product.nutriments, 'energy-kcal_100g': undefined, 'energy-kj_100g': 418.4 }
    });

    expect(normalized.calories).toBe(100);
  });

  it('rejects records with quality errors or impossible macros', () => {
    expect(normalizeOpenFoodFactsProduct({
      ...product,
      data_quality_errors_tags: ['en:nutrition-value-total-over-105']
    })).toBeNull();
    expect(normalizeOpenFoodFactsProduct({
      ...product,
      nutriments: { ...product.nutriments, fat_100g: 130 }
    })).toBeNull();
    expect(normalizeOpenFoodFactsProduct({
      ...product,
      nutriments: { ...product.nutriments, proteins_100g: null }
    })).toBeNull();
  });

  it('keeps complete plausible nutrition when unrelated profile fields are incomplete', () => {
    expect(normalizeOpenFoodFactsProduct({
      ...product,
      completeness: 0.2
    })).not.toBeNull();
  });

  it('renders a compact reusable module with license metadata', () => {
    const normalized = normalizeOpenFoodFactsProduct(product);
    const output = renderSnapshotModule([normalized], '2026-09-11');

    expect(output).toContain('ODbL 1.0');
    expect(output).toContain('off-ua-${barcode}');
    expect(renderSnapshotMetaModule([normalized], '2026-09-11')).toContain("date: '2026-09-11'");
    expect(renderSnapshotMetaModule([normalized], '2026-09-11')).toContain('count: 1');
    expect(renderSnapshotMetaModule([normalized], '2026-09-11', 42)).toContain('combinedCount: 42');
  });
});
