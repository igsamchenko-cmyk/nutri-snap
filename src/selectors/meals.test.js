import { describe, it, expect } from 'vitest';
import { createFoodItem, createMealEntryFromFoodItem } from '../models/food';
import {
  getCalendarMealIndicators,
  getCategoryTotals,
  getDailyTotals,
  getMacroProgress,
  getMealsByCategory,
  getMealsByDate,
  getMealsForDateRange,
  getRecentDatesForCategory,
  getStreakStats,
  getThirtyDayAverage,
  getUsageStats,
  getWeeklyAverages,
  getWeeklyTotals
} from './meals';

const lunch = 'Lunch';
const dinner = 'Dinner';

function createMeal(overrides = {}) {
  return createMealEntryFromFoodItem(
    createFoodItem({
      name: overrides.name || 'Rice bowl',
      source: overrides.source || 'manual',
      per100g: overrides.per100g || { calories: 100, protein: 5, fat: 2, carbs: 15 }
    }),
    overrides.servingGrams || 200,
    {
      id: overrides.id || 'meal-1',
      date: overrides.date || '2026-06-20',
      category: overrides.category || lunch,
      source: overrides.source || 'manual'
    }
  );
}

describe('meal selectors', () => {
  it('gets meals by date for legacy meals without mutating input', () => {
    const meals = [
      { id: 'legacy-1', name: 'Soup', date: '2026-06-20', category: lunch, calories: 120, protein: 6, fat: 4, carbs: 18, weight: 250 },
      { id: 'legacy-2', name: 'Toast', date: '2026-06-19', category: dinner, calories: 90, protein: 3, fat: 2, carbs: 14, weight: 80 }
    ];
    const original = JSON.parse(JSON.stringify(meals));

    const result = getMealsByDate(meals, '2026-06-20');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'legacy-1',
      totals: { calories: 120, protein: 6, fat: 4, carbs: 18 },
      foodSnapshot: expect.any(Object)
    });
    expect(meals).toEqual(original);
  });

  it('gets daily totals for new MealEntry objects', () => {
    const meals = [
      createMeal({ id: 'entry-1', name: 'Rice', date: '2026-06-20', servingGrams: 250 }),
      createMeal({ id: 'entry-2', name: 'Beans', date: '2026-06-20', servingGrams: 100, per100g: { calories: 80, protein: 6, fat: 1, carbs: 14 } })
    ];

    expect(getDailyTotals(meals, '2026-06-20')).toEqual({
      calories: 330,
      protein: 18.5,
      fat: 6,
      carbs: 51.5
    });
  });

  it('supports mixed legacy and MealEntry arrays for grouping and category totals', () => {
    const meals = [
      { id: 'legacy-1', name: 'Soup', date: '2026-06-20', category: lunch, calories: 120, protein: 6, fat: 4, carbs: 18, weight: 250 },
      createMeal({ id: 'entry-1', name: 'Stew', date: '2026-06-20', category: lunch, servingGrams: 150 }),
      createMeal({ id: 'entry-2', name: 'Salad', date: '2026-06-20', category: dinner, servingGrams: 100 })
    ];

    const grouped = getMealsByCategory(meals, '2026-06-20');
    const categoryTotals = getCategoryTotals(meals, '2026-06-20');

    expect(grouped[lunch]).toHaveLength(2);
    expect(grouped[dinner]).toHaveLength(1);
    expect(categoryTotals[lunch]).toEqual({ calories: 270, protein: 13.5, fat: 7, carbs: 40.5 });
    expect(categoryTotals[dinner]).toEqual({ calories: 100, protein: 5, fat: 2, carbs: 15 });
  });

  it('filters meals by inclusive date range', () => {
    const meals = [
      { id: 'a', name: 'A', date: '2026-06-18', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'b', name: 'B', date: '2026-06-19', calories: 20, protein: 2, fat: 2, carbs: 2, weight: 100 },
      { id: 'c', name: 'C', date: '2026-06-20', calories: 30, protein: 3, fat: 3, carbs: 3, weight: 100 }
    ];

    expect(getMealsForDateRange(meals, '2026-06-19', '2026-06-20').map(meal => meal.id)).toEqual(['b', 'c']);
    expect(getMealsForDateRange(meals, '2026-06-20', '2026-06-19').map(meal => meal.id)).toEqual(['b', 'c']);
  });

  it('computes weekly totals with water and goal percent', () => {
    const meals = [
      { id: 'legacy-1', name: 'Soup', date: '2026-06-18', calories: 100, protein: 5, fat: 2, carbs: 15, weight: 100 },
      createMeal({ id: 'entry-1', date: '2026-06-20', servingGrams: 200 })
    ];

    const weekly = getWeeklyTotals(meals, '2026-06-20', {
      waterIntake: { '2026-06-20': 750 },
      targetCalories: 200,
      today: '2026-06-20',
      locale: 'en-US'
    });

    expect(weekly).toHaveLength(7);
    expect(weekly[0].dateStr).toBe('2026-06-14');
    expect(weekly[4]).toMatchObject({ dateStr: '2026-06-18', calories: 100, goalPercent: 50 });
    expect(weekly[6]).toMatchObject({ dateStr: '2026-06-20', calories: 200, protein: 10, water: 750, goalPercent: 100, isToday: true });
  });

  it('computes weekly averages from logged days only', () => {
    const averages = getWeeklyAverages([
      { calories: 0, protein: 0, water: 0 },
      { calories: 100, protein: 5, water: 500 },
      { calories: 300, protein: 15, water: 1000 }
    ]);

    expect(averages).toEqual({ calories: 200, protein: 10, water: 750, loggedDays: 2 });
  });

  it('computes 30-day average from days that have meals', () => {
    const meals = [
      { id: 'legacy-1', name: 'Soup', date: '2026-05-22', calories: 100, protein: 5, fat: 2, carbs: 15, weight: 100 },
      createMeal({ id: 'entry-1', date: '2026-06-20', servingGrams: 300 })
    ];

    expect(getThirtyDayAverage(meals, '2026-06-20')).toBe(200);
  });

  it('returns calendar meal indicators for the requested month', () => {
    const indicators = getCalendarMealIndicators([
      { id: 'may', name: 'May', date: '2026-05-31', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'jun', name: 'June', date: '2026-06-01', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 }
    ], '2026-06-15');

    expect(indicators.has('2026-06-01')).toBe(true);
    expect(indicators.has('2026-05-31')).toBe(false);
  });

  it('computes usage stats with an optional key normalizer', () => {
    const stats = getUsageStats([
      { id: 'a', name: ' Rice ', date: '2026-06-20', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'b', name: 'rice', date: '2026-06-19', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 }
    ], { normalizeKey: value => String(value).trim().toLowerCase() });

    expect(stats.get('rice')).toEqual({ count: 2, firstIndex: 0 });
  });

  it('computes streak stats from meals and water activity', () => {
    const stats = getStreakStats([
      { id: 'a', name: 'A', date: '2026-06-18', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'b', name: 'B', date: '2026-06-20', calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 }
    ], '2026-06-20', {
      waterIntake: { '2026-06-19': 250 }
    });

    expect(stats.currentStreak).toBe(3);
    expect(stats.activeDates.has('2026-06-19')).toBe(true);
  });

  it('computes macro progress safely', () => {
    expect(getMacroProgress(
      { calories: 2200, protein: 90, fat: 20, carbs: 180 },
      { targetCalories: 2000, targetProtein: 100, targetFat: 0, targetCarbs: 240 }
    )).toEqual({
      calories: 100,
      protein: 90,
      fat: 0,
      carbs: 75
    });
  });

  it('handles empty and invalid inputs without throwing', () => {
    expect(getMealsByDate(null, '2026-06-20')).toEqual([]);
    expect(getDailyTotals([{ name: 'Broken', date: '2026-06-20' }], '2026-06-20')).toEqual({ calories: 0, protein: 0, fat: 0, carbs: 0 });
    expect(getMealsForDateRange([], '', '')).toEqual([]);
    expect(getThirtyDayAverage([], '2026-06-20')).toBe(0);
    expect(getWeeklyAverages([])).toEqual({ calories: 0, protein: 0, water: 0, loggedDays: 0 });
  });

  it('finds recent dates for a category and supports legacy snack naming', () => {
    const legacySnack = '\u041f\u0435\u0440\u0435\u043a\u0443\u0441';
    const firstSnack = '\u041f\u0435\u0440\u0448\u0438\u0439 \u043f\u0435\u0440\u0435\u043a\u0443\u0441';
    const dates = getRecentDatesForCategory([
      { id: 'a', name: 'A', date: '2026-06-18', category: legacySnack, calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'b', name: 'B', date: '2026-06-19', category: firstSnack, calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 },
      { id: 'c', name: 'C', date: '2026-06-20', category: firstSnack, calories: 10, protein: 1, fat: 1, carbs: 1, weight: 100 }
    ], firstSnack, '2026-06-20', 2);

    expect(dates).toEqual(['2026-06-19', '2026-06-18']);
  });
});
