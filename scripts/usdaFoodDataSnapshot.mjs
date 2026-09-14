import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { buildProductCatalog } from '../src/data/products/catalogPipeline.js';
import { productCatalog } from '../src/data/products/index.js';
import { openFoodFactsUkraineSnapshot } from '../src/data/products/openFoodFactsUkraineSnapshot.js';
import { inferProductType } from '../src/data/products/productType.js';

const DEFAULT_OUTPUT = resolve('src/data/products/usdaFoodDataSnapshot.js');
const DEFAULT_META_OUTPUT = resolve('src/data/products/usdaFoodDataSnapshotMeta.js');
const SOURCE_URL = 'https://fdc.nal.usda.gov/';
const USER_AGENT = 'NutriSnap/1.7 (https://github.com/igsamchenko-cmyk/nutri-snap)';

export const USDA_DATASETS = [
  {
    key: 'foundation',
    label: 'Foundation Foods',
    date: '2026-04-30',
    collection: 'FoundationFoods',
    source: 'usda-foundation',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip',
    localPath: 'foundation_food_json_2026-04-30/FoodData_Central_foundation_food_json_2026-04-30.json'
  },
  {
    key: 'fndds',
    label: 'FNDDS 2021-2023',
    date: '2024-10-31',
    collection: 'SurveyFoods',
    source: 'usda-fndds',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip',
    localPath: 'survey_food_json_2024-10-31/surveyDownload.json'
  },
  {
    key: 'sr-legacy',
    label: 'SR Legacy',
    date: '2018-04',
    collection: 'SRLegacyFoods',
    source: 'usda-sr-legacy',
    url: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip',
    localPath: 'sr_legacy_food_json_2018-04/FoodData_Central_sr_legacy_food_json_2018-04.json'
  }
];

const SEARCH_ALIASES = [
  [['apple'], ['яблуко', 'яблука']],
  [['apricot'], ['абрикос']],
  [['avocado'], ['авокадо']],
  [['banana'], ['банан']],
  [['blackberry'], ['ожина']],
  [['blueberry'], ['чорниця', 'лохина']],
  [['cherry', 'cherries'], ['вишня', 'черешня']],
  [['cranberry'], ['журавлина']],
  [['grape'], ['виноград']],
  [['grapefruit'], ['грейпфрут']],
  [['lemon'], ['лимон']],
  [['lime'], ['лайм']],
  [['mango'], ['манго']],
  [['melon'], ['диня']],
  [['orange'], ['апельсин']],
  [['peach'], ['персик']],
  [['pear'], ['груша']],
  [['pineapple'], ['ананас']],
  [['plum'], ['слива']],
  [['raspberry'], ['малина']],
  [['strawberry'], ['полуниця']],
  [['watermelon'], ['кавун']],
  [['asparagus'], ['спаржа']],
  [['beet'], ['буряк']],
  [['broccoli'], ['броколі']],
  [['cabbage'], ['капуста']],
  [['carrot'], ['морква']],
  [['cauliflower'], ['цвітна капуста']],
  [['celery'], ['селера']],
  [['corn'], ['кукурудза']],
  [['cucumber'], ['огірок']],
  [['eggplant'], ['баклажан']],
  [['garlic'], ['часник']],
  [['mushroom'], ['гриб', 'гриби']],
  [['onion'], ['цибуля']],
  [['pepper'], ['перець']],
  [['potato'], ['картопля']],
  [['pumpkin'], ['гарбуз']],
  [['spinach'], ['шпинат']],
  [['squash', 'zucchini'], ['кабачок']],
  [['tomato'], ['помідор', 'томат']],
  [['rice'], ['рис']],
  [['buckwheat'], ['гречка']],
  [['oat', 'oatmeal'], ['овес', 'вівсянка']],
  [['wheat'], ['пшениця']],
  [['barley'], ['ячмінь']],
  [['millet'], ['пшоно']],
  [['quinoa'], ['кіноа']],
  [['pasta', 'macaroni', 'spaghetti'], ['макарони']],
  [['noodle'], ['локшина']],
  [['bread'], ['хліб']],
  [['flour'], ['борошно']],
  [['chicken'], ['курка', 'курятина', 'курячий', 'куряча']],
  [['turkey'], ['індичка', 'індичатина']],
  [['beef'], ['яловичина']],
  [['pork'], ['свинина']],
  [['lamb'], ['баранина']],
  [['veal'], ['телятина']],
  [['duck'], ['качка']],
  [['bacon'], ['бекон']],
  [['ham'], ['шинка']],
  [['sausage'], ['ковбаса']],
  [['liver'], ['печінка']],
  [['breast'], ['грудка']],
  [['thigh'], ['стегно']],
  [['drumstick'], ['гомілка']],
  [['wing'], ['крило']],
  [['fillet'], ['філе']],
  [['salmon'], ['лосось']],
  [['tuna'], ['тунець']],
  [['cod'], ['тріска']],
  [['herring'], ['оселедець']],
  [['mackerel'], ['скумбрія']],
  [['sardine'], ['сардина']],
  [['shrimp'], ['креветка', 'креветки']],
  [['fish'], ['риба']],
  [['milk'], ['молоко']],
  [['cottage cheese'], ['кисломолочний сир', 'творог']],
  [['cheese'], ['сир']],
  [['yogurt', 'yoghurt'], ['йогурт']],
  [['kefir'], ['кефір']],
  [['cream'], ['вершки']],
  [['butter'], ['вершкове масло']],
  [['egg'], ['яйце', 'яйця']],
  [['bean'], ['квасоля']],
  [['lentil'], ['сочевиця']],
  [['chickpea'], ['нут']],
  [['pea'], ['горох']],
  [['soybean'], ['соя']],
  [['almond'], ['мигдаль']],
  [['walnut'], ['волоський горіх']],
  [['peanut'], ['арахіс']],
  [['cashew'], ['кеш’ю']],
  [['hazelnut'], ['фундук']],
  [['sugar'], ['цукор']],
  [['honey'], ['мед']],
  [['chocolate'], ['шоколад']],
  [['coffee'], ['кава']],
  [['tea'], ['чай']],
  [['water'], ['вода']],
  [['juice'], ['сік']],
  [['beer'], ['пиво']],
  [['wine'], ['вино']],
  [['oil'], ['олія']],
  [['soup'], ['суп']],
  [['pizza'], ['піца']],
  [['burger'], ['бургер']],
  [['sandwich'], ['сендвіч', 'бутерброд']],
  [['raw'], ['сирий', 'сира']],
  [['cooked'], ['приготований', 'приготована', 'готовий', 'готова']],
  [['boiled'], ['варений', 'варена']],
  [['baked'], ['запечений', 'запечена']],
  [['fried'], ['смажений', 'смажена']],
  [['roasted'], ['печений', 'печена']],
  [['grilled'], ['гриль']],
  [['canned'], ['консервований']],
  [['frozen'], ['заморожений']],
  [['dried', 'dehydrated'], ['сушений']],
  [['without skin', 'skinless'], ['без шкіри']],
  [['boneless'], ['без кістки']],
  [['low fat', 'low-fat'], ['нежирний']]
];

