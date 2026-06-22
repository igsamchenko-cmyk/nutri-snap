import { requestGeminiContent, SERVER_GEMINI_API_KEY } from './geminiClient.js';
import {
  AI_FOOD_IMAGE_JPEG_QUALITY,
  AI_FOOD_IMAGE_MAX_SIDE,
  downscaleImageToBase64
} from '../utils/imageUtils.js';
import {
  getAiPerformanceNow,
  getBase64PayloadSizeKb,
  logAiPayload,
  logAiPerformance
} from '../utils/aiPerformance.js';
import {
  AI_PHOTO_REQUEST_TIMEOUT_MESSAGE,
  AI_PHOTO_REQUEST_TIMEOUT_MS
} from '../utils/requestTimeout.js';
import { filterValidAiNutritionResults, getValidatedAiNutritionResult } from './aiNutritionValidation.js';

export { SERVER_GEMINI_API_KEY };

// JSON-схеми для structured output Gemini (nullable за форматом Gemini/OpenAPI)
const FOOD_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    calories: { type: 'integer', nullable: true },
    protein: { type: 'number', nullable: true },
    fat: { type: 'number', nullable: true },
    carbs: { type: 'number', nullable: true },
    weight: { type: 'integer' },
    confidence: { type: 'integer' },
    ingredients: { type: 'string' },
    dataQuality: { type: 'string', enum: ['estimate', 'label_read', 'insufficient'] },
    needsManualNutrition: { type: 'boolean' },
    warning: { type: 'string' }
  },
  required: ['name', 'calories', 'protein', 'fat', 'carbs', 'weight', 'confidence', 'ingredients', 'dataQuality', 'needsManualNutrition', 'warning']
};

const PACKAGING_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    calories: { type: 'integer', nullable: true },
    protein: { type: 'number', nullable: true },
    fat: { type: 'number', nullable: true },
    carbs: { type: 'number', nullable: true },
    weight: { type: 'integer' },
    ingredients: { type: 'string', nullable: true },
    dataQuality: { type: 'string', enum: ['label_read', 'insufficient'] },
    needsManualNutrition: { type: 'boolean' },
    warning: { type: 'string' }
  },
  required: ['name', 'calories', 'protein', 'fat', 'carbs', 'weight', 'dataQuality', 'needsManualNutrition', 'warning']
};

const BARCODE_SCHEMA = {
  type: 'object',
  properties: {
    barcode: { type: 'string', nullable: true }
  },
  required: ['barcode']
};

const NAME_ESTIMATE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    calories: { type: 'integer' },
    protein: { type: 'number' },
    fat: { type: 'number' },
    carbs: { type: 'number' },
    weight: { type: 'integer' },
    ingredients: { type: 'string' },
    icon: { type: 'string' }
  },
  required: ['name', 'calories', 'protein', 'fat', 'carbs', 'weight', 'ingredients', 'icon']
};

const SMART_SEARCH_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      supermarket: { type: 'string' },
      brand: { type: 'string' },
      calories: { type: 'integer' },
      protein: { type: 'number' },
      fat: { type: 'number' },
      carbs: { type: 'number' },
      weight: { type: 'integer' },
      ingredients: { type: 'string' },
      icon: { type: 'string' }
    },
    required: ['id', 'name', 'supermarket', 'brand', 'calories', 'protein', 'fat', 'carbs', 'weight', 'ingredients', 'icon']
  }
};

function getGenerationConfig(baseConfig, modelName) {
  if (modelName && modelName.includes('pro')) {
    return baseConfig;
  }
  return {
    ...baseConfig,
    thinkingConfig: { thinkingBudget: 0 }
  };
}


