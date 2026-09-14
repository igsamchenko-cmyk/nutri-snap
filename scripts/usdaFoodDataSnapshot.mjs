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

const LOCALIZED_PRIMARY_FOODS = [
  { terms: ['cottage cheese'], label: 'Сир кисломолочний', gender: 'm' },
  { terms: ['chicken'], label: 'Курка', gender: 'f' },
  { terms: ['turkey'], label: 'Індичка', gender: 'f' },
  { terms: ['beef'], label: 'Яловичина', gender: 'f' },
  { terms: ['pork'], label: 'Свинина', gender: 'f' },
  { terms: ['lamb'], label: 'Баранина', gender: 'f' },
  { terms: ['veal'], label: 'Телятина', gender: 'f' },
  { terms: ['duck'], label: 'Качка', gender: 'f' },
  { terms: ['salmon'], label: 'Лосось', gender: 'm' },
  { terms: ['tuna'], label: 'Тунець', gender: 'm' },
  { terms: ['cod'], label: 'Тріска', gender: 'f' },
  { terms: ['herring'], label: 'Оселедець', gender: 'm' },
  { terms: ['mackerel'], label: 'Скумбрія', gender: 'f' },
  { terms: ['sardine'], label: 'Сардина', gender: 'f' },
  { terms: ['shrimp'], label: 'Креветки', gender: 'p' },
  { terms: ['apple'], label: 'Яблуко', gender: 'n' },
  { terms: ['apricot'], label: 'Абрикос', gender: 'm' },
  { terms: ['banana'], label: 'Банан', gender: 'm' },
  { terms: ['blackberry'], label: 'Ожина', gender: 'f' },
  { terms: ['orange'], label: 'Апельсин', gender: 'm' },
  { terms: ['cherry'], label: 'Вишня', gender: 'f' },
  { terms: ['cranberry'], label: 'Журавлина', gender: 'f' },
  { terms: ['grapefruit'], label: 'Грейпфрут', gender: 'm' },
  { terms: ['lemon'], label: 'Лимон', gender: 'm' },
  { terms: ['lime'], label: 'Лайм', gender: 'm' },
  { terms: ['mango'], label: 'Манго', gender: 'n' },
  { terms: ['melon'], label: 'Диня', gender: 'f' },
  { terms: ['pear'], label: 'Груша', gender: 'f' },
  { terms: ['peach'], label: 'Персик', gender: 'm' },
  { terms: ['pineapple'], label: 'Ананас', gender: 'm' },
  { terms: ['plum'], label: 'Слива', gender: 'f' },
  { terms: ['strawberry'], label: 'Полуниця', gender: 'f' },
  { terms: ['blueberry'], label: 'Чорниця', gender: 'f' },
  { terms: ['raspberry'], label: 'Малина', gender: 'f' },
  { terms: ['grape'], label: 'Виноград', gender: 'm' },
  { terms: ['watermelon'], label: 'Кавун', gender: 'm' },
  { terms: ['avocado'], label: 'Авокадо', gender: 'n' },
  { terms: ['asparagus'], label: 'Спаржа', gender: 'f' },
  { terms: ['potato'], label: 'Картопля', gender: 'f' },
  { terms: ['tomato'], label: 'Помідор', gender: 'm' },
  { terms: ['cucumber'], label: 'Огірок', gender: 'm' },
  { terms: ['carrot'], label: 'Морква', gender: 'f' },
  { terms: ['beet'], label: 'Буряк', gender: 'm' },
  { terms: ['cabbage'], label: 'Капуста', gender: 'f' },
  { terms: ['broccoli'], label: 'Броколі', gender: 'p' },
  { terms: ['cauliflower'], label: 'Цвітна капуста', gender: 'f' },
  { terms: ['celery'], label: 'Селера', gender: 'f' },
  { terms: ['corn'], label: 'Кукурудза', gender: 'f' },
  { terms: ['eggplant'], label: 'Баклажан', gender: 'm' },
  { terms: ['onion'], label: 'Цибуля', gender: 'f' },
  { terms: ['garlic'], label: 'Часник', gender: 'm' },
  { terms: ['mushroom'], label: 'Гриби', gender: 'p' },
  { terms: ['spinach'], label: 'Шпинат', gender: 'm' },
  { terms: ['pepper'], label: 'Перець', gender: 'm' },
  { terms: ['pumpkin'], label: 'Гарбуз', gender: 'm' },
  { terms: ['squash', 'zucchini'], label: 'Кабачок', gender: 'm' },
  { terms: ['rice'], label: 'Рис', gender: 'm' },
  { terms: ['buckwheat'], label: 'Гречка', gender: 'f' },
  { terms: ['oatmeal', 'oat'], label: 'Вівсянка', gender: 'f' },
  { terms: ['barley'], label: 'Ячмінь', gender: 'm' },
  { terms: ['millet'], label: 'Пшоно', gender: 'n' },
  { terms: ['quinoa'], label: 'Кіноа', gender: 'f' },
  { terms: ['pasta', 'macaroni'], label: 'Макарони', gender: 'p' },
  { terms: ['spaghetti'], label: 'Спагеті', gender: 'p' },
  { terms: ['noodle'], label: 'Локшина', gender: 'f' },
  { terms: ['milk'], label: 'Молоко', gender: 'n' },
  { terms: ['cheese'], label: 'Сир', gender: 'm' },
  { terms: ['yogurt', 'yoghurt'], label: 'Йогурт', gender: 'm' },
  { terms: ['kefir'], label: 'Кефір', gender: 'm' },
  { terms: ['egg'], label: 'Яйце', gender: 'n' },
  { terms: ['bean'], label: 'Квасоля', gender: 'f' },
  { terms: ['lentil'], label: 'Сочевиця', gender: 'f' },
  { terms: ['chickpea'], label: 'Нут', gender: 'm' },
  { terms: ['pea'], label: 'Горох', gender: 'm' }
];

