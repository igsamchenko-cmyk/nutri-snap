import { roundNutritionValues, scaleNutritionPer100g } from '../services/nutrition';

export const FOOD_SOURCES = [
  'manual',
  'ai_photo',
  'ai_estimate',
  'barcode_off',
  'local_db',
  'custom',
  'unknown'
];

const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'];
const NUMBER_EPSILON = 0.2;
const CALORIE_EPSILON = 2;
const DEFAULT_GRAMS = 100;

/**
 * @typedef {Object} NutritionValues
 * @property {number} calories
 * @property {number} protein
 * @property {number} fat
 * @property {number} carbs
 */

/**
 * FoodItem represents a product or dish normalized to per-100g nutrition.
 * Current legacy aliases (calories/protein/fat/carbs/weight) are included for compatibility.
 * @typedef {Object} FoodItem
 * @property {string} id
 * @property {string} name
 * @property {string} brand
 * @property {string} barcode
 * @property {'manual'|'ai_photo'|'ai_estimate'|'barcode_off'|'local_db'|'custom'|'unknown'} source
 * @property {string} dataQuality
 * @property {number|null} confidence
 * @property {NutritionValues|null} per100g
 * @property {number} defaultPortionGrams
 * @property {string} warning
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 */

/**
 * MealEntry represents one consumed serving. Top-level nutrition fields stay for legacy UI.
 * @typedef {Object} MealEntry
 * @property {string} id
 * @property {string} date
 * @property {string} category
 * @property {string} mealType
 * @property {string} name
 * @property {number} servingGrams
 * @property {NutritionValues} totals
 * @property {Object} foodSnapshot
 * @property {string} source
 * @property {number|null} confidence
 * @property {string} warning
 * @property {Object|null} original
 * @property {boolean} editedFromOriginal
 */

function parseFiniteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseNonNegativeNumber(value) {
  const number = parseFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function parsePositiveNumber(value, fallback = DEFAULT_GRAMS) {
  const number = parseFiniteNumber(value);
  return number !== null && number > 0 ? number : fallback;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function stableFoodId(input, source) {
  if (input?.id) return String(input.id);
  if (input?.barcode) return `food:${source}:barcode:${String(input.barcode).trim()}`;
  return `food:${source}:${slugify(input?.name)}`;
}

function stableMealId(input, foodItem, servingGrams, options) {
  if (options?.id) return String(options.id);
  if (input?.id) return String(input.id);
  return `meal:${foodItem?.id || 'unknown'}:${options?.date || input?.date || ''}:${servingGrams}`;
}

function normalizeSource(value, input = {}) {
  if (input.isCustom || input.isCustomBarcode) return 'custom';

  const normalized = normalizeText(value || input.source)
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

  if (FOOD_SOURCES.includes(normalized)) return normalized;
  if (['ai', 'ai_photo', 'ai_photo_local_match'].includes(normalized)) return 'ai_photo';
  if (['ai_search', 'ai_estimate'].includes(normalized)) return 'ai_estimate';
  if (['barcode', 'barcode_off', 'openfoodfacts', 'open_food_facts', 'off'].includes(normalized)) return 'barcode_off';
  if (['database', 'database_match', 'local', 'local_db', 'ua_core'].includes(normalized)) return 'local_db';
  if (['manual'].includes(normalized) || input.dataQuality === 'manual') return 'manual';
  if (['custom'].includes(normalized)) return 'custom';

  return 'unknown';
}

function normalizeNutrition(values) {
  const nutrition = {};

  for (const field of NUTRITION_FIELDS) {
    const value = parseNonNegativeNumber(values?.[field]);
    if (value === null) return null;
    nutrition[field] = value;
  }

  return roundNutritionValues(nutrition);
}

function normalizeNutritionWithDefaults(values = {}, fallback = {}) {
  const nutrition = {};

  for (const field of NUTRITION_FIELDS) {
    const value = parseNonNegativeNumber(values?.[field]);
    const fallbackValue = parseNonNegativeNumber(fallback?.[field]);
    nutrition[field] = value ?? fallbackValue ?? 0;
  }

  return roundNutritionValues(nutrition);
}

function nutritionFromLegacy(input) {
  const directNutrition = normalizeNutrition(input);
  if (!directNutrition) return null;

  const grams = parsePositiveNumber(input?.weight ?? input?.defaultPortionGrams ?? input?.servingGrams, DEFAULT_GRAMS);
  const scaleTo100g = DEFAULT_GRAMS / grams;

  return roundNutritionValues({
    calories: directNutrition.calories * scaleTo100g,
    protein: directNutrition.protein * scaleTo100g,
    fat: directNutrition.fat * scaleTo100g,
    carbs: directNutrition.carbs * scaleTo100g
  });
}

function resolvePer100g(input = {}) {
  if (input.per100g) {
    const nutrition = normalizeNutrition(input.per100g);
    if (nutrition) return nutrition;
  }

  if (input.foodSnapshot?.per100g) {
    const nutrition = normalizeNutrition(input.foodSnapshot.per100g);
    if (nutrition) return nutrition;
  }

  if (input.totals) {
    const totals = normalizeNutrition(input.totals);
    const servingGrams = parsePositiveNumber(input.servingGrams ?? input.weight, DEFAULT_GRAMS);
    if (totals) {
      return roundNutritionValues({
        calories: totals.calories * (DEFAULT_GRAMS / servingGrams),
        protein: totals.protein * (DEFAULT_GRAMS / servingGrams),
        fat: totals.fat * (DEFAULT_GRAMS / servingGrams),
        carbs: totals.carbs * (DEFAULT_GRAMS / servingGrams)
      });
    }
  }

  return nutritionFromLegacy(input);
}

function createFoodSnapshot(foodItem) {
  return {
    id: foodItem.id,
    name: foodItem.name,
    brand: foodItem.brand,
    barcode: foodItem.barcode,
    source: foodItem.source,
    dataQuality: foodItem.dataQuality,
    per100g: foodItem.per100g ? { ...foodItem.per100g } : null
  };
}

function normalizeOriginal(input) {
  if (!input) return null;

  const original = {
    calories: parseNonNegativeNumber(input.calories ?? input.originalCalories),
    protein: parseNonNegativeNumber(input.protein ?? input.originalProtein),
    fat: parseNonNegativeNumber(input.fat ?? input.originalFat),
    carbs: parseNonNegativeNumber(input.carbs ?? input.originalCarbs),
    weight: parsePositiveNumber(input.weight ?? input.originalWeight, DEFAULT_GRAMS)
  };

  if (NUTRITION_FIELDS.some(field => original[field] === null)) return null;
  return original;
}

function nutritionFromServingValues(values, grams) {
  const nutrition = normalizeNutrition(values);
  if (!nutrition) return null;

  const servingGrams = parsePositiveNumber(grams, DEFAULT_GRAMS);
  return roundNutritionValues({
    calories: nutrition.calories * (DEFAULT_GRAMS / servingGrams),
    protein: nutrition.protein * (DEFAULT_GRAMS / servingGrams),
    fat: nutrition.fat * (DEFAULT_GRAMS / servingGrams),
    carbs: nutrition.carbs * (DEFAULT_GRAMS / servingGrams)
  });
}

function applyServingTotals(meal, totals, grams) {
  if (!totals) return meal;

  return {
    ...meal,
    servingGrams: grams,
    totals: { ...totals },
    editedFromOriginal: hasEditedTotals({ ...totals, weight: grams }, meal.original),
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: grams
  };
}

function cloneFoodSnapshot(snapshot) {
  if (!snapshot) return null;

  return {
    ...snapshot,
    per100g: snapshot.per100g ? { ...snapshot.per100g } : null
  };
}

function cloneOriginalValues(original) {
  const normalized = normalizeOriginal(original);
  return normalized ? { ...normalized } : null;
}

function resolveCopiedMealId(overrides = {}, sourceId = '') {
  if (overrides.id) return String(overrides.id);
  if (typeof overrides.createId === 'function') return String(overrides.createId());

  const datePart = normalizeText(overrides.date || overrides.targetDate || 'undated');
  return 'meal-copy:' + (sourceId || 'unknown') + ':' + datePart;
}

function hasEditedTotals(totals, original) {
  if (!original) return false;

  return (
    Math.abs(totals.calories - original.calories) > CALORIE_EPSILON ||
    Math.abs(totals.protein - original.protein) > NUMBER_EPSILON ||
    Math.abs(totals.fat - original.fat) > NUMBER_EPSILON ||
    Math.abs(totals.carbs - original.carbs) > NUMBER_EPSILON ||
    Math.abs((totals.weight ?? 0) - original.weight) > NUMBER_EPSILON
  );
}

export function normalizeFoodItem(input = {}) {
  const source = normalizeSource(input.source, input);
  const per100g = resolvePer100g(input);
  const defaultPortionGrams = parsePositiveNumber(
    input.defaultPortionGrams ?? input.weight ?? input.servingGrams,
    DEFAULT_GRAMS
  );

  return {
    ...input,
    id: stableFoodId(input, source),
    name: normalizeText(input.name || input.foodSnapshot?.name),
    brand: normalizeText(input.brand || input.foodSnapshot?.brand),
    barcode: normalizeText(input.barcode || input.foodSnapshot?.barcode),
    source,
    dataQuality: input.dataQuality || input.foodSnapshot?.dataQuality || 'unknown',
    confidence: parseFiniteNumber(input.confidence),
    per100g,
    defaultPortionGrams,
    warning: normalizeText(input.warning),
    createdAt: input.createdAt || input.savedAt || null,
    updatedAt: input.updatedAt || null,
    calories: per100g?.calories ?? null,
    protein: per100g?.protein ?? null,
    fat: per100g?.fat ?? null,
    carbs: per100g?.carbs ?? null,
    weight: DEFAULT_GRAMS
  };
}

export function createFoodItem(input = {}) {
  return normalizeFoodItem(input);
}

export function createMealEntryFromFoodItem(foodItemInput, servingGrams = DEFAULT_GRAMS, options = {}) {
  const foodItem = normalizeFoodItem(foodItemInput);
  const grams = parsePositiveNumber(servingGrams, DEFAULT_GRAMS);
  const totals = foodItem.per100g
    ? scaleNutritionPer100g(foodItem.per100g, grams)
    : normalizeNutrition(options.totals) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
  const original = normalizeOriginal(options.original);
  const totalsWithWeight = { ...totals, weight: grams };
  const source = normalizeSource(options.source || foodItem.source, foodItem);
  const category = options.category || options.mealType || '';

  return {
    id: stableMealId(options, foodItem, grams, options),
    date: options.date || '',
    createdAt: options.createdAt || null,
    time: options.time || null,
    category,
    mealType: options.mealType || category,
    name: options.name || foodItem.name,
    servingGrams: grams,
    totals: { ...totals },
    foodSnapshot: createFoodSnapshot(foodItem),
    source,
    confidence: parseFiniteNumber(options.confidence ?? foodItem.confidence),
    warning: normalizeText(options.warning || foodItem.warning),
    original,
    editedFromOriginal: hasEditedTotals(totalsWithWeight, original),
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: grams,
    originalCalories: original?.calories ?? totals.calories,
    originalProtein: original?.protein ?? totals.protein,
    originalFat: original?.fat ?? totals.fat,
    originalCarbs: original?.carbs ?? totals.carbs,
    originalWeight: original?.weight ?? grams,
    icon: options.icon || foodItem.icon || ''
  };
}

export function createManualMealEntry(input = {}, servingGrams = DEFAULT_GRAMS, options = {}) {
  const grams = parsePositiveNumber(servingGrams ?? input.servingGrams ?? input.weight, DEFAULT_GRAMS);
  const explicitServingNutrition = normalizeNutrition(options.totals);
  const inferredServingNutrition = normalizeNutrition(input);
  const servingNutrition = explicitServingNutrition || inferredServingNutrition;
  const inputPer100g = normalizeNutrition(input.per100g);
  const per100g = inputPer100g || nutritionFromServingValues(servingNutrition, grams);
  const source = options.source || input.source || 'manual';
  const dataQuality = options.dataQuality || input.dataQuality || 'manual';
  const foodItem = createFoodItem({
    ...input,
    source,
    dataQuality,
    per100g,
    defaultPortionGrams: grams
  });
  const meal = createMealEntryFromFoodItem(foodItem, grams, {
    ...options,
    source: options.source || foodItem.source,
    original: options.original || (servingNutrition ? { ...servingNutrition, weight: grams } : undefined),
    totals: servingNutrition || options.totals
  });

  return explicitServingNutrition || !inputPer100g
    ? applyServingTotals(meal, servingNutrition, grams)
    : meal;
}

export function createBarcodeMealEntry(input = {}, servingGrams = DEFAULT_GRAMS, options = {}) {
  const grams = parsePositiveNumber(servingGrams ?? input.servingGrams ?? input.weight, DEFAULT_GRAMS);
  const servingNutrition = normalizeNutrition(options.totals);
  const directPer100g = normalizeNutrition(input.per100g) || normalizeNutrition(input);
  const per100g = directPer100g || nutritionFromServingValues(servingNutrition, grams);
  const source = options.source || input.source || 'barcode_off';
  const dataQuality = options.dataQuality || input.dataQuality || 'database';
  const originalNutrition = directPer100g || servingNutrition;
  const originalWeight = directPer100g ? DEFAULT_GRAMS : grams;
  const foodItem = createFoodItem({
    ...input,
    source,
    dataQuality,
    per100g,
    defaultPortionGrams: grams,
    weight: DEFAULT_GRAMS
  });
  const meal = createMealEntryFromFoodItem(foodItem, grams, {
    ...options,
    source: options.source || foodItem.source,
    original: options.original || (originalNutrition ? { ...originalNutrition, weight: originalWeight } : undefined),
    totals: servingNutrition || options.totals
  });

  return servingNutrition ? applyServingTotals(meal, servingNutrition, grams) : meal;
}

export function createMealEntryFromExistingMeal(meal = {}, overrides = {}) {
  const normalized = normalizeMealEntry(meal);
  const totals = getMealTotals(normalized);
  const servingGrams = parsePositiveNumber(
    overrides.servingGrams ?? overrides.weight ?? normalized.servingGrams ?? normalized.weight,
    DEFAULT_GRAMS
  );
  const original = cloneOriginalValues(normalized.original);
  const category = overrides.category ?? normalized.category ?? normalized.mealType ?? '';
  const mealType = overrides.mealType ?? category;
  const source = normalizeSource(overrides.source || normalized.source, normalized);

  const copiedMeal = {
    ...normalized,
    id: resolveCopiedMealId(overrides, normalized.id),
    date: overrides.date ?? overrides.targetDate ?? normalized.date ?? '',
    time: overrides.time ?? normalized.time ?? null,
    createdAt: overrides.createdAt ?? normalized.createdAt ?? null,
    category,
    mealType,
    servingGrams,
    totals: { ...totals },
    foodSnapshot: cloneFoodSnapshot(normalized.foodSnapshot),
    source,
    confidence: parseFiniteNumber(overrides.confidence ?? normalized.confidence),
    warning: normalizeText(overrides.warning ?? normalized.warning),
    original,
    editedFromOriginal: Boolean(normalized.editedFromOriginal),
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: servingGrams,
    originalCalories: original?.calories ?? normalized.originalCalories ?? totals.calories,
    originalProtein: original?.protein ?? normalized.originalProtein ?? totals.protein,
    originalFat: original?.fat ?? normalized.originalFat ?? totals.fat,
    originalCarbs: original?.carbs ?? normalized.originalCarbs ?? totals.carbs,
    originalWeight: original?.weight ?? normalized.originalWeight ?? servingGrams,
    icon: overrides.icon ?? normalized.icon ?? ''
  };

  for (const key of ['copiedFrom', 'copiedAt', 'repeatedFrom', 'repeatedAt']) {
    if (overrides[key] !== undefined) copiedMeal[key] = overrides[key];
  }

  return copiedMeal;
}

export function cloneMealEntryForDate(meal = {}, targetDate = '', options = {}) {
  return createMealEntryFromExistingMeal(meal, {
    ...options,
    date: targetDate
  });
}

export function copyMealEntriesForDate(meals = [], targetDate = '', options = {}) {
  if (!Array.isArray(meals)) return [];

  const { ids, createId, ...copyOptions } = options;

  return meals.filter(Boolean).map((meal, index) => cloneMealEntryForDate(meal, targetDate, {
    ...copyOptions,
    id: Array.isArray(ids) ? ids[index] : undefined,
    createId: Array.isArray(ids) ? undefined : createId,
    copiedFrom: copyOptions.copiedFrom ?? meal.id,
    copiedAt: copyOptions.copiedAt
  }));
}

export function normalizeFavoriteFood(favorite = {}) {
  const servingGrams = parsePositiveNumber(
    favorite.servingGrams ?? favorite.defaultPortionGrams ?? favorite.weight,
    DEFAULT_GRAMS
  );
  const per100gFromInput = normalizeNutrition(favorite.per100g) || normalizeNutrition(favorite.foodSnapshot?.per100g);
  const totalsFromPer100g = per100gFromInput ? scaleNutritionPer100g(per100gFromInput, servingGrams) : null;
  const totals = normalizeNutrition(favorite.totals)
    || normalizeNutrition(favorite)
    || normalizeNutritionWithDefaults(totalsFromPer100g);
  const source = normalizeSource(
    favorite.source || favorite.foodSnapshot?.source || (favorite.isCustom || favorite.isCustomBarcode ? 'custom' : 'manual'),
    favorite
  );
  const dataQuality = favorite.dataQuality
    || favorite.foodSnapshot?.dataQuality
    || (source === 'manual' ? 'manual' : 'unknown');
  const per100g = per100gFromInput || nutritionFromServingValues(totals, servingGrams);
  const foodItem = createFoodItem({
    ...favorite,
    source,
    dataQuality,
    per100g,
    defaultPortionGrams: servingGrams
  });
  const snapshotBase = favorite.foodSnapshot ? cloneFoodSnapshot(favorite.foodSnapshot) : createFoodSnapshot(foodItem);
  const foodSnapshot = {
    ...createFoodSnapshot(foodItem),
    ...snapshotBase,
    source,
    dataQuality,
    per100g: snapshotBase?.per100g || (per100g ? { ...per100g } : null)
  };

  return {
    ...favorite,
    id: favorite.id || stableFoodId(favorite, source),
    name: foodItem.name,
    brand: foodItem.brand,
    barcode: foodItem.barcode,
    source,
    dataQuality,
    confidence: parseFiniteNumber(favorite.confidence),
    warning: normalizeText(favorite.warning),
    per100g: per100g ? { ...per100g } : null,
    defaultPortionGrams: servingGrams,
    servingGrams,
    totals: { ...totals },
    foodSnapshot,
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: servingGrams,
    image: favorite.image || '',
    createdAt: favorite.createdAt || favorite.savedAt || null,
    updatedAt: favorite.updatedAt || null
  };
}

export function normalizeFavoriteFoods(favorites = []) {
  if (!Array.isArray(favorites)) return [];
  return favorites.filter(Boolean).map(normalizeFavoriteFood);
}

export function createFavoriteFromFoodItem(foodItemInput = {}, options = {}) {
  const foodItem = createFoodItem(foodItemInput);
  const servingGrams = parsePositiveNumber(
    options.servingGrams ?? options.weight ?? foodItem.defaultPortionGrams,
    DEFAULT_GRAMS
  );
  const totals = normalizeNutrition(options.totals)
    || (foodItem.per100g ? scaleNutritionPer100g(foodItem.per100g, servingGrams) : null)
    || normalizeNutritionWithDefaults(foodItem);

  return normalizeFavoriteFood({
    ...options,
    name: options.name || foodItem.name,
    brand: options.brand ?? foodItem.brand,
    barcode: options.barcode ?? foodItem.barcode,
    source: options.source || foodItem.source,
    dataQuality: options.dataQuality || foodItem.dataQuality,
    confidence: options.confidence ?? foodItem.confidence,
    warning: options.warning || foodItem.warning,
    per100g: foodItem.per100g,
    foodSnapshot: createFoodSnapshot(foodItem),
    totals,
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: servingGrams,
    servingGrams,
    image: options.image || foodItemInput.image || ''
  });
}

export function createFavoriteFromMealEntry(mealEntry = {}, options = {}) {
  const meal = normalizeMealEntry(mealEntry);
  const servingGrams = parsePositiveNumber(
    options.servingGrams ?? options.weight ?? meal.servingGrams ?? meal.weight,
    DEFAULT_GRAMS
  );
  const totals = normalizeNutrition(options.totals) || getMealTotals(meal);

  return normalizeFavoriteFood({
    ...meal,
    ...options,
    id: options.id,
    name: options.name || meal.name,
    source: options.source || meal.source,
    confidence: options.confidence ?? meal.confidence,
    warning: options.warning ?? meal.warning,
    foodSnapshot: meal.foodSnapshot ? cloneFoodSnapshot(meal.foodSnapshot) : null,
    totals,
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: servingGrams,
    servingGrams,
    image: options.image ?? meal.image ?? ''
  });
}

export function createMealEntryFromFavorite(favorite = {}, options = {}) {
  const normalizedFavorite = normalizeFavoriteFood(favorite);
  const servingGrams = parsePositiveNumber(
    options.servingGrams ?? options.weight ?? normalizedFavorite.servingGrams ?? normalizedFavorite.weight,
    DEFAULT_GRAMS
  );
  const totals = normalizeNutrition(options.totals) || normalizeNutrition(normalizedFavorite.totals) || normalizeNutritionWithDefaults(normalizedFavorite);
  const source = options.source || normalizedFavorite.source || 'manual';
  const dataQuality = options.dataQuality || normalizedFavorite.dataQuality || (source === 'manual' ? 'manual' : 'unknown');
  const per100g = normalizeNutrition(normalizedFavorite.per100g)
    || normalizeNutrition(normalizedFavorite.foodSnapshot?.per100g)
    || nutritionFromServingValues(totals, servingGrams);
  const meal = createManualMealEntry({
    ...normalizedFavorite,
    source,
    dataQuality,
    per100g,
    defaultPortionGrams: servingGrams
  }, servingGrams, {
    ...options,
    source,
    totals,
    original: options.original || (totals ? { ...totals, weight: servingGrams } : undefined)
  });

  return {
    ...meal,
    image: normalizedFavorite.image || meal.image || ''
  };
}

export function normalizeCustomFood(customFood = {}) {
  const legacyWeight = parsePositiveNumber(customFood.weight ?? customFood.defaultPortionGrams ?? customFood.servingGrams, DEFAULT_GRAMS);
  const directNutrition = normalizeNutrition(customFood) || normalizeNutritionWithDefaults(customFood);
  const per100g = normalizeNutrition(customFood.per100g)
    || normalizeNutrition(customFood.foodSnapshot?.per100g)
    || nutritionFromServingValues(directNutrition, legacyWeight);
  const source = normalizeSource(customFood.source || 'custom', { ...customFood, isCustom: true });
  const dataQuality = customFood.dataQuality || 'manual';
  const defaultPortionGrams = parsePositiveNumber(customFood.defaultPortionGrams ?? customFood.servingGrams ?? legacyWeight, legacyWeight);
  const foodItem = createFoodItem({
    ...customFood,
    source,
    dataQuality,
    per100g,
    defaultPortionGrams,
    weight: DEFAULT_GRAMS
  });
  const foodSnapshot = customFood.foodSnapshot
    ? { ...createFoodSnapshot(foodItem), ...cloneFoodSnapshot(customFood.foodSnapshot), source, dataQuality, per100g: customFood.foodSnapshot.per100g ? { ...customFood.foodSnapshot.per100g } : { ...per100g } }
    : createFoodSnapshot(foodItem);

  return {
    ...customFood,
    id: customFood.id || stableFoodId(customFood, source),
    name: foodItem.name,
    brand: customFood.brand ?? foodItem.brand,
    barcode: foodItem.barcode,
    source,
    dataQuality,
    confidence: parseFiniteNumber(customFood.confidence),
    warning: normalizeText(customFood.warning),
    per100g: per100g ? { ...per100g } : null,
    defaultPortionGrams,
    foodSnapshot,
    calories: directNutrition.calories,
    protein: directNutrition.protein,
    fat: directNutrition.fat,
    carbs: directNutrition.carbs,
    weight: legacyWeight,
    createdAt: customFood.createdAt || customFood.savedAt || null,
    updatedAt: customFood.updatedAt || null
  };
}

export function normalizeCustomFoods(customFoods = []) {
  if (!Array.isArray(customFoods)) return [];
  return customFoods.filter(Boolean).map(normalizeCustomFood);
}

export function createCustomFoodItem(input = {}) {
  const servingGrams = parsePositiveNumber(input.servingGrams ?? input.defaultPortionGrams ?? input.weight, DEFAULT_GRAMS);
  const servingNutrition = normalizeNutrition(input.totals) || normalizeNutrition(input) || normalizeNutritionWithDefaults(input);
  const per100g = normalizeNutrition(input.per100g) || nutritionFromServingValues(servingNutrition, servingGrams);
  const source = input.source || 'custom';

  return normalizeCustomFood({
    ...input,
    source,
    dataQuality: input.dataQuality || 'manual',
    per100g,
    defaultPortionGrams: servingGrams,
    calories: per100g?.calories ?? 0,
    protein: per100g?.protein ?? 0,
    fat: per100g?.fat ?? 0,
    carbs: per100g?.carbs ?? 0,
    weight: DEFAULT_GRAMS
  });
}

export function createFoodItemFromCustomFood(customFood = {}) {
  const normalizedCustomFood = normalizeCustomFood(customFood);
  return createFoodItem({
    ...normalizedCustomFood,
    source: normalizedCustomFood.source || 'custom',
    dataQuality: normalizedCustomFood.dataQuality || 'manual',
    per100g: normalizedCustomFood.per100g,
    defaultPortionGrams: normalizedCustomFood.defaultPortionGrams
  });
}

export function createMealEntryFromCustomFood(customFood = {}, servingGrams = DEFAULT_GRAMS, options = {}) {
  const normalizedCustomFood = normalizeCustomFood(customFood);
  const grams = parsePositiveNumber(servingGrams ?? normalizedCustomFood.defaultPortionGrams ?? normalizedCustomFood.weight, DEFAULT_GRAMS);
  const foodItem = createFoodItemFromCustomFood(normalizedCustomFood);
  const explicitTotals = normalizeNutrition(options.totals);
  const meal = createMealEntryFromFoodItem(foodItem, grams, {
    ...options,
    source: options.source || normalizedCustomFood.source || 'custom',
    confidence: options.confidence ?? normalizedCustomFood.confidence,
    warning: options.warning ?? normalizedCustomFood.warning,
    original: options.original || (normalizedCustomFood.per100g ? { ...normalizedCustomFood.per100g, weight: DEFAULT_GRAMS } : undefined)
  });

  return explicitTotals ? applyServingTotals(meal, explicitTotals, grams) : meal;
}

export function createMealEntryFromLegacyMeal(legacyMeal = {}) {
  const servingGrams = parsePositiveNumber(legacyMeal.servingGrams ?? legacyMeal.weight, DEFAULT_GRAMS);
  const totals = getMealTotals(legacyMeal);
  const source = normalizeSource(legacyMeal.source, legacyMeal);
  const foodItem = normalizeFoodItem({
    ...legacyMeal,
    source,
    weight: servingGrams,
    per100g: legacyMeal.foodSnapshot?.per100g
  });
  const original = normalizeOriginal({
    calories: legacyMeal.originalCalories,
    protein: legacyMeal.originalProtein,
    fat: legacyMeal.originalFat,
    carbs: legacyMeal.originalCarbs,
    weight: legacyMeal.originalWeight
  });

  return {
    ...legacyMeal,
    id: legacyMeal.id || stableMealId(legacyMeal, foodItem, servingGrams, legacyMeal),
    date: legacyMeal.date || '',
    createdAt: legacyMeal.createdAt || null,
    time: legacyMeal.time || null,
    category: legacyMeal.category || legacyMeal.mealType || '',
    mealType: legacyMeal.mealType || legacyMeal.category || '',
    name: normalizeText(legacyMeal.name),
    servingGrams,
    totals,
    foodSnapshot: legacyMeal.foodSnapshot || createFoodSnapshot(foodItem),
    source,
    confidence: parseFiniteNumber(legacyMeal.confidence),
    warning: normalizeText(legacyMeal.warning),
    original,
    editedFromOriginal: Boolean(legacyMeal.editedFromOriginal) || hasEditedTotals({ ...totals, weight: servingGrams }, original),
    calories: totals.calories,
    protein: totals.protein,
    fat: totals.fat,
    carbs: totals.carbs,
    weight: servingGrams,
    originalCalories: original?.calories ?? legacyMeal.originalCalories ?? totals.calories,
    originalProtein: original?.protein ?? legacyMeal.originalProtein ?? totals.protein,
    originalFat: original?.fat ?? legacyMeal.originalFat ?? totals.fat,
    originalCarbs: original?.carbs ?? legacyMeal.originalCarbs ?? totals.carbs,
    originalWeight: original?.weight ?? legacyMeal.originalWeight ?? servingGrams
  };
}

export function normalizeMealEntry(input = {}) {
  return createMealEntryFromLegacyMeal(input);
}

export function normalizeMealEntries(meals = []) {
  if (!Array.isArray(meals)) return [];
  return meals.filter(Boolean).map(normalizeMealEntry);
}

export function getMealTotals(mealEntry = {}) {
  const totals = normalizeNutrition(mealEntry.totals);
  if (totals) return totals;

  const legacyTotals = normalizeNutrition(mealEntry);
  if (legacyTotals) return legacyTotals;

  return { calories: 0, protein: 0, fat: 0, carbs: 0 };
}

export function sumMealTotals(meals = []) {
  const totals = meals.reduce((acc, meal) => {
    const mealTotals = getMealTotals(meal);
    return {
      calories: acc.calories + mealTotals.calories,
      protein: acc.protein + mealTotals.protein,
      fat: acc.fat + mealTotals.fat,
      carbs: acc.carbs + mealTotals.carbs
    };
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });

  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10
  };
}