export async function analyzeFoodImage(base64Data, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }



  // Очищення base64 префіксу (наприклад, data:image/jpeg;base64,) якщо він є
  const base64ImageBytes = await downscaleImageToBase64(base64Data, AI_FOOD_IMAGE_MAX_SIDE, AI_FOOD_IMAGE_JPEG_QUALITY);
  logAiPayload('photo payload', {
    provider: 'gemini',
    modelName,
    payloadSizeKb: getBase64PayloadSizeKb(base64ImageBytes)
  });

  // Використовуємо обрану модель Gemini

  const promptText = `
    Analyze this food photo and return only JSON matching the schema. Return all text values in Ukrainian.

    Required task:
    - identify the main dish/product and visible components;
    - estimate total serving weight in grams;
    - estimate calories/protein/fat/carbs for the whole serving;
    - confidence must be 0-99; lower it when uncertain and explain in warning;
    - dataQuality must be "estimate", "label_read", or "insufficient";
    - needsManualNutrition must be true when nutrition cannot be estimated or read reliably.

    Rules:
    - For normal prepared food, give the best approximate estimate; do not provide medical advice.
    - Calories should roughly match macros: protein*4 + carbs*4 + fat*9.
    - If this is packaging and the nutrition table is clearly readable, read values per 100 g and use dataQuality "label_read".
    - If packaging/label is unclear, do not invent nutrition: calories/protein/fat/carbs null, confidence <=45, dataQuality "insufficient", needsManualNutrition true.
    - Do not use generic brand knowledge as exact label data.

    Required JSON fields: name, calories, protein, fat, carbs, weight, confidence, ingredients, dataQuality, needsManualNutrition, warning.
  `;
  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64ImageBytes
            }
          }
        ]
      }
    ],
    generationConfig: getGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: FOOD_SCAN_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1200
    }, modelName)
  };

  try {
    const requestStartedAt = getAiPerformanceNow();
    const data = await requestGeminiContent(modelName, payload, apiKey, {
      timeoutMs: AI_PHOTO_REQUEST_TIMEOUT_MS,
      timeoutMessage: AI_PHOTO_REQUEST_TIMEOUT_MESSAGE
    });
    logAiPerformance('provider request', requestStartedAt, {
      provider: 'gemini',
      modelName
    });

    // Перевірка наявності відповіді
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для цього зображення.");
    }

    const validationStartedAt = getAiPerformanceNow();
    const parsedData = JSON.parse(textResponse);
    const validatedResult = getValidatedAiNutritionResult({
      ...parsedData,
      dataQuality: parsedData.dataQuality || "estimate",
      needsManualNutrition: Boolean(parsedData.needsManualNutrition),
      warning: parsedData.warning || "КБЖВ з фото є приблизною оцінкою. Перевірте дані перед додаванням."
    }, {
      requireConfidence: true,
      requireNeedsManualNutrition: true,
      confidenceMax: 99,
      defaultDataQuality: "estimate"
    });
    logAiPerformance('JSON parse / validation', validationStartedAt, {
      provider: 'gemini',
      dataQuality: validatedResult.dataQuality,
      needsManualNutrition: validatedResult.needsManualNutrition
    });
    return validatedResult;

  } catch (error) {
    console.error("Error in analyzeFoodImage:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Не вдалося розпарсити відповідь від ШІ. Спробуйте ще раз.");
    }
    throw error;
  }
}

/**
 * Сервіс для розпізнавання штрих-коду з фотографії через Gemini API
 */