const PREPARATION_LOCALIZATIONS = [
  { terms: ['braised'], forms: { m: 'тушкований', f: 'тушкована', n: 'тушковане', p: 'тушковані' } },
  { terms: ['boiled'], forms: { m: 'варений', f: 'варена', n: 'варене', p: 'варені' } },
  { terms: ['steamed'], forms: { m: 'на парі', f: 'на парі', n: 'на парі', p: 'на парі' } },
  { terms: ['stewed'], forms: { m: 'тушкований', f: 'тушкована', n: 'тушковане', p: 'тушковані' } },
  { terms: ['sauteed'], forms: { m: 'смажений', f: 'смажена', n: 'смажене', p: 'смажені' } },
  { terms: ['grilled'], forms: { m: 'гриль', f: 'гриль', n: 'гриль', p: 'гриль' } },
  { terms: ['fried'], forms: { m: 'смажений', f: 'смажена', n: 'смажене', p: 'смажені' } },
  { terms: ['baked', 'roasted'], forms: { m: 'запечений', f: 'запечена', n: 'запечене', p: 'запечені' } },
  { terms: ['cooked'], forms: { m: 'приготований', f: 'приготована', n: 'приготоване', p: 'приготовані' } },
  { terms: ['raw'], forms: { m: 'сирий', f: 'сира', n: 'сире', p: 'сирі' } },
  { terms: ['dried', 'dehydrated'], forms: { m: 'сушений', f: 'сушена', n: 'сушене', p: 'сушені' } },
  { terms: ['frozen'], forms: { m: 'заморожений', f: 'заморожена', n: 'заморожене', p: 'заморожені' } },
  { terms: ['canned'], forms: { m: 'консервований', f: 'консервована', n: 'консервоване', p: 'консервовані' } }
];

const SAFE_LOCALIZED_COMPOUNDS = [
  'cottage cheese',
  'rice milk',
  'rice flour',
  'apple juice',
  'orange juice',
  'chicken breast',
  'chicken thigh',
  'chicken drumstick',
  'chicken wing'
];

