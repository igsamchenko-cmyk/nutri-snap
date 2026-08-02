export const GEMINI_FAST_FOOD_SCAN_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL = 'gemini-2.5-flash-lite';
export const GEMINI_ACCURATE_FOOD_SCAN_MODEL = 'gemini-3.5-flash';
export const GEMINI_STABLE_FLASH_MODEL = 'gemini-2.5-flash';

export const GEMINI_SUPPORTED_MODEL_IDS = [
  GEMINI_FAST_FOOD_SCAN_MODEL,
  GEMINI_ACCURATE_FOOD_SCAN_MODEL,
  GEMINI_STABLE_FLASH_MODEL,
  GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL,
  'gemini-2.5-pro'
];

function uniqueModels(models) {
  return [...new Set(models.filter(Boolean))];
}

export function isGeminiLiteModel(modelName = '') {
  return String(modelName).toLowerCase().includes('flash-lite');
}

export function normalizeGeminiModel(modelName, fallbackModel = GEMINI_STABLE_FLASH_MODEL) {
  const normalized = String(modelName || '').trim();
  return normalized || fallbackModel;
}

export function getFastFoodScanModel() {
  return GEMINI_FAST_FOOD_SCAN_MODEL;
}

export function getFastFoodScanFallbackModels(modelName = GEMINI_FAST_FOOD_SCAN_MODEL) {
  return uniqueModels([GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL])
    .filter(model => model !== modelName);
}

export function getAccurateFoodScanModel() {
  return GEMINI_ACCURATE_FOOD_SCAN_MODEL;
}

export function getAccurateFoodScanFallbackModels(modelName = GEMINI_ACCURATE_FOOD_SCAN_MODEL) {
  return uniqueModels([GEMINI_STABLE_FLASH_MODEL])
    .filter(model => model !== modelName);
}

export function getFoodScanModelStrategy(modelName) {
  const selectedModel = normalizeGeminiModel(modelName, GEMINI_ACCURATE_FOOD_SCAN_MODEL);

  if (selectedModel === GEMINI_FAST_FOOD_SCAN_MODEL) {
    return {
      mode: 'fast',
      model: selectedModel,
      fallbackModels: getFastFoodScanFallbackModels(selectedModel)
    };
  }

  if (selectedModel === GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL) {
    return {
      mode: 'fast',
      model: selectedModel,
      fallbackModels: []
    };
  }

  return {
    mode: 'accurate',
    model: selectedModel,
    fallbackModels: getAccurateFoodScanFallbackModels(selectedModel)
  };
}

export function getLabelOcrModelStrategy(modelName) {
  const selectedModel = normalizeGeminiModel(modelName, GEMINI_STABLE_FLASH_MODEL);
  const fallbackModels = isGeminiLiteModel(selectedModel)
    ? []
    : uniqueModels([GEMINI_STABLE_FLASH_MODEL]).filter(model => model !== selectedModel);

  return {
    model: selectedModel,
    fallbackModels
  };
}
