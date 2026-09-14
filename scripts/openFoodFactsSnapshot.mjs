import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProductCatalog } from '../src/data/products/catalogPipeline.js';
import { productCatalog } from '../src/data/products/index.js';
import { openFoodFactsUkraineSnapshot as existingSnapshot } from '../src/data/products/openFoodFactsUkraineSnapshot.js';

const API_URL = 'https://search.openfoodfacts.org/search';
const DEFAULT_OUTPUT = resolve('src/data/products/openFoodFactsUkraineSnapshot.js');
const DEFAULT_META_OUTPUT = resolve('src/data/products/openFoodFactsUkraineSnapshotMeta.js');
const DEFAULT_TARGET = 4000;
const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_DELAY_MS = 1500;
const MAX_ATTEMPTS = 5;
const USER_AGENT = 'NutriSnap/1.6 (https://github.com/igsamchenko-cmyk/nutri-snap)';
const REQUEST_FIELDS = [
  'code',
  'product_name',
  'product_name_uk',
  'product_name_ru',
  'product_name_en',
  'product_name_pl',
  'product_name_ro',
  'generic_name',
  'generic_name_uk',
  'generic_name_ru',
  'generic_name_en',
  'generic_name_pl',
  'generic_name_ro',
  'brands',
  'stores',
  'categories_tags',
  'nutriments',
  'data_quality_errors_tags',
  'completeness',
  'last_modified_t'
];
const SEARCH_QUERIES = [
  { label: 'продаються в Україні', query: 'countries_tags:"en:ukraine"' },
  { label: 'українські штрихкоди', query: 'code:482*' }
];

const sleep = milliseconds => new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

function roundNutrition(value) {
  return Math.round(Number(value) * 10) / 10;
}

function getNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function uniqueStrings(values) {
  const unique = new Map();
  values
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .forEach(value => {
      const key = value.toLocaleLowerCase('uk-UA').replace(/[ʼ’'`]/g, '').replace(/\s+/g, ' ');
      if (!unique.has(key)) unique.set(key, value);
    });
  return Array.from(unique.values());
}

export function normalizeOpenFoodFactsProduct(product = {}) {
  const barcode = String(product.code || '').trim();
  const nameCandidates = uniqueStrings([
    product.product_name_uk,
    product.product_name,
    product.product_name_ru,
    product.product_name_en,
    product.product_name_pl,
    product.product_name_ro,
    product.generic_name,
    product.generic_name_uk,
    product.generic_name_ru,
    product.generic_name_en,
    product.generic_name_pl,
    product.generic_name_ro
  ]);
  const name = nameCandidates[0] || '';
  const nutriments = product.nutriments || {};
  const energyKcal = getNumber(nutriments['energy-kcal_100g'])
    ?? (getNumber(nutriments['energy-kj_100g']) !== null
      ? getNumber(nutriments['energy-kj_100g']) / 4.184
      : null);
  const protein = getNumber(nutriments.proteins_100g);
  const fat = getNumber(nutriments.fat_100g);
  const carbs = getNumber(nutriments.carbohydrates_100g);
  const nutrition = [energyKcal, protein, fat, carbs];
  const hasQualityErrors = Array.isArray(product.data_quality_errors_tags)
    && product.data_quality_errors_tags.length > 0;

  if (!/^\d{8,14}$/.test(barcode) || name.length < 2 || hasQualityErrors) return null;
  if (nutrition.some(value => value === null || value < 0)) return null;
  if (energyKcal > 1000 || protein > 100 || fat > 100 || carbs > 100) return null;
  if (protein + fat + carbs > 105) return null;
  const aliases = nameCandidates.slice(1);
  const sourceCategories = uniqueStrings(
    Array.isArray(product.categories_tags) ? product.categories_tags : []
  ).filter(category => /^[a-z]{2}:.+/i.test(category) && category.toLowerCase() !== 'en:null');
  const supermarket = String(product.stores || '').split(',')[0].trim();

  return {
    id: `off-ua-${barcode}`,
    barcode,
    name,
    brand: String(product.brands || '').split(',')[0].trim(),
    supermarket,
    category: 'Продукти',
    calories: roundNutrition(energyKcal),
    protein: roundNutrition(protein),
    fat: roundNutrition(fat),
    carbs: roundNutrition(carbs),
    weight: 100,
    icon: '🛒',
    aliases,
    sourceCategories,
    source: 'openfoodfacts',
    sourceLabel: 'Open Food Facts · Україна',
    sourceUrl: `https://world.openfoodfacts.org/product/${barcode}`,
    sourceUpdatedAt: getNumber(product.last_modified_t),
    dataQuality: 'database',
    confidence: null,
    warning: 'Дані Open Food Facts. Перевірте КБЖВ на етикетці конкретного товару.'
  };
}

function productToRow(product) {
  return [
    product.barcode,
    product.name,
    product.brand,
    product.supermarket,
    product.calories,
    product.protein,
    product.fat,
    product.carbs,
    product.aliases,
    Array.isArray(product.sourceCategories) ? product.sourceCategories : [],
    product.sourceUpdatedAt
  ];
}

export function renderSnapshotModule(products, snapshotDate = new Date().toISOString().slice(0, 10)) {
  const rows = products.map(productToRow).map(row => `  ${JSON.stringify(row)}`).join(',\n');

  return `// Generated from Open Food Facts on ${snapshotDate} by \`npm run update:off-ukraine\`.
// Database: ODbL 1.0. Individual contents: Database Contents License.
const rows = [
${rows}
];

export const openFoodFactsUkraineSnapshot = rows.map(([
  barcode,
  name,
  brand,
  supermarket,
  calories,
  protein,
  fat,
  carbs,
  aliases,
  sourceCategories,
  sourceUpdatedAt
]) => ({
  id: \`off-ua-\${barcode}\`,
  barcode,
  name,
  brand,
  supermarket,
  category: 'Продукти',
  calories,
  protein,
  fat,
  carbs,
  weight: 100,
  icon: '🛒',
  aliases,
  sourceCategories,
  source: 'openfoodfacts',
  sourceLabel: 'Open Food Facts · Україна',
  sourceUrl: \`https://world.openfoodfacts.org/product/\${barcode}\`,
  sourceUpdatedAt,
  dataQuality: 'database',
  confidence: null,
  warning: 'Дані Open Food Facts. Перевірте КБЖВ на етикетці конкретного товару.'
}));
`;
}

export function renderSnapshotMetaModule(
  products,
  snapshotDate = new Date().toISOString().slice(0, 10),
  combinedCount = products.length
) {
  return [
    '// Generated together with openFoodFactsUkraineSnapshot.js by npm run update:off-ukraine.',
    'export const OPEN_FOOD_FACTS_UKRAINE_SNAPSHOT_META = {',
    "  date: '" + snapshotDate + "',",
    '  count: ' + products.length + ',',
    '  combinedCount: ' + combinedCount + ',',
    "  sourceUrl: 'https://world.openfoodfacts.org/'",
    '};',
    ''
  ].join('\n');
}

function parseArguments(argv) {
  const options = Object.fromEntries(argv.map(argument => {
    const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
    return [key, value];
  }));

  return {
    target: Math.max(1, Number(options.target) || DEFAULT_TARGET),
    pageSize: Math.min(500, Math.max(1, Number(options['page-size']) || DEFAULT_PAGE_SIZE)),
    maxPages: Math.min(20, Math.max(1, Number(options['max-pages']) || 10)),
    delayMs: Math.max(DEFAULT_DELAY_MS, Number(options.delay) || DEFAULT_DELAY_MS),
    output: resolve(options.output || DEFAULT_OUTPUT),
    metaOutput: resolve(options['meta-output'] || DEFAULT_META_OUTPUT)
  };
}

async function fetchPage(searchQuery, page, pageSize, delayMs) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      },
      body: JSON.stringify({
        q: searchQuery,
        fields: REQUEST_FIELDS,
        langs: ['uk', 'ru', 'en'],
        page,
        page_size: pageSize,
        sort_by: '-last_modified_t'
      })
    });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('application/json')) return response.json();

    if (attempt === MAX_ATTEMPTS || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Open Food Facts request failed with HTTP ${response.status}.`);
    }

    const retryDelay = Math.max(delayMs, attempt * 5000);
    console.warn(`Page ${page}: HTTP ${response.status}, retrying in ${Math.round(retryDelay / 1000)} s.`);
    await sleep(retryDelay);
  }

  return null;
}

async function saveSnapshot(options, productsByBarcode) {
  const products = Array.from(productsByBarcode.values()).slice(0, options.target);
  const combinedCount = buildProductCatalog([...productCatalog, ...products]).products.length;
  const snapshotDate = new Date().toISOString().slice(0, 10);
  await Promise.all([
    writeFile(options.output, renderSnapshotModule(products, snapshotDate), 'utf8'),
    writeFile(options.metaOutput, renderSnapshotMetaModule(products, snapshotDate, combinedCount), 'utf8')
  ]);
  return products;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const productsByBarcode = new Map(existingSnapshot.map(product => [product.barcode, product]));
  let requestCount = 0;

  console.log(`Starting with ${productsByBarcode.size} products from the current snapshot.`);
  for (const searchQuery of SEARCH_QUERIES) {
    for (let page = 1; page <= options.maxPages; page += 1) {
      if (requestCount > 0) await sleep(options.delayMs);
      requestCount += 1;

      let response;
      try {
        response = await fetchPage(searchQuery.query, page, options.pageSize, options.delayMs);
      } catch (error) {
        console.warn(`${searchQuery.label}: ${error.message} Moving to the next query.`);
        break;
      }
      const pageProducts = Array.isArray(response?.hits) ? response.hits : [];
      pageProducts.forEach(product => {
        const normalized = normalizeOpenFoodFactsProduct(product);
        if (normalized) productsByBarcode.set(normalized.barcode, normalized);
      });

      console.log(`${searchQuery.label}, page ${page}: ${productsByBarcode.size} valid unique products from ${response?.count || 'unknown'} matches.`);
      await saveSnapshot(options, productsByBarcode);
      if (pageProducts.length < options.pageSize) break;
    }
  }

  const products = await saveSnapshot(options, productsByBarcode);
  if (products.length === 0) throw new Error('Open Food Facts returned no valid Ukrainian products.');

  console.log(`Saved ${products.length} products to ${options.output}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    () => process.exit(0),
    error => {
      console.error(error);
      process.exit(1);
    }
  );
}
