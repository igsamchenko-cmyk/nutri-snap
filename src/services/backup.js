const BACKUP_VERSION = '1.0.0';

const CREDENTIAL_FIELD_NAMES = new Set([
  'apiKey',
  'geminiApiKey',
  'geminiAPIKey',
  'openAiApiKey',
  'openAIApiKey',
  'openaiApiKey',
  'openAIKey',
  'openAiProxyUrl',
  'openaiProxyUrl',
  'authorization',
  'accessToken',
  'refreshToken',
  'secret',
  'clientSecret',
  'token'
]);

const MAX_BACKUP_TEXT_LENGTH = 20 * 1024 * 1024;
const RESTORABLE_FIELDS = new Set([
  'meals',
  'waterIntake',
  'water_intake',
  'weight_log',
  'weightLog',
  'profile',
  'customFoods',
  'favorites',
  'learnedProducts',
  'customBarcodes',
  'rememberedFoodPortions',
  'apiKey',
  'openAiApiKey',
  'openAiProxyUrl',
  'scanMode',
  'geminiModel',
  'openAiModel',
  'theme'
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(item => cloneJsonValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneJsonValue(nestedValue)])
    );
  }
  return value;
}

function sanitizeJsonValue(value) {
  if (Array.isArray(value)) return value.map(item => sanitizeJsonValue(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !CREDENTIAL_FIELD_NAMES.has(key))
        .map(([key, nestedValue]) => [key, sanitizeJsonValue(nestedValue)])
    );
  }
  return value;
}

function readDateParts(date = new Date()) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    };
  }

  const match = String(date || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  return readDateParts(new Date());
}

function getRestoreObject(payload, primaryKey, fallbackKey) {
  const value = hasOwn(payload, primaryKey) ? payload[primaryKey] : payload[fallbackKey];
  return isPlainObject(value) ? cloneJsonValue(value) : undefined;
}

function getRestoreArray(payload, key) {
  return Array.isArray(payload[key]) ? cloneJsonValue(payload[key]) : undefined;
}

function getRestoreScalar(payload, key) {
  return hasOwn(payload, key) ? cloneJsonValue(payload[key]) : undefined;
}

export function sanitizeBackupPayload(payload = {}) {
  return sanitizeJsonValue(payload);
}

export function backupHasCredentialFields(data) {
  if (!isPlainObject(data) && !Array.isArray(data)) return false;

  const stack = [data];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;

    for (const [key, value] of Object.entries(current)) {
      if (CREDENTIAL_FIELD_NAMES.has(key)) return true;
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  return false;
}

export function createBackupPayload(appState = {}, options = {}) {
  const exportedAt = typeof options === 'string'
    ? options
    : options.exportedAt || new Date().toISOString();

  const payload = {
    version: BACKUP_VERSION,
    exportedAt,
    meals: appState.meals,
    waterIntake: appState.waterIntake,
    weight_log: appState.weightLog,
    profile: appState.profile,
    customFoods: appState.customFoods,
    customBarcodes: appState.customBarcodes,
    learnedProducts: appState.learnedProducts,
    rememberedFoodPortions: appState.rememberedFoodPortions,
    scanMode: appState.scanMode,
    geminiModel: appState.geminiModel,
    openAiModel: appState.openAiModel,
    theme: appState.theme
  };

  if (appState.favorites !== undefined) {
    payload.favorites = appState.favorites;
  }

  return sanitizeBackupPayload(payload);
}

export function validateBackupPayload(payload) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(payload)) {
    return {
      isValid: false,
      errors: ['Backup payload must be a JSON object.'],
      warnings
    };
  }

  if (hasOwn(payload, 'version') && typeof payload.version !== 'string') {
    errors.push('Backup version must be a string.');
  }

  if (![...RESTORABLE_FIELDS].some(field => hasOwn(payload, field))) {
    errors.push('Backup does not contain any restorable NutriSnap data.');
  }

  for (const key of ['meals', 'customFoods', 'learnedProducts', 'favorites']) {
    if (!hasOwn(payload, key)) continue;
    if (!Array.isArray(payload[key])) {
      errors.push('Backup ' + key + ' field must be an array.');
    } else if (payload[key].some(item => !isPlainObject(item))) {
      errors.push('Backup ' + key + ' field contains an invalid item.');
    }
  }

  for (const key of ['waterIntake', 'water_intake', 'weight_log', 'weightLog', 'profile', 'customBarcodes', 'rememberedFoodPortions']) {
    if (hasOwn(payload, key) && !isPlainObject(payload[key])) {
      errors.push('Backup ' + key + ' field must be an object.');
    }
  }

  for (const key of ['apiKey', 'openAiApiKey', 'openAiProxyUrl', 'geminiModel', 'openAiModel']) {
    if (hasOwn(payload, key) && typeof payload[key] !== 'string') {
      errors.push('Backup ' + key + ' field must be a string.');
    }
  }

  if (hasOwn(payload, 'scanMode') && !['mock', 'gemini', 'openai'].includes(payload.scanMode)) {
    errors.push('Backup scanMode field is invalid.');
  }
  if (hasOwn(payload, 'theme') && !['dark', 'light'].includes(payload.theme)) {
    errors.push('Backup theme field is invalid.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function parseBackupFileContent(text = '') {
  const backupText = String(text || '');
  if (backupText.length > MAX_BACKUP_TEXT_LENGTH) {
    throw new Error('Backup file is too large.');
  }

  let payload;
  try {
    payload = JSON.parse(backupText);
  } catch {
    throw new Error('Invalid backup JSON.');
  }

  const validation = validateBackupPayload(payload);
  if (!validation.isValid) {
    throw new Error(validation.errors[0] || 'Invalid backup payload.');
  }

  return payload;
}

export function prepareRestoreData(payload = {}) {
  const validation = validateBackupPayload(payload);
  if (!validation.isValid) {
    throw new Error(validation.errors[0] || 'Invalid backup payload.');
  }

  return {
    meals: getRestoreArray(payload, 'meals'),
    waterIntake: getRestoreObject(payload, 'waterIntake', 'water_intake'),
    weightLog: getRestoreObject(payload, 'weight_log', 'weightLog'),
    profile: getRestoreObject(payload, 'profile'),
    customFoods: getRestoreArray(payload, 'customFoods'),
    favorites: getRestoreArray(payload, 'favorites'),
    learnedProducts: getRestoreArray(payload, 'learnedProducts'),
    customBarcodes: getRestoreObject(payload, 'customBarcodes'),
    rememberedFoodPortions: getRestoreObject(payload, 'rememberedFoodPortions'),
    apiKey: getRestoreScalar(payload, 'apiKey'),
    openAiApiKey: getRestoreScalar(payload, 'openAiApiKey'),
    openAiProxyUrl: getRestoreScalar(payload, 'openAiProxyUrl'),
    scanMode: getRestoreScalar(payload, 'scanMode'),
    geminiModel: getRestoreScalar(payload, 'geminiModel'),
    openAiModel: getRestoreScalar(payload, 'openAiModel'),
    theme: getRestoreScalar(payload, 'theme'),
    hasCredentialFields: backupHasCredentialFields(payload),
    validation
  };
}

export function createBackupFilename(date = new Date()) {
  const { year, month, day } = readDateParts(date);
  return `nutrisnap_backup_${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}.json`;
}
