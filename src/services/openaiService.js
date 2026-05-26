const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const FOOD_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    calories: { type: ['number', 'null'] },
    protein: { type: ['number', 'null'] },
    fat: { type: ['number', 'null'] },
    carbs: { type: ['number', 'null'] },
    weight: { type: 'number' },
    confidence: { type: 'number' },
    ingredients: { type: 'string' },
    dataQuality: { type: 'string', enum: ['estimate', 'label_read', 'insufficient'] },
    needsManualNutrition: { type: 'boolean' },
    warning: { type: 'string' }
  },
  required: [
    'name',
    'calories',
    'protein',
    'fat',
    'carbs',
    'weight',
    'confidence',
    'ingredients',
    'dataQuality',
    'needsManualNutrition',
    'warning'
  ],
  additionalProperties: false
};

const BARCODE_SCHEMA = {
  type: 'object',
  properties: {
    barcode: { type: ['string', 'null'] }
  },
  required: ['barcode'],
  additionalProperties: false
};

const SMART_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          supermarket: { type: 'string' },
          brand: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          fat: { type: 'number' },
          carbs: { type: 'number' },
          weight: { type: 'number' },
          ingredients: { type: 'string' },
          icon: { type: 'string' }
        },
        required: [
          'id',
          'name',
          'supermarket',
          'brand',
          'calories',
          'protein',
          'fat',
          'carbs',
          'weight',
          'ingredients',
          'icon'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['products'],
  additionalProperties: false
};

function toImageUrl(base64Data) {
  if (base64Data.startsWith('data:image/')) {
    return base64Data;
  }

  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, '');
  return `data:image/jpeg;base64,${base64ImageBytes}`;
}

function getOutputText(data) {
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  const outputText = data.output
    ?.flatMap(item => item.content || [])
    ?.find(content => content.type === 'output_text' && typeof content.text === 'string')
    ?.text;

  return outputText || '';
}

function normalizeFoodResult(result) {
  return {
    ...result,
    calories: result.calories === null ? null : Number(result.calories),
    protein: result.protein === null ? null : Number(result.protein),
    fat: result.fat === null ? null : Number(result.fat),
    carbs: result.carbs === null ? null : Number(result.carbs),
    weight: Number(result.weight) || 100,
    confidence: Number(result.confidence) || 0,
    ingredients: result.ingredients || '',
    dataQuality: result.dataQuality || 'estimate',
    needsManualNutrition: Boolean(result.needsManualNutrition),
    warning: result.warning || 'КБЖВ з фото є приблизною оцінкою. Перевірте дані перед додаванням.'
  };
}

function handleOpenAIError(response, errorData) {
  const apiErrorMessage = errorData.error?.message || '';
  console.error('OpenAI API Error details:', errorData);

  if (response.status === 401 || response.status === 403) {
    return new Error('Невірний OpenAI API-ключ або обмежений доступ. Перевірте ключ у налаштуваннях.');
  }

  if (response.status === 429) {
    return new Error('Перевищено ліміт або квоту OpenAI API. Зачекайте трохи або перевірте Billing/Rate limits.');
  }

  if (response.status === 400) {
    return new Error(apiErrorMessage || 'Невірний запит до OpenAI API. Перевірте модель або формат даних.');
  }

  return new Error(apiErrorMessage || `Помилка OpenAI API (код: ${response.status})`);
}

async function requestOpenAIResponse(modelName, input, apiKey, schemaName, schema, maxOutputTokens = 1200) {
  if (!apiKey) {
    throw new Error('OpenAI API-ключ не налаштовано. Введіть ключ у налаштуваннях додатку.');
  }

  let response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelName,
        input,
        max_output_tokens: maxOutputTokens,
        temperature: 0.2,
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            strict: true,
            schema
          }
        }
      })
    });
  } catch (error) {
    console.error('OpenAI network error:', error);
    throw new Error('Не вдалося підключитися до OpenAI API. Якщо браузер блокує прямий запит з GitHub Pages, потрібен серверний proxy.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw handleOpenAIError(response, errorData);
  }

  const data = await response.json();
  const textResponse = getOutputText(data);

  if (!textResponse) {
    throw new Error('OpenAI не зміг згенерувати відповідь для цього запиту.');
  }

  try {
    return JSON.parse(textResponse);
  } catch (error) {
    console.error('OpenAI JSON parse error:', error, textResponse);
    throw new Error('Не вдалося розпарсити відповідь OpenAI. Спробуйте ще раз.');
  }
}

export async function analyzeFoodImageWithOpenAI(base64Data, apiKey, modelName = 'gpt-5.5') {
  const promptText = `
    Проаналізуй фото їжі українською мовою.

    Правила точності:
    - Якщо це готова страва без етикетки, дай приблизну оцінку ваги та КБЖВ.
    - Якщо це упаковка, але таблиця харчової цінності нечітка, не вигадуй КБЖВ: calories/protein/fat/carbs мають бути null, dataQuality "insufficient", needsManualNutrition true.
    - Якщо таблиця харчової цінності чітко читається, зчитай КБЖВ з етикетки, встанови dataQuality "label_read".
    - Не використовуй загальні знання бренду як точні дані конкретної упаковки.
    - Поверни тільки дані, які відповідають JSON Schema.
  `;

  const result = await requestOpenAIResponse(
    modelName,
    [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: promptText },
          { type: 'input_image', image_url: toImageUrl(base64Data) }
        ]
      }
    ],
    apiKey,
    'food_scan_result',
    FOOD_SCAN_SCHEMA
  );

  return normalizeFoodResult(result);
}

export async function detectBarcodeFromImageWithOpenAI(base64Data, apiKey, modelName = 'gpt-5.5') {
  const promptText = `
    Знайди на фото штрих-код продукту (EAN-13, EAN-8, UPC-A або UPC-E).
    Поверни тільки цифри штрих-коду. Якщо штрих-код не видно або він нечіткий, поверни null.
  `;

  const result = await requestOpenAIResponse(
    modelName,
    [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: promptText },
          { type: 'input_image', image_url: toImageUrl(base64Data) }
        ]
      }
    ],
    apiKey,
    'barcode_scan_result',
    BARCODE_SCHEMA,
    400
  );

  return result.barcode;
}

export async function searchSmartProductsWithOpenAI(query, apiKey, modelName = 'gpt-5.5') {
  if (!query || !query.trim()) {
    return [];
  }

  const promptText = `
    Ти пошуковий помічник NutriSnap для продуктів і страв.
    Запит користувача: "${query.trim()}".

    Поверни 3-5 релевантних варіантів українською мовою.
    Для загальних продуктів давай різні сорти/типи/способи приготування.
    Для супермаркетів або брендів в Україні вказуй бренд/супермаркет, якщо доречно.
    КБЖВ має бути на 100 г, максимально наближене до типових даних.
  `;

  const result = await requestOpenAIResponse(
    modelName,
    [{ role: 'user', content: [{ type: 'input_text', text: promptText }] }],
    apiKey,
    'smart_product_search',
    SMART_SEARCH_SCHEMA
  );

  return Array.isArray(result.products) ? result.products : [];
}