const CATEGORY_TYPES = [
  ['Готові страви', ['mixed dish', 'pizza', 'sandwich', 'burger', 'fast food', 'restaurant food', 'omelet']],
  ['Соуси', ['sauce', 'gravy', 'condiment', 'salad dressing']],
  ['Яйця', ['egg']],
  ['Молочне', ['milk', 'dairy', 'cheese', 'yogurt']],
  ['Риба та морепродукти', ['fish', 'seafood', 'shellfish']],
  ['М’ясо та птиця', ['meat', 'chicken', 'poultry', 'beef', 'pork', 'lamb', 'veal', 'game', 'sausage']],
  ['Напої', ['beverage', 'coffee', 'tea', 'juice', 'water', 'liquor', 'cocktail']],
  ['Олії та жири', ['fat', 'oil']],
  ['Бобові', ['bean', 'pea', 'legume']],
  ['Солодощі', ['sweet', 'cookie', 'brownie', 'cake', 'pie', 'candy', 'sugar', 'dessert']],
  ['Снеки', ['snack', 'nut', 'seed', 'popcorn', 'pretzel']],
  ['Хліб і випічка', ['bread', 'baked product', 'doughnut', 'pastry']],
  ['Крупи та макарони', ['cereal', 'grain', 'pasta', 'rice', 'noodle']],
  ['Овочі та фрукти', ['vegetable', 'fruit']]
];

