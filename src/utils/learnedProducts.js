import { safeSetItem } from './storage.js';

export const LEARNED_PRODUCTS_STORAGE_KEY = 'nutrisnap_learned_products';
export const MAX_LEARNED_PRODUCTS = 500;

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
  const limitedProducts = products.slice(0, MAX_LEARNED_PRODUCTS);
  return safeSetItem(LEARNED_PRODUCTS_STORAGE_KEY, JSON.stringify(limitedProducts))
    ? limitedProducts
    : null;
}

export function normalizeLearnedProductKey(productOrName, brand = '') {
  if (typeof productOrName === 'object' && productOrName !== null) {
    const barcode = String(productOrName.barcode || '').replace(/\D/g, '');
    if (barcode) return `barcode:${barcode}`;
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
    .slice(0, MAX_LEARNED_PRODUCTS);

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
    per100g: product.per100g ? {
      calories: Number(product.per100g.calories) || 0,
      protein: Number(product.per100g.protein) || 0,
      fat: Number(product.per100g.fat) || 0,
      carbs: Number(product.per100g.carbs) || 0
    } : null,
    nutritionBasis: product.nutritionBasis || '',
    packageWeight: Number(product.packageWeight) || null,
    defaultPortionGrams: Number(product.defaultPortionGrams) || null,
    ingredients: product.ingredients || '',
    icon: product.icon || '🍽️',
    barcode: product.barcode || '',
    source,
    sourceLabel: product.sourceLabel || '🧠 Збережено зі сканувань',
    dataQuality: product.dataQuality || 'unknown',
    confidence: Number.isFinite(Number(product.confidence)) ? Number(product.confidence) : null,
    warning: product.warning || '',
    savedAt: product.savedAt || new Date().toISOString()
  };
}
