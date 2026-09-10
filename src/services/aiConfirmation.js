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

function parseNutritionValues(source = {}) {
  const nutrition = {
    calories: parseFiniteNumber(source.calories),
    protein: parseFiniteNumber(source.protein),
    fat: parseFiniteNumber(source.fat),
    carbs: parseFiniteNumber(source.carbs)
  };

  if (Object.values(nutrition).some(value => value === null || value < 0)) return null;
  return nutrition;
}

function getNutritionValues(source = {}) {
  const nutrition = parseNutritionValues(source);
  return nutrition ? roundNutritionValues(nutrition) : null;
}

function getSourceNutritionBasis(source = {}) {
  if (source.nutritionBasis === '100g' || source.nutritionBasis === 'serving') {
    return source.nutritionBasis;
  }
  return source.dataQuality === 'label_read' ? '100g' : 'serving';
}

function getPer100gNutrition(source = {}, weight, sourceBasis) {
  const nutrition = getNutritionValues(source);
  if (!nutrition || !weight) return null;
  if (sourceBasis === '100g') return nutrition;

  return roundNutritionValues({
    calories: nutrition.calories * 100 / weight,
    protein: nutrition.protein * 100 / weight,
    fat: nutrition.fat * 100 / weight,
    carbs: nutrition.carbs * 100 / weight
  });
}

export function createAiConfirmationDraft(result = {}, overrides = {}) {
  const source = { ...result, ...overrides };
  const confidence = parseFiniteNumber(source.confidence);
  const weight = parseFiniteNumber(source.weight) ?? DEFAULT_CONFIRMATION_WEIGHT;
  const sourceNutritionBasis = getSourceNutritionBasis(source);
  const inputNutrition = parseNutritionValues(source);
  const per100g = getPer100gNutrition(source, parsePositiveFiniteNumber(weight), sourceNutritionBasis);
  const servingNutrition = sourceNutritionBasis === '100g' && per100g && weight > 0
    ? scaleNutritionPer100g(per100g, weight)
    : inputNutrition;

  const draft = {
    ...source,
    name: typeof source.name === 'string' ? source.name.trim() : '',
    calories: servingNutrition?.calories ?? parseFiniteNumber(source.calories),
    protein: servingNutrition?.protein ?? parseFiniteNumber(source.protein),
    fat: servingNutrition?.fat ?? parseFiniteNumber(source.fat),
    carbs: servingNutrition?.carbs ?? parseFiniteNumber(source.carbs),
    weight,
    nutritionBasis: 'serving',
    sourceNutritionBasis: source.sourceNutritionBasis || sourceNutritionBasis,
    per100g,
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

  const storedPer100g = getNutritionValues(sourceResult?.per100g);
  const per100g = storedPer100g || getPer100gNutrition(
    sourceResult,
    baselineWeight,
    getSourceNutritionBasis(sourceResult)
  );

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
