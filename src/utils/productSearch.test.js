import { describe, expect, it } from 'vitest';
import {
  findReliableFoodMatchByName,
  getFoodSearchText,
  getProductQueryMatchScore
} from './productSearch.js';

const food = {
  name: 'Молоко пастеризоване 2,5%',
  brand: 'Приклад',
  barcode: '4820000000001',
  aliases: ['Молоко 2.5%'],
  productType: 'Молочне',
  taxonomyAliases: ['молочний продукт'],
  calories: 52,
  protein: 2.8,
  fat: 2.5,
  carbs: 4.7
};

describe('product search quality', () => {
  it('indexes barcode together with name, brand and aliases', () => {
    const text = getFoodSearchText(food);

    expect(text).toContain('4820000000001');
    expect(text).toContain('молоко 2 5');
    expect(text).toContain('приклад');
    expect(text).toContain('молочне');
    expect(text).toContain('молочний продукт');
  });

  it('prioritizes exact barcode, name and alias matches', () => {
    expect(getProductQueryMatchScore(food, '4820000000001')).toBeGreaterThan(40000);
    expect(getProductQueryMatchScore(food, 'Молоко пастеризоване 2,5%'))
      .toBeGreaterThan(getProductQueryMatchScore(food, 'Приклад'));
    expect(getProductQueryMatchScore(food, 'Молоко 2.5%')).toBeGreaterThan(15000);
  });

  it('uses a unique exact name as a reliable nutrition match', () => {
    expect(findReliableFoodMatchByName(food.name, [food])).toBe(food);
  });

  it('rejects ambiguous generic names with different nutrition', () => {
    const lowFat = { ...food, name: 'Молоко', calories: 42, fat: 1.5 };
    const fullFat = { ...food, name: 'Молоко', barcode: '4820000000002', calories: 61, fat: 3.2 };

    expect(findReliableFoodMatchByName('Молоко', [lowFat, fullFat])).toBeNull();
  });

  it('does not match nutrition through a brand or category alone', () => {
    const branded = { ...food, name: 'Йогурт натуральний', brand: 'Молоко', category: 'Молоко' };

    expect(findReliableFoodMatchByName('Молоко', [branded])).toBeNull();
  });

  it('uses generated USDA aliases for search without treating them as an exact nutrition match', () => {
    const usdaFood = {
      ...food,
      name: 'Chicken breast, cooked',
      displayName: 'Куряча грудка, приготована',
      aliases: [],
      searchAliases: ['курка', 'грудка', 'приготована'],
      barcode: ''
    };

    expect(getFoodSearchText(usdaFood)).toContain('куряча грудка');
    expect(getProductQueryMatchScore(usdaFood, 'куряча грудка')).toBeGreaterThan(10000);
    expect(getProductQueryMatchScore(usdaFood, 'курка приготована')).toBeGreaterThan(5000);
    expect(findReliableFoodMatchByName('куряча грудка', [usdaFood])).toBeNull();
  });

  it('prefers an exact personal correction over a catalogue value', () => {
    const catalogue = { ...food, name: 'Сир кисломолочний' };
    const personal = {
      ...catalogue,
      isCustom: true,
      calories: 110,
      protein: 17,
      fat: 4,
      carbs: 2
    };

    expect(findReliableFoodMatchByName('Сир кисломолочний', [catalogue, personal])).toBe(personal);
  });
});
