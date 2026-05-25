const API_BASE = "https://world.openfoodfacts.org";
const APP_PARAMS = "app_name=NutriSnap&app_version=1.3.0";
const SEARCH_PAGE_SIZE = 40;
const CACHE_DB_NAME = "nutrisnap-product-database";
const CACHE_DB_VERSION = 1;
const CACHE_STORE = "products";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_CACHED_SEARCH_RESULTS = 80;

const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "product_name_uk",
  "brands",
  "brands_tags",
  "categories",
  "countries",
  "countries_tags",
  "stores",
  "stores_tags",
  "quantity",
  "image_front_url",
  "image_url",
  "ingredients_text",
  "ingredients_text_en",
  "ingredients_text_uk",
  "nutriments"
].join(",");

const UKRAINIAN_MARKET_PATTERNS = [
  { supermarket: "АТБ", terms: ["атб", "atb", "своя лінія", "своя линия", "розумний вибір", "умный выбор", "de luxe foods"] },
  { supermarket: "Сільпо", terms: ["сільпо", "сильпо", "silpo", "премія", "премия", "premiya", "premia", "повна чаша"] },
  { supermarket: "Фора", terms: ["фора", "fora"] },
  { supermarket: "Novus", terms: ["novus", "новус"] },
  { supermarket: "Varus", terms: ["varus", "варус"] },
  { supermarket: "Metro", terms: ["metro", "metro chef", "aro", "rioba"] },
  { supermarket: "Auchan", terms: ["auchan", "ашан"] },
  { supermarket: "Рукавичка", terms: ["рукавичка", "rukavychka"] },
  { supermarket: "Близенько", terms: ["близенько", "blyzenko"] },
  { supermarket: "Таврія В", terms: ["таврія", "таврия", "tavria"] },
  { supermarket: "Наш Край", terms: ["наш край", "nash kraj", "nash kray"] },
  { supermarket: "Еко Маркет", terms: ["еко маркет", "eko market"] }
];

function cleanText(text) {
  if (!text) return "";
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ґ/g, "г")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function roundMacro(value) {
  return Math.round(toNumber(value) * 10) / 10;
}

function parseQuantityToGrams(quantity) {
  if (!quantity) return 100;

  const match = String(quantity).match(/([\d.,]+)\s*(kg|кг|g|гр|г|ml|мл|l|л)\b/i);
  if (!match) return 100;

  let value = parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return 100;

  const unit = match[2].toLowerCase();
  if (unit === "kg" || unit === "кг" || unit === "l" || unit === "л") {
    value *= 1000;
  }

  return Math.round(value) || 100;
}

function detectSupermarket(product) {
  const haystack = normalizeText([
    product.brands,
    product.brands_tags?.join(" "),
    product.stores,
    product.stores_tags?.join(" "),
    product.categories
  ].filter(Boolean).join(" "));

  for (const pattern of UKRAINIAN_MARKET_PATTERNS) {
    if (pattern.terms.some(term => haystack.includes(normalizeText(term)))) {
      return pattern.supermarket;
    }
  }

  return "";
}

function hasCompleteNutrition(nutriments) {
  if (!nutriments) return false;

  const hasValue = (...keys) => keys.some(key => {
    const value = nutriments[key];
    return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
  });

  return (
    hasValue("energy-kcal_100g", "energy-kcal") &&
    hasValue("proteins_100g", "proteins") &&
    hasValue("fat_100g", "fat") &&
    hasValue("carbohydrates_100g", "carbohydrates")
  );
}

function getProductName(product) {
  return cleanText(product.product_name_uk || product.product_name || product.product_name_en);
}

function getPrimaryBrand(product) {
  return cleanText(product.brands?.split(",")[0] || "");
}

