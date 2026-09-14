import { describe, expect, it } from 'vitest';
import {
  getUsdaSearchAliases,
  getUsdaLocalizedName,
  getUsdaSearchPriority,
  normalizeUsdaFood,
  renderUsdaSnapshotModule,
  USDA_DATASETS
} from './usdaFoodDataSnapshot.mjs';

const nutrient = (id, amount) => ({ nutrient: { id }, amount });

describe('USDA FoodData Central snapshot generator', () => {
  it('normalizes complete nutrition, a useful portion and Ukrainian search aliases', () => {
    const product = normalizeUsdaFood({
      fdcId: 123,
      description: 'Chicken breast, cooked, roasted, skinless, boneless',
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
      name: 'Chicken breast, cooked, roasted, skinless, boneless',
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
    expect(product.displayName).toBe('Куряча грудка, запечена, без шкіри, без кістки');
    expect(product.searchAliases).toContain('Куряча грудка');
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
    expect(getUsdaSearchAliases('Blueberries, raw')).toEqual(expect.arrayContaining(['чорниця', 'лохина']));
    expect(getUsdaSearchAliases('Corned beef')).not.toContain('кукурудза');
    expect(getUsdaSearchAliases('Tomatoes, grape, raw')).not.toContain('виноград');
  });

  it('localizes common simple foods and leaves ambiguous US descriptions untouched', () => {
    expect(getUsdaLocalizedName('Apple, raw')).toBe('Яблуко, сире');
    expect(getUsdaLocalizedName('Potato, boiled, no added fat')).toBe('Картопля, варена, без доданого жиру');
    expect(getUsdaLocalizedName('Fish, salmon, grilled')).toBe('Лосось, гриль');
    expect(getUsdaLocalizedName('Blueberries, raw')).toBe('Чорниця, сира');
    expect(getUsdaLocalizedName('Cranberries, dried')).toBe('Журавлина, сушена');
    expect(getUsdaLocalizedName('Cheese, swiss')).toBe('Сир швейцарський');
    expect(getUsdaLocalizedName('Cake or cupcake, apple')).toBe('');
    expect(getUsdaLocalizedName('Barbecue chicken')).toBe('');
    expect(getUsdaLocalizedName('Orange chicken')).toBe('');
    expect(getUsdaLocalizedName('Cheese ball')).toBe('');
    expect(getUsdaLocalizedName('Beans and rice')).toBe('');
    expect(getUsdaLocalizedName('Rice milk')).toBe('Рисове молоко');
    expect(getUsdaLocalizedName('Rice, cooked, with milk')).toBe('Рис, приготований');
    expect(getUsdaLocalizedName('Chicken, NS as to cooking method')).toBe('');
  });

  it('ranks localized simple foods above unsuitable generic matches', () => {
    const simple = getUsdaSearchPriority('Apple, raw', USDA_DATASETS[1], 'Яблуко, сире', 'Овочі та фрукти');
    const dessert = getUsdaSearchPriority('Cake or cupcake, apple', USDA_DATASETS[1], '', 'Солодощі');
    const infant = getUsdaSearchPriority('Infant formula, added rice', USDA_DATASETS[1], '', 'Крупи та макарони', 'Baby Foods');

    expect(simple).toBeGreaterThan(dessert);
    expect(dessert).toBeGreaterThan(infant);
  });

  it('prioritizes staple foods above derived products with the same Ukrainian alias', () => {
    const rice = getUsdaSearchPriority('Rice, white, cooked', USDA_DATASETS[1], 'Рис білий, приготований', 'Крупи та макарони');
    const riceMilk = getUsdaSearchPriority('Rice milk', USDA_DATASETS[1], 'Рисове молоко', 'Напої');
    const friedRice = getUsdaSearchPriority('Rice, fried, meatless', USDA_DATASETS[1], 'Рис, смажений', 'Крупи та макарони');
    const cheese = getUsdaSearchPriority('Cheese, cheddar', USDA_DATASETS[1], 'Сир чеддер', 'Молочне');
    const cheeseBall = getUsdaSearchPriority('Cheese ball', USDA_DATASETS[1], '', 'Молочне');

    expect(rice).toBeGreaterThan(riceMilk);
    expect(rice).toBeGreaterThan(friedRice);
    expect(cheese).toBeGreaterThan(cheeseBall);
  });

  it('keeps fruit and plant beverages in the correct product categories', () => {
    const makeFood = (fdcId, description, sourceCategory) => normalizeUsdaFood({
      fdcId,
      description,
      foodCategory: { description: sourceCategory },
      foodNutrients: [
        nutrient(1008, 50),
        nutrient(1003, 1),
        nutrient(1004, 1),
        nutrient(1005, 10)
      ]
    }, USDA_DATASETS[1]);

    expect(makeFood(201, 'Blueberries, wild, frozen', 'American Indian/Alaska Native Foods')?.productType)
      .toBe('Овочі та фрукти');
    expect(makeFood(202, 'Rice milk', 'Plant-based milk')?.productType).toBe('Напої');
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
