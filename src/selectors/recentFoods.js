const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'];
const MAX_RECENT_FOODS = 12;

const normalizeIdentity = (value = '') => String(value)
  .normalize('NFKC')
  .toLocaleLowerCase('uk-UA')
  .replace(/[’ʼ'`]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function getFoodFromMeal(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const snapshot = meal.foodSnapshot || {};
  const name = String(meal.name || snapshot.name || '').trim();
  const weight = Number(meal.servingGrams ?? meal.weight);
  if (!name || !Number.isFinite(weight) || weight <= 0 || weight > 5000) return null;

  // The saved serving is authoritative: the snapshot can predate manual edits.
  const values = meal.totals || meal;
  const nutrition = {};
  for (const field of NUTRITION_FIELDS) {
    const value = values[field];
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    nutrition[field] = number;
  }

  const brand = String(meal.brand || snapshot.brand || '').trim();
  const barcode = String(meal.barcode || snapshot.barcode || '').trim();
  const per100g = Object.fromEntries(NUTRITION_FIELDS.map(field => [
    field, Number((nutrition[field] * 100 / weight).toFixed(4))
  ]));
  // Keep edited nutrition variants separate, including products with a barcode.
  const identity = barcode
    ? ['barcode', barcode]
    : ['name', normalizeIdentity(name), normalizeIdentity(brand)];
  const key = JSON.stringify([...identity, ...NUTRITION_FIELDS.map(field => per100g[field])]);

  return {
    id: `recent:${key}`,
    name,
    brand,
    barcode,
    weight,
    defaultPortionGrams: weight,
    ...nutrition,
    per100g,
    source: meal.source || snapshot.source || 'manual',
    dataQuality: meal.dataQuality || snapshot.dataQuality || 'unknown',
    confidence: meal.confidence ?? snapshot.confidence ?? null,
    warning: meal.warning ?? snapshot.warning ?? '',
    icon: meal.icon || snapshot.icon || '',
    image: meal.image || snapshot.image || '',
    isRecent: true
  };
}

/** Recent reusable foods, newest serving first, limited to the selected diary day. */
export function getRecentFoods(meals = [], selectedDate = '', limit = MAX_RECENT_FOODS) {
  if (!Array.isArray(meals)) return [];
  const count = Number.isFinite(Number(limit))
    ? Math.min(MAX_RECENT_FOODS, Math.max(0, Math.floor(Number(limit))))
    : MAX_RECENT_FOODS;
  if (count === 0) return [];

  const sortedMeals = meals
    .map((meal, index) => ({ meal, index }))
    .filter(({ meal }) => meal && /^\d{4}-\d{2}-\d{2}$/.test(meal.date || '')
      && (!selectedDate || meal.date <= selectedDate))
    .sort((a, b) => {
      const dayOrder = b.meal.date.localeCompare(a.meal.date);
      if (dayOrder !== 0) return dayOrder;
      const aTime = Date.parse(a.meal.createdAt || '') || 0;
      const bTime = Date.parse(b.meal.createdAt || '') || 0;
      return bTime - aTime || a.index - b.index;
    });

  const foods = [];
  const seen = new Set();
  for (const { meal } of sortedMeals) {
    const food = getFoodFromMeal(meal);
    if (!food || seen.has(food.id)) continue;
    seen.add(food.id);
    foods.push(food);
    if (foods.length >= count) break;
  }
  return foods;
}
