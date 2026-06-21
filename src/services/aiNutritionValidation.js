import { checkCaloriesConsistency, roundNutritionValues } from './nutrition';

export const AI_DATA_QUALITY_VALUES = ['estimate', 'label_read', 'insufficient'];

const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'];
const DEFAULT_WARNING = 'Дані від ШІ неповні або потребують ручної перевірки. Перевірте КБЖВ перед додаванням.';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function validateAiNutritionResult(rawResult, options = {}) {
  const {
    allowedDataQualities = AI_DATA_QUALITY_VALUES,
    calorieTolerance = 25,
    confidenceMax = 100,
    confidenceMin = 0,
    defaultDataQuality = 'estimate',
    defaultEstimateWarning = 'КБЖВ з фото є приблизною оцінкою. Перевірте дані перед додаванням.',
    defaultWarning = DEFAULT_WARNING,
    preserveMissingDataQuality = false,
    preserveMissingNeedsManualNutrition = false,
    requireConfidence = false,
    requireNeedsManualNutrition = false
  } = options;

  const errors = [];
  const warnings = [];

  if (!isPlainObject(rawResult)) {
    return {
      isValid: false,
      result: {
        name: '',
        calories: null,
        protein: null,
        fat: null,
        carbs: null,
        dataQuality: 'insufficient',
        needsManualNutrition: true,
        warning: defaultWarning
      },
      errors: ['AI result must be an object'],
      warnings: []
    };
  }

  const result = { ...rawResult };
  const name = normalizeText(rawResult.name);
  if (!name) {
    errors.push('name is required');
  }
  result.name = name;

  const rawDataQuality = rawResult.dataQuality;
  const hasDataQuality = rawDataQuality !== undefined;
  if (hasDataQuality) {
    if (typeof rawDataQuality !== 'string' || !allowedDataQualities.includes(rawDataQuality)) {
      errors.push('dataQuality is invalid');
      result.dataQuality = 'insufficient';
    } else {
      result.dataQuality = rawDataQuality;
    }
  } else if (!preserveMissingDataQuality) {
    result.dataQuality = defaultDataQuality;
  }

  const hasNeedsManualNutrition = hasOwn(rawResult, 'needsManualNutrition');
  if (hasNeedsManualNutrition) {
    if (typeof rawResult.needsManualNutrition !== 'boolean') {
      errors.push('needsManualNutrition must be boolean');
      result.needsManualNutrition = true;
    } else {
      result.needsManualNutrition = rawResult.needsManualNutrition;
    }
  } else if (requireNeedsManualNutrition) {
    errors.push('needsManualNutrition is required');
    result.needsManualNutrition = true;
  } else if (!preserveMissingNeedsManualNutrition) {
    result.needsManualNutrition = false;
  }

  const initialManualState = result.needsManualNutrition === true || result.dataQuality === 'insufficient';
  const nutritionValues = {};
  const invalidNutritionFields = new Set();
  let hasCompleteNutrition = true;

  NUTRITION_FIELDS.forEach((field) => {
    if (!hasOwn(rawResult, field) || rawResult[field] === null || rawResult[field] === undefined) {
      hasCompleteNutrition = false;
      result[field] = null;
      if (!initialManualState) {
        errors.push(`${field} is required`);
      }
      return;
    }

    const value = rawResult[field];
    if (!isFiniteNumber(value)) {
      errors.push(`${field} must be a finite number`);
      invalidNutritionFields.add(field);
      result[field] = null;
      return;
    }

    if (value < 0) {
      errors.push(`${field} must be greater than or equal to 0`);
      invalidNutritionFields.add(field);
      result[field] = null;
      return;
    }

    nutritionValues[field] = value;
  });

  if (hasCompleteNutrition && invalidNutritionFields.size === 0) {
    const roundedNutrition = roundNutritionValues(nutritionValues);
    Object.assign(result, roundedNutrition);

    const consistency = checkCaloriesConsistency(roundedNutrition, { tolerance: calorieTolerance });
    if (!consistency.isConsistent) {
      errors.push('calories are inconsistent with macros');
      warnings.push(`Expected approximately ${Math.round(consistency.expectedCalories)} kcal from macros.`);
    }
  } else if (!initialManualState) {
    warnings.push('Nutrition values are incomplete and require manual review.');
  }

  if (requireConfidence && !hasOwn(rawResult, 'confidence')) {
    errors.push('confidence is required');
    result.confidence = 0;
  } else if (hasOwn(rawResult, 'confidence')) {
    if (!isFiniteNumber(rawResult.confidence)) {
      errors.push('confidence must be a finite number');
      result.confidence = 0;
    } else if (rawResult.confidence < confidenceMin || rawResult.confidence > confidenceMax) {
      errors.push(`confidence must be between ${confidenceMin} and ${confidenceMax}`);
      result.confidence = Math.min(Math.max(rawResult.confidence, confidenceMin), confidenceMax);
    } else {
      result.confidence = Math.round(rawResult.confidence);
    }
  }

  const shouldRequireManualReview = (
    errors.length > 0 ||
    !hasCompleteNutrition ||
    invalidNutritionFields.size > 0 ||
    result.dataQuality === 'insufficient' ||
    result.needsManualNutrition === true
  );

  if (shouldRequireManualReview) {
    result.needsManualNutrition = true;
    if (!preserveMissingDataQuality) {
      result.dataQuality = 'insufficient';
    }
    result.warning = normalizeText(rawResult.warning) || defaultWarning;
  } else {
    result.warning = normalizeText(rawResult.warning) || defaultEstimateWarning;
  }

  return {
    isValid: !shouldRequireManualReview,
    result,
    errors,
    warnings
  };
}

export function getValidatedAiNutritionResult(rawResult, options = {}) {
  const validation = validateAiNutritionResult(rawResult, options);

  if (!validation.result.name) {
    throw new Error('AI response is missing a product or dish name.');
  }

  return validation.result;
}

export function filterValidAiNutritionResults(results, options = {}) {
  if (!Array.isArray(results)) return [];

  return results
    .map((item) => validateAiNutritionResult(item, {
      preserveMissingDataQuality: true,
      preserveMissingNeedsManualNutrition: true,
      ...options
    }))
    .filter((validation) => validation.isValid && validation.result.name)
    .map((validation) => validation.result);
}