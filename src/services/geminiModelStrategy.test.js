import { describe, expect, it } from 'vitest';
import {
  GEMINI_ACCURATE_FOOD_SCAN_MODEL,
  GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL,
  GEMINI_FAST_FOOD_SCAN_MODEL,
  GEMINI_STABLE_FLASH_MODEL,
  getAccurateFoodScanFallbackModels,
  getAccurateFoodScanModel,
  getFastFoodScanFallbackModels,
  getFastFoodScanModel,
  getFoodScanModelStrategy,
  getLabelOcrModelStrategy
} from './geminiModelStrategy.js';

describe('geminiModelStrategy', () => {
  it('selects Gemini 3.1 Flash-Lite for fast food scan mode', () => {
    expect(getFastFoodScanModel()).toBe(GEMINI_FAST_FOOD_SCAN_MODEL);
    expect(getFoodScanModelStrategy(GEMINI_FAST_FOOD_SCAN_MODEL)).toEqual({
      mode: 'fast',
      model: GEMINI_FAST_FOOD_SCAN_MODEL,
      fallbackModels: [GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL]
    });
  });

  it('uses Gemini 2.5 Flash-Lite as the fast fallback model', () => {
    expect(getFastFoodScanFallbackModels()).toEqual([GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL]);
    expect(getFoodScanModelStrategy(GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL)).toEqual({
      mode: 'fast',
      model: GEMINI_FAST_FOOD_SCAN_FALLBACK_MODEL,
      fallbackModels: []
    });
  });

  it('selects Gemini 3.5 Flash for accurate food scan mode with stable Flash fallback', () => {
    expect(getAccurateFoodScanModel()).toBe(GEMINI_ACCURATE_FOOD_SCAN_MODEL);
    expect(getAccurateFoodScanFallbackModels()).toEqual([GEMINI_STABLE_FLASH_MODEL]);
    expect(getFoodScanModelStrategy(GEMINI_ACCURATE_FOOD_SCAN_MODEL)).toEqual({
      mode: 'accurate',
      model: GEMINI_ACCURATE_FOOD_SCAN_MODEL,
      fallbackModels: [GEMINI_STABLE_FLASH_MODEL]
    });
  });

  it('does not automatically route label or OCR flow to Lite models', () => {
    expect(getLabelOcrModelStrategy(GEMINI_ACCURATE_FOOD_SCAN_MODEL)).toEqual({
      model: GEMINI_ACCURATE_FOOD_SCAN_MODEL,
      fallbackModels: [GEMINI_STABLE_FLASH_MODEL]
    });
    expect(getLabelOcrModelStrategy(GEMINI_STABLE_FLASH_MODEL)).toEqual({
      model: GEMINI_STABLE_FLASH_MODEL,
      fallbackModels: []
    });
  });
});