const COMPOUND_DISH_TERMS = [
  'ball',
  'burger',
  'cake',
  'casserole',
  'cracker',
  'croquette',
  'curry',
  'dip',
  'dressing',
  'fondue',
  'noodle',
  'paper',
  'pie',
  'pizza',
  'pudding',
  'salad',
  'sandwich',
  'sausage',
  'soup',
  'souffle'
];

const FRUIT_AND_VEGETABLE_TERMS = new Set([
  'apple', 'apricot', 'banana', 'blackberry', 'orange', 'cherry', 'cranberry',
  'grapefruit', 'lemon', 'lime', 'mango', 'melon', 'pear', 'peach', 'pineapple',
  'plum', 'strawberry', 'blueberry', 'raspberry', 'grape', 'watermelon', 'avocado',
  'asparagus', 'potato', 'tomato', 'cucumber', 'carrot', 'beet', 'cabbage',
  'broccoli', 'cauliflower', 'celery', 'corn', 'eggplant', 'onion', 'garlic',
  'mushroom', 'spinach', 'pepper', 'pumpkin', 'squash', 'zucchini'
]);

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

const getTermPattern = term => {
  const normalizedTerm = normalizeText(term);
  const pluralForms = [normalizedTerm, `${normalizedTerm}s`, `${normalizedTerm}es`];
  if (/[^aeiou]y$/.test(normalizedTerm)) pluralForms.push(`${normalizedTerm.slice(0, -1)}ies`);
  return pluralForms
    .map(value => value.replace(/[.*+?^$()|[\]\\]/g, '\\$&'))
    .join('|');
};

const hasTerm = (text, term) => new RegExp(`(^| )(${getTermPattern(term)})( |$)`).test(text);
const startsWithTerm = (text, term) => new RegExp(`^(${getTermPattern(term)})( |$)`).test(text);

const uniqueStrings = values => [...new Map(values
  .map(value => String(value || '').trim())
  .filter(Boolean)
  .map(value => [normalizeText(value), value])).values()];

