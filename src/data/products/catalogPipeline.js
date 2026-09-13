import { inferProductType } from './productType.js';

const REQUIRED_NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'];

const SOURCE_PRIORITY = {
  'ua-import': 100,
  openfoodfacts: 95,
  'ua-core': 90,
  'ua-retail': 80,
  'ua-atb': 75,
  'ua-seed': 70,
  'ua-expanded': 60,
  'ua-everyday': 50
};

const PREPARATION_STATE_ALIASES = {
  raw: ['сирий', 'сира', 'сире', 'сирі', 'необроблений', 'raw'],
  dry: ['сухий', 'суха', 'сухе', 'сухі', 'до приготування', 'dry'],
  frozen: ['заморожений', 'заморожена', 'заморожене', 'заморожені', 'frozen'],
  cooked: ['готовий', 'готова', 'готове', 'готові', 'приготований', 'варений', 'cooked'],
  prepared: ['готова страва', 'домашня страва', 'prepared']
};

const VALID_PREPARATION_STATES = new Set([
  'raw',
  'dry',
  'frozen',
  'cooked',
  'prepared',
  'unspecified'
]);

const UNSOURCED_WARNING = 'Довідкове усереднене значення. Перевірте КБЖВ на етикетці конкретного продукту.';

export function normalizeProductSearchText(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('uk-UA')
    .replace(/[ʼ’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeProductAliases(value = []) {
  const aliases = Array.isArray(value)
    ? value
    : String(value).split(/[;|]/);
  const uniqueAliases = new Map();

  aliases
    .map(alias => String(alias || '').trim())
    .filter(Boolean)
    .forEach(alias => {
      const key = normalizeProductSearchText(alias);
      if (key && !uniqueAliases.has(key)) uniqueAliases.set(key, alias);
    });

  return Array.from(uniqueAliases.values());
}

export function inferPreparationState(product = {}) {
  if (VALID_PREPARATION_STATES.has(product.preparationState)) {
    return product.preparationState;
  }

  const text = normalizeProductSearchText([
    product.name,
    ...(Array.isArray(product.aliases) ? product.aliases : [product.aliases])
  ].filter(Boolean).join(' '));
  const words = text.split(' ').filter(Boolean);
  const hasWordStartingWith = roots => words.some(word => roots.some(root => word.startsWith(root)));

  if (hasWordStartingWith(['заморож', 'frozen'])) return 'frozen';
  if (words.some(word => ['сухий', 'суха', 'сухе', 'сухі', 'dry'].includes(word))) return 'dry';
  if (words.some(word => ['сирий', 'сира', 'сире', 'сирі', 'необроблений', 'raw'].includes(word))) return 'raw';
  if (hasWordStartingWith(['варен', 'відварен', 'запечен', 'смажен', 'грил', 'тушкован', 'приготован', 'готов', 'печен', 'cooked'])) {
    return 'cooked';
  }

  const brand = normalizeProductSearchText(product.brand);
  if (['домашня кухня', 'українська кухня', 'популярне'].includes(brand)) return 'prepared';
  return 'unspecified';
}

function getNutrition(product, field) {
  const value = product.per100g?.[field] ?? product[field];
  return Number(value);
}

function buildSearchText(product) {
  const stateAliases = PREPARATION_STATE_ALIASES[product.preparationState] || [];
  return normalizeProductSearchText([
    product.name,
    product.brand,
    product.supermarket,
    product.category,
    product.productType,
    ...product.aliases,
    ...stateAliases,
    product.searchText
  ].filter(Boolean).join(' '));
}

export function getCatalogIdentity(product = {}) {
  const barcode = String(product.barcode || '').trim();
  if (barcode) return `barcode:${barcode}`;

  return getCatalogNameIdentity(product);
}

function getCatalogNameIdentity(product = {}) {
  return [
    'name',
    normalizeProductSearchText(product.name),
    'brand',
    normalizeProductSearchText(product.brand),
    'state',
    product.preparationState || inferPreparationState(product)
  ].join(':');
}

export function normalizeCatalogProduct(product = {}, index = 0) {
  const aliases = normalizeProductAliases(product.aliases);
  const preparationState = inferPreparationState({ ...product, aliases });
  const productType = inferProductType({ ...product, aliases });
  const per100g = Object.fromEntries(
    REQUIRED_NUTRITION_FIELDS.map(field => [field, getNutrition(product, field)])
  );
  const hasVerifiableSource = Boolean(product.barcode || product.sourceUrl);
  const normalizedProduct = {
    ...product,
    id: String(product.id || `catalog-product-${index + 1}`).trim(),
    name: String(product.name || '').trim(),
    brand: String(product.brand || '').trim(),
    supermarket: String(product.supermarket || '').trim(),
    category: String(product.category || 'Інше').trim(),
    productType,
    aliases,
    preparationState,
    nutritionBasis: '100g',
    per100g,
    ...per100g,
    weight: Number(product.weight) || 100,
    dataQuality: product.dataQuality || (hasVerifiableSource ? 'database' : 'reference'),
    confidence: hasVerifiableSource ? product.confidence ?? null : null,
    warning: product.warning || (hasVerifiableSource ? '' : UNSOURCED_WARNING)
  };

  normalizedProduct.searchText = buildSearchText(normalizedProduct);
  normalizedProduct.catalogIdentity = getCatalogIdentity(normalizedProduct);
  return normalizedProduct;
}

export function validateCatalogProduct(product = {}) {
  const errors = [];

  if (!String(product.id || '').trim()) errors.push('missing-id');
  if (!String(product.name || '').trim()) errors.push('missing-name');
  if (product.nutritionBasis !== '100g') errors.push('invalid-nutrition-basis');
  if (!VALID_PREPARATION_STATES.has(product.preparationState)) errors.push('invalid-preparation-state');

  REQUIRED_NUTRITION_FIELDS.forEach(field => {
    const value = Number(product.per100g?.[field]);
    const maximum = field === 'calories' ? 1000 : 100;
    if (!Number.isFinite(value) || value < 0 || value > maximum) errors.push(`invalid-${field}`);
  });

  const macroTotal = ['protein', 'fat', 'carbs']
    .reduce((total, field) => total + Number(product.per100g?.[field] || 0), 0);
  if (macroTotal > 105) errors.push('invalid-macro-total');

  const weight = Number(product.weight);
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100000) errors.push('invalid-weight');

  return errors;
}

function getProductPriority(product) {
  let score = SOURCE_PRIORITY[product.source] || 0;
  if (product.sourceUrl) score += 1000;
  if (product.barcode) score += 2000;
  if (product.ingredients) score += 4;
  if (product.supermarket) score += 2;
  score += product.aliases.length;
  return score;
}

function mergeDuplicateProducts(current, candidate) {
  const [preferred, duplicate] = getProductPriority(candidate) > getProductPriority(current)
    ? [candidate, current]
    : [current, candidate];
  const aliases = normalizeProductAliases([
    ...preferred.aliases,
    ...duplicate.aliases,
    ...(preferred.name !== duplicate.name ? [duplicate.name] : [])
  ]);
  const merged = {
    ...preferred,
    aliases,
    searchText: [preferred.searchText, duplicate.searchText].filter(Boolean).join(' ')
  };

  merged.searchText = buildSearchText(merged);
  return merged;
}

export function buildProductCatalog(rawProducts = []) {
  const productsByIdentity = new Map();
  const identityByName = new Map();
  const invalidEntries = [];
  let duplicateCount = 0;

  rawProducts.forEach((rawProduct, index) => {
    const product = normalizeCatalogProduct(rawProduct, index);
    const errors = validateCatalogProduct(product);
    if (errors.length > 0) {
      invalidEntries.push({ id: product.id, name: product.name, errors });
      return;
    }

    const nameIdentity = getCatalogNameIdentity(product);
    const barcodeMatch = productsByIdentity.get(product.catalogIdentity);
    const nameMatchIdentity = identityByName.get(nameIdentity);
    const nameMatch = nameMatchIdentity ? productsByIdentity.get(nameMatchIdentity) : null;
    const hasDifferentBarcodes = Boolean(
      nameMatch?.barcode
      && product.barcode
      && String(nameMatch.barcode) !== String(product.barcode)
    );
    const existing = barcodeMatch || (!hasDifferentBarcodes ? nameMatch : null);
    const existingIdentity = barcodeMatch ? product.catalogIdentity : nameMatchIdentity;

    if (existing) {
      duplicateCount += 1;
      const merged = mergeDuplicateProducts(existing, product);
      const mergedIdentity = getCatalogIdentity(merged);
      if (existingIdentity !== mergedIdentity) productsByIdentity.delete(existingIdentity);
      productsByIdentity.set(mergedIdentity, merged);
      identityByName.set(getCatalogNameIdentity(existing), mergedIdentity);
      identityByName.set(nameIdentity, mergedIdentity);
      return;
    }

    productsByIdentity.set(product.catalogIdentity, product);
    if (!identityByName.has(nameIdentity)) identityByName.set(nameIdentity, product.catalogIdentity);
  });

  return {
    products: Array.from(productsByIdentity.values()),
    diagnostics: {
      inputCount: rawProducts.length,
      outputCount: productsByIdentity.size,
      duplicateCount,
      invalidCount: invalidEntries.length,
      invalidEntries
    }
  };
}
