/**
 * Shared Gemini client with retry, exponential backoff, and model fallback.
 */
export const SERVER_GEMINI_API_KEY = '__nutrisnap_server_gemini_key__';

export const GEMINI_MODEL_FALLBACK_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseQuotaScope(errorData) {
  const raw = JSON.stringify(errorData || {}).toLowerCase();
  if (raw.includes('perday') || raw.includes('per day') || raw.includes('daily')) {
    return 'daily';
  }
  return 'minute';
}

function buildQuotaError(errorData) {
  const scope = parseQuotaScope(errorData);
  if (scope === 'daily') {
    return new Error(
      'Вичерпано ДЕННИЙ безкоштовний ліміт Gemini для цієї моделі. ' +
      'Ліміт оновлюється опівночі за тихоокеанським часом (~10:00 за Києвом). ' +
      'Порада: оберіть модель gemini-2.5-flash або flash-lite у налаштуваннях — ' +
      'у них найбільший денний ліміт (1500 запитів), на відміну від Pro (50 запитів/день).'
    );
  }
  return new Error(
    'Перевищено хвилинний ліміт Gemini (free tier ≈ 10 запитів/хв). ' +
    'Додаток автоматично повторив запит, але ліміт ще діє. ' +
    'Зачекайте 30–60 секунд і спробуйте знову.'
  );
}

function buildApiError(response, errorData) {
  const msg = errorData?.error?.message || '';
  if (response.status === 403 || msg.toLowerCase().includes('api key')) {
    return new Error(
      'Невірний Gemini API-ключ або до нього обмежений доступ. ' +
      'Перевірте ключ у налаштуваннях (створити безкоштовний: aistudio.google.com/apikey).'
    );
  }
  if (response.status === 404) {
    return new Error(
      'Обрана модель Gemini не існує або застаріла. ' +
      'Оберіть gemini-2.5-flash у налаштуваннях.'
    );
  }
  if (response.status === 400) {
    return new Error(msg || 'Невірний запит до Gemini API. Перевірте модель або формат даних.');
  }
  return new Error(msg || `Помилка Gemini API (код: ${response.status})`);
}

async function requestOnce(modelName, payload, apiKey) {
  const useServerKey = apiKey === SERVER_GEMINI_API_KEY;
  const url = useServerKey
    ? `/api/gemini/${encodeURIComponent(modelName)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const headers = { 'Content-Type': 'application/json' };
  if (!useServerKey) {
    headers['x-goog-api-key'] = apiKey.trim();
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    return { ok: true, data: await response.json() };
  }

  const errorData = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, response, errorData };
}

export async function requestGeminiContent(modelName, payload, apiKey) {
  const chain = [modelName, ...GEMINI_MODEL_FALLBACK_CHAIN.filter(m => m !== modelName)];
  let lastError = null;

  for (const model of chain) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await requestOnce(model, payload, apiKey);

      if (result.ok) {
        return result.data;
      }

      const { status, errorData } = result;
      const retriable = status === 429 || status === 503;

      if (retriable && attempt < MAX_RETRIES) {
        const apiDelay = extractRetryDelayMs(errorData);
        const delay = apiDelay || BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
        await sleep(delay);
        continue;
      }

      if (status === 429) {
        lastError = buildQuotaError(errorData);
        break;
      }

      if (status === 404) {
        lastError = buildApiError(result.response, errorData);
        break;
      }

      throw buildApiError(result.response, errorData);
    }
  }

  throw lastError || new Error('Не вдалося виконати запит до Gemini API.');
}

function extractRetryDelayMs(errorData) {
  try {
    const retryInfo = (errorData?.error?.details || [])
      .find(d => (d['@type'] || '').includes('RetryInfo'));
    if (retryInfo?.retryDelay) {
      const seconds = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
      if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 20000);
    }
  } catch {
    // Ignore malformed API metadata.
  }
  return null;
}
