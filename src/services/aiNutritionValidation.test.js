import { describe, it, expect } from 'vitest';
import {
  filterValidAiNutritionResults,
  getValidatedAiNutritionResult,
  validateAiNutritionResult
} from './aiNutritionValidation';

const validFood = {
  name: 'Куряче філе з рисом',
  calories: 290,
  protein: 20,
  fat: 10,
  carbs: 30,
  weight: 250,
  confidence: 88,
  ingredients: 'куряче філе, рис',
  dataQuality: 'estimate',
  needsManualNutrition: false,
  warning: 'Оцінка приблизна.'
};

describe('AI Nutrition Validation', () => {
  it('should accept a valid AI nutrition result', () => {
    const validation = validateAiNutritionResult(validFood, { requireConfidence: true, requireNeedsManualNutrition: true });

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.result).toMatchObject({
      name: 'Куряче філе з рисом',
      calories: 290,
      protein: 20,
      fat: 10,
      carbs: 30,
      dataQuality: 'estimate',
      needsManualNutrition: false,
      confidence: 88
    });
  });

  it('should round valid nutrition values', () => {
    const validation = validateAiNutritionResult({
      ...validFood,
      calories: 290.6,
      protein: 20.04,
      fat: 10.05,
      carbs: 29.96
    });

    expect(validation.result.calories).toBe(291);
    expect(validation.result.protein).toBe(20);
    expect(validation.result.fat).toBe(10.1);
    expect(validation.result.carbs).toBe(30);
  });

  it('should mark negative nutrition values as requiring manual review', () => {
    const validation = validateAiNutritionResult({
      ...validFood,
      fat: -1
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('fat must be greater than or equal to 0');
    expect(validation.result.fat).toBeNull();
    expect(validation.result.dataQuality).toBe('insufficient');
    expect(validation.result.needsManualNutrition).toBe(true);
  });

  it('should reject null nutrition unless the result is already insufficient/manual', () => {
    const invalid = validateAiNutritionResult({
      ...validFood,
      calories: null
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toContain('calories is required');
    expect(invalid.result.needsManualNutrition).toBe(true);

    const insufficient = validateAiNutritionResult({
      ...validFood,
      calories: null,
      protein: null,
      fat: null,
      carbs: null,
      dataQuality: 'insufficient',
      needsManualNutrition: true
    });

    expect(insufficient.isValid).toBe(false);
    expect(insufficient.errors).toEqual([]);
    expect(insufficient.result.dataQuality).toBe('insufficient');
    expect(insufficient.result.needsManualNutrition).toBe(true);
  });

  it('should reject string nutrition values as normal data', () => {
    const validation = validateAiNutritionResult({
      ...validFood,
      calories: '290'
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('calories must be a finite number');
    expect(validation.result.calories).toBeNull();
    expect(validation.result.needsManualNutrition).toBe(true);
  });

  it('should validate confidence bounds', () => {
    const highConfidence = validateAiNutritionResult(validFood, { requireConfidence: true, confidenceMax: 99 });
    expect(highConfidence.isValid).toBe(true);

    const outOfBounds = validateAiNutritionResult({ ...validFood, confidence: 100 }, { requireConfidence: true, confidenceMax: 99 });
    expect(outOfBounds.isValid).toBe(false);
    expect(outOfBounds.errors).toContain('confidence must be between 0 and 99');
    expect(outOfBounds.result.confidence).toBe(99);
  });

  it('should validate dataQuality and needsManualNutrition fields', () => {
    const validation = validateAiNutritionResult({
      ...validFood,
      dataQuality: 'trusted',
      needsManualNutrition: 'no'
    }, { requireNeedsManualNutrition: true });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('dataQuality is invalid');
    expect(validation.errors).toContain('needsManualNutrition must be boolean');
    expect(validation.result.dataQuality).toBe('insufficient');
    expect(validation.result.needsManualNutrition).toBe(true);
  });

  it('should mark calorie and macro mismatch as requiring manual review', () => {
    const validation = validateAiNutritionResult({
      ...validFood,
      calories: 500
    }, { calorieTolerance: 20 });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('calories are inconsistent with macros');
    expect(validation.result.needsManualNutrition).toBe(true);
    expect(validation.result.warning).toBe(validFood.warning);
  });

  it('should throw when requesting a validated result without a name', () => {
    expect(() => getValidatedAiNutritionResult({ ...validFood, name: '' })).toThrow('AI response is missing a product or dish name.');
  });

  it('should filter invalid AI search products', () => {
    const products = filterValidAiNutritionResults([
      { name: 'Яблуко', calories: 52, protein: 0.3, fat: 0.2, carbs: 14, weight: 100 },
      { name: 'Погані дані', calories: 100, protein: -1, fat: 2, carbs: 10, weight: 100 },
      { name: '', calories: 100, protein: 5, fat: 2, carbs: 10, weight: 100 }
    ], { calorieTolerance: 50 });

    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Яблуко');
  });
  it('should add a search-specific warning to valid AI search products', () => {
    const warning = 'Перевірте КБЖВ вручну перед збереженням.';
    const products = filterValidAiNutritionResults([
      { name: 'Йогурт', calories: 80, protein: 4, fat: 3, carbs: 9, weight: 100 }
    ], { calorieTolerance: 50, defaultEstimateWarning: warning });

    expect(products).toHaveLength(1);
    expect(products[0].warning).toBe(warning);
  });
});