function getPrimaryLocalization(name) {
  const text = normalizeText(name);
  if (['infant', 'baby', 'formula', 'mock', 'imitation', 'nfs', 'ns as to']
    .some(term => text.includes(term))) return null;

  const segments = String(name).split(',').map(normalizeText).filter(Boolean);
  const isFishPrefix = segments[0] === 'fish';
  const leadingText = isFishPrefix
    ? [segments[0], segments[1]].filter(Boolean).join(' ')
    : segments[0] || '';
  const primaryMatches = LOCALIZED_PRIMARY_FOODS.filter(item => (
    item.terms.some(term => hasTerm(leadingText, term))
  ));
  const safeCompound = SAFE_LOCALIZED_COMPOUNDS.some(term => leadingText.startsWith(term));
  if (primaryMatches.length > 1 && !safeCompound) return null;
  if (COMPOUND_DISH_TERMS.some(term => hasTerm(leadingText, term))) return null;

  let primary = primaryMatches.find(item => (
    item.terms.some(term => (
      hasTerm(leadingText, term)
      && (isFishPrefix || startsWithTerm(leadingText, term))
    ))
  ));
  if (!primary) return null;

  let label = primary.label;
  let gender = primary.gender;
  if (primary.terms.includes('chicken')) {
    if (hasTerm(text, 'breast')) [label, gender] = ['Куряча грудка', 'f'];
    else if (hasTerm(text, 'thigh')) [label, gender] = ['Куряче стегно', 'n'];
    else if (hasTerm(text, 'drumstick')) [label, gender] = ['Куряча гомілка', 'f'];
    else if (hasTerm(text, 'wing')) [label, gender] = ['Куряче крило', 'n'];
  } else if (primary.terms.includes('cheese')) {
    if (hasTerm(text, 'cottage')) [label, gender] = ['Сир кисломолочний', 'm'];
    else if (hasTerm(text, 'cheddar')) label = 'Сир чеддер';
    else if (hasTerm(text, 'mozzarella')) label = 'Сир моцарела';
    else if (hasTerm(text, 'parmesan')) label = 'Сир пармезан';
    else if (hasTerm(text, 'ricotta')) label = 'Сир рикота';
    else if (hasTerm(text, 'swiss')) label = 'Сир швейцарський';
    else if (hasTerm(text, 'camembert')) label = 'Сир камамбер';
    else if (hasTerm(text, 'brie')) label = 'Сир брі';
    else if (hasTerm(text, 'colby')) label = 'Сир колбі';
    else if (hasTerm(text, 'gouda')) label = 'Сир гауда';
    else if (hasTerm(text, 'feta')) label = 'Сир фета';
  } else if (primary.terms.includes('milk')) {
    if (hasTerm(text, 'whole')) label = 'Молоко незбиране';
    else if (hasTerm(text, 'skim') || hasTerm(text, 'nonfat')) label = 'Молоко знежирене';
    else if (text.includes('2 ')) label = 'Молоко 2%';
    else if (text.includes('1 ')) label = 'Молоко 1%';
  } else if (primary.terms.includes('rice')) {
    if (hasTerm(leadingText, 'milk')) [label, gender] = ['Рисове молоко', 'n'];
    else if (hasTerm(leadingText, 'flour')) [label, gender] = ['Рисове борошно', 'n'];
    else if (hasTerm(text, 'brown')) label = 'Рис коричневий';
    else if (hasTerm(text, 'white')) label = 'Рис білий';
  } else if (primary.terms.includes('buckwheat') && hasTerm(leadingText, 'flour')) {
    [label, gender] = ['Гречане борошно', 'n'];
  } else if (primary.terms.includes('potato') && hasTerm(text, 'mashed')) {
    [label, gender] = ['Картопляне пюре', 'n'];
  } else if (primary.terms.includes('apple') && hasTerm(leadingText, 'juice')) {
    [label, gender] = ['Яблучний сік', 'm'];
  } else if (primary.terms.includes('orange') && hasTerm(leadingText, 'juice')) {
    [label, gender] = ['Апельсиновий сік', 'm'];
  }

  return { label, gender, leadingText, primaryTerms: primary.terms, text };
}

export function getUsdaLocalizedName(name = '') {
  const localization = getPrimaryLocalization(name);
  if (!localization) return '';

  const preparation = PREPARATION_LOCALIZATIONS.find(item => (
    item.terms.some(term => hasTerm(localization.text, term))
  ));
  const details = [];
  if (preparation) details.push(preparation.forms[localization.gender]);
  if (localization.text.includes('skinless') || localization.text.includes('skin not eaten')) details.push('без шкіри');
  else if (localization.text.includes('skin eaten')) details.push('зі шкірою');
  if (localization.text.includes('boneless')) details.push('без кістки');
  if (localization.text.includes('no added fat')) details.push('без доданого жиру');

  return [localization.label, ...uniqueStrings(details)].join(', ');
}

