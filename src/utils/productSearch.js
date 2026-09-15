import { normalizeProductSearchText } from '../data/products/catalogPipeline.js';

const foodSearchIndexCache = new WeakMap();

const getAliases = food => (
  Array.isArray(food?.aliases)
    ? food.aliases
    : String(food?.aliases || '').split(';')
).map(normalizeProductSearchText).filter(Boolean);

const getSearchAliases = food => [
  ...getAliases(food),
  ...(Array.isArray(food?.searchAliases) ? food.searchAliases : [food?.searchAliases])
    .map(normalizeProductSearchText)
    .filter(Boolean)
];

const getTokens = value => normalizeProductSearchText(value).split(/\s+/).filter(Boolean);
const hasCyrillic = value => /[а-яіїєґ]/i.test(value);
const hasUkrainianLetters = value => /[іїєґ]/i.test(value);
const isPersonalProduct = food => Boolean(
  food?.isCustom
  || food?.isCustomBarcode
  || food?.isLearned
  || food?.source === 'manual'
  || food?.dataQuality === 'manual'
);

function getFoodSearchIndex(food) {
  const canCache = food !== null && typeof food === 'object';
  const cachedIndex = canCache ? foodSearchIndexCache.get(food) : null;
  if (cachedIndex) return cachedIndex;

  const name = normalizeProductSearchText(food?.name);
  const displayName = normalizeProductSearchText(food?.displayName);
  const brand = normalizeProductSearchText(food?.brand);
  const barcode = String(food?.barcode || '').trim();
  const aliases = getSearchAliases(food);
  const searchIndex = {
    name,
    displayName,
    brand,
    barcode,
    aliases,
    aliasText: aliases.join(' '),
    nameTokens: getTokens(name),
    text: normalizeProductSearchText([
      food?.name,
      food?.displayName,
      food?.brand,
      food?.supermarket,
      food?.category,
      food?.productType,
      food?.barcode,
      ...(Array.isArray(food?.aliases) ? food.aliases : [food?.aliases]),
      ...(Array.isArray(food?.searchAliases) ? food.searchAliases : [food?.searchAliases]),
      ...(Array.isArray(food?.taxonomyAliases) ? food.taxonomyAliases : [food?.taxonomyAliases]),
      food?.searchText
    ].filter(Boolean).join(' '))
  };

  if (canCache) foodSearchIndexCache.set(food, searchIndex);
  return searchIndex;
}

export const getFoodSearchText = food => getFoodSearchIndex(food).text;

export function getProductQueryMatchScore(food, query, queryIsNormalized = false) {
  const normalizedQuery = queryIsNormalized ? query : normalizeProductSearchText(query);
  if (!normalizedQuery) return 0;

  const {
    name,
    displayName,
    brand,
    barcode,
    aliases,
    aliasText,
    nameTokens
  } = getFoodSearchIndex(food);
  const queryTokens = getTokens(normalizedQuery);
  let score = 0;

  if (barcode && barcode === normalizedQuery.replace(/\s+/g, '')) score += 50000;
  if (name === normalizedQuery) score += 20000;
  else if (name.startsWith(normalizedQuery)) score += 12000;
  else if (queryTokens.every(token => name.includes(token))) score += 8000;

  if (displayName === normalizedQuery) score += 19000;
  else if (displayName.startsWith(normalizedQuery)) score += 11000;
  else if (displayName && queryTokens.every(token => displayName.includes(token))) score += 7500;

  if (aliases.includes(normalizedQuery)) score += 18000;
  else if (aliases.some(alias => alias.startsWith(normalizedQuery))) score += 10000;
  else if (aliases.some(alias => queryTokens.every(token => alias.includes(token)))) score += 7000;
  else if (queryTokens.every(token => aliasText.includes(token))) score += 6000;

  if (brand === normalizedQuery) score += 6000;
  else if (brand.startsWith(normalizedQuery)) score += 3500;

  if (queryTokens.length > 0 && queryTokens.every(token => nameTokens.includes(token))) score += 900;
  if (hasCyrillic(normalizedQuery) && hasCyrillic(name)) score += 160;
  if (hasCyrillic(normalizedQuery) && hasUkrainianLetters(name)) score += 60;
  if (barcode.startsWith('482')) score += 20;

  return score;
}

export function rankFoodSearchResults(
  foods = [],
  query = '',
  getAdditionalScore = () => 0,
  queryIsNormalized = false
) {
  const normalizedQuery = queryIsNormalized ? query : normalizeProductSearchText(query);
  if (!normalizedQuery) return [...foods];

  return foods
    .map((food, index) => ({
      food,
      index,
      score: (Number(getAdditionalScore(food)) || 0)
        + getProductQueryMatchScore(food, normalizedQuery, true)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(candidate => candidate.food);
}

const nutritionSignature = food => ['calories', 'protein', 'fat', 'carbs']
  .map(field => Math.round(Number(food?.[field]) * 10) / 10)
  .join('|');

const hasCompleteNutrition = food => ['calories', 'protein', 'fat', 'carbs']
  .every(field => Number.isFinite(Number(food?.[field])));

function getReliableNameScore(query, food) {
  const name = normalizeProductSearchText(food?.name);
  const aliases = getAliases(food);
  if (!name) return 0;

  let score = 0;
  if (name === query) score = 100;
  else if (aliases.includes(query)) score = 98;
  else {
    const queryTokens = getTokens(query);
    const candidates = [name, ...aliases];
    if (queryTokens.length >= 2 && candidates.some(candidate => {
      const candidateTokens = getTokens(candidate);
      return queryTokens.every(token => candidateTokens.includes(token))
        && candidateTokens.length <= queryTokens.length + 2;
    })) {
      score = 80;
    }
  }

  if (score > 0 && isPersonalProduct(food)) score += 10;
  return score;
}

export function findReliableFoodMatchByName(foodName, foods = []) {
  const query = normalizeProductSearchText(foodName);
  if (!query) return null;

  const candidates = foods
    .filter(hasCompleteNutrition)
    .map((food, index) => ({ food, index, score: getReliableNameScore(query, food) }))
    .filter(candidate => candidate.score >= 80)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const competing = candidates.filter(candidate => best.score - candidate.score < 5);
  const nutritionVariants = new Set(competing.map(candidate => nutritionSignature(candidate.food)));
  if (nutritionVariants.size > 1) return null;

  return best.food;
}