export async function detectBarcodeFromImage(base64Data, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }

  const base64ImageBytes = await downscaleImageToBase64(base64Data, 1600);

  const promptText = `
    Проаналізуй це зображення штрих-коду продукту.
    Знайди на зображенні штрих-код (наприклад, EAN-13, EAN-8, UPC-A, UPC-E) та прочитай його цифри.
    Поверни ТІЛЬКИ чистий JSON об'єкт з наступним полем:
    - "barcode": рядок, що містить тільки цифри штрих-коду (без пробілів, наприклад: "8000500023976"). Якщо штрих-код не вдалося розпізнати або його немає на фото, поверни null.
    
    Формат відповіді має бути чистим JSON об'єктом, без markdown розмітки на кшталт \`\`\`json.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64ImageBytes
            }
          }
        ]
      }
    ],
    generationConfig: getGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: BARCODE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1200
    }, modelName)
  };

  try {
    const data = await requestGeminiContent(modelName, payload, apiKey);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг прочитати штрих-код з цього фото.");
    }

    const parsedData = JSON.parse(textResponse);
    return parsedData.barcode;
  } catch (error) {
    console.error("Error in detectBarcodeFromImage:", error);
    throw error;
  }
}

export async function estimateFoodNutritionByName(foodName, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }
  const promptText = `
    Проаналізуй назву страви або продукту харчування: "${foodName}".
    Оціни її типову харчову цінність на 100 грамів:
    калорійність (ккал), білки (г), жири (г) та вуглеводи (г).
    Також визнач типову вагу однієї порції цієї страви в грамах та її інгредієнти.
    
    Ти ПОВИНЕН повернути відповідь виключно у форматі JSON українською мовою з наступними полями:
    - "name": Назва страви або продукту (наприклад: "Шаурма з куркою")
    - "calories": Калорійність на 100г у ккал (ціле число)
    - "protein": Білки на 100г в грамах (число, округлене до 1 знака)
    - "fat": Жири на 100г в грамах (число, округлене до 1 знака)
    - "carbs": Вуглеводи на 100г в грамах (число, округлене до 1 знака)
    - "weight": Типова вага порції в грамах (ціле число, наприклад: 300)
    - "ingredients": Основні інгредієнти одним реченням
    - "icon": Відповідний смайлик-емодзі для цієї страви (наприклад: "🌯")

    Формат відповіді має бути чистим JSON об'єктом, без markdown розмітки на кшталт \`\`\`json.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: getGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: NAME_ESTIMATE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1200
    }, modelName)
  };

  try {
    const data = await requestGeminiContent(modelName, payload, apiKey);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для цієї назви страви.");
    }

    const parsedData = JSON.parse(textResponse);
    return parsedData;
  } catch (error) {
    console.error("Error in estimateFoodNutritionByName:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Не вдалося розпарсити відповідь від ШІ. Спробуйте ще раз.");
    }
    throw error;
  }
}

