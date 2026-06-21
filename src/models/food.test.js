import { describe, it, expect } from 'vitest';
import {
  cloneMealEntryForDate,
  copyMealEntriesForDate,
  createCustomFoodItem,
  createFavoriteFromFoodItem,
  createFavoriteFromMealEntry,
  createFoodItem,
  createFoodItemFromCustomFood,
  createBarcodeMealEntry,
  createManualMealEntry,
  createMealEntryFromCustomFood,
  createMealEntryFromExistingMeal,
  createMealEntryFromFavorite,
  createMealEntryFromFoodItem,
  createMealEntryFromLegacyMeal,
  getMealTotals,
  normalizeCustomFood,
  normalizeCustomFoods,
  normalizeFavoriteFood,
  normalizeFavoriteFoods,
  normalizeFoodItem,
  normalizeMealEntry,
  normalizeMealEntries,
  sumMealTotals
} from './food';

describe('Food and Meal Models', () => {
  it('should create a FoodItem normalized to per 100g nutrition', () => {
    const food = createFoodItem({
      id: 'food-1',
      name: 'Greek yogurt',
      brand: 'Local Dairy',
      barcode: '123456',
      source: 'openfoodfacts',
      dataQuality: 'label_read',
      confidence: 92,
      calories: 120,
      protein: 10,
      fat: 4,
      carbs: 8,
      weight: 200,
      warning: 'Check label.'
    });

    expect(food).toMatchObject({
      id: 'food-1',
      name: 'Greek yogurt',
      brand: 'Local Dairy',
      barcode: '123456',
      source: 'barcode_off',
      dataQuality: 'label_read',
      confidence: 92,
      defaultPortionGrams: 200,
      per100g: {
        calories: 60,
        protein: 5,
        fat: 2,
        carbs: 4
      },
      calories: 60,
      protein: 5,
      fat: 2,
      carbs: 4,
      weight: 100,
      warning: 'Check label.'
    });
  });

  it('should create a MealEntry from FoodItem and scale totals by serving grams', () => {
    const food = createFoodItem({
      name: 'Rice',
      source: 'manual',
      per100g: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 }
    });

    const meal = createMealEntryFromFoodItem(food, 250, {
      id: 'meal-1',
      date: '2026-06-20',
      category: 'Lunch',
      icon: 'rice',
      source: 'manual'
    });

    expect(meal).toMatchObject({
      id: 'meal-1',
      date: '2026-06-20',
      category: 'Lunch',
      mealType: 'Lunch',
      name: 'Rice',
      servingGrams: 250,
      totals: {
        calories: 325,
        protein: 6.8,
        fat: 0.8,
        carbs: 70
      },
      calories: 325,
      protein: 6.8,
      fat: 0.8,
      carbs: 70,
      weight: 250,
      source: 'manual'
    });
    expect(meal.foodSnapshot.per100g).toEqual(food.per100g);
  });


  it('should create a manual MealEntry from serving nutrition while preserving aliases', () => {
    const meal = createManualMealEntry({
      name: 'Homemade bowl',
      source: 'manual',
      calories: 480,
      protein: 30,
      fat: 20,
      carbs: 45,
      weight: 300
    }, 300, {
      id: 'manual-meal-1',
      date: '2026-06-20',
      category: 'Dinner',
      icon: 'bowl'
    });

    expect(meal).toMatchObject({
      id: 'manual-meal-1',
      source: 'manual',
      servingGrams: 300,
      totals: { calories: 480, protein: 30, fat: 20, carbs: 45 },
      calories: 480,
      protein: 30,
      fat: 20,
      carbs: 45,
      weight: 300,
      originalCalories: 480,
      originalProtein: 30,
      originalFat: 20,
      originalCarbs: 45,
      originalWeight: 300
    });
    expect(meal.foodSnapshot).toMatchObject({
      name: 'Homemade bowl',
      source: 'manual',
      per100g: { calories: 160, protein: 10, fat: 6.7, carbs: 15 }
    });
  });

  it('should create a barcode MealEntry from per-100g nutrition and preserve product metadata', () => {
    const meal = createBarcodeMealEntry({
      name: 'Greek yogurt',
      brand: 'Dairy Co',
      barcode: '4820000000000',
      source: 'openfoodfacts',
      dataQuality: 'database',
      calories: 60,
      protein: 5,
      fat: 2,
      carbs: 4,
      warning: 'Check label.'
    }, 250, {
      id: 'barcode-meal-1',
      date: '2026-06-20',
      category: 'Snack',
      source: 'barcode_off'
    });

    expect(meal).toMatchObject({
      id: 'barcode-meal-1',
      source: 'barcode_off',
      servingGrams: 250,
      totals: { calories: 150, protein: 12.5, fat: 5, carbs: 10 },
      calories: 150,
      protein: 12.5,
      fat: 5,
      carbs: 10,
      weight: 250,
      originalCalories: 60,
      originalProtein: 5,
      originalFat: 2,
      originalCarbs: 4,
      originalWeight: 100,
      warning: 'Check label.'
    });
    expect(meal.foodSnapshot).toMatchObject({
      name: 'Greek yogurt',
      brand: 'Dairy Co',
      barcode: '4820000000000',
      source: 'barcode_off',
      dataQuality: 'database',
      per100g: { calories: 60, protein: 5, fat: 2, carbs: 4 }
    });
  });

  it('should clone a legacy meal for a new date without mutating the original', () => {
    const legacy = {
      id: 'legacy-source',
      name: 'Soup',
      date: '2026-06-19',
      category: 'Lunch',
      calories: 180,
      protein: 8,
      fat: 6,
      carbs: 24,
      weight: 300
    };

    const clone = cloneMealEntryForDate(legacy, '2026-06-20', {
      id: 'legacy-copy',
      copiedFrom: legacy.id,
      copiedAt: '2026-06-20T10:00:00.000Z'
    });

    expect(clone).toMatchObject({
      id: 'legacy-copy',
      date: '2026-06-20',
      copiedFrom: 'legacy-source',
      copiedAt: '2026-06-20T10:00:00.000Z',
      totals: { calories: 180, protein: 8, fat: 6, carbs: 24 },
      calories: 180,
      protein: 8,
      fat: 6,
      carbs: 24,
      weight: 300,
      originalCalories: 180,
      originalProtein: 8,
      originalFat: 6,
      originalCarbs: 24,
      originalWeight: 300
    });
    expect(clone.foodSnapshot).toMatchObject({ name: 'Soup' });
    expect(legacy).toEqual({
      id: 'legacy-source',
      name: 'Soup',
      date: '2026-06-19',
      category: 'Lunch',
      calories: 180,
      protein: 8,
      fat: 6,
      carbs: 24,
      weight: 300
    });
  });

  it('should clone a MealEntry and preserve totals, snapshot, source, confidence and warning', () => {
    const meal = createMealEntryFromFoodItem(
      createFoodItem({
        name: 'Pasta',
        source: 'ai_photo',
        confidence: 88,
        warning: 'Estimate only.',
        per100g: { calories: 140, protein: 5, fat: 2, carbs: 24 }
      }),
      250,
      {
        id: 'meal-source',
        date: '2026-06-19',
        category: 'Dinner',
        source: 'ai_photo',
        confidence: 88,
        warning: 'Estimate only.',
        original: { calories: 340, protein: 12, fat: 5, carbs: 58, weight: 250 }
      }
    );

    const clone = createMealEntryFromExistingMeal(meal, {
      id: 'meal-copy',
      date: '2026-06-20',
      repeatedFrom: meal.id,
      repeatedAt: '2026-06-20T11:00:00.000Z'
    });

    expect(clone).toMatchObject({
      id: 'meal-copy',
      date: '2026-06-20',
      repeatedFrom: 'meal-source',
      repeatedAt: '2026-06-20T11:00:00.000Z',
      source: 'ai_photo',
      confidence: 88,
      warning: 'Estimate only.',
      totals: meal.totals,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
      weight: meal.weight,
      originalCalories: meal.originalCalories,
      originalProtein: meal.originalProtein,
      originalFat: meal.originalFat,
      originalCarbs: meal.originalCarbs,
      originalWeight: meal.originalWeight
    });
    expect(clone.foodSnapshot).toEqual(meal.foodSnapshot);
    expect(clone.foodSnapshot).not.toBe(meal.foodSnapshot);
    expect(clone.totals).not.toBe(meal.totals);
    expect(meal.id).toBe('meal-source');
    expect(meal.date).toBe('2026-06-19');
  });

  it('should copy multiple meals for a target date with independent ids', () => {
    const meals = [
      { id: 'legacy-1', name: 'Soup', date: '2026-06-18', calories: 100, protein: 5, fat: 2, carbs: 15, weight: 250 },
      createMealEntryFromFoodItem(
        createFoodItem({ name: 'Rice', source: 'manual', per100g: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 } }),
        200,
        { id: 'entry-1', date: '2026-06-18' }
      )
    ];
    let nextId = 0;

    const copies = copyMealEntriesForDate(meals, '2026-06-20', {
      createId: () => 'copy-' + (nextId += 1),
      copiedAt: '2026-06-20T12:00:00.000Z',
      time: '12:00'
    });

    expect(copies).toHaveLength(2);
    expect(copies.map(meal => meal.id)).toEqual(['copy-1', 'copy-2']);
    expect(copies.map(meal => meal.date)).toEqual(['2026-06-20', '2026-06-20']);
    expect(copies.map(meal => meal.copiedFrom)).toEqual(['legacy-1', 'entry-1']);
    expect(copies[1].foodSnapshot).toEqual(meals[1].foodSnapshot);
    expect(copies[1].totals).toEqual(meals[1].totals);
    expect(meals[0].date).toBe('2026-06-18');
    expect(meals[1].date).toBe('2026-06-18');
  });

  it('should create a MealEntry from a favorite without requiring new favorite fields', () => {
    const favorite = {
      name: 'Favorite omelette',
      calories: 220,
      protein: 16,
      fat: 14,
      carbs: 6,
      weight: 180,
      image: 'data:image/png;base64,abc'
    };

    const meal = createMealEntryFromFavorite(favorite, {
      id: 'favorite-meal-1',
      date: '2026-06-20',
      category: 'Breakfast',
      icon: 'egg'
    });

    expect(meal).toMatchObject({
      id: 'favorite-meal-1',
      date: '2026-06-20',
      category: 'Breakfast',
      source: 'manual',
      totals: { calories: 220, protein: 16, fat: 14, carbs: 6 },
      calories: 220,
      protein: 16,
      fat: 14,
      carbs: 6,
      weight: 180,
      originalCalories: 220,
      originalProtein: 16,
      originalFat: 14,
      originalCarbs: 6,
      originalWeight: 180,
      image: 'data:image/png;base64,abc'
    });
    expect(meal.foodSnapshot).toMatchObject({
      name: 'Favorite omelette',
      source: 'manual',
      per100g: { calories: 122, protein: 8.9, fat: 7.8, carbs: 3.3 }
    });
  });

  it('should normalize a legacy favorite without mutating input', () => {
    const favorite = {
      name: 'Legacy favorite',
      calories: 200,
      protein: 12,
      fat: 6,
      carbs: 36,
      weight: 150,
      image: 'favorite-image'
    };
    const original = JSON.parse(JSON.stringify(favorite));

    const normalized = normalizeFavoriteFood(favorite);

    expect(normalized).toMatchObject({
      name: 'Legacy favorite',
      source: 'manual',
      calories: 200,
      protein: 12,
      fat: 6,
      carbs: 36,
      weight: 150,
      servingGrams: 150,
      totals: { calories: 200, protein: 12, fat: 6, carbs: 36 },
      per100g: { calories: 133, protein: 8, fat: 4, carbs: 24 },
      image: 'favorite-image'
    });
    expect(normalized.foodSnapshot).toMatchObject({
      name: 'Legacy favorite',
      source: 'manual',
      per100g: { calories: 133, protein: 8, fat: 4, carbs: 24 }
    });
    expect(favorite).toEqual(original);
  });

  it('should create a favorite from a FoodItem and preserve metadata', () => {
    const food = createFoodItem({
      name: 'Barcode yogurt',
      brand: 'Dairy Co',
      barcode: '4820000000000',
      source: 'barcode_off',
      dataQuality: 'database',
      confidence: 91,
      warning: 'Check label.',
      per100g: { calories: 60, protein: 5, fat: 2, carbs: 4 }
    });

    const favorite = createFavoriteFromFoodItem(food, {
      weight: 250,
      image: 'yogurt-image'
    });

    expect(favorite).toMatchObject({
      name: 'Barcode yogurt',
      brand: 'Dairy Co',
      barcode: '4820000000000',
      source: 'barcode_off',
      dataQuality: 'database',
      confidence: 91,
      warning: 'Check label.',
      calories: 150,
      protein: 12.5,
      fat: 5,
      carbs: 10,
      weight: 250,
      image: 'yogurt-image'
    });
    expect(favorite.foodSnapshot).toMatchObject({
      source: 'barcode_off',
      per100g: { calories: 60, protein: 5, fat: 2, carbs: 4 }
    });
  });

  it('should create a favorite from a MealEntry without losing snapshot, warning or confidence', () => {
    const meal = createMealEntryFromFoodItem(
      createFoodItem({
        name: 'AI stew',
        source: 'ai_photo',
        confidence: 77,
        warning: 'Estimate only.',
        per100g: { calories: 120, protein: 8, fat: 4, carbs: 13 }
      }),
      300,
      {
        id: 'ai-meal-1',
        date: '2026-06-20',
        category: 'Dinner',
        source: 'ai_photo',
        confidence: 77,
        warning: 'Estimate only.'
      }
    );
    const originalSnapshot = meal.foodSnapshot;

    const favorite = createFavoriteFromMealEntry(meal);

    expect(favorite).toMatchObject({
      name: 'AI stew',
      source: 'ai_photo',
      confidence: 77,
      warning: 'Estimate only.',
      calories: 360,
      protein: 24,
      fat: 12,
      carbs: 39,
      weight: 300
    });
    expect(favorite.foodSnapshot).toEqual(originalSnapshot);
    expect(favorite.foodSnapshot).not.toBe(originalSnapshot);
  });

  it('should normalize favorite arrays and keep normalized favorites compatible with MealEntry creation', () => {
    const favorites = normalizeFavoriteFoods([
      { name: 'Legacy favorite', calories: 120, protein: 8, fat: 4, carbs: 12, weight: 100 },
      createFavoriteFromFoodItem({ name: 'New favorite', source: 'manual', per100g: { calories: 80, protein: 6, fat: 2, carbs: 10 } }, { weight: 200 })
    ]);

    const meal = createMealEntryFromFavorite(favorites[1], {
      id: 'favorite-entry-2',
      date: '2026-06-20',
      category: 'Snack'
    });

    expect(favorites).toHaveLength(2);
    expect(meal).toMatchObject({
      id: 'favorite-entry-2',
      totals: { calories: 160, protein: 12, fat: 4, carbs: 20 },
      calories: 160,
      protein: 12,
      fat: 4,
      carbs: 20,
      weight: 200
    });
    expect(meal.foodSnapshot).toMatchObject({ name: 'New favorite', source: 'manual' });
  });

  it('should normalize a legacy custom food and preserve backup-compatible aliases', () => {
    const customFood = {
      id: 'custom-legacy',
      name: 'Custom granola',
      calories: 420,
      protein: 12,
      fat: 18,
      carbs: 52,
      weight: 100,
      brand: 'My foods',
      source: 'manual',
      dataQuality: 'manual'
    };
    const original = JSON.parse(JSON.stringify(customFood));

    const normalized = normalizeCustomFood(customFood);

    expect(normalized).toMatchObject({
      id: 'custom-legacy',
      name: 'Custom granola',
      brand: 'My foods',
      source: 'custom',
      dataQuality: 'manual',
      calories: 420,
      protein: 12,
      fat: 18,
      carbs: 52,
      weight: 100,
      per100g: { calories: 420, protein: 12, fat: 18, carbs: 52 }
    });
    expect(normalized.foodSnapshot).toMatchObject({
      name: 'Custom granola',
      source: 'custom',
      per100g: { calories: 420, protein: 12, fat: 18, carbs: 52 }
    });
    expect(customFood).toEqual(original);
  });

  it('should create a custom FoodItem from serving nutrition and scale it to per 100g', () => {
    const customFood = createCustomFoodItem({
      id: 'custom-serving',
      name: 'Homemade curry',
      calories: 500,
      protein: 25,
      fat: 20,
      carbs: 60,
      weight: 250,
      source: 'custom'
    });
    const foodItem = createFoodItemFromCustomFood(customFood);

    expect(customFood).toMatchObject({
      id: 'custom-serving',
      source: 'custom',
      dataQuality: 'manual',
      calories: 200,
      protein: 10,
      fat: 8,
      carbs: 24,
      weight: 100,
      defaultPortionGrams: 250,
      per100g: { calories: 200, protein: 10, fat: 8, carbs: 24 }
    });
    expect(foodItem).toMatchObject({
      id: 'custom-serving',
      source: 'custom',
      per100g: { calories: 200, protein: 10, fat: 8, carbs: 24 }
    });
  });

  it('should create a backward-compatible MealEntry from custom food', () => {
    const customFood = createCustomFoodItem({
      id: 'custom-oats',
      name: 'Custom oats',
      per100g: { calories: 200, protein: 10, fat: 8, carbs: 24 },
      source: 'custom'
    });

    const meal = createMealEntryFromCustomFood(customFood, 125, {
      id: 'custom-meal-1',
      date: '2026-06-20',
      category: 'Breakfast'
    });

    expect(meal).toMatchObject({
      id: 'custom-meal-1',
      date: '2026-06-20',
      category: 'Breakfast',
      source: 'custom',
      servingGrams: 125,
      totals: { calories: 250, protein: 12.5, fat: 10, carbs: 30 },
      calories: 250,
      protein: 12.5,
      fat: 10,
      carbs: 30,
      weight: 125,
      originalCalories: 200,
      originalProtein: 10,
      originalFat: 8,
      originalCarbs: 24,
      originalWeight: 100
    });
    expect(meal.foodSnapshot).toMatchObject({
      name: 'Custom oats',
      source: 'custom',
      per100g: { calories: 200, protein: 10, fat: 8, carbs: 24 }
    });
  });

  it('should normalize mixed custom food arrays without changing storage-shaped fields', () => {
    const customFoods = normalizeCustomFoods([
      { name: 'Legacy custom', calories: 100, protein: 5, fat: 2, carbs: 12, weight: 100 },
      createCustomFoodItem({ name: 'New custom', calories: 300, protein: 15, fat: 12, carbs: 33, weight: 150 })
    ]);

    expect(customFoods).toHaveLength(2);
    expect(customFoods[0]).toMatchObject({
      name: 'Legacy custom',
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 12,
      weight: 100,
      foodSnapshot: expect.any(Object)
    });
    expect(customFoods[1]).toMatchObject({
      name: 'New custom',
      calories: 200,
      protein: 10,
      fat: 8,
      carbs: 22,
      weight: 100,
      defaultPortionGrams: 150,
      foodSnapshot: expect.any(Object)
    });
  });

  it('should create a MealEntry from a legacy meal without breaking top-level fields', () => {
    const legacy = {
      id: 'legacy-1',
      name: 'Soup',
      date: '2026-06-20',
      category: 'Dinner',
      calories: 180,
      protein: 8,
      fat: 6,
      carbs: 24,
      weight: 300
    };

    const meal = createMealEntryFromLegacyMeal(legacy);

    expect(meal).toMatchObject({
      id: 'legacy-1',
      name: 'Soup',
      calories: 180,
      protein: 8,
      fat: 6,
      carbs: 24,
      weight: 300,
      servingGrams: 300,
      totals: {
        calories: 180,
        protein: 8,
        fat: 6,
        carbs: 24
      },
      foodSnapshot: {
        name: 'Soup',
        per100g: {
          calories: 60,
          protein: 2.7,
          fat: 2,
          carbs: 8
        }
      }
    });
  });

  it('should normalize an existing FoodItem without mutating input', () => {
    const input = {
      name: 'Apple',
      source: 'ai-search',
      per100g: { calories: '52', protein: '0.3', fat: '0.2', carbs: '14' }
    };

    const food = normalizeFoodItem(input);

    expect(food.source).toBe('ai_estimate');
    expect(food.per100g).toEqual({ calories: 52, protein: 0.3, fat: 0.2, carbs: 14 });
    expect(input.per100g.calories).toBe('52');
  });

  it('should normalize an existing MealEntry with totals and preserve compatibility aliases', () => {
    const meal = normalizeMealEntry({
      id: 'meal-2',
      name: 'Cottage cheese',
      date: '2026-06-20',
      mealType: 'Breakfast',
      servingGrams: '150',
      totals: { calories: '165', protein: '24', fat: '6', carbs: '4' },
      foodSnapshot: {
        name: 'Cottage cheese',
        source: 'manual',
        per100g: { calories: 110, protein: 16, fat: 4, carbs: 2.7 }
      }
    });

    expect(meal).toMatchObject({
      calories: 165,
      protein: 24,
      fat: 6,
      carbs: 4,
      weight: 150,
      servingGrams: 150,
      category: 'Breakfast',
      mealType: 'Breakfast'
    });
  });

  it('should return totals from new or legacy meal entries', () => {
    expect(getMealTotals({ totals: { calories: 100, protein: 5, fat: 2, carbs: 12 } })).toEqual({
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 12
    });
    expect(getMealTotals({ calories: 200, protein: 8, fat: 9, carbs: 22 })).toEqual({
      calories: 200,
      protein: 8,
      fat: 9,
      carbs: 22
    });
  });

  it('should preserve source, confidence, and warning on AI photo meal entries', () => {
    const food = createFoodItem({
      name: 'Pasta plate',
      source: 'ai_photo',
      confidence: 81,
      warning: 'Estimate only.',
      calories: 440,
      protein: 18,
      fat: 12,
      carbs: 64,
      weight: 350
    });

    const meal = createMealEntryFromFoodItem(food, 350, {
      source: 'ai_photo',
      confidence: food.confidence,
      warning: food.warning,
      original: { calories: 440, protein: 18, fat: 12, carbs: 64, weight: 350 }
    });

    expect(meal.source).toBe('ai_photo');
    expect(meal.confidence).toBe(81);
    expect(meal.warning).toBe('Estimate only.');
    expect(meal.editedFromOriginal).toBe(false);
  });

  it('should mark editedFromOriginal when confirmed values changed from AI original', () => {
    const food = createFoodItem({
      name: 'Pasta plate',
      source: 'ai_photo',
      calories: 500,
      protein: 20,
      fat: 10,
      carbs: 80,
      weight: 350
    });

    const meal = createMealEntryFromFoodItem(food, 350, {
      original: { calories: 440, protein: 18, fat: 12, carbs: 64, weight: 350 }
    });

    expect(meal.editedFromOriginal).toBe(true);
    expect(meal.original).toEqual({ calories: 440, protein: 18, fat: 12, carbs: 64, weight: 350 });
  });

  it('should normalize mixed legacy and new meal arrays for read-time views', () => {
    const legacyMeal = {
      id: 'legacy-soup',
      name: 'Soup',
      date: '2026-06-20',
      category: 'Lunch',
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 15,
      weight: 250
    };
    const food = createFoodItem({
      name: 'Rice',
      source: 'manual',
      per100g: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 }
    });
    const newMeal = createMealEntryFromFoodItem(food, 200, {
      id: 'meal-rice',
      date: '2026-06-20',
      category: 'Lunch'
    });

    const normalizedMeals = normalizeMealEntries([legacyMeal, newMeal]);

    expect(normalizedMeals).toHaveLength(2);
    expect(normalizedMeals[0]).toMatchObject({
      id: 'legacy-soup',
      totals: { calories: 100, protein: 5, fat: 2, carbs: 15 },
      servingGrams: 250
    });
    expect(normalizedMeals[1]).toMatchObject({
      id: 'meal-rice',
      totals: { calories: 260, protein: 5.4, fat: 0.6, carbs: 56 },
      servingGrams: 200
    });
  });

  it('should sum daily totals from mixed legacy and MealEntry objects', () => {
    const legacyMeal = {
      name: 'Soup',
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 15,
      weight: 250
    };
    const riceMeal = createMealEntryFromFoodItem(
      createFoodItem({
        name: 'Rice',
        source: 'manual',
        per100g: { calories: 130, protein: 2.7, fat: 0.3, carbs: 28 }
      }),
      200
    );

    expect(sumMealTotals([legacyMeal, riceMeal])).toEqual({
      calories: 360,
      protein: 10.4,
      fat: 2.6,
      carbs: 71
    });
  });
});
