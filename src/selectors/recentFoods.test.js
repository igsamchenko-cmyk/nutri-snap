import { describe, expect, it } from 'vitest';
import { getRecentFoods } from './recentFoods';

const meal = (overrides = {}) => ({
  id: 'meal-1', name: 'Йогурт', date: '2026-09-05', weight: 100,
  calories: 100, protein: 5, fat: 2, carbs: 15, source: 'manual',
  ...overrides
});

describe('getRecentFoods', () => {
  it('deduplicates products independently of meal id and keeps the latest portion', () => {
    const foods = [
      meal({ id: 'old', date: '2026-09-03' }),
      meal({ id: 'new', name: '  ЙОГУРТ  ', weight: 200, calories: 200, protein: 10, fat: 4, carbs: 30 })
    ];
    const before = JSON.stringify(foods);
    const recent = getRecentFoods(foods, '2026-09-06');
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ weight: 200, defaultPortionGrams: 200, calories: 200 });
    expect(recent[0].id).toBe(getRecentFoods([foods[0]])[0].id);
    expect(JSON.stringify(foods)).toBe(before);
  });

  it('orders by diary date then creation time and excludes days after the selected date', () => {
    const recent = getRecentFoods([
      meal({ name: 'Early', createdAt: '2026-09-05T07:00:00Z' }),
      meal({ name: 'Old day', date: '2026-09-04', createdAt: '2026-09-06T12:00:00Z' }),
      meal({ name: 'Late', createdAt: '2026-09-05T19:00:00Z' }),
      meal({ name: 'Future', date: '2026-09-06' })
    ], '2026-09-05');
    expect(recent.map(food => food.name)).toEqual(['Late', 'Early', 'Old day']);
  });

  it('preserves input latest-first order when creation timestamps are missing or tied', () => {
    expect(getRecentFoods([
      meal({ name: 'Newest in storage' }),
      meal({ name: 'Previous in storage' }),
      meal({ name: 'Oldest in storage' })
    ]).map(food => food.name)).toEqual(['Newest in storage', 'Previous in storage', 'Oldest in storage']);
  });

  it('uses manually edited totals and serving grams rather than the original snapshot', () => {
    const recent = getRecentFoods([meal({
      servingGrams: 150,
      totals: { calories: 240, protein: 18, fat: 6, carbs: 30 },
      foodSnapshot: {
        brand: 'Test brand', source: 'ai_estimate',
        per100g: { calories: 100, protein: 5, fat: 2, carbs: 15 }
      },
      source: 'ai_estimate', confidence: 0.6, warning: 'Орієнтовні дані', icon: '🥣', image: 'saved.jpg'
    })]);
    expect(recent[0]).toMatchObject({
      weight: 150, calories: 240, protein: 18, fat: 6, carbs: 30,
      per100g: { calories: 160, protein: 12, fat: 4, carbs: 20 },
      brand: 'Test brand', source: 'ai_estimate', confidence: 0.6,
      warning: 'Орієнтовні дані', icon: '🥣', image: 'saved.jpg'
    });
  });

  it('keeps different brands and different nutrition values separate', () => {
    const recent = getRecentFoods([
      meal({ brand: 'Brand A' }),
      meal({ foodSnapshot: { brand: 'Brand B' } }),
      meal({ brand: 'Brand A', protein: 8 })
    ]);
    expect(recent).toHaveLength(3);
    expect(new Set(recent.map(food => food.id)).size).toBe(3);
  });

  it('deduplicates by barcode across display names but retains edited nutrition variants', () => {
    const recent = getRecentFoods([
      meal({ name: 'New label', barcode: '12345678' }),
      meal({ name: 'Old label', date: '2026-09-04', foodSnapshot: { barcode: '12345678' } }),
      meal({ name: 'Edited label', barcode: '12345678', protein: 8 })
    ]);
    expect(recent.map(food => food.name)).toEqual(['New label', 'Edited label']);
  });

  it('returns at most twelve valid products after filtering and deduplication', () => {
    const recent = getRecentFoods([
      null,
      meal({ name: '' }),
      meal({ weight: 0 }),
      meal({ calories: -1 }),
      meal({ protein: undefined }),
      meal({ date: '' }),
      ...Array.from({ length: 15 }, (_, index) => meal({ name: `Food ${index}` }))
    ]);
    expect(recent).toHaveLength(12);
    expect(recent[0].name).toBe('Food 0');
    expect(recent[11].name).toBe('Food 11');
    expect(getRecentFoods([meal()], '', 0)).toEqual([]);
    expect(getRecentFoods(null)).toEqual([]);
  });
});
