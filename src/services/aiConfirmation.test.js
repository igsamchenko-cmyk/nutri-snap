import { describe, it, expect } from 'vitest';
import {
  createAiConfirmationDraft,
  scaleAiConfirmationDraftByWeight,
  validateAiConfirmationDraft
} from './aiConfirmation';

const validDraft = {
  name: 'Chicken rice bowl',
  calories: 340,
  protein: 40,
  fat: 20,
  carbs: 0,
  weight: 200,
  confidence: 88,
  dataQuality: 'estimate',
  warning: 'Estimate from photo.'
};

describe('AI Confirmation Services', () => {
  it('should create a normalized confirmation draft from AI result values', () => {
    const draft = createAiConfirmationDraft({
      ...validDraft,
      name: '  Chicken rice bowl  ',
      calories: '340',
      protein: '40.04'
    });

    expect(draft).toMatchObject({
      name: 'Chicken rice bowl',
      calories: 340,
      protein: 40.04,
      weight: 200
    });
  });

  it('should scale nutrition proportionally when the confirmed weight changes', () => {
    const scaled = scaleAiConfirmationDraftByWeight(validDraft, 100);

    expect(scaled).toEqual({
      calories: 170,
      protein: 20,
      fat: 10,
      carbs: 0,
      weight: 100
    });
  });

  it('should validate a corrected draft before saving', () => {
    const validation = validateAiConfirmationDraft({
      ...validDraft,
      calories: '170',
      protein: '20',
      fat: '10',
      carbs: '0',
      weight: '100'
    });

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.result).toMatchObject({
      calories: 170,
      protein: 20,
      fat: 10,
      carbs: 0,
      weight: 100
    });
  });

  it('should reject invalid values before saving', () => {
    const validation = validateAiConfirmationDraft({
      ...validDraft,
      weight: 0,
      protein: -1
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('weight must be greater than 0');
    expect(validation.errors).toContain('protein must be greater than or equal to 0');
  });

  it('should reject calories that are not consistent with macros', () => {
    const validation = validateAiConfirmationDraft({
      ...validDraft,
      calories: 900
    }, { calorieTolerance: 20 });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('calories are inconsistent with macros');
  });

  it('should reject non-numeric nutrition values', () => {
    const validation = validateAiConfirmationDraft({
      ...validDraft,
      carbs: 'many'
    });

    expect(validation.isValid).toBe(false);
    expect(validation.errors).toContain('carbs is required');
  });
});