const normalizeText = value => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('en-US')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const hasTerm = (text, term) => {
  const normalizedTerm = normalizeText(term);
  const escapedTerm = normalizedTerm.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escapedTerm}(s|es)?( |$)`).test(text);
};

const uniqueStrings = values => [...new Map(values
  .map(value => String(value || '').trim())
  .filter(Boolean)
  .map(value => [normalizeText(value), value])).values()];

const roundNutrition = value => Math.round(Number(value) * 10) / 10;

function getNutrient(food, id) {
  const value = food?.foodNutrients?.find(entry => entry?.nutrient?.id === id)?.amount;
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function getSourceCategory(food) {
  return String(
    food?.foodCategory?.description
    || food?.wweiaFoodCategory?.wweiaFoodCategoryDescription
    || ''
  ).trim();
}

function inferUsdaProductType(name, sourceCategory) {
  const categoryText = normalizeText(sourceCategory);
  const preparedCategory = CATEGORY_TYPES[0][1].some(term => categoryText.includes(term));
  if (preparedCategory) return CATEGORY_TYPES[0][0];

  const nameType = inferProductType({ name });
  if (nameType !== 'Інше') return nameType;
  return CATEGORY_TYPES.find(([, terms]) => terms.some(term => categoryText.includes(term)))?.[0] || 'Інше';
}

function inferPreparationState(name, productType) {
  const text = normalizeText(name);
  if (hasTerm(text, 'frozen')) return 'frozen';
  if (['dry', 'dried', 'dehydrated', 'powder'].some(term => hasTerm(text, term))) return 'dry';
  if (hasTerm(text, 'raw')) return 'raw';
  if (['cooked', 'boiled', 'baked', 'fried', 'roasted', 'grilled', 'braised', 'steamed']
    .some(term => hasTerm(text, term))) return 'cooked';
  if (productType === 'Готові страви') return 'prepared';
  return 'unspecified';
}

function getDefaultWeight(food) {
  const portion = food?.foodPortions?.find(item => {
    const grams = Number(item?.gramWeight);
    const description = normalizeText(item?.portionDescription || item?.modifier);
    return grams >= 5
      && grams <= 1000
      && description
      && !description.startsWith('guideline amount')
      && description !== 'quantity not specified';
  });
  return portion ? Math.round(Number(portion.gramWeight) * 10) / 10 : 100;
}

export function getUsdaSearchAliases(name = '') {
  const text = normalizeText(name);
  const aliases = uniqueStrings(SEARCH_ALIASES
    .filter(([terms]) => terms.some(term => hasTerm(text, term)))
    .flatMap(([, aliases]) => aliases));
  return hasTerm(text, 'grape') && hasTerm(text, 'tomato')
    ? aliases.filter(alias => alias !== 'виноград')
    : aliases;
}

export function normalizeUsdaFood(food = {}, dataset = USDA_DATASETS[0]) {
  const fdcId = Number(food?.fdcId);
  const name = String(food?.description || '').trim();
  const sourceCategory = getSourceCategory(food);
  const [calories, protein, fat, carbs] = [1008, 1003, 1004, 1005].map(id => getNutrient(food, id));
  const nutrition = [calories, protein, fat, carbs];

  if (!Number.isInteger(fdcId) || !name || nutrition.some(value => !Number.isFinite(value) || value < 0)) return null;
  if (calories > 1000 || protein > 100 || fat > 100 || carbs > 100 || protein + fat + carbs > 105) return null;

  const productType = inferUsdaProductType(name, sourceCategory);
  const per100g = {
    calories: roundNutrition(calories),
    protein: roundNutrition(protein),
    fat: roundNutrition(fat),
    carbs: roundNutrition(carbs)
  };
  return {
    id: `usda-${fdcId}`,
    name,
    brand: 'USDA',
    category: 'Продукти',
    ...per100g,
    nutritionBasis: '100g',
    per100g,
    weight: getDefaultWeight(food),
    icon: '🥗',
    aliases: [],
    searchAliases: getUsdaSearchAliases(name),
    taxonomyAliases: uniqueStrings([productType]),
    sourceCategories: sourceCategory ? [sourceCategory] : [],
    productType,
    preparationState: inferPreparationState(name, productType),
    datasetKey: dataset.key,
    source: dataset.source,
    sourceLabel: 'USDA FoodData Central',
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
    sourceUpdatedAt: dataset.date,
    dataQuality: 'database',
    confidence: null,
    warning: 'Дані USDA FoodData Central на 100 г. Перевірте опис продукту та стан приготування.'
  };
}

export async function readUsdaDataset(dataset, options = {}) {
  if (options.inputDir) {
    const content = await readFile(resolve(options.inputDir, dataset.localPath), 'utf8');
    return JSON.parse(content)[dataset.collection].filter(Boolean);
  }

  const response = await (options.fetchImpl || fetch)(dataset.url, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!response.ok) throw new Error(`USDA ${dataset.label} download failed with HTTP ${response.status}.`);

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const jsonFilename = Object.keys(archive).find(filename => filename.toLowerCase().endsWith('.json'));
  if (!jsonFilename) throw new Error(`USDA ${dataset.label} archive contains no JSON file.`);
  return JSON.parse(strFromU8(archive[jsonFilename]))[dataset.collection].filter(Boolean);
}

function productToRow(product) {
  return [
    Number(product.id.replace('usda-', '')),
    product.name,
    product.sourceCategories[0] || '',
    product.calories,
    product.protein,
    product.fat,
    product.carbs,
    product.weight,
    product.searchAliases,
    product.productType,
    product.preparationState,
    product.datasetKey
  ];
}

export function renderUsdaSnapshotModule(products, snapshotDate = new Date().toISOString().slice(0, 10)) {
  const rows = products.map(productToRow).map(row => `  ${JSON.stringify(row)}`).join(',\n');
  return `// Generated from USDA FoodData Central on ${snapshotDate} by npm run update:usda.
