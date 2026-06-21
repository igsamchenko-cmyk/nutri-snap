import { roundNutritionValues } from '../services/nutrition';

export const PRODUCT_IMPORT_FIELDS = {
  name: ["name", "назва", "продукт", "title"],
  brand: ["brand", "бренд", "виробник"],
  supermarket: ["supermarket", "магазин", "мережа"],
  category: ["category", "категорія"],
  calories: ["calories", "kcal", "ккал", "калорії"],
  protein: ["protein", "білки"],
  fat: ["fat", "жири"],
  carbs: ["carbs", "вуглеводи"],
  weight: ["weight", "вага", "порція"],
  barcode: ["barcode", "штрихкод", "штрих-код"],
  aliases: ["aliases", "синоніми"],
  ingredients: ["ingredients", "склад"],
  icon: ["icon", "emoji"]
};

export function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

export function normalizeImportHeader(value = "") {
  return String(value).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getImportField(row, field) {
  const aliases = PRODUCT_IMPORT_FIELDS[field] || [field];
  for (const alias of aliases) {
    const value = row[normalizeImportHeader(alias)];
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

export function numberFromImport(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function aliasesFromImport(value) {
  return String(value || "")
    .split(/[;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function rowsFromProductImport(text, fileName = "") {
  if (fileName.toLowerCase().endsWith(".json")) {
    const data = JSON.parse(text);
    const products = Array.isArray(data) ? data : [...(data.customFoods || []), ...Object.values(data.customBarcodes || {})];
    return products.map(item => {
      const row = {};
      Object.entries(item || {}).forEach(([key, value]) => {
        row[normalizeImportHeader(key)] = Array.isArray(value) ? value.join(";") : String(value ?? "");
      });
      return row;
    });
  }

  const [headers, ...rows] = parseCsvText(text);
  if (!headers?.length) return [];
  const normalizedHeaders = headers.map(normalizeImportHeader);
  return rows.map(values => {
    const row = {};
    normalizedHeaders.forEach((header, index) => {
      row[header] = String(values[index] || "").trim();
    });
    return row;
  });
}

export function normalizeImportedProduct(row, index) {
  const name = String(getImportField(row, "name") || "").trim();
  if (!name) return null;

  const baseWeight = Math.max(1, Math.round(numberFromImport(getImportField(row, "weight"), 100)));
  const scaleTo100 = 100 / baseWeight;
  const now = new Date().toISOString();
  const barcode = String(getImportField(row, "barcode") || "").replace(/\D/g, "");
  const brand = String(getImportField(row, "brand") || "").trim();
  const supermarket = String(getImportField(row, "supermarket") || "").trim();
  const aliases = aliasesFromImport(getImportField(row, "aliases"));
  const nutrition = roundNutritionValues({
    calories: numberFromImport(getImportField(row, "calories")) * scaleTo100,
    protein: numberFromImport(getImportField(row, "protein")) * scaleTo100,
    fat: numberFromImport(getImportField(row, "fat")) * scaleTo100,
    carbs: numberFromImport(getImportField(row, "carbs")) * scaleTo100
  });

  if (!nutrition) return null;

  return {
    id: barcode || `imported-${Date.now()}-${index}`,
    barcode,
    name,
    brand: brand || "Моя база",
    supermarket,
    category: String(getImportField(row, "category") || "Інше").trim(),
    calories: nutrition.calories,
    protein: nutrition.protein,
    fat: nutrition.fat,
    carbs: nutrition.carbs,
    weight: 100,
    icon: String(getImportField(row, "icon") || "🏷️").trim(),
    aliases,
    ingredients: String(getImportField(row, "ingredients") || "").trim(),
    source: barcode ? "manual-barcode-import" : "manual-import",
    sourceLabel: barcode ? "Мій штрих-код" : "Моя база",
    dataQuality: "manual",
    searchText: [name, brand, supermarket, barcode, aliases.join(" "), "моя база імпорт"].filter(Boolean).join(" ").toLowerCase(),
    createdAt: now,
    updatedAt: now
  };
}

export function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getTodayString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createMealId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatDateLabel(dateStr) {
  const today = getTodayString();
  const yesterday = getTodayString(new Date(Date.now() - 86400000));
  const tomorrow = getTodayString(new Date(Date.now() + 86400000));
  
  if (dateStr === today) return 'Сьогодні';
  if (dateStr === yesterday) return 'Вчора';
  if (dateStr === tomorrow) return 'Завтра';

  const date = parseLocalDate(dateStr);
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function getDashboardTitle(dateStr) {
  const today = getTodayString();
  const yesterday = getTodayString(new Date(Date.now() - 86400000));
  const tomorrow = getTodayString(new Date(Date.now() + 86400000));
  
  if (dateStr === today) return 'Сьогоднішній огляд';
  if (dateStr === yesterday) return 'Огляд за вчора';
  if (dateStr === tomorrow) return 'Огляд на завтра';
  
  return `Огляд за ${formatDateLabel(dateStr)}`;
}

export function calculateBMR(w, h, a, g) {
  const weight = Number(w) || 70;
  const height = Number(h) || 170;
  const age = Number(a) || 25;
  if (g === 'female') {
    return Math.round(447.593 + 9.247 * weight + 3.098 * height - 4.330 * age);
  }
  return Math.round(88.362 + 13.397 * weight + 4.799 * height - 5.677 * age);
}

export function getActivityMultiplier(level) {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9
  };
  return multipliers[level] || 1.55;
}
