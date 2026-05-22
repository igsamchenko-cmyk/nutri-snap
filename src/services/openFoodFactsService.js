/**
 * Сервіс для роботи з відкритим API Open Food Facts (український та світовий сегмент)
 */

export async function getProductByBarcode(barcode) {
  const cleanBarcode = barcode.trim();
  
  // Перевірка на валідність штрих-коду (має бути лише з цифр)
  if (!/^\d+$/.test(cleanBarcode)) {
    throw new Error("Штрих-код має складатися тільки з цифр.");
  }

  // Запит до API Open Food Facts
  const url = `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'NutriSnap - Web/1.1.0 (nutrisnap.app.ua@outlook.com)'
    }
  });

  if (!response.ok) {
    throw new Error("Не вдалося підключитися до бази даних продуктів. Спробуйте пізніше.");
  }
  
  const data = await response.json();
  
  if (data.status !== 1 || !data.product) {
    throw new Error("Продукт із таким штрих-кодом не знайдено у базі даних.");
  }
  
  const p = data.product;
  
  // Спроба отримати назву українською, інакше англійською або загальною
  const name = p.product_name_uk || p.product_name || p.product_name_en || "Невідомий продукт";
  const brand = p.brands ? p.brands.split(',')[0].trim() : "";
  const fullName = brand ? `${brand} - ${name}` : name;

  const nutriments = p.nutriments || {};
  
  // Отримання КБЖВ на 100г
  const calories = Math.round(Number(nutriments['energy-kcal_100g']) || Number(nutriments['energy-kcal']) || 0);
  const protein = Math.round((Number(nutriments.proteins_100g) || Number(nutriments.proteins) || 0) * 10) / 10;
  const fat = Math.round((Number(nutriments.fat_100g) || Number(nutriments.fat) || 0) * 10) / 10;
  const carbs = Math.round((Number(nutriments.carbohydrates_100g) || Number(nutriments.carbohydrates) || 0) * 10) / 10;
  
  // Визначення ваги продукту за замовчуванням
  let weight = 100;
  if (p.quantity) {
    // Шукаємо цифри у полі кількості (наприклад "400 g", "0.5 l", "250 мл")
    const numMatch = p.quantity.match(/([\d.,]+)\s*(g|г|ml|мл|l|л)/i);
    if (numMatch) {
      let val = parseFloat(numMatch[1].replace(',', '.'));
      const unit = numMatch[2].toLowerCase();
      
      // Якщо вказано в літрах або кілограмах, переводимо в грами/мілілітри
      if (unit === 'l' || unit === 'л') {
        val = val * 1000;
      }
      weight = Math.round(val) || 100;
    }
  }

  return {
    name: fullName,
    calories,
    protein,
    fat,
    carbs,
    weight,
    image: p.image_front_url || p.image_url || null,
    ingredients: p.ingredients_text_uk || p.ingredients_text || p.ingredients_text_en || null
  };
}
