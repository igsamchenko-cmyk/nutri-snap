import { validateAiNutritionResult } from './aiNutritionValidation';
import { roundNutritionValues, scaleNutritionPer100g } from './nutrition';

const DEFAULT_CONFIRMATION_WEIGHT = 200;
const DEFAULT_CONFIRMATION_CALORIE_TOLERANCE = 50;
const CONFIRMATION_DATA_QUALITIES = ['estimate', 'label_read', 'insufficient', 'database_match'];

function parseFiniteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parsePositiveFiniteNumber(value) {
  const number = parseFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}

export function createAiConfirmationDraft(result = {}, overrides = {}) {
  const source = { ...result, ...overrides };
  const confidence = parseFiniteNumber(source.confidence);

  const draft = {
    ...source,
    name: typeof source.name === 'string' ? source.name.trim() : '',
    calories: parseFiniteNumber(source.calories),
    protein: parseFiniteNumber(source.protein),
    fat: parseFiniteNumber(source.fat),
    carbs: parseFiniteNumber(source.carbs),
    weight: parseFiniteNumber(source.weight) ?? DEFAULT_CONFIRMATION_WEIGHT,
    dataQuality: source.dataQuality || 'estimate',
    needsManualNutrition: Boolean(source.needsManualNutrition)
  };

  if (confidence !== null) {
    draft.confidence = confidence;
  } else {
    delete draft.confidence;
  }

  return draft;
}

export function scaleAiConfirmationDraftByWeight(sourceResult, nextWeight) {
  const baselineWeight = parsePositiveFiniteNumber(sourceResult?.weight) ?? DEFAULT_CONFIRMATION_WEIGHT;
  const targetWeight = parseFiniteNumber(nextWeight);

  if (targetWeight === null || targetWeight < 0) return null;

  const baselineNutrition = roundNutritionValues({
    calories: parseFiniteNumber(sourceResult?.calories) ?? 0,
    protein: parseFiniteNumber(sourceResult?.protein) ?? 0,
    fat: parseFiniteNumber(sourceResult?.fat) ?? 0,
    carbs: parseFiniteNumber(sourceResult?.carbs) ?? 0
  });

  if (!baselineNutrition) return null;

  // Technical debt: AI photo results are currently portion totals, not canonical per-100g values.
  // For the confirmation card we derive a temporary per-100g baseline from the initial portion.
  const scaleTo100g = 100 / baselineWeight;
  const per100g = roundNutritionValues({
    calories: baselineNutrition.calories * scaleTo100g,
    protein: baselineNutrition.protein * scaleTo100g,
    fat: baselineNutrition.fat * scaleTo100g,
    carbs: baselineNutrition.carbs * scaleTo100g
  });

  if (!per100g) return null;

  const scaledNutrition = scaleNutritionPer100g(per100g, targetWeight);
  if (!scaledNutrition) return null;

  return {
    ...scaledNutrition,
    weight: targetWeight
  };
}

export function validateAiConfirmationDraft(draft, options = {}) {
  const normalizedDraft = createAiConfirmationDraft(draft);
  const errors = [];

  if (parsePositiveFiniteNumber(normalizedDraft.weight) === null) {
    errors.push('weight must be greater than 0');
  }

  const resultForValidation = {
    ...normalizedDraft,
    needsManualNutrition: false
  };

  const validation = validateAiNutritionResult(resultForValidation, {
    allowedDataQualities: CONFIRMATION_DATA_QUALITIES,
    calorieTolerance: options.calorieTolerance ?? DEFAULT_CONFIRMATION_CALORIE_TOLERANCE,
    defaultDataQuality: normalizedDraft.dataQuality || 'estimate'
  });

  return {
    isValid: errors.length === 0 && validation.isValid,
    result: {
      ...validation.result,
      weight: normalizedDraft.weight
    },
    errors: [...errors, ...validation.errors],
    warnings: validation.warnings
  };
}
