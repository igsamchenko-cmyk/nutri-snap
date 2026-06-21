import { describe, it, expect } from 'vitest';
import {
  backupHasCredentialFields,
  createBackupFilename,
  createBackupPayload,
  parseBackupFileContent,
  prepareRestoreData,
  sanitizeBackupPayload,
  validateBackupPayload
} from './backup';

function createAppState(overrides = {}) {
  return {
    meals: [{ id: 'meal-1', name: 'Soup', calories: 120 }],
    waterIntake: { '2026-06-19': 500 },
    weightLog: { '2026-06-19': 70 },
    profile: { targetCalories: 2000, weight: 70 },
    customFoods: [{ id: 'custom-1', name: 'Yogurt' }],
    customBarcodes: { '123': { name: 'Barcode product' } },
    favorites: [{ id: 'favorite-1', name: 'Oats' }],
    learnedProducts: [{ name: 'Learned product' }],
    rememberedFoodPortions: { 'name:soup': 250 },
    scanMode: 'gemini',
    geminiModel: 'gemini-2.5-flash',
    openAiModel: 'gpt-4o-mini',
    theme: 'light',
    ...overrides
  };
}

describe('backup service', () => {
  it('creates a backup payload with the current restorable structure', () => {
    const backup = createBackupPayload(createAppState(), {
      exportedAt: '2026-06-19T00:00:00.000Z'
    });

    expect(backup).toEqual({
      version: '1.0.0',
      exportedAt: '2026-06-19T00:00:00.000Z',
      meals: [{ id: 'meal-1', name: 'Soup', calories: 120 }],
      waterIntake: { '2026-06-19': 500 },
      weight_log: { '2026-06-19': 70 },
      profile: { targetCalories: 2000, weight: 70 },
      customFoods: [{ id: 'custom-1', name: 'Yogurt' }],
      customBarcodes: { '123': { name: 'Barcode product' } },
      learnedProducts: [{ name: 'Learned product' }],
      rememberedFoodPortions: { 'name:soup': 250 },
      scanMode: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'light',
      favorites: [{ id: 'favorite-1', name: 'Oats' }]
    });
  });

  it('does not include API keys, proxy URLs, or nested secret fields in backups', () => {
    const backup = createBackupPayload(createAppState({
      apiKey: 'gemini-secret',
      openAiApiKey: 'openai-secret',
      openAiProxyUrl: 'https://proxy.example.com?token=secret',
      profile: {
        targetCalories: 2000,
        token: 'profile-secret'
      },
      customFoods: [{ name: 'Hidden key food', apiKey: 'nested-secret' }]
    }), {
      exportedAt: '2026-06-19T00:00:00.000Z'
    });

    const serialized = JSON.stringify(backup);
    expect(backup).not.toHaveProperty('apiKey');
    expect(backup).not.toHaveProperty('openAiApiKey');
    expect(backup).not.toHaveProperty('openAiProxyUrl');
    expect(backup.profile).not.toHaveProperty('token');
    expect(backup.customFoods[0]).not.toHaveProperty('apiKey');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('proxy.example.com');
    expect(backupHasCredentialFields(backup)).toBe(false);
  });

  it('sanitizes without mutating the input object', () => {
    const payload = {
      meals: [{ id: 'meal-1', name: 'Soup', apiKey: 'nested-secret' }],
      openAiApiKey: 'top-secret'
    };
    const original = JSON.parse(JSON.stringify(payload));

    const sanitized = sanitizeBackupPayload(payload);

    expect(sanitized).toEqual({
      meals: [{ id: 'meal-1', name: 'Soup' }]
    });
    expect(payload).toEqual(original);
  });

  it('prepares restore data from a modern backup without requiring API keys', () => {
    const backup = createBackupPayload(createAppState(), {
      exportedAt: '2026-06-19T00:00:00.000Z'
    });

    const restoreData = prepareRestoreData(backup);

    expect(restoreData).toMatchObject({
      meals: [{ id: 'meal-1', name: 'Soup', calories: 120 }],
      waterIntake: { '2026-06-19': 500 },
      weightLog: { '2026-06-19': 70 },
      profile: { targetCalories: 2000, weight: 70 },
      customFoods: [{ id: 'custom-1', name: 'Yogurt' }],
      customBarcodes: { '123': { name: 'Barcode product' } },
      favorites: [{ id: 'favorite-1', name: 'Oats' }],
      learnedProducts: [{ name: 'Learned product' }],
      rememberedFoodPortions: { 'name:soup': 250 },
      scanMode: 'gemini',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'light',
      hasCredentialFields: false
    });
    expect(restoreData.apiKey).toBeUndefined();
    expect(restoreData.openAiApiKey).toBeUndefined();
    expect(restoreData.openAiProxyUrl).toBeUndefined();
  });

  it('supports old backup shapes without version and with weightLog', () => {
    const oldBackup = {
      meals: [{ id: 'legacy-meal', name: 'Legacy meal' }],
      waterIntake: { '2026-06-18': 750 },
      weightLog: { '2026-06-18': 71 },
      profile: { targetCalories: 1900 },
      favorites: [{ id: 'legacy-fav', name: 'Favorite' }],
      customFoods: [{ id: 'legacy-food', name: 'Custom' }],
      customBarcodes: { '456': { name: 'Legacy barcode' } },
      rememberedFoodPortions: { 'name:legacy': 180 },
      apiKey: 'legacy-gemini-key',
      openAiApiKey: 'legacy-openai-key',
      openAiProxyUrl: 'https://legacy-proxy.example.com?token=old',
      scanMode: 'openai',
      geminiModel: 'gemini-2.5-flash',
      openAiModel: 'gpt-4o-mini',
      theme: 'dark'
    };

    const parsed = parseBackupFileContent(JSON.stringify(oldBackup));
    const restoreData = prepareRestoreData(parsed);

    expect(restoreData.meals).toEqual(oldBackup.meals);
    expect(restoreData.waterIntake).toEqual(oldBackup.waterIntake);
    expect(restoreData.weightLog).toEqual(oldBackup.weightLog);
    expect(restoreData.profile).toEqual(oldBackup.profile);
    expect(restoreData.favorites).toEqual(oldBackup.favorites);
    expect(restoreData.customFoods).toEqual(oldBackup.customFoods);
    expect(restoreData.customBarcodes).toEqual(oldBackup.customBarcodes);
    expect(restoreData.rememberedFoodPortions).toEqual(oldBackup.rememberedFoodPortions);
    expect(restoreData.apiKey).toBe('legacy-gemini-key');
    expect(restoreData.openAiApiKey).toBe('legacy-openai-key');
    expect(restoreData.openAiProxyUrl).toBe('https://legacy-proxy.example.com?token=old');
    expect(restoreData.hasCredentialFields).toBe(true);
  });

  it('throws a clear error for invalid JSON', () => {
    expect(() => parseBackupFileContent('{bad json')).toThrow('Invalid backup JSON.');
  });

  it('returns validation warnings for invalid optional fields without rejecting old partial backups', () => {
    const validation = validateBackupPayload({
      meals: {},
      favorites: {},
      profile: { targetCalories: 2000 }
    });

    expect(validation.isValid).toBe(true);
    expect(validation.warnings).toEqual(expect.arrayContaining([
      'Backup meals field is not an array and will be ignored.',
      'Backup favorites field is not an array and will be ignored.'
    ]));

    const restoreData = prepareRestoreData({ meals: {}, favorites: {}, profile: { targetCalories: 2000 } });
    expect(restoreData.meals).toBeUndefined();
    expect(restoreData.favorites).toBeUndefined();
    expect(restoreData.profile).toEqual({ targetCalories: 2000 });
  });

  it('creates predictable backup filenames', () => {
    expect(createBackupFilename('2026-06-19')).toBe('nutrisnap_backup_20260619.json');
    expect(createBackupFilename(new Date(2026, 5, 19))).toBe('nutrisnap_backup_20260619.json');
  });
});