export async function analyzeProductPackagingImage(base64Data, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }
  const base64ImageBytes = await downscaleImageToBase64(base64Data);

  const promptText = `
    Проаналізуй це зображення упаковки продукту харчування (зокрема таблицю харчової цінності або опис КБЖВ).
    НЕ ВИГАДУЙ харчові дані. Якщо таблиця харчової цінності або КБЖВ не читаються чітко на фото, поверни calories/protein/fat/carbs як null, dataQuality: "insufficient", needsManualNutrition: true.
    Твоє завдання:
    1. Визначити назву продукту та бренд (наприклад, "Agrola - Хліб зерновий").
    2. Знайти калорійність (ккал), білки (г), жири (г) та вуглеводи (г) НА 100г продукту.
    3. Знайти загальну вагу упаковки або типову порцію в грамах (якщо вказано, інакше поверни 100).
    4. Зчитати склад/інгредієнти одним реченням.
    
    Ти ПОВИНЕН повернути відповідь виключно у форматі JSON українською мовою з наступними полями:
    - "name": Назва продукту разом з брендом
    - "calories": Калорійність на 100г у ккал (ціле число або null)
    - "protein": Білки на 100г в грамах (число, округлене до 1 знака або null)
    - "fat": Жири на 100г в грамах (число, округлене до 1 знака або null)
    - "carbs": Вуглеводи на 100г в грамах (число, округлене до 1 знака або null)
    - "weight": Загальна вага упаковки або порції в грамах (ціле число, за замовчуванням 100)
    - "ingredients": Склад продукту (одним реченням, або null якщо не вказано)
    - "dataQuality": "label_read" якщо дані зчитані з етикетки, або "insufficient" якщо КБЖВ не читаються
    - "needsManualNutrition": true якщо користувачу треба вручну ввести КБЖВ з етикетки, інакше false
    - "warning": коротке попередження для користувача українською мовою
    
    Формат відповіді має бути чистим JSON об'єктом, без markdown розмітки на кшталт \`\`\`json.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64ImageBytes
            }
          }
        ]
      }
    ],
    generationConfig: getGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: PACKAGING_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1200
    }, modelName)
  };

  try {
    const data = await requestGeminiContent(modelName, payload, apiKey);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для цього зображення.");
    }

    const parsedData = JSON.parse(textResponse);
    return getValidatedAiNutritionResult({
      ...parsedData,
      dataQuality: parsedData.dataQuality || "insufficient",
      needsManualNutrition: Boolean(parsedData.needsManualNutrition),
      warning: parsedData.warning || "Використовуйте тільки дані, які видно на етикетці."
    }, {
      allowedDataQualities: ["label_read", "insufficient"],
      defaultDataQuality: "insufficient",
      requireNeedsManualNutrition: true
    });
  } catch (error) {
    console.error("Error in analyzeProductPackagingImage:", error);
    if (error instanceof SyntaxError) {
      throw new Error("Не вдалося розпарсити відповідь від ШІ. Спробуйте ще раз.");
    }
    throw error;
  }
}

export async function searchSmartProducts(query, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }
  const promptText = `
    Ти — інтелектуальний пошуковий помічник по продуктах харчування та стравах.
    Знайди або згенеруй найбільш релевантні результати для пошукового запиту: "${query}".
    
    Якщо запит стосується загальних продуктів (наприклад, "яблуко", "пиво", "куряче філе", "вівсянка") або домашніх страв:
    - ОБОВ'ЯЗКОВО надай 3-5 різноманітних варіантів.
    - Наприклад, для фруктів/овочів: різні популярні сорти (яблуко Голден, яблуко Гала, яблуко Симиренка) та стани (свіже, сушене, запечене).
    - Для напоїв (пиво, тощо): різні види (світле, темне, безалкогольне) з різною калорійністю.
    - Для м'яса/круп: сире, варене, смажене.
    - Назва (поле "name") повинна чітко відображати сорт або вид приготування.
    - Вкажи "supermarket": "Загальний продукт".
    
    Якщо запит містить назви українських супермаркетів (АТБ, Сільпо, Рукавичка, Близенько) або їх торгових марок:
    - Зосередься на їхніх власних торгових марках (ВТМ), наприклад "Своя Лінія", "Премія", "Кухарочка".
    - Вкажи відповідний супермаркет.
    
    Для кожного знайденого/визначеного продукту вкажи максимально наближені до офіційних дані КБЖВ на 100г.
    Поверни від 3 до 5 найбільш релевантних продуктів.
    
    Ти ПОВИНЕН повернути відповідь виключно у форматі JSON (масив об'єктів) українською мовою з наступними полями для кожного продукту:
    - "id": Унікальний рядок-ідентифікатор (наприклад: "ai-prod-123")
    - "name": Повна назва продукту з назвою бренду або точним сортом / типом приготування
    - "supermarket": Назва супермаркету або "Загальний продукт"
    - "brand": Конкретний бренд (якщо є) або "Домашня страва" / "Природний продукт"
    - "calories": Калорійність на 100г у ккал (ціле число)
    - "protein": Білки на 100г в грамах (число, округлене до 1 знака)
    - "fat": Жири на 100г в грамах (число, округлене до 1 знака)
    - "carbs": Вуглеводи на 100г в грамах (число, округлене до 1 знака)
    - "weight": Стандартна порція або вага упаковки в грамах (ціле число, наприклад: 100, 200, 330, 500)
    - "ingredients": Склад продукту або основні інгредієнти одним реченням
    - "icon": Відповідний смайлик-емодзі (наприклад: "🍎", "🍏", "🍺", "🍗", "🥣", "🛒")

    Формат відповіді має бути чистим JSON масивом об'єктів, без markdown розмітки на кшталт \`\`\`json. Якщо нічого не знайдено, поверни порожній масив [].
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ],
    generationConfig: getGenerationConfig({
      responseMimeType: "application/json",
      responseSchema: SMART_SEARCH_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 1200
    }, modelName)
  };

  try {
    const data = await requestGeminiContent(modelName, payload, apiKey);
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для пошуку продуктів.");
    }

    const parsedData = JSON.parse(textResponse);
    return filterValidAiNutritionResults(parsedData, {
      calorieTolerance: 50,
      defaultEstimateWarning: 'Підказка ШІ може бути приблизною. Введіть КБЖВ з етикетки або перевіреного джерела перед збереженням.'
    });
  } catch (error) {
    console.error("Error in searchSupermarketProducts:", error);
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}
