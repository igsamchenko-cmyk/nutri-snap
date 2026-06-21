import { describe, it, expect } from 'vitest';
import { backupHasCredentialFields, createUserBackup } from './backup';

describe('Backup Utilities', () => {
  it('should preserve the existing backup structure for restorable user data', () => {
    const backup = createUserBackup({
      meals: [{ id: 'meal-1', name: 'Soup' }],
      waterIntake: { '2026-06-19': 500 },
      weightLog: { '2026-06-19': 70 },
      profile: { targetCalories: 2000 },
      customFoods: [{ id: 'custom-1', name: 'Yogurt' }],
      customBarcodes: { '123': { name: 'Barcode product' } },
      learnedProducts: [{ name: 'Learned product' }],
      rememberedFoodPortions: { 'name:soup': 250 },
      scanMode: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'light'
    }, '2026-06-19T00:00:00.000Z');

    expect(backup).toEqual({
      version: '1.0.0',
      exportedAt: '2026-06-19T00:00:00.000Z',
      meals: [{ id: 'meal-1', name: 'Soup' }],
      waterIntake: { '2026-06-19': 500 },
      weight_log: { '2026-06-19': 70 },
      profile: { targetCalories: 2000 },
      customFoods: [{ id: 'custom-1', name: 'Yogurt' }],
      customBarcodes: { '123': { name: 'Barcode product' } },
      learnedProducts: [{ name: 'Learned product' }],
      rememberedFoodPortions: { 'name:soup': 250 },
      scanMode: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'light'
    });
  });

  it('should not include API keys or proxy URL in user backups', () => {
    const backup = createUserBackup({
      meals: [],
      waterIntake: {},
      weightLog: {},
      profile: { targetCalories: 2000 },
      customFoods: [],
      customBarcodes: {},
      learnedProducts: [],
      rememberedFoodPortions: {},
      apiKey: 'gemini-secret',
      openAiApiKey: 'openai-secret',
      openAiProxyUrl: 'https://proxy.example.com?token=secret',
      scanMode: 'openai',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'dark'
    }, '2026-06-19T00:00:00.000Z');

    expect(backup).not.toHaveProperty('apiKey');
    expect(backup).not.toHaveProperty('openAiApiKey');
    expect(backup).not.toHaveProperty('openAiProxyUrl');
    expect(JSON.stringify(backup)).not.toContain('secret');
    expect(backupHasCredentialFields(backup)).toBe(false);
  });

  it('should detect credential fields in legacy backups', () => {
    expect(backupHasCredentialFields({ apiKey: '' })).toBe(true);
    expect(backupHasCredentialFields({ openAiApiKey: 'sk-old' })).toBe(true);
    expect(backupHasCredentialFields({ openAiProxyUrl: 'https://proxy.example.com' })).toBe(true);
    expect(backupHasCredentialFields({ meals: [] })).toBe(false);
    expect(backupHasCredentialFields(null)).toBe(false);
  });
});