function normalizeProduct(product) {
  const name = getProductName(product);
  if (!name) return null;

  const brand = getPrimaryBrand(product);
  const nutriments = product.nutriments || {};
  if (!hasCompleteNutrition(nutriments)) return null;

  const calories = Math.round(toNumber(nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"]));
  const protein = roundMacro(nutriments.proteins_100g ?? nutriments.proteins);
  const fat = roundMacro(nutriments.fat_100g ?? nutriments.fat);
  const carbs = roundMacro(nutriments.carbohydrates_100g ?? nutriments.carbohydrates);
  const supermarket = detectSupermarket(product);
  const fullName = brand ? `${brand} - ${name}` : name;
  const barcode = cleanText(product.code || "");
  const ingredients = product.ingredients_text_uk || product.ingredients_text || product.ingredients_text_en || null;
  const cacheId = barcode ? `off-${barcode}` : `off-${normalizeText(fullName).slice(0, 80)}`;

  return {
    id: cacheId,
    barcode,
    name: fullName,
    brand: brand || supermarket || "Open Food Facts",
    supermarket,
    calories,
    protein,
    fat,
    carbs,
    weight: parseQuantityToGrams(product.quantity),
    icon: supermarket ? "🛒" : "🥗",
    image: product.image_front_url || product.image_url || null,
    ingredients: ingredients ? cleanText(ingredients) : null,
    source: "openfoodfacts",
    sourceLabel: supermarket ? `${supermarket} / OFF` : "Open Food Facts",
    dataQuality: "database",
    cachedAt: Date.now(),
    searchText: normalizeText([
      fullName,
      brand,
      supermarket,
      product.stores,
      product.categories,
      barcode
    ].filter(Boolean).join(" "))
  };
}

function openCacheDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise(resolve => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "id" });
        store.createIndex("barcode", "barcode", { unique: false });
        store.createIndex("cachedAt", "cachedAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function withStore(mode, callback) {
  const db = await openCacheDb();
  if (!db) return null;

  return new Promise(resolve => {
    const tx = db.transaction(CACHE_STORE, mode);
    const store = tx.objectStore(CACHE_STORE);
    const result = callback(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      resolve(null);
    };
  });
}

async function cacheProducts(products) {
  const validProducts = products.filter(Boolean);
  if (validProducts.length === 0) return;

  await withStore("readwrite", store => {
    validProducts.forEach(product => store.put({ ...product, cachedAt: Date.now() }));
  });
}

async function searchCachedProducts(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const now = Date.now();

  const products = await new Promise(resolve => {
    openCacheDb().then(db => {
      if (!db) {
        resolve([]);
        return;
      }

      const tx = db.transaction(CACHE_STORE, "readonly");
      const request = tx.objectStore(CACHE_STORE).getAll();

      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };
      request.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  });

  return products
    .filter(product => now - (product.cachedAt || 0) < CACHE_TTL_MS)
    .filter(product => tokens.every(token => (product.searchText || normalizeText(product.name)).includes(token)))
    .sort((a, b) => {
      const aMarket = a.supermarket ? 1 : 0;
      const bMarket = b.supermarket ? 1 : 0;
      if (aMarket !== bMarket) return bMarket - aMarket;
      return (b.cachedAt || 0) - (a.cachedAt || 0);
    })
    .slice(0, MAX_CACHED_SEARCH_RESULTS);
}

async function getCachedProductByBarcode(barcode) {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  const products = await new Promise(resolve => {
    openCacheDb().then(db => {
      if (!db) {
        resolve([]);
        return;
      }

      const tx = db.transaction(CACHE_STORE, "readonly");
      const index = tx.objectStore(CACHE_STORE).index("barcode");
      const request = index.getAll(cleanBarcode);

      request.onsuccess = () => {
        db.close();
        resolve(request.result || []);
      };
      request.onerror = () => {
        db.close();
        resolve([]);
      };
    });
  });

  return products[0] || null;
}

function dedupeProducts(products) {
  const seen = new Set();
  const result = [];

  for (const product of products) {
    if (!product) continue;
    const key = product.barcode || normalizeText(`${product.name} ${product.brand}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(product);
  }

  return result;
}

function rankProducts(products, query) {
  const tokens = normalizeText(query).split(" ").filter(Boolean);

  return [...products].sort((a, b) => {
    const score = product => {
      const searchText = product.searchText || normalizeText([
        product.name,
        product.brand,
        product.supermarket,
        product.barcode
      ].filter(Boolean).join(" "));
      const supermarketText = normalizeText(product.supermarket || "");
      const brandText = normalizeText(product.brand || "");
      let total = 0;

      for (const token of tokens) {
        if (searchText.includes(token)) total += 5;
        if (supermarketText.includes(token)) total += 18;
        if (brandText.includes(token)) total += 8;
      }

      if (product.supermarket) total += 3;
      if (normalizeText(product.name).startsWith(tokens[0] || "")) total += 2;
      return total;
    };

    return score(b) - score(a);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Open Food Facts request failed with status ${response.status}`);
  }

  return response.json();
}

function buildSearchUrl(query, { ukrainianOnly }) {
  const params = new URLSearchParams({
    search_terms: query.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(SEARCH_PAGE_SIZE),
    sort_by: "unique_scans_n",
    fields: PRODUCT_FIELDS,
    lc: "uk",
    cc: "ua",
    app_name: "NutriSnap",
    app_version: "1.3.0"
  });

  if (ukrainianOnly) {
    params.set("tagtype_0", "countries");
    params.set("tag_contains_0", "contains");
    params.set("tag_0", "ukraine");
  }

  return `${API_BASE}/cgi/search.pl?${params.toString()}`;
}

export async function getProductByBarcode(barcode) {
  const cleanBarcode = barcode.trim();

  if (!/^\d+$/.test(cleanBarcode)) {
    throw new Error("Штрих-код має складатися тільки з цифр.");
  }

  const cached = await getCachedProductByBarcode(cleanBarcode);
  if (cached) return cached;

  const url = `${API_BASE}/api/v2/product/${cleanBarcode}.json?fields=${encodeURIComponent(PRODUCT_FIELDS)}&${APP_PARAMS}`;
  const data = await fetchJson(url);

  if (data.status !== 1 || !data.product) {
    throw new Error("Продукт із таким штрих-кодом не знайдено у базі продуктів.");
  }

  const product = normalizeProduct(data.product);
  if (!product) {
    throw new Error("Продукт знайдено, але в базі немає повного набору КБЖВ. Щоб не показувати неправильні нулі, додайте дані з етикетки вручну.");
  }

  await cacheProducts([product]);
  return product;
}

export async function searchProductsByName(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const cachedProducts = await searchCachedProducts(cleanQuery);

  try {
    const primaryData = await fetchJson(buildSearchUrl(cleanQuery, { ukrainianOnly: true }));
    let remoteProducts = (primaryData.products || []).map(normalizeProduct).filter(Boolean);

    if (remoteProducts.length < 8) {
      const fallbackData = await fetchJson(buildSearchUrl(cleanQuery, { ukrainianOnly: false }));
      remoteProducts = [
        ...remoteProducts,
        ...(fallbackData.products || []).map(normalizeProduct).filter(Boolean)
      ];
    }

    await cacheProducts(remoteProducts);
    return rankProducts(dedupeProducts([...remoteProducts, ...cachedProducts]), cleanQuery).slice(0, MAX_CACHED_SEARCH_RESULTS);
  } catch (e) {
    console.error("Error searching products in Open Food Facts:", e);
    return rankProducts(cachedProducts, cleanQuery);
  }
}