export function getUsdaSearchPriority(name, dataset, displayName, productType, sourceCategory = '') {
  const text = normalizeText(name);
  const nameSegments = String(name).split(',').map(normalizeText).filter(Boolean);
  const leadingText = nameSegments[0] === 'fish'
    ? nameSegments.slice(0, 2).join(' ')
    : nameSegments[0] || '';
  const category = normalizeText(sourceCategory);
  const datasetScore = { foundation: 300, fndds: 250, 'sr-legacy': 150 }[dataset.key] || 0;
  const tokenCount = text.split(' ').filter(Boolean).length;
  const commaCount = (String(name).match(/,/g) || []).length;
  let score = datasetScore + Math.max(0, 240 - tokenCount * 12) - commaCount * 20;

  if (displayName) score += 1000;
  else score -= 300;
  if (
    LOCALIZED_PRIMARY_FOODS.some(item => item.terms.some(term => leadingText === term))
    || (leadingText.startsWith('fish ') && displayName)
  ) score += 350;
  if (hasTerm(text, 'raw')) score += 120;
  if (commaCount === 0 && tokenCount <= 2) score += 60;
  if (productType === 'Інше') score -= 100;
  if (productType === 'Готові страви') score -= 350;
  if (productType === 'Соуси' || productType === 'Солодощі') score -= 250;
  if (/\b(infant|baby|formula)\b/.test(text) || category.includes('baby food')) score -= 2000;
  if (/\b(mock|imitation)\b/.test(text)) score -= 700;
  if (/\b(fast food|restaurant|store brand|school)\b/.test(text)) score -= 450;
  if (/\b(nfs|ns as to)\b/.test(text)) score -= 250;
  if (/\b(skin|feet|back|tail|cider|pie filling|candied|salad|cake|paper|croquette|pilaf|dressing|dip|fondue|souffle)\b/.test(text)) score -= 550;
  if (/^Рис(?:\s|,|$)/u.test(displayName) && /\b(milk|flour|noodle|cracker|cake|paper|croquette|pudding)\b/.test(text)) score -= 900;
  if (/^Рис(?:\s|,|$)/u.test(displayName) && (
    /\b(fried|sweet|honey)\b/.test(text)
    || /\bwith (milk|chicken|pork|beef|shrimp|vegetable)\b/.test(text)
  )) score -= 650;
  if (/^Рис(?:\s|,|$)/u.test(displayName) && /\b(glutinous|as ingredient|made with)\b/.test(text)) score -= 120;
  if (/^Кур/.test(displayName) && /\b(salad|soup|sausage|sandwich|casserole|pie|pizza|orange)\b/.test(text)) score -= 900;
  if (/^Сир(?:\s|,|$)/u.test(displayName) && /\b(ball|dip|fondue|souffle|sauce|pastry)\b/.test(text)) score -= 900;
  if (/^Куряча грудка/.test(displayName) && /\b(raw|skinless|boneless|meat only)\b/.test(text)) score += 180;
  if (text.includes('skin not eaten') || text.includes('skinless')) score += 40;

  return Math.round(score);
}

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

  const leadingName = String(name).split(',')[0];
  const leadingText = normalizeText(leadingName);
  const primaryLocalization = getPrimaryLocalization(name);
  if (/^(rice|oat|almond|soy) milk\b/.test(leadingText)) return 'Напої';
  if (categoryText.includes('fruit') && !hasTerm(leadingText, 'juice')) return 'Овочі та фрукти';
  if (categoryText.includes('vegetable')) return 'Овочі та фрукти';
  if (categoryText.includes('legume')) return 'Бобові';
  if (categoryText.includes('nut and seed')) return 'Снеки';
  if (primaryLocalization?.primaryTerms.some(term => FRUIT_AND_VEGETABLE_TERMS.has(term))) return 'Овочі та фрукти';
  if (hasTerm(leadingText, 'sweet potato')) return 'Овочі та фрукти';
  if (/^(chicken|turkey|beef|pork|lamb|veal|duck)\b/.test(leadingText)) return 'М’ясо та птиця';
  if (/^(fish|salmon|tuna|cod|herring|mackerel|sardine|shrimp)\b/.test(leadingText)) return 'Риба та морепродукти';
  if (/^(rice|buckwheat|oat|oatmeal|barley|millet|quinoa|pasta|macaroni|spaghetti|noodle)\b/.test(leadingText)) return 'Крупи та макарони';
  if (/^(milk|cheese|yogurt|yoghurt|kefir)\b/.test(leadingText)) return 'Молочне';

  const nameType = inferProductType({ name: leadingName });
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
  const displayName = getUsdaLocalizedName(name);
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
    searchAliases: uniqueStrings([
      ...getUsdaSearchAliases(name),
      displayName.split(',')[0],
      displayName
    ]),
    displayName,
    searchPriority: getUsdaSearchPriority(name, dataset, displayName, productType, sourceCategory),
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
    product.displayName,
    product.searchPriority,
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
  displayName,
  searchPriority,
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
  displayName,
  searchPriority,
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
