import { describe, expect, it } from 'vitest';
import { getBase64PayloadSizeKb, roundDurationMs } from './aiPerformance.js';

describe('aiPerformance utilities', () => {
  it('estimates raw base64 payload size in KB', () => {
    expect(getBase64PayloadSizeKb('A'.repeat(4096))).toBe(3);
  });

  it('handles data URLs and padding', () => {
    expect(getBase64PayloadSizeKb('data:image/jpeg;base64,QUJDRA==')).toBe(0);
  });

  it('returns 0 for invalid payload values', () => {
    expect(getBase64PayloadSizeKb()).toBe(0);
    expect(getBase64PayloadSizeKb(null)).toBe(0);
    expect(getBase64PayloadSizeKb({})).toBe(0);
  });

  it('rounds duration to one decimal place', () => {
    expect(roundDurationMs(12.34)).toBe(12.3);
    expect(roundDurationMs(12.36)).toBe(12.4);
    expect(roundDurationMs(Number.NaN)).toBe(0);
  });
});