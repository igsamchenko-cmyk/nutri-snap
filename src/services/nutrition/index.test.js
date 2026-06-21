import { describe, it, expect } from 'vitest';
import {
  calculateCaloriesFromMacros,
  checkCaloriesConsistency,
  roundNutritionValues,
  scaleNutritionPer100g,
  validateNutritionValues
} from './index';

describe('Nutrition Services', () => {
  it('should scale nutrition values from 100g to a portion', () => {
    expect(scaleNutritionPer100g({
      calories: 250,
      protein: 10,
      fat: 8,
      carbs: 30
    }, 150)).toEqual({
      calories: 375,
      protein: 15,
      fat: 12,
      carbs: 45
    });
  });

  it('should round scaled values consistently', () => {
    expect(scaleNutritionPer100g({
      calories: 123.4,
      protein: 3.33,
      fat: 2.22,
      carbs: 10.55
    }, 30)).toEqual({
      calories: 37,
      protein: 1,
      fat: 0.7,
      carbs: 3.2
    });
  });

  it('should round calories to integers and macros to one decimal place', () => {
    expect(roundNutritionValues({
      calories: 100.6,
      protein: 12.34,
      fat: 5.55,
      carbs: 20.04
    })).toEqual({
      calories: 101,
      protein: 12.3,
      fat: 5.6,
      carbs: 20
    });
  });

  it('should reject negative nutrition values', () => {
    const result = validateNutritionValues({
      calories: 100,
      protein: -1,
      fat: 5,
      carbs: 20
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('protein must be greater than or equal to 0');
    expect(scaleNutritionPer100g({
      calories: 100,
      protein: 5,
      fat: 2,
      carbs: 10
    }, -50)).toBeNull();
  });

  it('should reject null, undefined, and string values', () => {
    expect(validateNutritionValues(null).isValid).toBe(false);
    expect(validateNutritionValues(undefined).isValid).toBe(false);
    expect(validateNutritionValues({
      calories: '100',
      protein: 5,
      fat: 2,
      carbs: 10
    }).isValid).toBe(false);
    expect(validateNutritionValues({
      calories: 100,
      protein: undefined,
      fat: 2,
      carbs: null
    }).isValid).toBe(false);
    expect(roundNutritionValues({
      calories: 100,
      protein: 5,
      fat: '2',
      carbs: 10
    })).toBeNull();
  });

  it('should calculate calories from macro values', () => {
    expect(calculateCaloriesFromMacros(20, 10, 30)).toBe(290);
    expect(calculateCaloriesFromMacros(1.2, 0.5, 3.3)).toBeCloseTo(22.5, 5);
    expect(calculateCaloriesFromMacros(-1, 10, 30)).toBeNull();
    expect(calculateCaloriesFromMacros(null, 10, 30)).toBeNull();
  });

  it('should check calorie consistency within an allowed tolerance', () => {
    const result = checkCaloriesConsistency({
      calories: 291,
      protein: 20,
      fat: 10,
      carbs: 30
    }, { tolerance: 2 });

    expect(result.isConsistent).toBe(true);
    expect(result.expectedCalories).toBe(290);
    expect(result.difference).toBe(1);
    expect(result.tolerance).toBe(2);
  });

  it('should flag calorie values outside the allowed tolerance', () => {
    const result = checkCaloriesConsistency({
      calories: 330,
      protein: 20,
      fat: 10,
      carbs: 30
    }, { tolerance: 20 });

    expect(result.isConsistent).toBe(false);
    expect(result.expectedCalories).toBe(290);
    expect(result.difference).toBe(40);
  });

  it('should return validation errors when consistency input is invalid', () => {
    const result = checkCaloriesConsistency({
      calories: 100,
      protein: 5,
      fat: undefined,
      carbs: 10
    });

    expect(result.isConsistent).toBe(false);
    expect(result.expectedCalories).toBeNull();
    expect(result.difference).toBeNull();
    expect(result.errors).toContain('fat must be a finite number');
  });
});
