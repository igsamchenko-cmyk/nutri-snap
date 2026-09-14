import { describe, expect, it } from 'vitest';
import {
  getProductTaxonomySearchAliases,
  inferProductType
} from './productType.js';

describe('product type inference', () => {
  it.each([
    ['Молоко пастеризоване', 'Молочне'],
    ['Jogurt naturalny', 'Молочне'],
    ['Piept de pui', 'М’ясо та птиця'],
    ['Tuna in brine', 'Риба та морепродукти'],
    ['Sok jabłkowy', 'Напої'],
    ['Makaron spaghetti', 'Крупи та макарони'],
    ['Chleb pszenny', 'Хліб і випічка'],
    ['Овочева суміш', 'Овочі та фрукти'],
    ['Ciastka czekoladowe', 'Солодощі'],
    ['Чипси картопляні', 'Снеки'],
    ['Sos pomidorowy', 'Соуси'],
    ['Вареники з картоплею', 'Готові страви']
  ])('classifies %s as %s', (name, expectedType) => {
    expect(inferProductType({ name })).toBe(expectedType);
  });

  it.each([
    ['Квасоля біла суха', 'Бобові'],
    ['Яблуко вагове супермаркет', 'Овочі та фрукти'],
    ['Хліб пшеничний', 'Хліб і випічка'],
    ['Протеїновий батончик', 'Спортивне харчування'],
    ['Яйце куряче', 'Яйця'],
    ['Олія соняшникова', 'Олії та жири']
  ])('avoids known ambiguous matches for %s', (name, expectedType) => {
    expect(inferProductType({ name })).toBe(expectedType);
  });

  it('keeps a valid manually assigned type', () => {
    expect(inferProductType({ name: 'Набір продуктів', productType: 'Снеки' })).toBe('Снеки');
  });

  it('uses official taxonomy tags when the product name is not descriptive', () => {
    const product = {
      name: 'Original 500',
      sourceCategories: ['en:beverages', 'en:fruit-juices']
    };

    expect(inferProductType(product)).toBe('Напої');
    expect(getProductTaxonomySearchAliases(product)).toEqual(['напої', 'сік']);
  });

  it.each([
    ['Temna čokolada', 'Солодощі'],
    ['Płatki owsiane', 'Крупи та макарони']
  ])('normalizes European diacritics in %s', (name, expectedType) => {
    expect(inferProductType({ name })).toBe(expectedType);
  });

  it('uses a Ukrainian source tag as a fallback for an unclear name', () => {
    expect(inferProductType({
      name: 'Original',
      sourceCategories: ['uk:ковбаса']
    })).toBe('М’ясо та птиця');
  });

  it('prefers a descriptive name over a broad source category', () => {
    expect(inferProductType({
      name: 'Riso parboiled',
      sourceCategories: ['en:snacks', 'en:cereal-grains']
    })).toBe('Крупи та макарони');
  });

  it('uses a known single-purpose brand only as a final fallback', () => {
    expect(inferProductType({ name: 'Qualita Oro', brand: 'Lavazza' })).toBe('Напої');
    expect(inferProductType({ name: 'Олія соняшникова', brand: 'Roshen' })).toBe('Олії та жири');
  });

  it('uses the fallback for an unknown product', () => {
    expect(inferProductType({ name: 'Невідомий товар' })).toBe('Інше');
  });
});
