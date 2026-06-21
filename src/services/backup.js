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

  if (hasOwn(payload, 'meals') && !Array.isArray(payload.meals)) {
    warnings.push('Backup meals field is not an array and will be ignored.');
  }
  if (hasOwn(payload, 'customFoods') && !Array.isArray(payload.customFoods)) {
    warnings.push('Backup customFoods field is not an array and will be ignored.');
  }
  if (hasOwn(payload, 'learnedProducts') && !Array.isArray(payload.learnedProducts)) {
    warnings.push('Backup learnedProducts field is not an array and will be ignored.');
  }
  if (hasOwn(payload, 'favorites') && !Array.isArray(payload.favorites)) {
    warnings.push('Backup favorites field is not an array and will be ignored.');
  }
  if (hasOwn(payload, 'waterIntake') && !isPlainObject(payload.waterIntake)) {
    warnings.push('Backup waterIntake field is not an object and will be ignored.');
  }
  if (hasOwn(payload, 'weight_log') && !isPlainObject(payload.weight_log)) {
    warnings.push('Backup weight_log field is not an object and will be ignored.');
  }
  if (hasOwn(payload, 'weightLog') && !isPlainObject(payload.weightLog)) {
    warnings.push('Backup weightLog field is not an object and will be ignored.');
  }
  if (hasOwn(payload, 'profile') && !isPlainObject(payload.profile)) {
    warnings.push('Backup profile field is not an object and will be ignored.');
  }
  if (hasOwn(payload, 'customBarcodes') && !isPlainObject(payload.customBarcodes)) {
    warnings.push('Backup customBarcodes field is not an object and will be ignored.');
  }
  if (hasOwn(payload, 'rememberedFoodPortions') && !isPlainObject(payload.rememberedFoodPortions)) {
    warnings.push('Backup rememberedFoodPortions field is not an object and will be ignored.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

export function parseBackupFileContent(text = '') {
  let payload;
  try {
    payload = JSON.parse(String(text || ''));
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
