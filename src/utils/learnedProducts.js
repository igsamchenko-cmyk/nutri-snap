import { safeSetItem } from './storage.js';

export const LEARNED_PRODUCTS_STORAGE_KEY = 'nutrisnap_learned_products';
const MAX_ITEMS = 500;

export function getLearnedProducts() {
  try {
    const raw = localStorage.getItem(LEARNED_PRODUCTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading learned products:', error);
    return [];
  }
}

export function setLearnedProducts(products = []) {
  safeSetItem(LEARNED_PRODUCTS_STORAGE_KEY, JSON.stringify(products.slice(0, MAX_ITEMS)));
}

export function normalizeLearnedProductKey(productOrName, brand = '') {
  if (typeof productOrName === 'object' && productOrName !== null) {
    return `${normalizeName(productOrName.name)}|${normalizeName(productOrName.brand)}`;
  }
  return `${normalizeName(productOrName)}|${normalizeName(brand)}`;
}

export function mergeLearnedProducts(products = []) {
  const existing = getLearnedProducts();
  const map = new Map(existing.map(product => [normalizeLearnedProductKey(product), product]));

  products.forEach(product => {
    if (!product?.name || product.calories == null) return;
    const normalized = normalizeLearnedProduct(product, product.source || 'import');
    map.set(normalizeLearnedProductKey(normalized), normalized);
  });

  const merged = [...map.values()]
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .slice(0, MAX_ITEMS);

  setLearnedProducts(merged);
  return merged;
}

export function saveLearnedProduct(product, source = 'ai') {
  if (!product?.name || product.calories == null) return;
  mergeLearnedProducts([{ ...product, source }]);
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeLearnedProduct(product, source = 'ai') {
  return {
    id: product.id || `learned-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(product.name || '').trim(),
    brand: product.brand || '',
    supermarket: product.supermarket || '',
    calories: Number(product.calories) || 0,
    protein: Number(product.protein) || 0,
    fat: Number(product.fat) || 0,
    carbs: Number(product.carbs) || 0,
    weight: Number(product.weight) || 100,
    ingredients: product.ingredients || '',
    icon: product.icon || '🍽️',
    barcode: product.barcode || '',
    source,
    sourceLabel: '🧠 Збережено зі сканувань',
    savedAt: product.savedAt || new Date().toISOString()
  };
}
