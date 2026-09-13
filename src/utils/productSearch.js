import { normalizeProductSearchText } from '../data/products/catalogPipeline.js';

const getAliases = food => (
  Array.isArray(food?.aliases)
    ? food.aliases
    : String(food?.aliases || '').split(';')
).map(normalizeProductSearchText).filter(Boolean);

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

export const getFoodSearchText = food => normalizeProductSearchText([
  food?.name,
  food?.brand,
  food?.supermarket,
  food?.category,
  food?.barcode,
  ...(Array.isArray(food?.aliases) ? food.aliases : [food?.aliases]),
  food?.searchText
].filter(Boolean).join(' '));

export function getProductQueryMatchScore(food, query) {
  const normalizedQuery = normalizeProductSearchText(query);
  if (!normalizedQuery) return 0;

  const name = normalizeProductSearchText(food?.name);
  const brand = normalizeProductSearchText(food?.brand);
  const barcode = String(food?.barcode || '').trim();
  const aliases = getAliases(food);
  const queryTokens = getTokens(normalizedQuery);
  const nameTokens = getTokens(name);
  let score = 0;

  if (barcode && barcode === normalizedQuery.replace(/\s+/g, '')) score += 50000;
  if (name === normalizedQuery) score += 20000;
  else if (name.startsWith(normalizedQuery)) score += 12000;
  else if (queryTokens.every(token => name.includes(token))) score += 8000;

  if (aliases.includes(normalizedQuery)) score += 18000;
  else if (aliases.some(alias => alias.startsWith(normalizedQuery))) score += 10000;
  else if (aliases.some(alias => queryTokens.every(token => alias.includes(token)))) score += 7000;

  if (brand === normalizedQuery) score += 6000;
  else if (brand.startsWith(normalizedQuery)) score += 3500;

  if (queryTokens.length > 0 && queryTokens.every(token => nameTokens.includes(token))) score += 900;
  if (hasCyrillic(normalizedQuery) && hasCyrillic(name)) score += 160;
  if (hasCyrillic(normalizedQuery) && hasUkrainianLetters(name)) score += 60;
  if (barcode.startsWith('482')) score += 20;

  return score;
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
