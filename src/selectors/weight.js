const DEFAULT_TREND_DAYS = 30;
const DEFAULT_LOCALE = 'uk-UA';

function parseWeightValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function roundToTenth(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function parseDateKey(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) return date;
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateKey(value) {
  const date = parseDateKey(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  const base = parseDateKey(date) || parseDateKey(new Date());
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function readWeightEntries(weightLog = {}) {
  if (!weightLog) return [];

  if (Array.isArray(weightLog)) {
    return weightLog.map(entry => [entry?.date || entry?.dateStr || entry?.createdAt, entry?.weight ?? entry?.value]);
  }

  if (typeof weightLog !== 'object') return [];
  return Object.entries(weightLog);
}

function createChangeResult(entries) {
  const first = entries[0] || null;
  const latest = entries[entries.length - 1] || null;
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;

  return {
    latest,
    previous,
    first,
    change: latest && previous ? roundToTenth(latest.weight - previous.weight) : 0,
    totalChange: latest && first && latest !== first ? roundToTenth(latest.weight - first.weight) : 0,
    hasChange: Boolean(latest && previous)
  };
}

function calculateTrend(points) {
  if (points.length < 2) {
    return { slope: 0, intercept: 0, hasTrend: false, pointsCount: points.length };
  }

  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const denominator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.x - meanX), 0);
  const slope = denominator !== 0 ? numerator / denominator : 0;

  return {
    slope,
    intercept: meanY - slope * meanX,
    hasTrend: true,
    pointsCount: n
  };
}

export function normalizeWeightLog(weightLog = {}) {
  return readWeightEntries(weightLog)
    .map(([date, weight]) => ({
      date: formatDateKey(date),
      weight: parseWeightValue(weight)
    }))
    .filter(entry => entry.date && entry.weight !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getSortedWeightEntries(weightLog = {}) {
  return normalizeWeightLog(weightLog);
}

export function getLatestWeightEntry(weightLog = {}) {
  const entries = normalizeWeightLog(weightLog);
  return entries[entries.length - 1] || null;
}

export function getPreviousWeightEntry(weightLog = {}) {
  const entries = normalizeWeightLog(weightLog);
  return entries.length > 1 ? entries[entries.length - 2] : null;
}

export function getWeightChange(weightLog = {}) {
  return createChangeResult(normalizeWeightLog(weightLog));
}

export function getWeightChangeForRange(weightLog = {}, startDate = '', endDate = '') {
  const start = formatDateKey(startDate);
  const end = formatDateKey(endDate);
  if (!start || !end) return createChangeResult([]);

  const [minDate, maxDate] = start <= end ? [start, end] : [end, start];
  const entries = normalizeWeightLog(weightLog).filter(entry => entry.date >= minDate && entry.date <= maxDate);
  return createChangeResult(entries);
}

export function getWeightForDate(weightLog = {}, date = '') {
  const targetDate = formatDateKey(date);
  if (!targetDate) return null;
  return normalizeWeightLog(weightLog).find(entry => entry.date === targetDate)?.weight ?? null;
}

export function getWeightRange(weightLog = {}) {
  const entries = normalizeWeightLog(weightLog);
  if (entries.length === 0) {
    return { min: null, max: null, span: 0, hasRange: false };
  }

  const weights = entries.map(entry => entry.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  return {
    min,
    max,
    span: roundToTenth(max - min),
    hasRange: true
  };
}

export function getWeightTrendData(weightLog = {}, options = {}) {
  const daysCount = Math.max(1, Math.floor(Number(options.days) || DEFAULT_TREND_DAYS));
  const endDate = parseDateKey(options.endDate || new Date()) || parseDateKey(new Date());
  const locale = options.locale || DEFAULT_LOCALE;
  const normalizedByDate = new Map(normalizeWeightLog(weightLog).map(entry => [entry.date, entry.weight]));
  const days = [];
  const points = [];

  for (let offset = daysCount - 1; offset >= 0; offset -= 1) {
    const dateObj = addDays(endDate, -offset);
    const dateStr = formatDateKey(dateObj);
    const weight = normalizedByDate.get(dateStr) ?? null;
    const day = {
      dateStr,
      dateObj,
      weight,
      label: dateObj.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    };

    days.push(day);

    if (weight !== null) {
      points.push({
        x: daysCount - 1 - offset,
        y: weight,
        dateStr,
        weight
      });
    }
  }

  return {
    days,
    points,
    trend: calculateTrend(points)
  };
}

export function getWeightStats(weightLog = {}) {
  const entries = normalizeWeightLog(weightLog);
  const change = createChangeResult(entries);
  const range = getWeightRange(weightLog);
  const average = entries.length > 0
    ? roundToTenth(entries.reduce((sum, entry) => sum + entry.weight, 0) / entries.length)
    : null;

  return {
    entries,
    count: entries.length,
    latest: change.latest,
    previous: change.previous,
    change: change.change,
    totalChange: change.totalChange,
    hasChange: change.hasChange,
    average,
    range
  };
}
