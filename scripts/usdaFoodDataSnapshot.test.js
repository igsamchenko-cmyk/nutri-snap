import { describe, expect, it } from 'vitest';
import {
  getUsdaSearchAliases,
  normalizeUsdaFood,
  renderUsdaSnapshotModule,
  USDA_DATASETS
} from './usdaFoodDataSnapshot.mjs';

const nutrient = (id, amount) => ({ nutrient: { id }, amount });

describe('USDA FoodData Central snapshot generator', () => {
  it('normalizes complete nutrition, a useful portion and Ukrainian search aliases', () => {
    const product = normalizeUsdaFood({
      fdcId: 123,
      description: 'Chicken breast, cooked, roasted, skinless',
      foodCategory: { description: 'Poultry Products' },
      foodNutrients: [
        nutrient(1008, 165),
        nutrient(1003, 31.02),
        nutrient(1004, 3.57),
        nutrient(1005, 0)
      ],
      foodPortions: [
        { gramWeight: 140, portionDescription: '1 breast' }
      ]
    }, USDA_DATASETS[0]);

    expect(product).toMatchObject({
      id: 'usda-123',
      name: 'Chicken breast, cooked, roasted, skinless',
      calories: 165,
      protein: 31,
      fat: 3.6,
      carbs: 0,
      weight: 140,
      productType: 'М’ясо та птиця',
      preparationState: 'cooked',
      source: 'usda-foundation'
    });
    expect(product.aliases).toEqual([]);
    expect(product.searchAliases).toEqual(expect.arrayContaining(['курка', 'приготований', 'печений', 'без шкіри']));
  });

  it('rejects incomplete and implausible records', () => {
    const base = {
      fdcId: 123,
      description: 'Apple, raw',
      foodNutrients: [
        nutrient(1008, 52),
        nutrient(1003, 0.3),
        nutrient(1004, 0.2),
        nutrient(1005, 14)
      ]
    };

    expect(normalizeUsdaFood({ ...base, foodNutrients: base.foodNutrients.slice(0, 3) })).toBeNull();
    expect(normalizeUsdaFood({
      ...base,
      foodNutrients: base.foodNutrients.map(item => (
        item.nutrient.id === 1005 ? nutrient(1005, 140) : item
      ))
    })).toBeNull();
  });

  it('matches whole terms instead of unsafe fragments', () => {
    expect(getUsdaSearchAliases('Apple, raw')).toEqual(expect.arrayContaining(['яблуко', 'сирий']));
    expect(getUsdaSearchAliases('Pineapple juice')).toEqual(expect.arrayContaining(['ананас', 'сік']));
    expect(getUsdaSearchAliases('Corned beef')).not.toContain('кукурудза');
    expect(getUsdaSearchAliases('Tomatoes, grape, raw')).not.toContain('виноград');
  });

  it('renders a compact lazy-loadable module', () => {
    const product = normalizeUsdaFood({
      fdcId: 321,
      description: 'Rice, cooked',
      foodCategory: { description: 'Cereal Grains and Pasta' },
      foodNutrients: [
        nutrient(1008, 130),
        nutrient(1003, 2.7),
        nutrient(1004, 0.3),
        nutrient(1005, 28.2)
      ]
    }, USDA_DATASETS[1]);
    const moduleText = renderUsdaSnapshotModule([product], '2026-09-14');

    expect(moduleText).toContain('[321,"Rice, cooked"');
    expect(moduleText).toContain("sourceLabel: 'USDA FoodData Central'");
    expect(moduleText).toContain('USDA FoodData Central data are public domain');
  });
});
