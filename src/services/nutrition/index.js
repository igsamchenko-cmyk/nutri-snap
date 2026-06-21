const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'];
const DEFAULT_CALORIE_TOLERANCE = 20;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeFiniteNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

function roundTo(value, decimals = 0) {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function calculateCaloriesFromMacros(protein, fat, carbs) {
  if (![protein, fat, carbs].every(isNonNegativeFiniteNumber)) {
    return null;
  }

  return protein * 4 + carbs * 4 + fat * 9;
}

export function validateNutritionValues(nutrition) {
  const errors = [];

  if (!nutrition || typeof nutrition !== 'object' || Array.isArray(nutrition)) {
    return {
      isValid: false,
      errors: ['nutrition must be an object']
    };
  }

  NUTRITION_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(nutrition, field)) {
      errors.push(`${field} is required`);
      return;
    }

    if (!isFiniteNumber(nutrition[field])) {
      errors.push(`${field} must be a finite number`);
      return;
    }

    if (nutrition[field] < 0) {
      errors.push(`${field} must be greater than or equal to 0`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function roundNutritionValues(nutrition) {
  const validation = validateNutritionValues(nutrition);
  if (!validation.isValid) return null;

  return {
    ...nutrition,
    calories: roundTo(nutrition.calories, 0),
    protein: roundTo(nutrition.protein, 1),
    fat: roundTo(nutrition.fat, 1),
    carbs: roundTo(nutrition.carbs, 1)
  };
}

export function scaleNutritionPer100g(per100g, grams) {
  const validation = validateNutritionValues(per100g);
  if (!validation.isValid || !isNonNegativeFiniteNumber(grams)) {
    return null;
  }

  const scale = grams / 100;

  return roundNutritionValues({
    calories: per100g.calories * scale,
    protein: per100g.protein * scale,
    fat: per100g.fat * scale,
    carbs: per100g.carbs * scale
  });
}

export function checkCaloriesConsistency(nutrition, options = {}) {
  const validation = validateNutritionValues(nutrition);
  const tolerance = isNonNegativeFiniteNumber(options.tolerance)
    ? options.tolerance
    : DEFAULT_CALORIE_TOLERANCE;

  if (!validation.isValid) {
    return {
      isConsistent: false,
      expectedCalories: null,
      difference: null,
      tolerance,
      errors: validation.errors
    };
  }

  const expectedCalories = calculateCaloriesFromMacros(
    nutrition.protein,
    nutrition.fat,
    nutrition.carbs
  );
  const difference = Math.abs(nutrition.calories - expectedCalories);

  return {
    isConsistent: difference <= tolerance,
    expectedCalories,
    difference,
    tolerance,
    errors: []
  };
}
