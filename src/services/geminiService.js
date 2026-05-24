/**
 * Сервіс для аналізу фотографій їжі через Gemini API
 */

// Допоміжна функція для обробки помилок Gemini API
function handleGeminiError(response, errorData) {
  const apiErrorMessage = errorData.error?.message || "";
  console.error("Gemini API Error details:", errorData);
  
  if (response.status === 429 || apiErrorMessage.toLowerCase().includes("quota") || apiErrorMessage.toLowerCase().includes("exhausted") || apiErrorMessage.toLowerCase().includes("rate limit")) {
    return new Error("Перевищено ліміти або квоту запитів ШІ (Помилка 429 / Resource Exhausted). На безкоштовному тарифі діє ліміт (зазвичай 15 запитів на хвилину або добові ліміти). Будь ласка, зачекайте 1-2 хвилини і спробуйте знову.");
  } else if (response.status === 403 || apiErrorMessage.toLowerCase().includes("api key")) {
    return new Error("Невірний API-ключ або обмежений доступ. Будь ласка, перевірте правильність вашого Gemini API-ключа в налаштуваннях.");
  } else if (response.status === 400) {
    return new Error(apiErrorMessage || "Невірний запит до API. Перевірте формат або модель.");
  } else {
    return new Error(apiErrorMessage || `Помилка API Gemini (Код: ${response.status})`);
  }
}

export async function analyzeFoodImage(base64Data, apiKey, modelName = 'gemini-2.5-flash') {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }

  const trimmedKey = apiKey.trim();


  // Очищення base64 префіксу (наприклад, data:image/jpeg;base64,) якщо він є
  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, "");

  // Використовуємо обрану модель Gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;

  const promptText = `
    Проаналізуй це фото їжі. Визнач головну страву або продукт харчування на знімку.
    Оціни приблизну вагу страви в грамах та вирахуй харчочу цінність:
    калорійність (ккал), білки (г), жири (г) та вуглеводи (г).
    
    Ти ПОВИНЕН повернути відповідь виключно у форматі JSON українською мовою з наступними полями:
    - "name": Назва страви або продукту (наприклад: "Куряче філе гриль з рисом")
    - "calories": Калорійність у ккал (ціле число)
    - "protein": Білки в грамах (число, округлене до 1 знака)
    - "fat": Жири в грамах (число, округлене до 1 знака)
    - "carbs": Вуглеводи в грамах (число, округлене до 1 знака)
    - "weight": Оціночна вага порції в грамах (ціле число, наприклад: 250)
    - "confidence": Твоя впевненість у розпізнаванні від 50 до 99 (ціле число)
    - "ingredients": Основні інгредієнти одним реченням (наприклад: "куряче філе, рис, оливкова олія, броколі")

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
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleGeminiError(response, errorData);
    }

    const data = await response.json();
    
    // Перевірка наявності відповіді
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для цього зображення.");
    }

    // Парсимо JSON
    const parsedData = JSON.parse(textResponse);
    return parsedData;

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

  const trimmedKey = apiKey.trim();


  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;

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
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleGeminiError(response, errorData);
    }

    const data = await response.json();
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
  const trimmedKey = apiKey.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;

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
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleGeminiError(response, errorData);
    }

    const data = await response.json();
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
  const trimmedKey = apiKey.trim();
  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;

  const promptText = `
    Проаналізуй це зображення упаковки продукту харчування (зокрема таблицю харчової цінності або опис КБЖВ).
    Твоє завдання:
    1. Визначити назву продукту та бренд (наприклад, "Agrola - Хліб зерновий").
    2. Знайти калорійність (ккал), білки (г), жири (г) та вуглеводи (г) НА 100г продукту.
    3. Знайти загальну вагу упаковки або типову порцію в грамах (якщо вказано, інакше поверни 100).
    4. Зчитати склад/інгредієнти одним реченням.
    
    Ти ПОВИНЕН повернути відповідь виключно у форматі JSON українською мовою з наступними полями:
    - "name": Назва продукту разом з брендом
    - "calories": Калорійність на 100г у ккал (ціле число)
    - "protein": Білки на 100г в грамах (число, огруглене до 1 знака)
    - "fat": Жири на 100г в грамах (число, огруглене до 1 знака)
    - "carbs": Вуглеводи на 100г в грамах (число, огруглене до 1 знака)
    - "weight": Загальна вага упаковки або порції в грамах (ціле число, за замовчуванням 100)
    - "ingredients": Склад продукту (одним реченням, або null якщо не вказано)
    
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
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleGeminiError(response, errorData);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для цього зображення.");
    }

    const parsedData = JSON.parse(textResponse);
    return parsedData;
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
  const trimmedKey = apiKey.trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${trimmedKey}`;

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
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw handleGeminiError(response, errorData);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("ШІ не зміг згенерувати відповідь для пошуку продуктів.");
    }

    const parsedData = JSON.parse(textResponse);
    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error("Error in searchSupermarketProducts:", error);
    if (error instanceof SyntaxError) {
      return [];
    }
    throw error;
  }
}
