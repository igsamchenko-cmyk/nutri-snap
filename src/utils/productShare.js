import { getLearnedProducts } from './learnedProducts.js';

const FORMAT_VERSION = 1;

export function exportProductsToFile(customFoods = []) {
  const payload = {
    app: 'nutrisnap',
    type: 'product-database',
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    products: [...getLearnedProducts(), ...customFoods]
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nutrisnap-products-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProductsFromFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не є коректним JSON.');
  }

  if (data?.type !== 'product-database' || !Array.isArray(data.products)) {
    throw new Error('Це не файл бази продуктів NutriSnap.');
  }

  return data.products.filter(p => p && p.name && p.calories != null);
}
