/**
 * Сервіс для аналізу фотографій їжі через Gemini API
 */
export async function analyzeFoodImage(base64Data, apiKey) {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }

  // Очищення base64 префіксу (наприклад, data:image/jpeg;base64,) якщо він є
  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, "");

  // Використовуємо gemini-2.5-flash як найшвидшу та найефективнішу модель для зору (Vision)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const promptText = `
    Проаналізуй це фото їжі. Визнач головну страву або продукт харчування на знімку.
    Оціни приблизну вагу страви в грамах та вирахуй харчову цінність:
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
      console.error("Gemini API Error:", errorData);
      
      if (response.status === 400) {
        throw new Error("Невірний запит до API. Перевірте формат або модель.");
      } else if (response.status === 403) {
        throw new Error("Невірний API-ключ або обмежений доступ. Перевірте ключ у налаштуваннях.");
      } else {
        throw new Error(errorData.error?.message || `Помилка API Gemini (Код: ${response.status})`);
      }
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
export async function detectBarcodeFromImage(base64Data, apiKey) {
  if (!apiKey) {
    throw new Error("API-ключ не налаштовано. Будь ласка, введіть ваш Gemini API-ключ у налаштуваннях.");
  }

  const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
      throw new Error(errorData.error?.message || `Помилка API Gemini (Код: ${response.status})`);
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

