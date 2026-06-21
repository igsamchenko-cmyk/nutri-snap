import { normalizeMealEntries, sumMealTotals } from '../models/food';

const DEFAULT_TOTALS = { calories: 0, protein: 0, fat: 0, carbs: 0 };
const LEGACY_SNACK_CATEGORY = '\u041f\u0435\u0440\u0435\u043a\u0443\u0441';
const FIRST_SNACK_CATEGORY = '\u041f\u0435\u0440\u0448\u0438\u0439 \u043f\u0435\u0440\u0435\u043a\u0443\u0441';

function toSafeMeals(meals = []) {
  // Selectors normalize internally so legacy, MealEntry, and mixed arrays are safe inputs.
  return normalizeMealEntries(meals);
}

function toDate(value = new Date()) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? new Date() : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function addDays(date, amount) {
  const next = toDate(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateKey(value = new Date()) {
  const date = toDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function roundMacro(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function normalizeUsageKey(value = '') {
  return String(value).toLowerCase().replace(/[\u2019'`]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeMealCategory(category = '') {
  return category === LEGACY_SNACK_CATEGORY ? FIRST_SNACK_CATEGORY : String(category || '');
}

export function getMealsByDate(meals = [], date = '') {
  const targetDate = String(date || '');
  return toSafeMeals(meals).filter(meal => meal.date === targetDate);
}

export function getMealsByCategory(meals = [], date = '') {
  const sourceMeals = date ? getMealsByDate(meals, date) : toSafeMeals(meals);

  return sourceMeals.reduce((groups, meal) => {
    const category = normalizeMealCategory(meal.category || meal.mealType);
    if (!category) return groups;
    if (!groups[category]) groups[category] = [];
    groups[category].push(meal);
    return groups;
  }, {});
}

export function getDailyTotals(meals = [], date = '') {
  const sourceMeals = date ? getMealsByDate(meals, date) : toSafeMeals(meals);
  return sumMealTotals(sourceMeals);
}

export function getCategoryTotals(meals = [], date = '') {
  const groups = getMealsByCategory(meals, date);

  return Object.fromEntries(
    Object.entries(groups).map(([category, categoryMeals]) => [
      category,
      sumMealTotals(categoryMeals)
    ])
  );
}

export function getMealsForDateRange(meals = [], startDate = '', endDate = '') {
  const start = String(startDate || '');
  const end = String(endDate || '');
  if (!start || !end) return [];

  const [minDate, maxDate] = start <= end ? [start, end] : [end, start];
  return toSafeMeals(meals).filter(meal => meal.date >= minDate && meal.date <= maxDate);
}

export function getWeeklyTotals(meals = [], endDateOrSelectedDate = new Date(), options = {}) {
  const endDate = toDate(endDateOrSelectedDate);
  const waterIntake = options.waterIntake || {};
  const targetCalories = Number(options.targetCalories) || 0;
  const todayKey = formatDateKey(options.today || new Date());
  const locale = options.locale || 'uk-UA';

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(endDate, index - 6);
    const dateStr = formatDateKey(date);
    const dayTotals = getDailyTotals(meals, dateStr);
    const water = Number(waterIntake[dateStr]) || 0;

    return {
      dateStr,
      label: date.toLocaleDateString(locale, { weekday: 'short' }),
      dayNum: date.getDate(),
      calories: dayTotals.calories,
      protein: dayTotals.protein,
      fat: dayTotals.fat,
      carbs: dayTotals.carbs,
      water,
      goalPercent: targetCalories > 0 ? Math.min(Math.round((dayTotals.calories / targetCalories) * 100), 100) : 0,
      isToday: dateStr === todayKey
    };
  });
}

export function getThirtyDayAverage(meals = [], selectedDate = new Date()) {
  const endDate = toDate(selectedDate);
  let totalCalories = 0;
  let loggedDays = 0;

  for (let offset = 29; offset >= 0; offset--) {
    const dateStr = formatDateKey(addDays(endDate, -offset));
    const dayMeals = getMealsByDate(meals, dateStr);
    if (dayMeals.length > 0) {
      totalCalories += sumMealTotals(dayMeals).calories;
      loggedDays += 1;
    }
  }

  return loggedDays > 0 ? Math.round(totalCalories / loggedDays) : 0;
}

export function getCalendarMealIndicators(meals = [], monthDate = new Date()) {
  const targetMonth = toDate(monthDate);
  const year = targetMonth.getFullYear();
  const month = targetMonth.getMonth();
  const indicators = new Set();

  toSafeMeals(meals).forEach(meal => {
    if (!meal.date) return;
    const date = toDate(meal.date);
    if (date.getFullYear() === year && date.getMonth() === month) {
      indicators.add(meal.date);
    }
  });

  return indicators;
}

export function getUsageStats(meals = [], options = {}) {
  const normalizeKey = options.normalizeKey || normalizeUsageKey;
  const stats = new Map();

  toSafeMeals(meals).forEach((meal, index) => {
    const key = normalizeKey(meal.name);
    if (!key) return;
    const current = stats.get(key) || { count: 0, firstIndex: index };
    stats.set(key, {
      count: current.count + 1,
      firstIndex: Math.min(current.firstIndex, index)
    });
  });

  return stats;
}

export function getStreakStats(meals = [], todayOrSelectedDate = new Date(), options = {}) {
  const waterIntake = options.waterIntake || {};
  const activeDates = new Set();

  toSafeMeals(meals).forEach(meal => {
    if (meal.date) activeDates.add(meal.date);
  });
  Object.entries(waterIntake).forEach(([dateStr, amount]) => {
    if ((Number(amount) || 0) > 0) activeDates.add(dateStr);
  });

  const today = toDate(todayOrSelectedDate);
  const todayStr = formatDateKey(today);
  const yesterdayStr = formatDateKey(addDays(today, -1));
  let startDate = null;

  if (activeDates.has(todayStr)) {
    startDate = today;
  } else if (activeDates.has(yesterdayStr)) {
    startDate = addDays(today, -1);
  }

  let currentStreak = 0;
  if (startDate) {
    let cursor = toDate(startDate);
    while (activeDates.has(formatDateKey(cursor))) {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    currentStreak,
    activeDates
  };
}

export function getMacroProgress(totals = DEFAULT_TOTALS, goals = {}) {
  const progressFor = (value, goal) => {
    const numericGoal = Number(goal) || 0;
    if (numericGoal <= 0) return 0;
    return Math.min(((Number(value) || 0) / numericGoal) * 100, 100);
  };

  return {
    calories: progressFor(totals.calories, goals.targetCalories ?? goals.calories),
    protein: progressFor(totals.protein, goals.targetProtein ?? goals.protein),
    fat: progressFor(totals.fat, goals.targetFat ?? goals.fat),
    carbs: progressFor(totals.carbs, goals.targetCarbs ?? goals.carbs)
  };
}

export function getWeeklyAverages(weeklyTotals = []) {
  const activeDays = weeklyTotals.filter(day => (Number(day.calories) || 0) > 0);
  const loggedDays = activeDays.length;

  if (loggedDays === 0) {
    return { calories: 0, protein: 0, water: 0, loggedDays: 0 };
  }

  return {
    calories: Math.round(activeDays.reduce((sum, day) => sum + (Number(day.calories) || 0), 0) / loggedDays),
    protein: roundMacro(activeDays.reduce((sum, day) => sum + (Number(day.protein) || 0), 0) / loggedDays),
    water: Math.round(activeDays.reduce((sum, day) => sum + (Number(day.water) || 0), 0) / loggedDays),
    loggedDays
  };
}

export function getRecentDatesForCategory(meals = [], categoryName = '', selectedDate = '', limit = 3) {
  const targetCategory = normalizeMealCategory(categoryName);
  const dates = [];

  toSafeMeals(meals)
    .filter(meal => normalizeMealCategory(meal.category || meal.mealType) === targetCategory && meal.date !== selectedDate)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .forEach(meal => {
      if (!meal.date || dates.includes(meal.date)) return;
      dates.push(meal.date);
    });

  return dates.slice(0, limit);
}
