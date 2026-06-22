import { describe, expect, it } from 'vitest';
import {
  AI_DEFAULT_IMAGE_JPEG_QUALITY,
  AI_DEFAULT_IMAGE_MAX_SIDE,
  AI_FOOD_IMAGE_JPEG_QUALITY,
  AI_FOOD_IMAGE_MAX_SIDE
} from './imageUtils.js';

describe('imageUtils AI image config', () => {
  it('uses a smaller payload config for food-photo analysis than generic image OCR', () => {
    expect(AI_FOOD_IMAGE_MAX_SIDE).toBe(896);
    expect(AI_FOOD_IMAGE_JPEG_QUALITY).toBe(0.72);
    expect(AI_FOOD_IMAGE_MAX_SIDE).toBeLessThan(AI_DEFAULT_IMAGE_MAX_SIDE);
    expect(AI_FOOD_IMAGE_JPEG_QUALITY).toBeLessThan(AI_DEFAULT_IMAGE_JPEG_QUALITY);
  });
});