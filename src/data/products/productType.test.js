import { describe, expect, it } from 'vitest';
import { inferProductType } from './productType.js';

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

  it('uses the fallback for an unknown product', () => {
    expect(inferProductType({ name: 'Невідомий товар' })).toBe('Інше');
  });
});