// USDA FoodData Central data are public domain under CC0 1.0.
const DATASETS = {
  foundation: { source: 'usda-foundation', date: '2026-04-30' },
  fndds: { source: 'usda-fndds', date: '2024-10-31' },
  'sr-legacy': { source: 'usda-sr-legacy', date: '2018-04' }
};

const rows = [
${rows}
];

export const usdaFoodDataSnapshot = rows.map(([
  fdcId,
  name,
  sourceCategory,
  calories,
  protein,
  fat,
  carbs,
  weight,
  searchAliases,
  productType,
  preparationState,
  datasetKey
]) => ({
  id: 'usda-' + fdcId,
  name,
  brand: 'USDA',
  category: 'Продукти',
  calories,
  protein,
  fat,
  carbs,
  weight,
  nutritionBasis: '100g',
  per100g: { calories, protein, fat, carbs },
  icon: '🥗',
  aliases: [],
  searchAliases,
  taxonomyAliases: [productType],
  sourceCategories: sourceCategory ? [sourceCategory] : [],
  productType,
  preparationState,
  datasetKey,
  source: DATASETS[datasetKey].source,
  sourceLabel: 'USDA FoodData Central',
  sourceUrl: 'https://fdc.nal.usda.gov/food-details/' + fdcId + '/nutrients',
  sourceUpdatedAt: DATASETS[datasetKey].date,
  dataQuality: 'database',
  confidence: null,
  warning: 'Дані USDA FoodData Central на 100 г. Перевірте опис продукту та стан приготування.'
}));
`;
}

export function renderUsdaSnapshotMetaModule({
  products,
  datasetCounts,
  inputCount,
  skippedCount,
  combinedCount,
  snapshotDate = new Date().toISOString().slice(0, 10)
}) {
  return `// Generated together with usdaFoodDataSnapshot.js by npm run update:usda.
export const USDA_FOOD_DATA_SNAPSHOT_META = {
  date: '${snapshotDate}',
  count: ${products.length},
  inputCount: ${inputCount},
  skippedCount: ${skippedCount},
  combinedCount: ${combinedCount},
  datasetCounts: ${JSON.stringify(datasetCounts)},
  sourceUrl: '${SOURCE_URL}'
};
`;
}

function parseArguments(argv) {
  const options = Object.fromEntries(argv.map(argument => {
    const [key, value = 'true'] = argument.replace(/^--/, '').split('=');
    return [key, value];
  }));
  return {
    inputDir: options['input-dir'] ? resolve(options['input-dir']) : '',
    output: resolve(options.output || DEFAULT_OUTPUT),
    metaOutput: resolve(options['meta-output'] || DEFAULT_META_OUTPUT)
  };
}

export async function createUsdaSnapshot(options = {}) {
  const normalized = [];
  let inputCount = 0;
  let skippedCount = 0;

  for (const dataset of USDA_DATASETS) {
    console.log(`Loading USDA ${dataset.label}...`);
    const foods = await readUsdaDataset(dataset, options);
    inputCount += foods.length;
    for (const food of foods) {
      const product = normalizeUsdaFood(food, dataset);
      if (product) normalized.push(product);
      else skippedCount += 1;
    }
  }

  const catalogBuild = buildProductCatalog(normalized);
  const products = catalogBuild.products;
  const datasetCounts = Object.fromEntries(USDA_DATASETS.map(dataset => [
    dataset.key,
    products.filter(product => product.datasetKey === dataset.key).length
  ]));
  const combinedCount = buildProductCatalog([
    ...productCatalog,
    ...openFoodFactsUkraineSnapshot,
    ...products
  ]).products.length;
  const snapshotDate = new Date().toISOString().slice(0, 10);

  await writeFile(options.output || DEFAULT_OUTPUT, renderUsdaSnapshotModule(products, snapshotDate), 'utf8');
  await writeFile(options.metaOutput || DEFAULT_META_OUTPUT, renderUsdaSnapshotMetaModule({
    products,
    datasetCounts,
    inputCount,
    skippedCount,
    combinedCount,
    snapshotDate
  }), 'utf8');

  return { products, datasetCounts, inputCount, skippedCount, combinedCount, diagnostics: catalogBuild.diagnostics };
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const options = parseArguments(process.argv.slice(2));
  createUsdaSnapshot(options)
    .then(result => {
      console.log(`Saved ${result.products.length} USDA products from ${result.inputCount} source rows.`);
      console.log(`Skipped ${result.skippedCount} incomplete rows and merged ${result.diagnostics.duplicateCount} duplicates.`);
      console.log(`Combined catalogue: ${result.combinedCount} products.`);
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
