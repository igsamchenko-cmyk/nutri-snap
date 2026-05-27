import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  Camera, 
  Calendar, 
  Settings, 
  Flame, 
  Droplet, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown, 
  Moon, 
  Sun, 
  Key, 
  Brain, 
  RefreshCw, 
  Check, 
  Upload, 
  Sparkles,
  AlertCircle,
  User,
  QrCode,
  Download,
  Database,
  Star,
  Search,
  Pencil,
  X
} from 'lucide-react';
import {
  SERVER_GEMINI_API_KEY,
  analyzeFoodImage as analyzeFoodImageWithGemini,
  detectBarcodeFromImage as detectBarcodeFromImageWithGemini,
  searchSmartProducts as searchSmartProductsWithGemini
} from './services/geminiService';
import {
  SERVER_OPENAI_API_KEY,
  analyzeFoodImageWithOpenAI,
  detectBarcodeFromImageWithOpenAI,
  searchSmartProductsWithOpenAI
} from './services/openaiService';
import { mockFoods } from './data/mockFood';
import { productCatalog } from './data/products';
import { getProductByBarcode, searchProductsByName } from './services/openFoodFactsService';

const DEFAULT_API_KEY = import.meta.env.DEV ? SERVER_GEMINI_API_KEY : '';
const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const DEFAULT_OPENAI_PROXY_URL = import.meta.env.DEV ? '/api/openai/responses' : '';
const MAX_LOCAL_SEARCH_RESULTS = 80;
const MAX_SEARCH_SUGGESTIONS = 6;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const PRODUCT_IMPORT_FIELDS = {
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

const normalizeSearchText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[ʼ'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getFoodSearchText = (food) =>
  normalizeSearchText([
    food.name,
    food.brand,
    food.supermarket,
    food.category,
    food.searchText
  ].filter(Boolean).join(' '));

const hasCompleteNutritionValues = (item) => (
  ["calories", "protein", "fat", "carbs"].every(field => Number.isFinite(Number(item?.[field])))
);

const hasFilledNutritionInputs = (...values) => (
  values.every(value => String(value ?? '').trim() !== '' && Number.isFinite(Number(value)))
);

const findBestFoodMatchByName = (foodName, foods) => {
  const query = normalizeSearchText(foodName);
  const tokens = query.split(/\s+/).filter(token => token.length >= 2);
  if (!query || tokens.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  foods.forEach((food, index) => {
    if (!hasCompleteNutritionValues(food)) return;

    const name = normalizeSearchText(food.name);
    const text = getFoodSearchText(food);
    if (!tokens.every(token => text.includes(token))) return;

    let score = 40;
    if (name === query) score += 60;
    else if (name.startsWith(query) || query.startsWith(name)) score += 35;
    if (food.isCustom || food.isCustomBarcode || food.source === "manual" || food.dataQuality === "manual") score += 20;
    if (food.source === "ua-core") score += 12;
    score -= index * 0.01;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = food;
    }
  });

  return bestScore >= 45 ? bestMatch : null;
};

const parseCsvText = (text) => {
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
};

const normalizeImportHeader = (value = "") => String(value).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");

const getImportField = (row, field) => {
  const aliases = PRODUCT_IMPORT_FIELDS[field] || [field];
  for (const alias of aliases) {
    const value = row[normalizeImportHeader(alias)];
    if (value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
};

const numberFromImport = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

const aliasesFromImport = (value) => String(value || "")
  .split(/[;|]/)
  .map(item => item.trim())
  .filter(Boolean);

const rowsFromProductImport = (text, fileName = "") => {
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
};

const normalizeImportedProduct = (row, index) => {
  const name = String(getImportField(row, "name") || "").trim();
  if (!name) return null;

  const baseWeight = Math.max(1, Math.round(numberFromImport(getImportField(row, "weight"), 100)));
  const scaleTo100 = 100 / baseWeight;
  const now = new Date().toISOString();
  const barcode = String(getImportField(row, "barcode") || "").replace(/\D/g, "");
  const brand = String(getImportField(row, "brand") || "").trim();
  const supermarket = String(getImportField(row, "supermarket") || "").trim();
  const aliases = aliasesFromImport(getImportField(row, "aliases"));

  return {
    id: barcode || `imported-${Date.now()}-${index}`,
    barcode,
    name,
    brand: brand || "Моя база",
    supermarket,
    category: String(getImportField(row, "category") || "Інше").trim(),
    calories: Math.round(numberFromImport(getImportField(row, "calories")) * scaleTo100),
    protein: Math.round(numberFromImport(getImportField(row, "protein")) * scaleTo100 * 10) / 10,
    fat: Math.round(numberFromImport(getImportField(row, "fat")) * scaleTo100 * 10) / 10,
    carbs: Math.round(numberFromImport(getImportField(row, "carbs")) * scaleTo100 * 10) / 10,
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
};

// Локальне безпечне парсування дати типу YYYY-MM-DD для запобігання зсуву таймзон
const parseLocalDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Отримання поточної дати у форматі YYYY-MM-DD
const getTodayString = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createMealId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

// Форматування дати для відображення в інтерфейсі (українською)
const formatDateLabel = (dateStr) => {
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
};

// Створення динамічного заголовка для дашборду відповідно до дати
const getDashboardTitle = (dateStr) => {
  const today = getTodayString();
  const yesterday = getTodayString(new Date(Date.now() - 86400000));
  const tomorrow = getTodayString(new Date(Date.now() + 86400000));
  
  if (dateStr === today) return 'Сьогоднішній огляд';
  if (dateStr === yesterday) return 'Огляд за вчора';
  if (dateStr === tomorrow) return 'Огляд на завтра';
  
  return `Огляд за ${formatDateLabel(dateStr)}`;
};

export default function App() {
  // --- Global States ---
  const [activeTab, setActiveTab] = useState('dashboard');
  const [previousTab, setPreviousTab] = useState('dashboard');
  const [selectedDate, setSelectedDate] = useState(getTodayString());

  const changeTab = (tabName) => {
    setPreviousTab(activeTab);
    setActiveTab(tabName);
  };

  // --- States for Database Search ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('Усі');
  const [selectedSearchFood, setSelectedSearchFood] = useState(null);
  const [searchFoodWeight, setSearchFoodWeight] = useState(100);
  const [searchMealCategory, setSearchMealCategory] = useState('Сніданок');
  const [externalSearchFoods, setExternalSearchFoods] = useState([]);
  const [aiSearchFoods, setAiSearchFoods] = useState([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [isAIEstimating, setIsAIEstimating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isNativeScannerSupported] = useState(() => 'BarcodeDetector' in window);
  const externalSearchCacheRef = useRef(new Map());
  const aiSearchCacheRef = useRef(new Map());
  const aiSearchRequestIdRef = useRef(0);
  const aiSearchInFlightKeyRef = useRef('');
  
  // Дані страв та води (ініціалізація з localStorage)
  const [meals, setMeals] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_meals');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error reading nutrisnap_meals:", e);
      return [];
    }
  });
  
  const [waterIntake, setWaterIntake] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_water');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Error reading nutrisnap_water:", e);
      return {};
    }
  });

  // Профіль користувача та цілі КБЖВ
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_profile');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Error reading nutrisnap_profile:", e);
    }
    return {
      weight: 70,
      height: 170,
      goal: 'maintain', // lose | maintain | gain
      targetCalories: 2000,
      targetProtein: 150,
      targetFat: 55,
      targetCarbs: 225
    };
  });

  // Налаштування ШІ
  const [apiKey, setApiKey] = useState(() => {
    try {
      const stored = localStorage.getItem('nutrisnap_apikey');
      return stored ? stored.trim() : DEFAULT_API_KEY;
    } catch {
      return DEFAULT_API_KEY;
    }
  });
  const [openAiApiKey, setOpenAiApiKey] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_openai_apikey') || '';
    } catch {
      return '';
    }
  });
  const [openAiProxyUrl, setOpenAiProxyUrl] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_openai_proxy_url') || DEFAULT_OPENAI_PROXY_URL;
    } catch {
      return DEFAULT_OPENAI_PROXY_URL;
    }
  });
  const [scanMode, setScanMode] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_scanmode') || (DEFAULT_API_KEY ? 'gemini' : 'mock');
    } catch {
      return DEFAULT_API_KEY ? 'gemini' : 'mock';
    }
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_geminimodel') || 'gemini-2.5-flash';
    } catch (e) {
      return 'gemini-2.5-flash';
    }
  });
  const [openAiModel, setOpenAiModel] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_openai_model') || DEFAULT_OPENAI_MODEL;
    } catch {
      return DEFAULT_OPENAI_MODEL;
    }
  });
  const [updateRegistration, setUpdateRegistration] = useState(null);

  // --- Favorite Meals & Toast Notification States ---
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Error reading nutrisnap_favorites:", e);
      return [];
    }
  });

  const [toast, setToast] = useState(null);

  useEffect(() => {
    localStorage.setItem('nutrisnap_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const isFavorite = (name) => {
    if (!name) return false;
    return favorites.some(f => f.name.toLowerCase() === name.toLowerCase());
  };

  const toggleFavoriteScanned = () => {
    if (!scanResult) return;
    const name = scanResult.name;
    setFavorites(prev => {
      const exists = prev.some(f => f.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => f.name.toLowerCase() !== name.toLowerCase());
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        return [...prev, {
          name: name,
          calories: Number(scannedCalories) || 0,
          protein: Number(scannedProtein) || 0,
          fat: Number(scannedFat) || 0,
          carbs: Number(scannedCarbs) || 0,
          weight: Number(editedWeight) || 100,
          image: scanResult?.image || ''
        }];
      }
    });
  };

  const toggleFavoriteBarcode = () => {
    if (!barcodeResult) return;
    const name = barcodeResult.name;
    setFavorites(prev => {
      const exists = prev.some(f => f.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => f.name.toLowerCase() !== name.toLowerCase());
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        return [...prev, {
          name: name,
          calories: Number(barcodeScannedCalories) || 0,
          protein: Number(barcodeScannedProtein) || 0,
          fat: Number(barcodeScannedFat) || 0,
          carbs: Number(barcodeScannedCarbs) || 0,
          weight: Number(barcodeEditedWeight) || 100,
          image: ''
        }];
      }
    });
  };

  const toggleFavoriteMeal = (meal) => {
    if (!meal) return;
    const name = meal.name;
    setFavorites(prev => {
      const exists = prev.some(f => f.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => f.name.toLowerCase() !== name.toLowerCase());
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        return [...prev, {
          name: name,
          calories: Number(meal.calories) || 0,
          protein: Number(meal.protein) || 0,
          fat: Number(meal.fat) || 0,
          carbs: Number(meal.carbs) || 0,
          weight: Number(meal.weight) || 100,
          image: meal.image || ''
        }];
      }
    });
  };

  const calculateStreak = () => {
    const activeDates = new Set();
    meals.forEach(m => {
      if (m.date) activeDates.add(m.date);
    });
    Object.keys(waterIntake).forEach(dateStr => {
      if (waterIntake[dateStr] > 0) activeDates.add(dateStr);
    });

    let streak = 0;
    let checkDate = new Date();
    const getLocalDateStr = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    let todayStr = getLocalDateStr(checkDate);
    checkDate.setDate(checkDate.getDate() - 1);
    let yesterdayStr = getLocalDateStr(checkDate);

    if (activeDates.has(todayStr)) {
      let tempDate = new Date();
      while (activeDates.has(getLocalDateStr(tempDate))) {
        streak++;
        tempDate.setDate(tempDate.getDate() - 1);
      }
    } else if (activeDates.has(yesterdayStr)) {
      let tempDate = new Date();
      tempDate.setDate(tempDate.getDate() - 1);
      while (activeDates.has(getLocalDateStr(tempDate))) {
        streak++;
        tempDate.setDate(tempDate.getDate() - 1);
      }
    }

    return streak;
  };

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_theme') || 'dark';
    } catch (e) {
      return 'dark';
    }
  });

  // --- States for Scanner ---
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [editedWeight, setEditedWeight] = useState(200);
  const [scannedProtein, setScannedProtein] = useState(0);
  const [scannedFat, setScannedFat] = useState(0);
  const [scannedCarbs, setScannedCarbs] = useState(0);
  const [scannedCalories, setScannedCalories] = useState(0);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraRequested, setCameraRequested] = useState(false);

  // Ghost click protection state
  const [allowCameraTrigger, setAllowCameraTrigger] = useState(false);

  // Barcode Lookup states
  const [scannerMode, setScannerMode] = useState('camera'); // 'camera' або 'barcode'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [barcodeCandidateProduct, setBarcodeCandidateProduct] = useState(null);
  const [barcodeEditedWeight, setBarcodeEditedWeight] = useState(100);
  const [barcodeScannedProtein, setBarcodeScannedProtein] = useState(0);
  const [barcodeScannedFat, setBarcodeScannedFat] = useState(0);
  const [barcodeScannedCarbs, setBarcodeScannedCarbs] = useState(0);
  const [barcodeScannedCalories, setBarcodeScannedCalories] = useState(0);
  const [barcodeError, setBarcodeError] = useState(null);
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);

  // --- States for Custom Barcodes & Custom Foods ---
  const [customBarcodes, setCustomBarcodes] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_custom_barcodes');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Failed to load custom barcodes:", e);
      return {};
    }
  });

  const [customFoods, setCustomFoods] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_custom_foods');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load custom foods:", e);
      return [];
    }
  });

  const [isCustomFoodModalOpen, setIsCustomFoodModalOpen] = useState(false);
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodCalories, setCustomFoodCalories] = useState('');
  const [customFoodProtein, setCustomFoodProtein] = useState('');
  const [customFoodFat, setCustomFoodFat] = useState('');
  const [customFoodCarbs, setCustomFoodCarbs] = useState('');
  const [customFoodWeight, setCustomFoodWeight] = useState('100');
  const [customFoodEditTarget, setCustomFoodEditTarget] = useState(null);

  // Fallback states for when a scanned barcode is not found
  const [barcodeNotFound, setBarcodeNotFound] = useState(null); // stores the scanned barcode string
  const [isBarcodeNotFoundModalOpen, setIsBarcodeNotFoundModalOpen] = useState(false);
  const [fallbackName, setFallbackName] = useState('');
  const [fallbackCalories, setFallbackCalories] = useState('');
  const [fallbackProtein, setFallbackProtein] = useState('');
  const [fallbackFat, setFallbackFat] = useState('');
  const [fallbackCarbs, setFallbackCarbs] = useState('');
  const [fallbackWeight, setFallbackWeight] = useState('100');

  // Calendar and Structured Meal States
  const [preselectedCategory, setPreselectedCategory] = useState(null);
  const [scannedMealCategory, setScannedMealCategory] = useState('Сніданок');
  const [barcodeMealCategory, setBarcodeMealCategory] = useState('Сніданок');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);

  const getDefaultCategory = () => {
    const currentHour = new Date().getHours();
    if (currentHour >= 6 && currentHour < 11) return 'Сніданок';
    if (currentHour >= 11 && currentHour < 13) return 'Перший перекус';
    if (currentHour >= 13 && currentHour < 17) return 'Обід';
    if (currentHour >= 17 && currentHour < 19) return 'Другий перекус';
    return 'Вечеря';
  };

  const getDaysInMonthGrid = (dateObj) => {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday is 0, Sunday is 6
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    const cells = [];
    
    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      cells.push({
        day: d,
        dateString: getTodayString(prevDate),
        isCurrentMonth: false
      });
    }
    
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const currDate = new Date(year, month, d);
      cells.push({
        day: d,
        dateString: getTodayString(currDate),
        isCurrentMonth: true
      });
    }
    
    // Next month padding
    const totalCellsNeeded = cells.length > 35 ? 42 : 35;
    const nextMonthPadding = totalCellsNeeded - cells.length;
    for (let d = 1; d <= nextMonthPadding; d++) {
      const nextDate = new Date(year, month + 1, d);
      cells.push({
        day: d,
        dateString: getTodayString(nextDate),
        isCurrentMonth: false
      });
    }
    
    return cells;
  };

  const videoRef = useRef(null);
  const cameraFileInputRef = useRef(null);
  const galleryFileInputRef = useRef(null);
  const barcodeFileInputRef = useRef(null);
  const scannerOpenedTimeRef = useRef(0);

  // Синхронізація місяця календаря при зміні selectedDate
  useEffect(() => {
    if (selectedDate) {
      setCalendarDate(parseLocalDate(selectedDate));
    }
  }, [selectedDate]);

  // --- Sync to LocalStorage ---
  useEffect(() => {
    localStorage.setItem('nutrisnap_meals', JSON.stringify(meals));
  }, [meals]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_water', JSON.stringify(waterIntake));
  }, [waterIntake]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (apiKey === SERVER_GEMINI_API_KEY) {
      localStorage.removeItem('nutrisnap_apikey');
    } else {
      localStorage.setItem('nutrisnap_apikey', apiKey.trim());
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_openai_apikey', openAiApiKey.trim());
  }, [openAiApiKey]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_openai_proxy_url', openAiProxyUrl.trim());
  }, [openAiProxyUrl]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_scanmode', scanMode);
  }, [scanMode]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_geminimodel', geminiModel);
  }, [geminiModel]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_openai_model', openAiModel);
  }, [openAiModel]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_theme', theme);
    const bodyClass = document.body.classList;
    if (theme === 'light') {
      bodyClass.add('light-mode');
    } else {
      bodyClass.remove('light-mode');
    }
  }, [theme]);

  useEffect(() => {
    const handleUpdateAvailable = (event) => {
      setUpdateRegistration(event.detail?.registration || null);
    };

    window.addEventListener('nutrisnap-update-available', handleUpdateAvailable);
    return () => window.removeEventListener('nutrisnap-update-available', handleUpdateAvailable);
  }, []);

  const applyAppUpdate = () => {
    const waitingWorker = updateRegistration?.waiting;
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    localStorage.setItem('nutrisnap_custom_barcodes', JSON.stringify(customBarcodes));
  }, [customBarcodes]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_custom_foods', JSON.stringify(customFoods));
  }, [customFoods]);

  // Захист від фантомних натискань (ghost click protection) при відкритті сканера або зміні режимів
  useEffect(() => {
    if (activeTab === 'scanner') {
      scannerOpenedTimeRef.current = Date.now();
      setAllowCameraTrigger(false);
      const timer = setTimeout(() => {
        setAllowCameraTrigger(true);
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setAllowCameraTrigger(false);
    }
  }, [activeTab, scannerMode]);

  // Керування камерою при перемиканні вкладок та режимів
  useEffect(() => {
    if (activeTab !== 'scanner' || scannerMode === 'search') {
      stopCamera();
      setCameraRequested(false);
      if (activeTab !== 'scanner') {
        // Очищуємо результати пошуку штрих-кодів, якщо виходимо зі сканера повністю
        setScanResult(null);
        setBarcodeResult(null);
        setBarcodeCandidateProduct(null);
        setBarcodeError(null);
        setBarcodeInput('');
      }
    } else if (cameraRequested) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, scannerMode, cameraRequested]);

  // Дебоунс-пошук продуктів в українській базі Open Food Facts та автоматичний AI-пошук
  useEffect(() => {
    const cleanQuery = searchQuery.trim();

    if (activeTab !== 'scanner' || scannerMode !== 'search' || cleanQuery.length < 3) {
      aiSearchRequestIdRef.current += 1;
      aiSearchInFlightKeyRef.current = '';
      setExternalSearchFoods([]);
      setAiSearchFoods([]);
      setIsSearchingExternal(false);
      setIsSearchingAI(false);
      return;
    }

    let cancelled = false;
    const cacheKey = normalizeSearchText(cleanQuery);
    const cachedExternal = externalSearchCacheRef.current.get(cacheKey);

    if (cachedExternal && Date.now() - cachedExternal.cachedAt < SEARCH_CACHE_TTL_MS) {
      setExternalSearchFoods(cachedExternal.results);
      setIsSearchingExternal(false);
    } else {
      setIsSearchingExternal(true);
    }

    const delayTimer = setTimeout(async () => {
      try {
        if (cachedExternal && Date.now() - cachedExternal.cachedAt < SEARCH_CACHE_TTL_MS) {
          return;
        }

        const results = await searchProductsByName(cleanQuery);
        externalSearchCacheRef.current.set(cacheKey, {
          cachedAt: Date.now(),
          results
        });

        if (cancelled) return;
        setExternalSearchFoods(results);
      } catch (err) {
        console.error("Error in live search query:", err);
      } finally {
        if (!cancelled) {
          setIsSearchingExternal(false);
        }
      }
    }, 900); // 900ms debounce

    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
    };
  }, [searchQuery, activeTab, scannerMode, scanMode, apiKey, openAiApiKey, openAiProxyUrl, geminiModel, openAiModel]);

  // --- Camera Operations ---
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Ваш браузер не підтримує доступ до камери або з'єднання незахищене (потрібен HTTPS). Скористайтеся завантаженням фотографії."
      );
      setCameraRequested(false);
      return;
    }

    const constraints1 = {
      video: { 
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    const constraints2 = {
      video: { 
        facingMode: 'environment'
      },
      audio: false
    };

    const constraints3 = {
      video: true,
      audio: false
    };

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints1);
    } catch (err1) {
      console.warn("First camera constraints failed, trying fallback 1 (facingMode only)...", err1);
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints2);
      } catch (err2) {
        console.warn("Second camera constraints failed, trying fallback 2 (any camera)...", err2);
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints3);
        } catch (err3) {
          console.error("All camera constraints failed:", err3);
          setCameraError(
            "Не вдалося отримати доступ до камери. Ви можете скористатися завантаженням фотографії з пристрою."
          );
          setCameraRequested(false);
          return;
        }
      }
    }

    try {
      setCameraStream(stream);
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.error("Error playing video stream in startCamera:", playErr);
        }
      }
    } catch (err) {
      console.error("Camera stream binding failed:", err);
      setCameraError("Не вдалося запустити відеопотік з камери.");
      setCameraRequested(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  // Прив'язка відеопотоку до елемента <video> після його монтування
  useEffect(() => {
    const bindVideo = async () => {
      if (cameraActive && cameraStream && videoRef.current) {
        videoRef.current.srcObject = cameraStream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.error("Error starting video in useEffect:", playErr);
        }
      }
    };
    bindVideo();
  }, [cameraActive, cameraStream]);

  const getCurrentAiConfig = () => {
    if (scanMode === 'openai') {
      const proxyUrl = openAiProxyUrl.trim();
      return {
        provider: 'openai',
        apiKey: proxyUrl ? SERVER_OPENAI_API_KEY : openAiApiKey.trim(),
        model: openAiModel,
        displayName: 'OpenAI GPT',
        proxyUrl
      };
    }

    return {
      provider: 'gemini',
      apiKey: apiKey.trim(),
      model: geminiModel,
      displayName: 'Gemini',
      proxyUrl: ''
    };
  };

  const analyzeFoodWithCurrentProvider = (imageDataBase64) => {
    const config = getCurrentAiConfig();

    if (!config.apiKey) {
      throw new Error(`Будь ласка, введіть API-ключ ${config.displayName} у налаштуваннях додатку.`);
    }

    if (config.provider === 'openai') {
      return analyzeFoodImageWithOpenAI(imageDataBase64, config.apiKey, config.model, config.proxyUrl);
    }

    return analyzeFoodImageWithGemini(imageDataBase64, config.apiKey, config.model);
  };

  const detectBarcodeWithCurrentProvider = (imageDataBase64) => {
    const config = getCurrentAiConfig();

    if (!config.apiKey) {
      throw new Error(`Будь ласка, введіть API-ключ ${config.displayName} у налаштуваннях додатку.`);
    }

    if (config.provider === 'openai') {
      return detectBarcodeFromImageWithOpenAI(imageDataBase64, config.apiKey, config.model, config.proxyUrl);
    }

    return detectBarcodeFromImageWithGemini(imageDataBase64, config.apiKey, config.model);
  };

  // Запуск аналізу
  const resetCustomFoodForm = () => {
    setCustomFoodName('');
    setCustomFoodCalories('');
    setCustomFoodProtein('');
    setCustomFoodFat('');
    setCustomFoodCarbs('');
    setCustomFoodWeight('100');
    setCustomFoodEditTarget(null);
  };

  const closeCustomFoodModal = () => {
    setIsCustomFoodModalOpen(false);
    setCustomFoodEditTarget(null);
  };

  const openCustomFoodForm = (prefill = {}, editTarget = null) => {
    setCustomFoodName(prefill.name || '');
    setCustomFoodCalories(prefill.calories !== undefined ? String(prefill.calories) : '');
    setCustomFoodProtein(prefill.protein !== undefined ? String(prefill.protein) : '');
    setCustomFoodFat(prefill.fat !== undefined ? String(prefill.fat) : '');
    setCustomFoodCarbs(prefill.carbs !== undefined ? String(prefill.carbs) : '');
    setCustomFoodWeight(prefill.weight !== undefined ? String(prefill.weight) : '100');
    setCustomFoodEditTarget(editTarget);
    setIsCustomFoodModalOpen(true);
  };

  const openCustomFoodEditor = (food) => {
    if (!food?.isCustom && !food?.isCustomBarcode) return;

    openCustomFoodForm(
      {
        name: food.name,
        calories: food.calories,
        protein: food.protein,
        fat: food.fat,
        carbs: food.carbs,
        weight: food.weight || 100
      },
      food.isCustomBarcode
        ? { type: 'barcode', barcode: food.barcode }
        : { type: 'food', id: food.id }
    );
  };

  const triggerScan = async (imageDataBase64) => {
    setIsScanning(true);
    setScanResult(null);
    setScannedMealCategory(preselectedCategory || getDefaultCategory());
    try {
      if (scanMode === 'mock') {
        throw new Error("Для фото-сканування оберіть GPT (OpenAI) або Gemini у налаштуваннях ШІ.");
      }

      const result = await analyzeFoodWithCurrentProvider(imageDataBase64);
      const localNutritionMatch = findBestFoodMatchByName(result.name, [
        ...Object.values(customBarcodes).map(food => ({ ...food, isCustomBarcode: true })),
        ...customFoods.map(food => ({ ...food, isCustom: true })),
        ...productCatalog,
        ...mockFoods
      ]);

      const scanData = localNutritionMatch ? {
        ...result,
        name: localNutritionMatch.name,
        calories: Number(localNutritionMatch.calories),
        protein: Number(localNutritionMatch.protein),
        fat: Number(localNutritionMatch.fat),
        carbs: Number(localNutritionMatch.carbs),
        weight: Number(localNutritionMatch.weight) || 100,
        ingredients: localNutritionMatch.ingredients || result.ingredients || '',
        dataQuality: "database_match",
        needsManualNutrition: false,
        confidence: Math.max(Number(result.confidence) || 0, 85),
        warning: `КБЖВ взято з локальної бази: ${localNutritionMatch.brand || localNutritionMatch.sourceLabel || "продукт"}. Перевірте вагу перед додаванням.`
      } : result;

      if (scanData.needsManualNutrition || scanData.dataQuality === "insufficient" || !hasCompleteNutritionValues(scanData)) {
        const fallbackSearchName = String(result?.name || scanData?.name || '').trim();
        if (fallbackSearchName) {
          setSearchQuery(fallbackSearchName);
          setSelectedCategoryFilter('Усі');
          setScannerMode('search');
          setCameraRequested(false);
          stopCamera();
          showToast(`Камера впізнала "${fallbackSearchName}", але КБЖВ ненадійні. Показую схожі продукти з бази.`, "info");
          return;
        }
        throw new Error(scanData.warning || "Не вдалося надійно визначити КБЖВ з фото. Щоб не показувати неправильні дані, введіть значення з етикетки вручну.");
      }

      const verifiedResult = {
        ...scanData,
        dataQuality: scanData.dataQuality || "estimate",
        warning: scanData.warning || "КБЖВ з фото є приблизною оцінкою. Перевірте дані перед додаванням."
      };

      setScanResult(verifiedResult);
      setEditedWeight(Number(verifiedResult.weight) || 200);
      setScannedProtein(Number(verifiedResult.protein) || 0);
      setScannedFat(Number(verifiedResult.fat) || 0);
      setScannedCarbs(Number(verifiedResult.carbs) || 0);
      setScannedCalories(Number(verifiedResult.calories) || 0);
    } catch (err) {
      console.error(err);
      openCustomFoodForm({ weight: 100 });
      showToast(err.message || "Помилка під час аналізу страви.", "error");
    } finally {
      setIsScanning(false);
    }
  };

  // Захоплення кадру з відео
  const capturePhoto = () => {
    if (!allowCameraTrigger) return;
    if (Date.now() - scannerOpenedTimeRef.current < 350) {
      console.log("Ignored capturePhoto: triggered too soon after opening scanner.");
      return;
    }
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const maxSide = 960;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.62);
    triggerScan(base64Data);
  };

  // Стиснення та масштабування зображення для ШІ
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Обмежуємо максимальний розмір до 800px
          const max_size = 800;
          if (width > height) {
            if (width > max_size) {
              height *= max_size / width;
              width = max_size;
            }
          } else {
            if (height > max_size) {
              width *= max_size / height;
              height = max_size;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Стискаємо до якості 70% для швидкого завантаження
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
        img.src = event.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Обробка завантаження файлу зображення страви
  const handleFileUpload = async (e) => {
    if (!allowCameraTrigger) {
      e.target.value = "";
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    try {
      try {
        const compressedBase64 = await compressImage(file);
        await triggerScan(compressedBase64);
      } catch (err) {
        console.error("Помилка стиснення зображення страви, надсилаємо оригінал:", err);
        await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              await triggerScan(reader.result);
              resolve();
            } catch (scanErr) {
              reject(scanErr);
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      }
    } catch (err) {
      console.error("Помилка обробки файлу страви:", err);
    } finally {
      e.target.value = "";
    }
  };

  // Обробник ручної зміни білків, жирів та вуглеводів для камери
  const handleScanMacroChange = (macro, value) => {
    let p = scannedProtein;
    let f = scannedFat;
    let c = scannedCarbs;
    
    if (macro === 'protein') {
      setScannedProtein(value);
      p = value;
    } else if (macro === 'fat') {
      setScannedFat(value);
      f = value;
    } else if (macro === 'carbs') {
      setScannedCarbs(value);
      c = value;
    }
    
    const pVal = p === '' ? 0 : (parseFloat(p) || 0);
    const fVal = f === '' ? 0 : (parseFloat(f) || 0);
    const cVal = c === '' ? 0 : (parseFloat(c) || 0);
    
    setScannedCalories(Math.round(pVal * 4 + fVal * 9 + cVal * 4));
  };

  // Обробник ручної зміни ваги страви з масштабуванням КБЖВ
  const handleScanWeightChange = (value) => {
    setEditedWeight(value);
    if (!scanResult) return;
    
    const baselineWeight = Number(scanResult.weight) || 200;
    const currentWeightVal = Number(value) || 0;
    const scale = currentWeightVal > 0 ? (currentWeightVal / baselineWeight) : 0;
    
    const p = Math.round(Number(scanResult.protein || 0) * scale * 10) / 10;
    const f = Math.round(Number(scanResult.fat || 0) * scale * 10) / 10;
    const c = Math.round(Number(scanResult.carbs || 0) * scale * 10) / 10;
    
    setScannedProtein(p);
    setScannedFat(f);
    setScannedCarbs(c);
    setScannedCalories(Math.round(p * 4 + f * 9 + c * 4));
  };

  // Додавання розпізнаної страви у щоденник
  const addScannedMealToDiary = () => {
    if (!scanResult) return;

    if (scanResult.dataQuality !== "label_read" && scanResult.dataQuality !== "database_match") {
      const confirmed = window.confirm("Це приблизна оцінка ШІ, а не точні дані з етикетки. Додати її до щоденника?");
      if (!confirmed) return;
    }

    const category = scannedMealCategory;

    const baselineWeight = Number(scanResult.weight) || 200;
    const finalWeight = Number(editedWeight) || baselineWeight;

    const finalCalories = Number(scannedCalories) || 0;
    const finalProtein = Number(scannedProtein) || 0;
    const finalFat = Number(scannedFat) || 0;
    const finalCarbs = Number(scannedCarbs) || 0;

    const newMeal = {
      id: createMealId(),
      name: scanResult.name,
      calories: finalCalories,
      protein: finalProtein,
      fat: finalFat,
      carbs: finalCarbs,
      weight: finalWeight,
      originalCalories: Number(scanResult.calories),
      originalProtein: Number(scanResult.protein),
      originalFat: Number(scanResult.fat),
      originalCarbs: Number(scanResult.carbs),
      originalWeight: baselineWeight,
      category,
      date: selectedDate,
      icon: getEmojiForCategory(category)
    };

    setMeals(prev => [newMeal, ...prev]);
    setPreselectedCategory(null);
    
    showToast(`Страву "${scanResult.name}" додано до щоденника!`, "success");
    
    setScanResult(null);
    setActiveTab('dashboard');
  };

  // Спроба отримати продукт з локальної бази кастомних штрих-кодів або з Open Food Facts
  const resolveBarcodeProduct = async (barcodeVal) => {
    const cleanBarcode = barcodeVal.trim();
    if (customBarcodes && customBarcodes[cleanBarcode]) {
      console.log("Знайдено продукт в локальній базі штрих-кодів:", customBarcodes[cleanBarcode]);
      return customBarcodes[cleanBarcode];
    }
    return await getProductByBarcode(cleanBarcode);
  };

  const prepareManualBarcodeEntry = (barcodeVal, product = null, message = "") => {
    const cleanBarcode = barcodeVal?.trim() || product?.barcode || "";
    setBarcodeResult(null);
    setBarcodeCandidateProduct(product);
    setBarcodeNotFound(cleanBarcode);
    setBarcodeError(message);
    setFallbackName(product?.name || '');
    setFallbackCalories('');
    setFallbackProtein('');
    setFallbackFat('');
    setFallbackCarbs('');
    setFallbackWeight(product?.weight ? String(product.weight) : '100');
  };

  const setVerifiedBarcodeProduct = (product, barcodeVal = "") => {
    if (product?.source === "openfoodfacts") {
      prepareManualBarcodeEntry(
        barcodeVal,
        product,
        "Зовнішня база знайшла товар, але її КБЖВ не використовуються автоматично. Введіть значення з етикетки."
      );
      return false;
    }

    if (!hasCompleteNutritionValues(product)) {
      throw new Error("У знайденого продукту немає повного набору КБЖВ. Щоб не показувати неправильні дані, внесіть значення з етикетки вручну.");
    }

    setBarcodeCandidateProduct(null);
    setBarcodeNotFound(null);
    setBarcodeResult(product);
    const w = product.weight || 100;
    setBarcodeEditedWeight(w);
    const scale = w / 100;
    setBarcodeScannedProtein(Math.round((product.protein || 0) * scale * 10) / 10);
    setBarcodeScannedFat(Math.round((product.fat || 0) * scale * 10) / 10);
    setBarcodeScannedCarbs(Math.round((product.carbs || 0) * scale * 10) / 10);
    setBarcodeScannedCalories(Math.round((product.calories || 0) * scale));
    return true;
  };

  // Запуск аналізу штрих-коду ШІ
  const triggerBarcodeScan = async (imageDataBase64) => {
    setIsBarcodeScanning(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setBarcodeCandidateProduct(null);
    setBarcodeNotFound(null);
    setBarcodeMealCategory(preselectedCategory || getDefaultCategory());
    let detectedBarcode = null;
    try {
      if (scanMode === 'mock') {
        throw new Error("Для розпізнавання штрих-коду з фото оберіть GPT (OpenAI) або Gemini у налаштуваннях ШІ.");
      }

      const barcodeVal = await detectBarcodeWithCurrentProvider(imageDataBase64);

      if (!barcodeVal) {
        throw new Error("Не вдалося розпізнати штрих-код на фото. Спробуйте інший ракурс або введіть його вручну.");
      }

      detectedBarcode = barcodeVal;
      setBarcodeInput(barcodeVal);
      
      setBarcodeLoading(true);
      const product = await resolveBarcodeProduct(barcodeVal);
      setVerifiedBarcodeProduct(product, barcodeVal);
    } catch (err) {
      console.error(err);
      setBarcodeError(err.message || "Помилка при зчитуванні штрих-коду.");
      if (detectedBarcode) {
        prepareManualBarcodeEntry(detectedBarcode, null, err.message || "Не вдалося знайти надійні дані для цього штрих-коду.");
      }
    } finally {
      setIsBarcodeScanning(false);
      setBarcodeLoading(false);
    }
  };

  // Зйомка штрих-коду на камеру
  const captureBarcodePhoto = () => {
    if (!allowCameraTrigger) return;
    if (Date.now() - scannerOpenedTimeRef.current < 350) {
      console.log("Ignored captureBarcodePhoto: triggered too soon after opening scanner.");
      return;
    }
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.7);
    triggerBarcodeScan(base64Data);
  };

  // Прямий пошук за розпізнаним штрих-кодом без необхідності фотографування через ШІ
  const triggerBarcodeSearchDirect = async (barcodeVal) => {
    if (!barcodeVal) return;
    setBarcodeInput(barcodeVal);
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setBarcodeCandidateProduct(null);
    setBarcodeNotFound(null);
    setBarcodeMealCategory(preselectedCategory || getDefaultCategory());
    
    try {
      const product = await resolveBarcodeProduct(barcodeVal);
      const accepted = setVerifiedBarcodeProduct(product, barcodeVal);
      
      // Вібрація для зворотного зв'язку при успішному зчитуванні
      if (accepted && navigator.vibrate) {
        navigator.vibrate(150);
      }
      if (accepted) {
        showToast("Штрих-код успішно розпізнано!", "success");
      }
    } catch (err) {
      console.error("Direct barcode search error:", err);
      prepareManualBarcodeEntry(barcodeVal, null, err.message || "Не вдалося знайти надійні дані для цього штрих-коду.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  // Збереження нового продукту вручну без штрих-коду
  const handleSaveCustomFood = () => {
    if (!customFoodName.trim()) {
      showToast("Будь ласка, введіть назву продукту", "error");
      return;
    }
    if (!hasFilledNutritionInputs(customFoodCalories, customFoodProtein, customFoodFat, customFoodCarbs, customFoodWeight)) {
      showToast("Введіть вагу та всі КБЖВ з етикетки, щоб зберегти продукт у базу.", "error");
      return;
    }

    const kcalVal = Number(customFoodCalories) || 0;
    const proteinVal = Number(customFoodProtein) || 0;
    const fatVal = Number(customFoodFat) || 0;
    const carbsVal = Number(customFoodCarbs) || 0;
    const defaultWeightVal = Number(customFoodWeight) || 100;

    const scaleTo100 = defaultWeightVal > 0 ? (100 / defaultWeightVal) : 1;
    const now = new Date().toISOString();
    const normalizedFood = {
      name: customFoodName.trim(),
      calories: Math.round(kcalVal * scaleTo100),
      protein: Math.round(proteinVal * scaleTo100 * 10) / 10,
      fat: Math.round(fatVal * scaleTo100 * 10) / 10,
      carbs: Math.round(carbsVal * scaleTo100 * 10) / 10,
      weight: 100,
      brand: "Моя база",
      icon: "🏷️",
      source: "manual",
      sourceLabel: "Моя база",
      dataQuality: "manual",
      searchText: `${customFoodName.trim()} моя база введено вручну`.toLowerCase(),
      updatedAt: now
    };

    if (customFoodEditTarget?.type === 'barcode') {
      const barcode = customFoodEditTarget.barcode;
      const updatedProduct = {
        ...(customBarcodes[barcode] || {}),
        ...normalizedFood,
        barcode,
        id: customBarcodes[barcode]?.id || `barcode-${barcode}`,
        createdAt: customBarcodes[barcode]?.createdAt || now
      };

      setCustomBarcodes(prev => ({
        ...prev,
        [barcode]: updatedProduct
      }));
      setSelectedSearchFood(prev => prev?.isCustomBarcode && prev.barcode === barcode ? { ...updatedProduct, isCustomBarcode: true } : prev);
      setBarcodeResult(prev => prev?.barcode === barcode ? updatedProduct : prev);
      showToast(`"${updatedProduct.name}" оновлено у вашій базі.`, "success");
      closeCustomFoodModal();
      resetCustomFoodForm();
      return;
    }

    if (customFoodEditTarget?.type === 'food') {
      const updatedFood = {
        ...normalizedFood,
        id: customFoodEditTarget.id,
        createdAt: customFoods.find(food => food.id === customFoodEditTarget.id)?.createdAt || now
      };

      setCustomFoods(prev => prev.map(food => (
        food.id === customFoodEditTarget.id ? { ...food, ...updatedFood } : food
      )));
      setSelectedSearchFood(prev => prev?.isCustom && prev.id === customFoodEditTarget.id ? { ...updatedFood, isCustom: true } : prev);
      showToast(`"${updatedFood.name}" оновлено у вашій базі.`, "success");
      closeCustomFoodModal();
      resetCustomFoodForm();
      return;
    }

    const newFood = {
      ...normalizedFood,
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now
    };

    setCustomFoods(prev => [newFood, ...prev]);

    closeCustomFoodModal();
    resetCustomFoodForm();

    showToast(`"${newFood.name}" збережено у вашу базу продуктів!`, "success");

    // Відразу відкриваємо діалог додавання до щоденника
    setSelectedSearchFood({ ...newFood, isCustom: true });
    setSearchFoodWeight(defaultWeightVal);
    setSearchMealCategory(getDefaultCategory());
  };

  // Збереження нового продукту для раніше невідомого штрих-коду
  const handleSaveCustomBarcode = () => {
    if (!fallbackName.trim()) {
      showToast("Будь ласка, введіть назву продукту", "error");
      return;
    }
    if (!barcodeNotFound) return;
    if (!hasFilledNutritionInputs(fallbackCalories, fallbackProtein, fallbackFat, fallbackCarbs, fallbackWeight)) {
      showToast("Введіть вагу та всі КБЖВ з етикетки, щоб зберегти продукт для штрих-коду.", "error");
      return;
    }

    const kcalVal = Number(fallbackCalories) || 0;
    const proteinVal = Number(fallbackProtein) || 0;
    const fatVal = Number(fallbackFat) || 0;
    const carbsVal = Number(fallbackCarbs) || 0;
    const defaultWeightVal = Number(fallbackWeight) || 100;

    const scaleTo100 = defaultWeightVal > 0 ? (100 / defaultWeightVal) : 1;
    const newProduct = {
      barcode: barcodeNotFound,
      name: fallbackName.trim(),
      calories: Math.round(kcalVal * scaleTo100),
      protein: Math.round(proteinVal * scaleTo100 * 10) / 10,
      fat: Math.round(fatVal * scaleTo100 * 10) / 10,
      carbs: Math.round(carbsVal * scaleTo100 * 10) / 10,
      weight: 100, // Базові нутрієнти зберігаємо на 100г
      brand: "Моя база",
      icon: "🏷️",
      source: "manual",
      sourceLabel: "Моя база",
      dataQuality: "manual",
      searchText: `${fallbackName.trim()} ${barcodeNotFound} моя база штрих код введено вручну`.toLowerCase(),
      createdAt: new Date().toISOString()
    };

    setCustomBarcodes(prev => ({
      ...prev,
      [barcodeNotFound]: newProduct
    }));

    setFallbackName('');
    setFallbackCalories('');
    setFallbackProtein('');
    setFallbackFat('');
    setFallbackCarbs('');
    setFallbackWeight('100');
    setIsBarcodeNotFoundModalOpen(false);
    setBarcodeNotFound(null);
    setBarcodeCandidateProduct(null);

    showToast(`"${newProduct.name}" збережено у вашу базу та прив'язано до штрих-коду!`, "success");

    // Відразу відкриваємо результат штрих-коду
    setBarcodeResult(newProduct);
    setBarcodeEditedWeight(defaultWeightVal);
    setBarcodeMealCategory(getDefaultCategory());
    
    // Встановлюємо значення макросів для поточної ваги
    setBarcodeScannedCalories(kcalVal);
    setBarcodeScannedProtein(proteinVal);
    setBarcodeScannedFat(fatVal);
    setBarcodeScannedCarbs(carbsVal);
  };

  // Автоматичне сканування штрих-коду за допомогою вбудованого BarcodeDetector API (якщо підтримується браузером)
  useEffect(() => {
    if (activeTab !== 'scanner' || scannerMode !== 'barcode' || !cameraActive || barcodeResult || barcodeLoading || isBarcodeScanning) {
      return;
    }

    if (!isNativeScannerSupported) {
      return;
    }

    let intervalId = null;
    try {
      const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
      const detector = new window.BarcodeDetector({ formats });

      intervalId = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState !== 4) return;

        try {
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            console.log("Natively detected barcode:", code);
            clearInterval(intervalId);
            triggerBarcodeSearchDirect(code);
          }
        } catch (detectErr) {
          console.error("Barcode detection loop error:", detectErr);
        }
      }, 400);
    } catch (e) {
      console.error("Failed to initialize BarcodeDetector:", e);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [activeTab, scannerMode, cameraActive, barcodeResult, barcodeLoading, isBarcodeScanning, isNativeScannerSupported]);

  // Обробка завантаження файлу зображення штрих-коду
  const handleBarcodeFileUpload = async (e) => {
    if (!allowCameraTrigger) {
      e.target.value = "";
      return;
    }
    const file = e.target.files[0];
    if (!file) return;

    try {
      try {
        const compressedBase64 = await compressImage(file);
        await triggerBarcodeScan(compressedBase64);
      } catch (err) {
        console.error("Помилка стиснення зображення штрих-коду, надсилаємо оригінал:", err);
        await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              await triggerBarcodeScan(reader.result);
              resolve();
            } catch (scanErr) {
              reject(scanErr);
            }
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
      }
    } catch (err) {
      console.error("Помилка обробки файлу штрих-коду:", err);
    } finally {
      e.target.value = "";
    }
  };

  // Обробка пошуку продукту за штрих-кодом
  const handleBarcodeSearch = async (e) => {
    if (e) e.preventDefault();
    if (!barcodeInput.trim()) {
      setBarcodeError("Будь ласка, введіть штрих-код.");
      return;
    }
    
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setBarcodeCandidateProduct(null);
    setBarcodeNotFound(null);
    setBarcodeMealCategory(preselectedCategory || getDefaultCategory());
    
    try {
      const product = await resolveBarcodeProduct(barcodeInput);
      setVerifiedBarcodeProduct(product, barcodeInput);
    } catch (err) {
      console.error("Barcode lookup error:", err);
      prepareManualBarcodeEntry(barcodeInput.trim(), null, err.message || "Не вдалося знайти надійні дані для цього штрих-коду.");
    } finally {
      setBarcodeLoading(false);
    }
  };

  // Обробник ручної зміни білків, жирів та вуглеводів для штрих-коду
  const handleBarcodeMacroChange = (macro, value) => {
    let p = barcodeScannedProtein;
    let f = barcodeScannedFat;
    let c = barcodeScannedCarbs;
    
    if (macro === 'protein') {
      setBarcodeScannedProtein(value);
      p = value;
    } else if (macro === 'fat') {
      setBarcodeScannedFat(value);
      f = value;
    } else if (macro === 'carbs') {
      setBarcodeScannedCarbs(value);
      c = value;
    }
    
    const pVal = p === '' ? 0 : (parseFloat(p) || 0);
    const fVal = f === '' ? 0 : (parseFloat(f) || 0);
    const cVal = c === '' ? 0 : (parseFloat(c) || 0);
    
    const caloriesVal = Math.round(pVal * 4 + fVal * 9 + cVal * 4);
    setBarcodeScannedCalories(caloriesVal);

    if (barcodeResult) {
      const portionWeight = Number(barcodeEditedWeight) || 100;
      const scaleTo100 = portionWeight > 0 ? (100 / portionWeight) : 1;
      
      setBarcodeResult(prev => ({
        ...prev,
        protein: Math.round(pVal * scaleTo100 * 10) / 10,
        fat: Math.round(fVal * scaleTo100 * 10) / 10,
        carbs: Math.round(cVal * scaleTo100 * 10) / 10,
        calories: Math.round(caloriesVal * scaleTo100)
      }));
    }
  };

  // Обробник ручної зміни ваги порції для штрих-коду з масштабуванням КБЖВ
  const handleBarcodeWeightChange = (value) => {
    setBarcodeEditedWeight(value);
    if (!barcodeResult) return;
    
    const baselineWeight = 100;
    const currentWeightVal = Number(value) || 0;
    const scale = currentWeightVal > 0 ? (currentWeightVal / baselineWeight) : 0;
    
    const p = Math.round(Number(barcodeResult.protein || 0) * scale * 10) / 10;
    const f = Math.round(Number(barcodeResult.fat || 0) * scale * 10) / 10;
    const c = Math.round(Number(barcodeResult.carbs || 0) * scale * 10) / 10;
    
    setBarcodeScannedProtein(p);
    setBarcodeScannedFat(f);
    setBarcodeScannedCarbs(c);
    setBarcodeScannedCalories(Math.round(p * 4 + f * 9 + c * 4));
  };

  // Додавання знайденого за штрих-кодом продукту у щоденник
  const addBarcodeMealToDiary = () => {
    if (!barcodeResult) return;

    const category = barcodeMealCategory;

    const baselineWeight = 100;
    const finalWeight = Number(barcodeEditedWeight) || 100;

    const finalCalories = Number(barcodeScannedCalories) || 0;
    const finalProtein = Number(barcodeScannedProtein) || 0;
    const finalFat = Number(barcodeScannedFat) || 0;
    const finalCarbs = Number(barcodeScannedCarbs) || 0;

    const newMeal = {
      id: createMealId(),
      name: barcodeResult.name,
      calories: finalCalories,
      protein: finalProtein,
      fat: finalFat,
      carbs: finalCarbs,
      weight: finalWeight,
      originalCalories: Number(barcodeResult.calories),
      originalProtein: Number(barcodeResult.protein),
      originalFat: Number(barcodeResult.fat),
      originalCarbs: Number(barcodeResult.carbs),
      originalWeight: baselineWeight,
      category,
      date: selectedDate,
      icon: getEmojiForCategory(category)
    };

    setMeals(prev => [newMeal, ...prev]);
    setPreselectedCategory(null);
    showToast(`Продукт "${barcodeResult.name}" додано до щоденника!`, "success");
    
    setBarcodeResult(null);
    setBarcodeInput('');
    setActiveTab('dashboard');
  };

  const getEmojiForCategory = (cat) => {
    switch (cat) {
      case 'Сніданок': return '🍳';
      case 'Перший перекус': return '🍎';
      case 'Обід': return '🥣';
      case 'Другий перекус': return '🍌';
      case 'Вечеря': return '🥗';
      default: return '🍕';
    }
  };

  // --- Manual Search Helper Functions ---
  const addSearchMealToDiary = () => {
    if (!selectedSearchFood) return;
    const weightFactor = Number(searchFoodWeight) / Number(selectedSearchFood.weight);
    const finalCalories = Math.round(Number(selectedSearchFood.calories) * weightFactor);
    const finalProtein = Math.round(Number(selectedSearchFood.protein) * weightFactor * 10) / 10;
    const finalFat = Math.round(Number(selectedSearchFood.fat) * weightFactor * 10) / 10;
    const finalCarbs = Math.round(Number(selectedSearchFood.carbs) * weightFactor * 10) / 10;

    const newMeal = {
      id: createMealId(),
      name: selectedSearchFood.name,
      calories: finalCalories,
      protein: finalProtein,
      fat: finalFat,
      carbs: finalCarbs,
      weight: Number(searchFoodWeight),
      originalCalories: Number(selectedSearchFood.calories),
      originalProtein: Number(selectedSearchFood.protein),
      originalFat: Number(selectedSearchFood.fat),
      originalCarbs: Number(selectedSearchFood.carbs),
      originalWeight: Number(selectedSearchFood.weight),
      category: searchMealCategory,
      date: selectedDate,
      icon: selectedSearchFood.icon || getEmojiForCategory(searchMealCategory)
    };

    setMeals(prev => [newMeal, ...prev]);
    setPreselectedCategory(null);
    showToast(`"${selectedSearchFood.name}" додано до щоденника!`, "success");
    
    setSelectedSearchFood(null);
    setSearchQuery('');
    changeTab(previousTab || 'dashboard');
  };

  const triggerAISmartSearch = async (queryToSearch) => {
    if (!queryToSearch || !queryToSearch.trim()) return;
    if (scanMode === 'mock') return;

    const aiConfig = getCurrentAiConfig();
    if (!aiConfig.apiKey) return;
    
    const cleanQuery = queryToSearch.trim();
    const cacheKey = `${aiConfig.provider}:${aiConfig.model}:${normalizeSearchText(cleanQuery)}`;
    const cachedAiResults = aiSearchCacheRef.current.get(cacheKey);

    if (cachedAiResults && Date.now() - cachedAiResults.cachedAt < SEARCH_CACHE_TTL_MS) {
      setAiSearchFoods(cachedAiResults.results);
      return cachedAiResults.results;
    }

    if (aiSearchInFlightKeyRef.current === cacheKey) return;

    const requestId = aiSearchRequestIdRef.current + 1;
    aiSearchRequestIdRef.current = requestId;
    aiSearchInFlightKeyRef.current = cacheKey;
    setIsSearchingAI(true);

    try {
      const results = aiConfig.provider === 'openai'
        ? await searchSmartProductsWithOpenAI(cleanQuery, aiConfig.apiKey, aiConfig.model, aiConfig.proxyUrl)
        : await searchSmartProductsWithGemini(cleanQuery, aiConfig.apiKey, aiConfig.model);
      const formattedResults = (results || []).map(p => ({
        id: p.id || `ai-market-${createMealId()}`,
        name: p.name,
        brand: p.brand || p.supermarket || "ШІ Пошук",
        supermarket: p.supermarket || "Загальний",
        calories: Number(p.calories) || 0,
        protein: Number(p.protein) || 0,
        fat: Number(p.fat) || 0,
        carbs: Number(p.carbs) || 0,
        weight: Number(p.weight) || 100,
        ingredients: p.ingredients || null,
        icon: p.icon || "🔮"
      }));

      aiSearchCacheRef.current.set(cacheKey, {
        cachedAt: Date.now(),
        results: formattedResults
      });

      if (requestId !== aiSearchRequestIdRef.current) {
        return formattedResults;
      }

      setAiSearchFoods(formattedResults);
      return formattedResults;
    } catch (err) {
      console.error("Error in AI smart search:", err);
      return [];
    } finally {
      if (aiSearchInFlightKeyRef.current === cacheKey) {
        aiSearchInFlightKeyRef.current = '';
      }
      if (requestId === aiSearchRequestIdRef.current) {
        setIsSearchingAI(false);
      }
    }
  };

  // Об'єднана база продуктів: вбудовані + користувацькі без штрих-коду + користувацькі зі штрих-кодом
  const combinedFoods = useMemo(() => [
    ...customFoods.map(f => ({ 
      ...f, 
      isCustom: true, 
      id: f.id || `custom-${f.name}-${Date.now()}`,
      brand: f.brand || "Мій продукт",
      icon: "🏷️"
    })),
    ...Object.values(customBarcodes).map(f => ({ 
      ...f, 
      isCustomBarcode: true, 
      id: f.id || `barcode-${f.barcode}`,
      brand: f.brand || "Штрих-код",
      icon: "🏷️"
    })),
    ...productCatalog,
    ...mockFoods
  ], [customFoods, customBarcodes]);

  const indexedCombinedFoods = useMemo(() => (
    combinedFoods.map(food => ({
      ...food,
      searchIndexText: getFoodSearchText(food)
    }))
  ), [combinedFoods]);

  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);
  const searchTokens = useMemo(() => normalizedSearchQuery.split(/\s+/).filter(Boolean), [normalizedSearchQuery]);
  const favoriteNameSet = useMemo(() => new Set(favorites.map(fav => normalizeSearchText(fav.name))), [favorites]);

  const filteredSearchFoods = useMemo(() => indexedCombinedFoods.filter(food => {
    const matchesQuery = searchTokens.length === 0 || searchTokens.every(token => food.searchIndexText.includes(token));
    if (!matchesQuery) return false;

    if (selectedCategoryFilter === 'Усі') return true;
    if (selectedCategoryFilter === 'Моя база') {
      return Boolean(food.isCustom || food.isCustomBarcode || food.source === 'manual' || food.dataQuality === 'manual');
    }
    if (selectedCategoryFilter === 'Супермаркети') {
      if (food.supermarket || food.source === 'ua-seed') return true;
      const isSupermarket = food.brand && (
        food.brand.includes('АТБ') || 
        food.brand.includes('Сільпо') || 
        food.brand.includes('Своя Лінія') || 
        food.brand.includes('Розумний Вибір') || 
        food.brand.includes('Премія') ||
        food.brand.includes('Повна Чаша') ||
        food.brand.includes('Яготинське') ||
        food.brand.includes('Галичина') ||
        food.brand.includes('Комо') ||
        food.brand.includes('Наша Ряба') ||
        food.brand.includes('Пирятин') ||
        food.brand.includes('Чумак') ||
        food.brand.includes('Верес') ||
        food.brand.includes('Рошен') ||
        food.brand.includes('Світоч') ||
        food.brand.includes('Agrola') ||
        food.brand.includes('Кулиничі') ||
        food.brand.includes('Київхліб') ||
        food.brand.includes('Алан') ||
        food.brand.includes('Ятрань') ||
        food.brand.includes('Глобино')
      );
      return isSupermarket;
    }
    if (selectedCategoryFilter === 'Страви') {
      return food.brand === 'Українська кухня' || food.brand === 'Популярне';
    }
    if (selectedCategoryFilter === 'Сніданок') return food.category === 'Сніданок';
    if (selectedCategoryFilter === 'Обід') return food.category === 'Обід';
    if (selectedCategoryFilter === 'Вечеря') return food.category === 'Вечеря';
    if (selectedCategoryFilter === 'Перекуси') return food.category === 'Перекус' || food.category === 'Перший перекус' || food.category === 'Другий перекус';
    if (selectedCategoryFilter === 'Обрані') {
      return favoriteNameSet.has(normalizeSearchText(food.name));
    }
    return true;
  }).slice(0, MAX_LOCAL_SEARCH_RESULTS), [indexedCombinedFoods, searchTokens, selectedCategoryFilter, favoriteNameSet]);

  const filteredExternalSearchFoods = useMemo(() => externalSearchFoods.filter(food => {
    if (selectedCategoryFilter === 'Усі') return true;
    if (selectedCategoryFilter === 'Супермаркети') return true;
    return false;
  }), [externalSearchFoods, selectedCategoryFilter]);

  const filteredAiSearchFoods = useMemo(() => aiSearchFoods.filter(food => {
    if (selectedCategoryFilter === 'Усі') return true;
    if (selectedCategoryFilter === 'Супермаркети') return true;
    return false;
  }), [aiSearchFoods, selectedCategoryFilter]);

  const searchSuggestions = useMemo(() => {
    if (searchTokens.length === 0 || !showSuggestions) return [];

    return indexedCombinedFoods
      .filter(food => searchTokens.every(token => food.searchIndexText.includes(token)))
      .slice(0, MAX_SEARCH_SUGGESTIONS);
  }, [indexedCombinedFoods, searchTokens, showSuggestions]);

  const databaseStats = useMemo(() => {
    const sourceCounts = productCatalog.reduce((acc, food) => {
      const source = food.sourceLabel || food.source || food.supermarket || food.brand || "Каталог";
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    const verifiedCustomFoods = customFoods.filter(hasCompleteNutritionValues).length;
    const verifiedBarcodes = Object.values(customBarcodes).filter(hasCompleteNutritionValues).length;

    return {
      catalog: productCatalog.length,
      demo: mockFoods.length,
      custom: customFoods.length,
      customBarcodes: Object.keys(customBarcodes).length,
      verifiedCustom: verifiedCustomFoods + verifiedBarcodes,
      total: productCatalog.length + mockFoods.length + customFoods.length + Object.keys(customBarcodes).length,
      topSources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
    };
  }, [customFoods, customBarcodes]);
  // Оновлення ваги страви з пропорційним перерахунком КБЖВ
  const handleUpdateMealWeight = (mealId, value) => {
    setMeals(prevMeals => prevMeals.map(meal => {
      if (meal.id === mealId) {
        const origWeight = Number(meal.originalWeight) || Number(meal.weight) || 200;
        const origCals = Number(meal.originalCalories) || Number(meal.calories);
        const origProt = Number(meal.originalProtein) || Number(meal.protein);
        const origFat = Number(meal.originalFat) || Number(meal.fat);
        const origCarbs = Number(meal.originalCarbs) || Number(meal.carbs);

        if (value === "") {
          return {
            ...meal,
            weight: "",
            calories: 0,
            protein: 0,
            fat: 0,
            carbs: 0,
            originalWeight: origWeight,
            originalCalories: origCals,
            originalProtein: origProt,
            originalFat: origFat,
            originalCarbs: origCarbs
          };
        }

        const newWeight = Number(value);
        if (isNaN(newWeight) || newWeight < 0) return meal;

        const scale = newWeight / origWeight;

        return {
          ...meal,
          weight: newWeight,
          calories: Math.round(origCals * scale),
          protein: Math.round(origProt * scale * 10) / 10,
          fat: Math.round(origFat * scale * 10) / 10,
          carbs: Math.round(origCarbs * scale * 10) / 10,
          originalWeight: origWeight,
          originalCalories: origCals,
          originalProtein: origProt,
          originalFat: origFat,
          originalCarbs: origCarbs
        };
      }
      return meal;
    }));
  };

  // Оновлення макросів страви з автоматичним перерахунком калорійності
  const handleUpdateMealMacro = (mealId, macroKey, value) => {
    setMeals(prevMeals => prevMeals.map(meal => {
      if (meal.id === mealId) {
        let p = meal.protein;
        let f = meal.fat;
        let c = meal.carbs;

        const numVal = value === "" ? 0 : (parseFloat(value) || 0);

        if (macroKey === 'protein') {
          p = value === "" ? "" : numVal;
        } else if (macroKey === 'fat') {
          f = value === "" ? "" : numVal;
        } else if (macroKey === 'carbs') {
          c = value === "" ? "" : numVal;
        }

        const pVal = p === "" ? 0 : p;
        const fVal = f === "" ? 0 : f;
        const cVal = c === "" ? 0 : c;

        const newCals = Math.round(pVal * 4 + fVal * 9 + cVal * 4);

        return {
          ...meal,
          protein: p,
          fat: f,
          carbs: c,
          calories: newCals,
          originalProtein: pVal,
          originalFat: fVal,
          originalCarbs: cVal,
          originalCalories: newCals,
          originalWeight: Number(meal.weight) || 100
        };
      }
      return meal;
    }));
  };

  // --- Calculations for Current Day ---
  const currentDayMeals = meals.filter(m => m.date === selectedDate);
  
  const totals = currentDayMeals.reduce((acc, m) => {
    acc.calories += m.calories;
    acc.protein += m.protein;
    acc.fat += m.fat;
    acc.carbs += m.carbs;
    return acc;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0 });

  // Округлити макроси
  totals.protein = Math.round(totals.protein * 10) / 10;
  totals.fat = Math.round(totals.fat * 10) / 10;
  totals.carbs = Math.round(totals.carbs * 10) / 10;

  const currentWater = waterIntake[selectedDate] || 0;

  const handleWaterAdd = (amount = 250) => {
    setWaterIntake(prev => ({
      ...prev,
      [selectedDate]: Math.max(0, (prev[selectedDate] || 0) + amount)
    }));
  };

  const deleteMeal = (id) => {
    setMeals(prev => prev.filter(m => m.id !== id));
  };

  // Зміна цільових КБЖВ при зміні ваги або цілі
  const handleProfileChange = (key, value) => {
    const updated = { ...profile, [key]: value };
    
    // Перерахунок КБЖВ за замовчуванням при зміні цілі або ваги
    if (key === 'goal' || key === 'weight') {
      let baseCals = 2000;
      const weightNum = Number(updated.weight) || 70;
      
      if (updated.goal === 'lose') {
        baseCals = Math.round(weightNum * 24); // Дефіцит
      } else if (updated.goal === 'gain') {
        baseCals = Math.round(weightNum * 35); // Профіцит
      } else {
        baseCals = Math.round(weightNum * 30); // Підтримка
      }
      
      updated.targetCalories = baseCals;
      // Білки (2.0г на кг для схуднення, 1.8г для підтримки/росту)
      updated.targetProtein = Math.round(weightNum * (updated.goal === 'lose' ? 2.0 : 1.8));
      // Жири (0.9г на кг)
      updated.targetFat = Math.round(weightNum * 0.9);
      // Вуглеводи (залишок калорій)
      const fatCals = updated.targetFat * 9;
      const protCals = updated.targetProtein * 4;
      updated.targetCarbs = Math.round((baseCals - fatCals - protCals) / 4);
    }
    
    setProfile(updated);
  };

  // Експорт та імпорт даних користувача (Бекапи)
  const exportUserData = () => {
    try {
      const exportData = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        meals,
        waterIntake,
        profile,
        customFoods,
        customBarcodes,
        apiKey: apiKey === SERVER_GEMINI_API_KEY ? '' : apiKey,
        openAiApiKey,
        openAiProxyUrl,
        scanMode,
        geminiModel,
        openAiModel,
        theme
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const dateStr = getTodayString().replace(/-/g, '');
      link.href = url;
      link.download = `nutrisnap_backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Помилка експорту даних:", error);
      showToast("Не вдалося експортувати дані: " + error.message, "error");
    }
  };

  const importUserData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!window.confirm("Увага! Імпорт резервної копії повністю замінить ваші поточні дані (історію страв, споживання води, налаштування та профіль). Бажаєте продовжити?")) {
      e.target.value = '';
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);
        
        // Валідація структури
        if (!importedData || typeof importedData !== 'object') {
          throw new Error("Невірний формат файлу. Очікувався об'єкт JSON.");
        }
        
        // Відновимо дані
        if (importedData.meals && Array.isArray(importedData.meals)) {
          setMeals(importedData.meals);
        }
        if (importedData.waterIntake && typeof importedData.waterIntake === 'object') {
          setWaterIntake(importedData.waterIntake);
        }
        if (importedData.profile && typeof importedData.profile === 'object') {
          setProfile(prev => ({ ...prev, ...importedData.profile }));
        }
        if (Array.isArray(importedData.customFoods)) {
          setCustomFoods(importedData.customFoods);
        }
        if (importedData.customBarcodes && typeof importedData.customBarcodes === 'object') {
          setCustomBarcodes(importedData.customBarcodes);
        }
        if (importedData.apiKey !== undefined) {
          const importedApiKey = String(importedData.apiKey || '').trim();
          setApiKey(importedApiKey || DEFAULT_API_KEY);
        }
        if (importedData.openAiApiKey !== undefined) {
          setOpenAiApiKey(String(importedData.openAiApiKey || '').trim());
        }
        if (importedData.openAiProxyUrl !== undefined) {
          setOpenAiProxyUrl(String(importedData.openAiProxyUrl || '').trim());
        }
        if (importedData.scanMode !== undefined) {
          setScanMode(importedData.scanMode);
        }
        if (importedData.geminiModel !== undefined) {
          setGeminiModel(importedData.geminiModel);
        }
        if (importedData.openAiModel !== undefined) {
          setOpenAiModel(importedData.openAiModel);
        }
        if (importedData.theme !== undefined) {
          setTheme(importedData.theme);
        }
        
        showToast("Дані успішно імпортовано! Додаток оновлено.", "success");
        e.target.value = '';
      } catch (error) {
        console.error("Помилка імпорту даних:", error);
        showToast("Не вдалося імпортувати дані. Перевірте, чи файл правильного формату та чи він не пошкоджений.\nДеталі: " + error.message, "error");
      }
    };
    reader.readAsText(file);
  };

  // Розрахунок прогресу для SVG
  const importProductDatabase = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const rows = rowsFromProductImport(String(readerEvent.target.result || ""), file.name);
        const importedProducts = rows
          .map((row, index) => normalizeImportedProduct(row, index))
          .filter(product => product && hasCompleteNutritionValues(product));

        if (importedProducts.length === 0) {
          throw new Error("У файлі немає продуктів з назвою та повними КБЖВ.");
        }

        const productsWithoutBarcode = importedProducts.filter(product => !product.barcode);
        const productsWithBarcode = importedProducts.filter(product => product.barcode);
        const existingFoodMap = new Map(customFoods.map(food => [normalizeSearchText(`${food.name} ${food.brand}`), food]));
        const nextCustomFoods = [...customFoods];
        let addedFoods = 0;
        let updatedFoods = 0;

        productsWithoutBarcode.forEach(product => {
          const key = normalizeSearchText(`${product.name} ${product.brand}`);
          const existing = existingFoodMap.get(key);
          if (existing) {
            const index = nextCustomFoods.findIndex(food => food.id === existing.id);
            nextCustomFoods[index] = {
              ...existing,
              ...product,
              id: existing.id,
              createdAt: existing.createdAt || product.createdAt
            };
            updatedFoods += 1;
          } else {
            const newFood = {
              ...product,
              id: `custom-import-${Date.now()}-${addedFoods}`
            };
            nextCustomFoods.unshift(newFood);
            existingFoodMap.set(key, newFood);
            addedFoods += 1;
          }
        });

        const nextCustomBarcodes = { ...customBarcodes };
        let addedBarcodes = 0;
        let updatedBarcodes = 0;

        productsWithBarcode.forEach(product => {
          const existing = nextCustomBarcodes[product.barcode];
          nextCustomBarcodes[product.barcode] = {
            ...existing,
            ...product,
            id: existing?.id || `barcode-${product.barcode}`,
            createdAt: existing?.createdAt || product.createdAt
          };
          if (existing) updatedBarcodes += 1;
          else addedBarcodes += 1;
        });

        setCustomFoods(nextCustomFoods);
        setCustomBarcodes(nextCustomBarcodes);
        showToast(`Імпортовано ${addedFoods + addedBarcodes} нових, оновлено ${updatedFoods + updatedBarcodes}.`, "success");
      } catch (error) {
        console.error("Product database import error:", error);
        showToast(`Не вдалося імпортувати базу: ${error.message}`, "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const downloadProductImportTemplate = () => {
    const csv = [
      "name,brand,supermarket,category,calories,protein,fat,carbs,weight,barcode,aliases,ingredients,icon",
      "Молоко 2.5%,Своя Лінія,АТБ,Сніданок,52,2.8,2.5,4.7,100,,молоко;атб,,🥛",
      "Гречка варена,,,Обід,110,3.6,1.1,21.3,100,,гречана каша,,🍚"
    ].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "nutrisnap_products_template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const calPercent = Math.min((totals.calories / profile.targetCalories) * 100, 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calPercent / 100) * circumference;

  // Перемикання дат
  const changeDate = (days) => {
    const current = parseLocalDate(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(getTodayString(current));
  };

  // Розрахунок масштабованих КБЖВ для картки результатів сканування
  const baselineWeight = scanResult ? (Number(scanResult.weight) || 200) : 200;



  return (
    <div className="app-container">
      
      {/* --- App Header --- */}
      <header className="app-header">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {activeTab !== 'dashboard' && (
            <button
              onClick={() => {
                changeTab('dashboard');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                borderRadius: '8px',
                transition: 'background 0.2s',
                marginLeft: '-4px'
              }}
              className="header-back-btn"
              title="Назад на головну"
            >
              <ChevronLeft size={22} style={{ color: 'var(--color-calories)' }} />
            </button>
          )}
          <span className="brand-logo">NutriSnap</span>
          {(scanMode === 'gemini' || scanMode === 'openai') && (
            <span style={{ 
              fontSize: '10px', 
              background: scanMode === 'openai' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)', 
              color: scanMode === 'openai' ? '#34d399' : '#818cf8', 
              padding: '2px 6px', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontWeight: 600
            }}>
              <Sparkles size={10} /> {scanMode === 'openai' ? 'GPT' : 'ШІ Gemini'}
            </span>
          )}
        </div>
        <button 
          className="theme-toggle" 
          onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          title="Змінити тему"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* --- App Main Content Scroll Area --- */}
      <main className="app-content">
        
        {/* ========================================================================= */}
        {/* 1. DASHBOARD TAB */}
        {/* ========================================================================= */}
        {activeTab === 'dashboard' && (
          <div>
            {/* Date Swiper */}
            <div className="diary-day-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 className="section-title" style={{ marginBottom: 0 }}>{getDashboardTitle(selectedDate)}</h2>
                {(() => {
                  const streak = calculateStreak();
                  return streak > 0 ? (
                    <div className="streak-badge" title={`Серія активності: ${streak} днів`}>
                      <Flame size={16} className="streak-flame-icon" />
                      <span>{streak} дн.</span>
                    </div>
                  ) : null;
                })()}
              </div>
              <div className="date-picker-bar">
                <button className="date-arrow-btn" onClick={() => changeDate(-1)}>
                  <ChevronLeft size={20} />
                </button>
                <span className="date-display">{formatDateLabel(selectedDate)}</span>
                <button className="date-arrow-btn" onClick={() => changeDate(1)}>
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Glassmorphism Circle Progress Card */}
            <div className="glass-card">
              <div className="dashboard-summary">
                <div className="circular-progress-container">
                  <svg className="circular-progress-svg" viewBox="0 0 140 140" aria-label="Прогрес калорій за день">
                    <circle className="progress-bg-circle" cx="70" cy="70" r={radius} />
                    <circle 
                      className="progress-active-circle" 
                      cx="70" 
                      cy="70" 
                      r={radius} 
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  </svg>
                  <div className="circular-progress-text">
                    <span className="calories-val">{totals.calories}</span>
                    <span className="calories-label">ккал</span>
                    <span className="calories-target">з {profile.targetCalories}</span>
                  </div>
                </div>

                <div className="macros-progress-grid">
                  {/* Protein */}
                  <div className="macro-bar-item">
                    <div className="macro-bar-header">
                      <span className="macro-bar-name">
                        <span className="macro-dot dot-protein"></span>
                        Білки
                      </span>
                      <span className="macro-bar-value">
                        <span className="macro-val-current">{totals.protein}г</span>
                        <span className="macro-val-divider">/</span>
                        <span className="macro-val-target">{profile.targetProtein}г</span>
                      </span>
                    </div>
                    <div className="macro-bar-track">
                      <div 
                        className="macro-bar-fill fill-protein" 
                        style={{ width: `${Math.min((totals.protein / profile.targetProtein) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Fat */}
                  <div className="macro-bar-item">
                    <div className="macro-bar-header">
                      <span className="macro-bar-name">
                        <span className="macro-dot dot-fat"></span>
                        Жири
                      </span>
                      <span className="macro-bar-value">
                        <span className="macro-val-current">{totals.fat}г</span>
                        <span className="macro-val-divider">/</span>
                        <span className="macro-val-target">{profile.targetFat}г</span>
                      </span>
                    </div>
                    <div className="macro-bar-track">
                      <div 
                        className="macro-bar-fill fill-fat" 
                        style={{ width: `${Math.min((totals.fat / profile.targetFat) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Carbs */}
                  <div className="macro-bar-item">
                    <div className="macro-bar-header">
                      <span className="macro-bar-name">
                        <span className="macro-dot dot-carbs"></span>
                        Вуглеводи
                      </span>
                      <span className="macro-bar-value">
                        <span className="macro-val-current">{totals.carbs}г</span>
                        <span className="macro-val-divider">/</span>
                        <span className="macro-val-target">{profile.targetCarbs}г</span>
                      </span>
                    </div>
                    <div className="macro-bar-track">
                      <div 
                        className="macro-bar-fill fill-carbs" 
                        style={{ width: `${Math.min((totals.carbs / profile.targetCarbs) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Water Tracker */}
            <div className="glass-card water-tracker-card">
              <div className="water-left">
                <div className="water-icon-box" style={{ overflow: 'visible', position: 'relative' }}>
                  {(() => {
                    const waterPercent = Math.min((currentWater / 2000) * 100, 100);
                    return (
                      <svg 
                        viewBox="0 0 24 24" 
                        width="40" 
                        height="40" 
                        style={{ overflow: 'visible' }}
                        className="water-droplet-svg"
                      >
                        <defs>
                          <linearGradient id="waterDropletGrad" x1="0" y1="1" x2="0" y2="0">
                            {/* Filled part (blue gradient) */}
                            <stop offset="0%" stopColor="#1d4ed8" />
                            <stop offset={`${waterPercent}%`} stopColor="#3b82f6" />
                            {/* Empty/translucent part */}
                            <stop offset={`${waterPercent}%`} stopColor="rgba(59, 130, 246, 0.05)" />
                            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.02)" />
                          </linearGradient>
                          <filter id="waterGlow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="1.5" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                          </filter>
                        </defs>
                        <path 
                          d="M12 22C17.5 22 21 18.5 21 14C21 9 12 2.5 12 2.5C12 2.5 3 9 3 14C3 18.5 6.5 22 12 22Z" 
                          fill="url(#waterDropletGrad)" 
                          stroke={waterPercent > 0 ? '#60a5fa' : 'rgba(59, 130, 246, 0.3)'}
                          strokeWidth="1.8" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                          style={{
                            transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                            filter: waterPercent >= 100 ? 'url(#waterGlow)' : 'none'
                          }}
                        />
                        {/* 3D Reflection Highlight */}
                        <path 
                          d="M8.5 13.5C8.1 14.5 8.3 15.8 9 16.5" 
                          stroke="rgba(255, 255, 255, 0.4)" 
                          strokeWidth="1" 
                          strokeLinecap="round"
                          style={{ 
                            opacity: waterPercent > 30 ? 1 : 0.1, 
                            transition: 'opacity 0.5s' 
                          }}
                        />
                      </svg>
                    );
                  })()}
                </div>
                <div>
                  <h3 className="water-title">Вода</h3>
                  <p className="water-progress">{currentWater} мл / 2000 мл</p>
                  <div className="water-progress-track" aria-hidden="true">
                    <div
                      className="water-progress-fill"
                      style={{ width: `${Math.min((currentWater / 2000) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
              <div className="water-actions">
                <button 
                  className="btn-water-add" 
                  onClick={() => handleWaterAdd(-250)} 
                  title="Зменшити на 250мл"
                  style={{
                    opacity: currentWater > 0 ? 1 : 0.5,
                    pointerEvents: currentWater > 0 ? 'auto' : 'none',
                    background: 'rgba(239, 68, 68, 0.08)',
                    color: '#f87171',
                    borderColor: 'rgba(239, 68, 68, 0.15)'
                  }}
                >
                  -250
                </button>
                <button className="btn-water-add" onClick={() => handleWaterAdd(250)} title="Додати 250мл">
                  +250
                </button>
                <button className="btn-water-add" onClick={() => handleWaterAdd(500)} title="Додати 500мл">
                  +500
                </button>
              </div>
            </div>

            {/* Favorites Scroll Tray */}
            {favorites.length > 0 && (
              <div className="favorites-container" style={{ marginTop: '24px' }}>
                <h3 className="section-title" style={{ marginBottom: '12px' }}>Обрані страви</h3>
                <div className="favorites-scroll-tray">
                  {favorites.map((fav, index) => (
                    <div key={index} className="favorite-meal-card">
                      {fav.image ? (
                        <img src={fav.image} alt={fav.name} className="favorite-meal-img" />
                      ) : (
                        <div className="favorite-meal-img-placeholder">
                          <span>🍳</span>
                        </div>
                      )}
                      <div className="favorite-meal-info">
                        <span className="favorite-meal-name" title={fav.name}>{fav.name}</span>
                        <span className="favorite-meal-kcal">{fav.calories} ккал</span>
                        <span className="favorite-meal-weight">{fav.weight}г</span>
                      </div>
                      <div className="favorite-meal-actions">
                        <button 
                          className="btn-fav-add" 
                          onClick={() => {
                            const category = getDefaultCategory();
                            const newMeal = {
                              id: createMealId(),
                              name: fav.name,
                              calories: Number(fav.calories) || 0,
                              protein: Number(fav.protein) || 0,
                              fat: Number(fav.fat) || 0,
                              carbs: Number(fav.carbs) || 0,
                              weight: Number(fav.weight) || 100,
                              originalCalories: Number(fav.calories) || 0,
                              originalProtein: Number(fav.protein) || 0,
                              originalFat: Number(fav.fat) || 0,
                              originalCarbs: Number(fav.carbs) || 0,
                              originalWeight: Number(fav.weight) || 100,
                              category,
                              date: selectedDate,
                              icon: getEmojiForCategory(category),
                              image: fav.image || ''
                            };
                            setMeals(prev => [newMeal, ...prev]);
                            showToast(`"${fav.name}" додано до щоденника!`, "success");
                          }}
                          title="Додати в щоденник"
                        >
                          Додати
                        </button>
                        <button 
                          className="btn-fav-remove" 
                          onClick={() => {
                            setFavorites(prev => prev.filter(f => f.name.toLowerCase() !== fav.name.toLowerCase()));
                            showToast(`"${fav.name}" видалено з обраного`, "info");
                          }}
                          title="Видалити з шаблонів"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'rgba(255, 255, 255, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px',
                            transition: 'color 0.2s'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Meals Timeline */}
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 className="section-title" style={{ margin: 0 }}>Прийоми їжі за день</h3>
              </div>

              {(() => {
                const categories = [
                  { name: 'Сніданок', icon: '🍳' },
                  { name: 'Перший перекус', icon: '🍎' },
                  { name: 'Обід', icon: '🥣' },
                  { name: 'Другий перекус', icon: '🍌' },
                  { name: 'Вечеря', icon: '🥗' }
                ];
                return categories.map(cat => {
                  const catMeals = currentDayMeals.filter(m => {
                    const normalizedCat = m.category === 'Перекус' ? 'Перший перекус' : m.category;
                    return normalizedCat === cat.name;
                  });
                  const catCals = catMeals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
                  
                  return (
                    <div key={cat.name} className="meal-category-card">
                      <div className="category-header">
                        <div className="category-title">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {catCals > 0 && <span className="category-total-cals">{catCals} ккал</span>}
                          <button 
                            className="category-add-btn" 
                            onClick={() => {
                              setPreselectedCategory(cat.name);
                              setScannerMode('search');
                              changeTab('scanner');
                            }}
                            title={`Додати до: ${cat.name}`}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                      
                      {catMeals.length === 0 ? (
                        <div className="category-empty-placeholder">
                          <span>Немає страв</span>
                        </div>
                      ) : (
                        <div className="category-meals-list">
                          {catMeals.map(meal => (
                            <div key={meal.id} className="timeline-item">
                              <div className="meal-info">
                                <div className="meal-text">
                                  <span className="meal-name" style={{ fontSize: '14px', fontWeight: 600 }}>{meal.name}</span>
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                    <input 
                                      type="number"
                                      value={meal.weight}
                                      onChange={(e) => handleUpdateMealWeight(meal.id, e.target.value)}
                                      className="meal-weight-input"
                                      min="1"
                                      max="5000"
                                    />
                                    <span>г</span>
                                  </span>
                                </div>
                              </div>
                              <div className="meal-calories-details">
                                <span className="meal-kcal">{meal.calories} ккал</span>
                                <div className="meal-macros">
                                  <label className="meal-macro-edit-field">
                                    <span>Білки</span>
                                    <input
                                      type="number"
                                      value={meal.protein}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'protein', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати білки"
                                    />
                                    <span>г</span>
                                  </label>
                                  <label className="meal-macro-edit-field">
                                    <span>Жири</span>
                                    <input
                                      type="number"
                                      value={meal.fat}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'fat', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати жири"
                                    />
                                    <span>г</span>
                                  </label>
                                  <label className="meal-macro-edit-field">
                                    <span>Вугл.</span>
                                    <input
                                      type="number"
                                      value={meal.carbs}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'carbs', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати вуглеводи"
                                    />
                                    <span>г</span>
                                  </label>
                                </div>
                              </div>
                              <button 
                                className={`meal-favorite-btn ${isFavorite(meal.name) ? 'active' : ''}`} 
                                onClick={() => toggleFavoriteMeal(meal)} 
                                title={isFavorite(meal.name) ? "Видалити з обраного" : "Додати в обране"}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: isFavorite(meal.name) ? '#ffb800' : 'rgba(255, 255, 255, 0.4)',
                                  transition: 'color 0.2s ease',
                                  marginRight: '6px'
                                }}
                              >
                                <Star size={16} fill={isFavorite(meal.name) ? "#ffb800" : "none"} />
                              </button>
                              <button className="meal-delete-btn" onClick={() => deleteMeal(meal.id)} title="Видалити">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {activeTab === 'scanner' && (
          <div className="camera-view-container" style={{ background: scannerMode === 'search' ? (theme === 'light' ? '#f8fafc' : '#0b0f19') : '#000' }}>
            {/* Top Bar on camera view */}
            <div className="app-header" style={{ position: scannerMode === 'search' ? 'relative' : 'absolute', top: 0, left: 0, width: '100%', background: scannerMode === 'search' ? 'transparent' : 'rgba(0,0,0,0.6)', border: 'none', flexDirection: 'column', gap: '8px', padding: 'calc(12px + env(safe-area-inset-top, 0px)) 20px 12px', zIndex: 60 }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  onClick={() => {
                    stopCamera();
                    changeTab(previousTab || 'dashboard');
                  }}
                  className="btn-secondary"
                  style={{ 
                    width: 'auto', 
                    margin: 0, 
                    padding: '8px 16px', 
                    borderRadius: '12px', 
                    background: scannerMode === 'search' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.1)', 
                    color: scannerMode === 'search' ? 'var(--color-accent)' : 'white', 
                    border: 'none' 
                  }}
                >
                  Назад
                </button>
                <div style={{ 
                  color: scannerMode === 'search' ? (theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)') : 'white', 
                  fontWeight: 600, 
                  fontSize: '16px' 
                }}>
                  Сканування та Пошук
                </div>
                <div style={{ width: '60px' }}></div> {/* Spacer */}
              </div>

              {/* Режими сканування */}
              <div className="scanner-sub-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button 
                  className={`scanner-sub-tab ${scannerMode === 'search' ? 'active' : ''}`}
                  onClick={() => setScannerMode('search')}
                  style={{ gap: '6px' }}
                >
                  <Search size={14} />
                  <span>Пошук</span>
                </button>
                <button 
                  className={`scanner-sub-tab ${scannerMode === 'camera' ? 'active' : ''}`}
                  onClick={() => setScannerMode('camera')}
                  style={{ gap: '6px' }}
                >
                  <Camera size={14} />
                  <span>Фото ШІ</span>
                </button>
                <button 
                  className={`scanner-sub-tab ${scannerMode === 'barcode' ? 'active' : ''}`}
                  onClick={() => setScannerMode('barcode')}
                  style={{ gap: '6px' }}
                >
                  <QrCode size={14} />
                  <span>Штрих-код</span>
                </button>
              </div>
            </div>

            {/* Shared Camera Preview Wrapper */}
            {(scannerMode === 'camera' || scannerMode === 'barcode') && (
              <div className="camera-preview-wrapper" style={{ paddingTop: 0 }}>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="camera-video"
                  style={{ display: cameraActive ? 'block' : 'none' }}
                ></video>
                
                {scannerMode === 'camera' ? (
                <>
                  {!cameraActive && (
                    <div className="camera-placeholder" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 'calc(130px + env(safe-area-inset-top, 0px)) 24px 24px', textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-calories)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)', marginLeft: 'auto', marginRight: 'auto' }}>
                        <Camera size={40} style={{ display: 'block', margin: 'auto' }} />
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
                        NutriSnap Фотосканер
                      </h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', marginBottom: '24px', lineHeight: '1.6' }}>
                        Фото ШІ може помилятися або впиратися в квоти. Для точного запису відкрийте ручне внесення КБЖВ з етикетки.
                      </p>
                      
                      {cameraError && (
                        <p style={{ fontSize: '12px', color: '#f87171', maxWidth: '280px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          ⚠️ {cameraError}
                        </p>
                      )}
                      
                      <button 
                        className="btn-primary" 
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            setCameraRequested(true);
                          }
                        }}
                        style={{ 
                          cursor: allowCameraTrigger ? 'pointer' : 'default', 
                          width: '100%', 
                          maxWidth: '260px', 
                          padding: '16px', 
                          borderRadius: '16px', 
                          gap: '10px', 
                          boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)', 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          pointerEvents: allowCameraTrigger ? 'auto' : 'none',
                          opacity: allowCameraTrigger ? 1 : 0.6,
                          border: 'none',
                          color: 'white',
                          fontFamily: 'inherit',
                          fontWeight: 600
                        }}
                      >
                        <Camera size={20} />
                        <span>Увімкнути камеру</span>
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            cameraFileInputRef.current?.click();
                          }
                        }}
                        disabled={!allowCameraTrigger}
                        style={{ width: '100%', maxWidth: '260px', marginTop: '10px', justifyContent: 'center' }}
                      >
                        <Upload size={18} />
                        <span>Завантажити фото</span>
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => openCustomFoodForm({ weight: 100 })}
                        disabled={!allowCameraTrigger}
                        style={{ width: '100%', maxWidth: '260px', marginTop: '10px', justifyContent: 'center' }}
                      >
                        <Plus size={18} />
                        <span>Внести КБЖВ вручну</span>
                      </button>
                      <input 
                        ref={cameraFileInputRef}
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        style={{ display: 'none' }} 
                        onChange={handleFileUpload} 
                      />
                    </div>
                  )}

                  {cameraActive && !isScanning && !scanResult && (
                    <div className="scanner-overlay">
                      <div className="scanner-instruction-label">
                        Наведіть камеру на страву
                      </div>
                      
                      <div className="scanner-box">
                        <div className="scanner-box-inner">
                          <div className="scanner-laser"></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {isScanning && (
                    <div className="scanner-loading-overlay">
                      <div className="scanner-loading-pulse">
                        <div className="loading-circle-outer"></div>
                        <span className="loading-icon-inner">🧬</span>
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>NutriSnap AI аналізує страву...</h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8', width: '80%', textAlign: 'center' }}>
                        Визначаємо інгредієнти, вагу та прораховуємо КБЖВ
                      </p>
                    </div>
                  )}

                  {scanResult && (
                    <div className="scan-result-card">
                      <button 
                        onClick={() => setScanResult(null)}
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#fff',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 100
                        }}
                        title="Закрити"
                      >
                        <X size={16} />
                      </button>
                      <div className="results-header" style={{ marginBottom: '8px' }}>
                        <div>
                          <span className="match-badge">
                            {scanResult.dataQuality === "label_read"
                              ? "КБЖВ зчитано з етикетки"
                              : scanResult.dataQuality === "database_match"
                                ? "КБЖВ з локальної бази"
                                : `Оцінка ШІ: ${scanResult.confidence || 0}% впевненості`}
                          </span>
                          <h2 className="dish-title">{scanResult.name}</h2>
                        </div>
                        <span style={{ fontSize: '28px' }}>🥗</span>
                      </div>

                      {scanResult.dataQuality !== "label_read" && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '10px 12px',
                          marginBottom: '12px',
                          borderRadius: '12px',
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          color: '#fbbf24',
                          fontSize: '12px',
                          lineHeight: 1.4,
                          textAlign: 'left'
                        }}>
                          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>{scanResult.warning || "Це приблизна оцінка з фото, не точні дані з етикетки. Перед додаванням перевірте вагу та КБЖВ."}</span>
                        </div>
                      )}

                      <div className="results-macros-grid">
                        <div className="results-macro-box box-kcal">
                          <div className="macro-box-val" style={{ color: 'var(--color-calories)' }}>{scannedCalories}</div>
                          <div className="macro-box-label">ккал</div>
                        </div>
                        <div className="results-macro-box box-protein">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={scannedProtein}
                              onChange={(e) => handleScanMacroChange('protein', e.target.value)}
                              style={{ color: 'var(--color-protein)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-protein)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">білки</div>
                        </div>
                        <div className="results-macro-box box-fat">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={scannedFat}
                              onChange={(e) => handleScanMacroChange('fat', e.target.value)}
                              style={{ color: 'var(--color-fat)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-fat)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">жири</div>
                        </div>
                        <div className="results-macro-box box-carbs">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={scannedCarbs}
                              onChange={(e) => handleScanMacroChange('carbs', e.target.value)}
                              style={{ color: 'var(--color-carbs)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-carbs)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">вуглеводи</div>
                        </div>
                      </div>

                      <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span className="detail-label">Прийом їжі:</span>
                        <select 
                          className="category-select"
                          value={scannedMealCategory}
                          onChange={(e) => setScannedMealCategory(e.target.value)}
                        >
                          <option value="Сніданок">Сніданок</option>
                          <option value="Перший перекус">Перший перекус</option>
                          <option value="Обід">Обід</option>
                          <option value="Другий перекус">Другий перекус</option>
                          <option value="Вечеря">Вечеря</option>
                        </select>
                      </div>

                      <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="detail-label">Вага страви (грам):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="number"
                            className="weight-input"
                            value={editedWeight}
                            onChange={(e) => handleScanWeightChange(e.target.value)}
                            min="1"
                            max="5000"
                          />
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark-secondary)' }}>грам</span>
                        </div>
                      </div>

                      <div className="detail-row">
                        <span className="detail-label">Інгредієнти:</span>
                        <span className="detail-value">{scanResult.ingredients || "Не визначено"}</span>
                      </div>

                      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={addScannedMealToDiary}>
                            <Check size={18} />
                            Додати до щоденника
                          </button>
                          
                          <button 
                            className={`btn-favorite-toggle ${isFavorite(scanResult?.name) ? 'active' : ''}`}
                            onClick={() => toggleFavoriteMeal(scanResult)}
                            title={isFavorite(scanResult?.name) ? "Видалити з обраного" : "Додати в обране"}
                            style={{
                              width: '46px',
                              height: '46px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '12px',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              background: isFavorite(scanResult?.name) ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              color: isFavorite(scanResult?.name) ? '#ffb800' : 'rgba(255, 255, 255, 0.8)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <Star size={20} fill={isFavorite(scanResult?.name) ? "#ffb800" : "none"} />
                          </button>
                        </div>
                        <button 
                          className="btn-secondary" 
                          onClick={() => {
                            setScanResult(null);
                          }}
                        >
                          Сканувати знову
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {!cameraActive && (
                    <div className="camera-placeholder" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 'calc(130px + env(safe-area-inset-top, 0px)) 24px 24px', textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-calories)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)', marginLeft: 'auto', marginRight: 'auto' }}>
                        <QrCode size={40} style={{ display: 'block', margin: 'auto' }} />
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
                        NutriSnap Сканер штрих-кодів
                      </h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', marginBottom: '24px', lineHeight: '1.6' }}>
                        Увімкніть камеру або завантажте фото штрих-коду для автоматичного розпізнавання продукту.
                      </p>
                      
                      {cameraError && (
                        <p style={{ fontSize: '12px', color: '#f87171', maxWidth: '280px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          ⚠️ {cameraError}
                        </p>
                      )}
                      
                      <button 
                        className="btn-primary" 
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            setCameraRequested(true);
                          }
                        }}
                        style={{ 
                          cursor: allowCameraTrigger ? 'pointer' : 'default', 
                          width: '100%', 
                          maxWidth: '260px', 
                          padding: '16px', 
                          borderRadius: '16px', 
                          gap: '10px', 
                          boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)', 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          pointerEvents: allowCameraTrigger ? 'auto' : 'none',
                          opacity: allowCameraTrigger ? 1 : 0.6,
                          border: 'none',
                          color: 'white',
                          fontFamily: 'inherit',
                          fontWeight: 600
                        }}
                      >
                        <Camera size={20} />
                        <span>Увімкнути камеру</span>
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            barcodeFileInputRef.current?.click();
                          }
                        }}
                        disabled={!allowCameraTrigger}
                        style={{ width: '100%', maxWidth: '260px', marginTop: '10px', justifyContent: 'center' }}
                      >
                        <Upload size={18} />
                        <span>Завантажити фото</span>
                      </button>
                      <input 
                        ref={barcodeFileInputRef}
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        style={{ display: 'none' }} 
                        onChange={handleBarcodeFileUpload} 
                      />
                    </div>
                  )}

                  {cameraActive && !isBarcodeScanning && !barcodeLoading && !barcodeResult && !barcodeNotFound && (
                    <div className="scanner-overlay">
                      <div className="scanner-instruction-label">
                        {isNativeScannerSupported 
                          ? "Наведіть камеру на штрих-код (розпізнається автоматично)" 
                          : "Наведіть камеру на штрих-код та натисніть кнопку"}
                      </div>
                      
                      <div className="barcode-scanner-box">
                        <div className="barcode-scanner-box-inner">
                          <div className="barcode-laser"></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(isBarcodeScanning || barcodeLoading) && (
                    <div className="scanner-loading-overlay">
                      <div className="scanner-loading-pulse">
                        <div className="loading-circle-outer"></div>
                        <span className="loading-icon-inner">🔍</span>
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                        {isBarcodeScanning ? "ШІ зчитує штрих-код..." : "Шукаємо продукт в базі..."}
                      </h3>
                    </div>
                  )}

                  {barcodeResult && (
                    <div className="scan-result-card" style={{ zIndex: 100 }}>
                      <button 
                        onClick={() => {
                          setBarcodeResult(null);
                          setBarcodeInput('');
                        }}
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#fff',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 100
                        }}
                        title="Закрити"
                      >
                        <X size={16} />
                      </button>
                      <div className="results-header" style={{ marginBottom: '8px' }}>
                        <div className="barcode-product-info" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          {barcodeResult.image ? (
                            <img src={barcodeResult.image} alt={barcodeResult.name} className="barcode-product-image" style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }} />
                          ) : (
                            <div className="barcode-product-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', width: '56px', height: '56px', borderRadius: '12px' }}>
                              <QrCode size={28} />
                            </div>
                          )}
                          <div>
                            <span className="match-badge">Знайдено за штрих-кодом</span>
                            <h2 className="dish-title" style={{ fontSize: '18px', marginTop: '2px' }}>{barcodeResult.name}</h2>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                              Джерело: {barcodeResult.sourceLabel || barcodeResult.source || "база продуктів"}
                            </div>
                          </div>
                        </div>
                      </div>

                      {barcodeResult.source === "openfoodfacts" && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '10px 12px',
                          marginBottom: '12px',
                          borderRadius: '12px',
                          background: 'rgba(59, 130, 246, 0.12)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          color: '#93c5fd',
                          fontSize: '12px',
                          lineHeight: 1.4,
                          textAlign: 'left'
                        }}>
                          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                          <span>Дані взято з Open Food Facts. Додаток показує їх тільки якщо в базі є повний набір КБЖВ, але етикетка продукту все одно є головним джерелом правди.</span>
                        </div>
                      )}

                      <div className="results-macros-grid">
                        <div className="results-macro-box box-kcal">
                          <div className="macro-box-val" style={{ color: 'var(--color-calories)' }}>{barcodeScannedCalories}</div>
                          <div className="macro-box-label">ккал</div>
                        </div>
                        <div className="results-macro-box box-protein">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={barcodeScannedProtein}
                              onChange={(e) => handleBarcodeMacroChange('protein', e.target.value)}
                              style={{ color: 'var(--color-protein)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-protein)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">білки</div>
                        </div>
                        <div className="results-macro-box box-fat">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={barcodeScannedFat}
                              onChange={(e) => handleBarcodeMacroChange('fat', e.target.value)}
                              style={{ color: 'var(--color-fat)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-fat)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">жири</div>
                        </div>
                        <div className="results-macro-box box-carbs">
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input 
                              type="number"
                              className="macro-box-input"
                              value={barcodeScannedCarbs}
                              onChange={(e) => handleBarcodeMacroChange('carbs', e.target.value)}
                              style={{ color: 'var(--color-carbs)' }}
                              min="0"
                              step="0.1"
                            />
                            <span style={{ color: 'var(--color-carbs)', fontSize: '12px', fontWeight: 700 }}>г</span>
                          </div>
                          <div className="macro-box-label">вуглеводи</div>
                        </div>
                      </div>

                      <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span className="detail-label">Прийом їжі:</span>
                        <select 
                          className="category-select"
                          value={barcodeMealCategory}
                          onChange={(e) => setBarcodeMealCategory(e.target.value)}
                        >
                          <option value="Сніданок">Сніданок</option>
                          <option value="Перший перекус">Перший перекус</option>
                          <option value="Обід">Обід</option>
                          <option value="Другий перекус">Другий перекус</option>
                          <option value="Вечеря">Вечеря</option>
                        </select>
                      </div>

                      <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="detail-label">Вага продукту (грам):</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input 
                            type="number"
                            className="weight-input"
                            value={barcodeEditedWeight}
                            onChange={(e) => handleBarcodeWeightChange(e.target.value)}
                            min="1"
                            max="5000"
                          />
                          <span style={{ fontSize: '11px', opacity: 0.6 }}>(ориг. {barcodeResult.weight}г)</span>
                        </div>
                      </div>

                      {barcodeResult.ingredients && (
                        <div className="detail-row">
                          <span className="detail-label">Склад продукту:</span>
                          <span className="detail-value" style={{ fontStyle: 'italic', fontSize: '11px', color: '#94a3b8', maxHeight: '70px', overflowY: 'auto', display: 'block' }}>
                            {barcodeResult.ingredients}
                          </span>
                        </div>
                      )}

                      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={addBarcodeMealToDiary}>
                            <Check size={18} />
                            Додати до щоденника
                          </button>
                          <button 
                            className={`btn-favorite-toggle ${isFavorite(barcodeResult?.name) ? 'active' : ''}`}
                            onClick={toggleFavoriteBarcode}
                            title={isFavorite(barcodeResult?.name) ? "Видалити з обраного" : "Додати в обране"}
                            style={{
                              width: '46px',
                              height: '46px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '12px',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              background: isFavorite(barcodeResult?.name) ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                              color: isFavorite(barcodeResult?.name) ? '#ffb800' : 'rgba(255, 255, 255, 0.8)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <Star size={20} fill={isFavorite(barcodeResult?.name) ? "#ffb800" : "none"} />
                          </button>
                        </div>
                        <button 
                          className="btn-secondary" 
                          onClick={() => {
                            setBarcodeResult(null);
                            setBarcodeInput('');
                            setBarcodeError(null);
                          }}
                        >
                          Сканувати знову
                        </button>
                      </div>
                    </div>
                  )}

                  {barcodeNotFound && (
                    <div className="scan-result-card" style={{ zIndex: 100, background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <button 
                        onClick={() => {
                          setBarcodeNotFound(null);
                          setBarcodeCandidateProduct(null);
                          setBarcodeInput('');
                          setBarcodeError(null);
                        }}
                        style={{
                          position: 'absolute',
                          top: '16px',
                          right: '16px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: 'none',
                          color: '#fff',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 100
                        }}
                        title="Закрити"
                      >
                        <X size={16} />
                      </button>
                      <div className="results-header" style={{ marginBottom: '8px' }}>
                        <div className="barcode-product-info" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          {barcodeCandidateProduct?.image ? (
                            <img src={barcodeCandidateProduct.image} alt={barcodeCandidateProduct.name} className="barcode-product-image" style={{ width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' }} />
                          ) : (
                            <div className="barcode-product-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', width: '56px', height: '56px', borderRadius: '12px' }}>
                              <AlertCircle size={28} />
                            </div>
                          )}
                          <div style={{ textAlign: 'left' }}>
                            <span className="match-badge" style={{ background: '#ef4444', color: '#fff' }}>
                              {barcodeCandidateProduct ? "Потрібне підтвердження" : "Невідомий штрих-код"}
                            </span>
                            <h2 className="dish-title" style={{ fontSize: '18px', marginTop: '2px', color: '#f1f5f9' }}>
                              {barcodeCandidateProduct?.name || barcodeNotFound}
                            </h2>
                            {barcodeCandidateProduct && (
                              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                                Код: {barcodeNotFound} • Джерело: {barcodeCandidateProduct.sourceLabel || "зовнішня база"}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <p style={{ fontSize: '13px', color: 'var(--text-dark-muted)', marginBottom: '16px', lineHeight: '1.4', textAlign: 'left' }}>
                        {barcodeCandidateProduct
                          ? "Товар знайдено у зовнішній базі, але КБЖВ звідти можуть бути неправильними. Щоб не обманювати користувача, додаток не підставляє ці числа автоматично. Внесіть значення з етикетки, і цей штрих-код буде збережено як перевірений."
                          : "Цього продукту ще немає в нашій перевіреній базі даних. Ви можете внести назву та КБЖВ з етикетки на 100 г, щоб додаток надалі автоматично розраховував калорійність."}
                      </p>

                      <button 
                        className="btn-primary" 
                        style={{ width: '100%' }} 
                        onClick={() => {
                          setFallbackName(barcodeCandidateProduct?.name || '');
                          setFallbackCalories('');
                          setFallbackProtein('');
                          setFallbackFat('');
                          setFallbackCarbs('');
                          setFallbackWeight(barcodeCandidateProduct?.weight ? String(barcodeCandidateProduct.weight) : '100');
                          setIsBarcodeNotFoundModalOpen(true);
                        }}
                      >
                        <Plus size={18} />
                        Ввести КБЖВ з етикетки
                      </button>
                    </div>
                  )}
                </>
              )}
              </div>
            )}

            {scannerMode === 'search' && (
              <div className="search-db-container">
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <button
                    className="btn-primary"
                    style={{ flex: 1, padding: '10px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => {
                      setCustomFoodName('');
                      setCustomFoodCalories('');
                      setCustomFoodProtein('');
                      setCustomFoodFat('');
                      setCustomFoodCarbs('');
                      setCustomFoodWeight('100');
                      setCustomFoodEditTarget(null);
                      setIsCustomFoodModalOpen(true);
                    }}
                  >
                    <Plus size={16} />
                    <span>➕ Додати продукт вручну</span>
                  </button>
                </div>
                {/* Search Input Box */}
                <div className="search-input-wrapper" style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="search-input-field"
                    placeholder="Пошук продуктів і супермаркетів (напр. Молоко АТБ, Йогурт Сільпо...)"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                        setShowSuggestions(false);
                      }
                    }}
                    autoFocus
                  />

                  {/* Autocomplete Suggestions Dropdown */}
                  {(() => {
                    if (searchSuggestions.length === 0) return null;

                    return (
                      <div className="autocomplete-dropdown" style={{
                        position: 'absolute',
                        top: 'calc(100% - 4px)',
                        left: '16px',
                        right: '16px',
                        background: theme === 'light' ? '#ffffff' : '#1e293b',
                        borderRadius: '16px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                        border: theme === 'light' ? '1px solid #e2e8f0' : '1px solid #334155',
                        zIndex: 110,
                        maxHeight: '220px',
                        overflowY: 'auto'
                      }}>
                        {searchSuggestions.map(food => (
                          <div
                            key={food.id}
                            className="autocomplete-item"
                            onClick={() => {
                              setSelectedSearchFood(food);
                              setSearchFoodWeight(food.weight); // default to its base weight
                              setSearchQuery(''); // clear query so dropdown disappears
                              setShowSuggestions(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '12px 16px',
                              cursor: 'pointer',
                              borderBottom: theme === 'light' ? '1px solid #f1f5f9' : '1px solid #334155',
                              fontSize: '14px',
                              textAlign: 'left'
                            }}
                          >
                            <span style={{ fontSize: '18px' }}>{food.icon || '🥗'}</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' }}>
                              <span style={{ 
                                fontWeight: 600, 
                                color: theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)' 
                              }}>
                                {food.name}
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {food.brand ? `${food.brand} • ` : ''}{food.calories} ккал
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* AI Smart Search Button */}
                {searchQuery.trim().length >= 2 && (
                  <div style={{ padding: '0 16px 12px' }}>
                    <button
                      className="btn-primary"
                      onClick={() => triggerAISmartSearch(searchQuery)}
                      disabled={isSearchingAI}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
                        border: 'none',
                        color: 'white',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.2)'
                      }}
                    >
                      {isSearchingAI ? (
                        <>
                          <RefreshCw className="spin" size={16} />
                          <span>ШІ генерує найкращі варіанти...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={16} />
                          <span>🔮 Знайти сорти та варіанти через ШІ</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Filter Chips */}
                <div className="filter-chips-container">
                  {['Усі', 'Моя база', 'Супермаркети', 'Страви', 'Обрані', 'Сніданок', 'Обід', 'Вечеря', 'Перекуси'].map(filter => (
                    <button
                      key={filter}
                      className={`filter-chip ${selectedCategoryFilter === filter ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                {/* Results List */}
                <div className="search-results-list">
                  {isSearchingExternal && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', fontSize: '13px', color: 'var(--color-accent)' }}>
                      <RefreshCw className="spin" size={14} />
                      <span>Шукаємо в українській базі продуктів...</span>
                    </div>
                  )}

                  {isSearchingAI && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', fontSize: '13px', color: '#a855f7' }}>
                      <RefreshCw className="spin" size={14} />
                      <span>ШІ генерує найкращі варіанти...</span>
                    </div>
                  )}

                  {filteredSearchFoods.length === 0 && filteredExternalSearchFoods.length === 0 && filteredAiSearchFoods.length === 0 && !isSearchingExternal && !isSearchingAI ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <span>Нічого не знайдено в базі. Натисніть кнопку ШІ-пошуку вище, щоб знайти цей продукт!</span>
                      <button
                        className="btn-primary"
                        style={{ marginTop: '8px', padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', marginRight: 'auto' }}
                        onClick={() => {
                          setCustomFoodName(searchQuery);
                          setCustomFoodCalories('');
                          setCustomFoodProtein('');
                          setCustomFoodFat('');
                          setCustomFoodCarbs('');
                          setCustomFoodWeight('100');
                          setCustomFoodEditTarget(null);
                          setIsCustomFoodModalOpen(true);
                        }}
                      >
                        <Plus size={16} />
                        Додати "{searchQuery}" вручну
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Local Results */}
                      {filteredSearchFoods.map(food => (
                        <div
                          key={food.id}
                          className="search-food-item"
                          onClick={() => {
                            setSelectedSearchFood(food);
                            setSearchFoodWeight(food.weight);
                          }}
                        >
                          <span style={{ fontSize: '24px', marginRight: '8px' }}>{food.icon || '🥗'}</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                            <span
                              onClick={(event) => {
                                if (food.isCustom || food.isCustomBarcode) {
                                  event.stopPropagation();
                                  openCustomFoodEditor(food);
                                }
                              }}
                              title={food.isCustom || food.isCustomBarcode ? "Редагувати КБЖВ" : undefined}
                              style={{
                                fontWeight: 600,
                                fontSize: '14px',
                                color: theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)',
                                cursor: food.isCustom || food.isCustomBarcode ? 'pointer' : 'default'
                              }}
                            >
                              {food.name}
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {food.brand ? `${food.brand} • ` : ''}{food.calories} ккал / {food.weight}г
                            </span>
                          </div>
                          {(food.isCustom || food.isCustomBarcode) && (
                            <button
                              type="button"
                              className="search-edit-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                openCustomFoodEditor(food);
                              }}
                              title="Редагувати КБЖВ"
                              aria-label="Редагувати КБЖВ"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {food.brand && <span className="search-brand-badge">{food.brand}</span>}
                        </div>
                      ))}

                      {/* AI Supermarket Results */}
                      {filteredAiSearchFoods.map(food => {
                        const getSupermarketColor = (supermarket) => {
                          if (!supermarket) return '#8b5cf6';
                          const sm = supermarket.toLowerCase();
                          if (sm.includes('атб') || sm.includes('atb')) return '#3b82f6';
                          if (sm.includes('сільпо') || sm.includes('silpo')) return '#f97316';
                          if (sm.includes('рукавичка') || sm.includes('rukavychka')) return '#dc2626';
                          if (sm.includes('близенько') || sm.includes('blyzenko')) return '#10b981';
                          return '#8b5cf6';
                        };

                        const getSupermarketClass = (supermarket) => {
                          if (!supermarket) return 'supermarket-general';
                          const sm = supermarket.toLowerCase();
                          if (sm.includes('атб') || sm.includes('atb')) return 'supermarket-atb';
                          if (sm.includes('сільпо') || sm.includes('silpo')) return 'supermarket-silpo';
                          if (sm.includes('рукавичка') || sm.includes('rukavychka')) return 'supermarket-rukavychka';
                          if (sm.includes('близенько') || sm.includes('blyzenko')) return 'supermarket-blyzenko';
                          return 'supermarket-general';
                        };

                        const borderCol = getSupermarketColor(food.supermarket);
                        const badgeClass = getSupermarketClass(food.supermarket);

                        return (
                          <div
                            key={food.id}
                            className="search-food-item"
                            style={{ borderLeft: `4px solid ${borderCol}` }}
                            onClick={() => {
                              setCustomFoodName(food.name);
                              setCustomFoodCalories('');
                              setCustomFoodProtein('');
                              setCustomFoodFat('');
                              setCustomFoodCarbs('');
                              setCustomFoodWeight(food.weight || '100');
                              setCustomFoodEditTarget(null);
                              setIsCustomFoodModalOpen(true);
                            }}
                          >
                            <span style={{ fontSize: '24px', marginRight: '8px' }}>{food.icon || '🔮'}</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)' }}>
                                {food.name}
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {food.brand ? `${food.brand} • ` : ''}ШІ-підказка назви, КБЖВ внесіть вручну
                              </span>
                            </div>
                            <span className={`search-brand-badge ${badgeClass}`}>{food.supermarket || "ШІ"}</span>
                          </div>
                        );
                      })}

                      {/* External Open Food Facts Results */}
                      {filteredExternalSearchFoods.map(food => (
                        <div
                          key={food.id}
                          className="search-food-item"
                          style={{ borderLeft: '3px solid var(--color-water)' }}
                          onClick={() => {
                            setCustomFoodName(food.name);
                            setCustomFoodCalories('');
                            setCustomFoodProtein('');
                            setCustomFoodFat('');
                            setCustomFoodCarbs('');
                            setCustomFoodWeight(food.weight || '100');
                            setCustomFoodEditTarget(null);
                            setIsCustomFoodModalOpen(true);
                          }}
                        >
                          <span style={{ fontSize: '24px', marginRight: '8px' }}>🛒</span>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)' }}>
                              {food.name}
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {food.brand ? `${food.brand} • ` : ''}Зовнішня база: КБЖВ підтвердіть з етикетки
                            </span>
                          </div>
                          <span className="search-brand-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>{food.sourceLabel || "База OFF"}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Selected Food Detail Card (similar to scan-result-card) */}
                {selectedSearchFood && (
                  <div className="scan-result-card" style={{ zIndex: 100 }}>
                    <button
                      onClick={() => setSelectedSearchFood(null)}
                      style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: '#fff',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        zIndex: 100
                      }}
                      title="Закрити"
                    >
                      <X size={16} />
                    </button>
                    <div className="results-header" style={{ marginBottom: '8px' }}>
                      <div className="barcode-product-info" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <div style={{ fontSize: '36px' }}>{selectedSearchFood.icon || '🥗'}</div>
                        <div style={{ textAlign: 'left' }}>
                          {selectedSearchFood.brand && <span className="match-badge">{selectedSearchFood.brand}</span>}
                          <h2
                            className="dish-title"
                            onClick={() => {
                              if (selectedSearchFood.isCustom || selectedSearchFood.isCustomBarcode) {
                                openCustomFoodEditor(selectedSearchFood);
                              }
                            }}
                            title={selectedSearchFood.isCustom || selectedSearchFood.isCustomBarcode ? "Редагувати КБЖВ" : undefined}
                            style={{
                              fontSize: '18px',
                              marginTop: '2px',
                              cursor: selectedSearchFood.isCustom || selectedSearchFood.isCustomBarcode ? 'pointer' : 'default'
                            }}
                          >
                            {selectedSearchFood.name}
                          </h2>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const factor = Number(searchFoodWeight) / Number(selectedSearchFood.weight);
                      const scaledKcal = Math.round(Number(selectedSearchFood.calories) * factor);
                      const scaledProt = Math.round(Number(selectedSearchFood.protein) * factor * 10) / 10;
                      const scaledFat = Math.round(Number(selectedSearchFood.fat) * factor * 10) / 10;
                      const scaledCarbs = Math.round(Number(selectedSearchFood.carbs) * factor * 10) / 10;

                      return (
                        <>
                          <div className="results-macros-grid">
                            <div className="results-macro-box box-kcal">
                              <div className="macro-box-val" style={{ color: 'var(--color-calories)' }}>{scaledKcal}</div>
                              <div className="macro-box-label">ккал</div>
                            </div>
                            <div className="results-macro-box box-protein">
                              <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                                <span style={{ color: 'var(--color-protein)', fontSize: '18px', fontWeight: 700 }}>{scaledProt}</span>
                                <span style={{ color: 'var(--color-protein)', fontSize: '12px', fontWeight: 700 }}>г</span>
                              </div>
                              <div className="macro-box-label">білки</div>
                            </div>
                            <div className="results-macro-box box-fat">
                              <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                                <span style={{ color: 'var(--color-fat)', fontSize: '18px', fontWeight: 700 }}>{scaledFat}</span>
                                <span style={{ color: 'var(--color-fat)', fontSize: '12px', fontWeight: 700 }}>г</span>
                              </div>
                              <div className="macro-box-label">жири</div>
                            </div>
                            <div className="results-macro-box box-carbs">
                              <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                                <span style={{ color: 'var(--color-carbs)', fontSize: '18px', fontWeight: 700 }}>{scaledCarbs}</span>
                                <span style={{ color: 'var(--color-carbs)', fontSize: '12px', fontWeight: 700 }}>г</span>
                              </div>
                              <div className="macro-box-label">вуглеводи</div>
                            </div>
                          </div>

                          <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <span className="detail-label">Прийом їжі:</span>
                            <select
                              className="category-select"
                              value={searchMealCategory}
                              onChange={(e) => setSearchMealCategory(e.target.value)}
                            >
                              <option value="Сніданок">Сніданок</option>
                              <option value="Перший перекус">Перший перекус</option>
                              <option value="Обід">Обід</option>
                              <option value="Другий перекус">Другий перекус</option>
                              <option value="Вечеря">Вечеря</option>
                            </select>
                          </div>

                          <div className="detail-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span className="detail-label">Вага продукту (грам):</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                type="number"
                                className="weight-input"
                                value={searchFoodWeight}
                                onChange={(e) => setSearchFoodWeight(e.target.value)}
                                min="1"
                                max="5000"
                              />
                              <span style={{ fontSize: '11px', opacity: 0.6 }}>(ориг. {selectedSearchFood.weight}г)</span>
                            </div>
                          </div>

                          {selectedSearchFood.ingredients && (
                            <div className="detail-row" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                              <span className="detail-label">Склад продукту:</span>
                              <span className="detail-value" style={{ fontStyle: 'italic', fontSize: '11px', color: '#94a3b8', maxHeight: '70px', overflowY: 'auto', display: 'block', textAlign: 'left' }}>
                                {selectedSearchFood.ingredients}
                              </span>
                            </div>
                          )}

                          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button className="btn-primary" style={{ flex: 1 }} onClick={addSearchMealToDiary}>
                                <Check size={18} />
                                Додати до щоденника
                              </button>
                              {(selectedSearchFood.isCustom || selectedSearchFood.isCustomBarcode) && (
                                <button
                                  className="btn-secondary"
                                  onClick={() => openCustomFoodEditor(selectedSearchFood)}
                                  style={{ width: '46px', height: '46px', padding: 0, justifyContent: 'center' }}
                                  title="Редагувати КБЖВ"
                                  aria-label="Редагувати КБЖВ"
                                >
                                  <Pencil size={18} />
                                </button>
                              )}
                              <button 
                                className={`btn-favorite-toggle ${isFavorite(selectedSearchFood.name) ? 'active' : ''}`}
                                onClick={() => toggleFavoriteMeal(selectedSearchFood)}
                                title={isFavorite(selectedSearchFood.name) ? "Видалити з обраного" : "Додати в обране"}
                                style={{
                                  width: '46px',
                                  height: '46px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '12px',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  background: isFavorite(selectedSearchFood.name) ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                  color: isFavorite(selectedSearchFood.name) ? '#ffb800' : 'rgba(255, 255, 255, 0.8)',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                <Star size={20} fill={isFavorite(selectedSearchFood.name) ? "#ffb800" : "none"} />
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Actions for Food Scanner Mode */}
            {scannerMode === 'camera' && !scanResult && !isScanning && (
              <div className="camera-actions">
                <button 
                  className="btn-circle" 
                  onClick={() => {
                    if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                      galleryFileInputRef.current?.click();
                    }
                  }}
                  disabled={!allowCameraTrigger}
                  style={{ pointerEvents: allowCameraTrigger ? 'auto' : 'none' }}
                  title="Завантажити з галереї"
                >
                  <Upload size={20} />
                </button>
                
                <input 
                  ref={galleryFileInputRef}
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />

                <button 
                  className="shutter-btn-outer" 
                  onClick={capturePhoto}
                  disabled={!cameraActive || !allowCameraTrigger}
                  style={{ 
                    opacity: (cameraActive && allowCameraTrigger) ? 1 : 0.5,
                    pointerEvents: allowCameraTrigger ? 'auto' : 'none'
                  }}
                >
                  <div className="shutter-btn-inner"></div>
                </button>

                <button 
                  className="btn-circle" 
                  onClick={() => {
                    if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                      stopCamera();
                      setActiveTab('settings');
                    }
                  }}
                  disabled={!allowCameraTrigger}
                  style={{ pointerEvents: allowCameraTrigger ? 'auto' : 'none' }}
                  title="Налаштування ШІ"
                >
                  <Brain size={20} />
                </button>
              </div>
            )}

            {/* Bottom Actions for Barcode Mode (Camera active, no result, no loading) */}
            {scannerMode === 'barcode' && cameraActive && !barcodeResult && !isBarcodeScanning && !barcodeLoading && (
              <div className="camera-actions-wrapper">
                {/* Manual entry wrapper inside camera scanner */}
                <div style={{ width: '100%' }}>
                  <form onSubmit={handleBarcodeSearch} className="barcode-input-wrapper" style={{ margin: 0 }}>
                    <input 
                      type="tel"
                      className="barcode-input"
                      placeholder="Штрих-код (EAN) вручну"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value.replace(/\D/g, ''))}
                      maxLength={15}
                      style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                    <button 
                      type="submit" 
                      className="btn-primary" 
                      style={{ width: 'auto', padding: '0 20px', margin: 0, borderRadius: '14px' }}
                      disabled={barcodeLoading}
                    >
                      {barcodeLoading ? <RefreshCw className="spin" size={18} /> : "Пошук"}
                    </button>
                  </form>
                  {barcodeError && (
                    <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <AlertCircle size={12} /> {barcodeError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', width: '100%' }}>
                  <button 
                    className="btn-circle" 
                    onClick={() => {
                      if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                        barcodeFileInputRef.current?.click();
                      }
                    }}
                    disabled={!allowCameraTrigger}
                    style={{ pointerEvents: allowCameraTrigger ? 'auto' : 'none' }}
                    title="Завантажити з галереї"
                  >
                    <Upload size={20} />
                  </button>
                  
                  <input 
                    ref={barcodeFileInputRef}
                    type="file" 
                    accept="image/*" 
                    style={{ display: 'none' }} 
                    onChange={handleBarcodeFileUpload} 
                  />

                  <button 
                    className="shutter-btn-outer" 
                    onClick={captureBarcodePhoto}
                    disabled={!cameraActive || !allowCameraTrigger}
                    style={{ 
                      opacity: (cameraActive && allowCameraTrigger) ? 1 : 0.5,
                      pointerEvents: allowCameraTrigger ? 'auto' : 'none'
                    }}
                  >
                    <div className="shutter-btn-inner" style={{ background: '#ef4444' }}></div>
                  </button>

                  <button 
                    className="btn-circle" 
                    onClick={() => {
                      if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                        stopCamera();
                        setActiveTab('settings');
                      }
                    }}
                    disabled={!allowCameraTrigger}
                    style={{ pointerEvents: allowCameraTrigger ? 'auto' : 'none' }}
                    title="Налаштування ШІ"
                  >
                    <Brain size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. DIARY (HISTORY) TAB */}
        {/* ========================================================================= */}
        {activeTab === 'diary' && (
          <div>
            <h2 className="section-title">Історія та Щоденник</h2>

            {/* Interactive Month Grid Calendar */}
            <div className="glass-card calendar-card" style={{ padding: '16px', marginBottom: '16px' }}>
              <div className="calendar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button 
                    className="calendar-toggle-btn"
                    onClick={() => setIsCalendarExpanded(prev => !prev)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                  >
                    {isCalendarExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>
                  <span className="calendar-month-title" style={{ fontWeight: 700, fontSize: '16px' }}>
                    {calendarDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button className="date-arrow-btn" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}>
                    <ChevronLeft size={16} />
                  </button>
                  <button 
                    className="btn-secondary" 
                    style={{ width: 'auto', padding: '4px 8px', fontSize: '11px', borderRadius: '8px', margin: '0 4px' }}
                    onClick={() => {
                      const today = new Date();
                      setSelectedDate(getTodayString(today));
                      setCalendarDate(today);
                    }}
                  >
                    Сьогодні
                  </button>
                  <button className="date-arrow-btn" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {isCalendarExpanded && (
                <div className="calendar-body" style={{ animation: 'slide-up-sheet 0.2s ease-out' }}>
                  <div className="calendar-weekdays" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-dark-secondary)', marginBottom: '8px' }}>
                    <div>Пн</div>
                    <div>Вт</div>
                    <div>Ср</div>
                    <div>Чт</div>
                    <div>Пт</div>
                    <div>Сб</div>
                    <div>Нд</div>
                  </div>
                  <div className="calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                    {getDaysInMonthGrid(calendarDate).map((cell, idx) => {
                      const isToday = cell.dateString === getTodayString();
                      const isSelected = cell.dateString === selectedDate;
                      const hasMeals = meals.some(m => m.date === cell.dateString);
                      const hasWater = waterIntake[cell.dateString] > 0;
                      
                      return (
                        <div 
                          key={idx}
                          className={`calendar-day ${!cell.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedDate(cell.dateString)}
                          style={{
                            aspectRatio: '1',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: isToday || isSelected ? 600 : 400,
                            position: 'relative',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span>{cell.day}</span>
                          <div className="dots-container" style={{ display: 'flex', gap: '2px', position: 'absolute', bottom: '4px' }}>
                            {hasMeals && <span className="dot-indicator dot-meals" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#10b981' }}></span>}
                            {hasWater && <span className="dot-indicator dot-water" style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#3b82f6' }}></span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Daily Macro Details Card */}
            <div className="glass-card">
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Статистика харчування за день</h3>
              
              <div className="results-macros-grid" style={{ marginBottom: 0 }}>
                <div className="results-macro-box box-kcal" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="macro-box-val" style={{ fontSize: '14px' }}>{totals.calories}</div>
                  <div className="macro-box-label" style={{ fontSize: '9px' }}>ккал</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-dark-muted)', marginTop: '2px' }}>Ціль: {profile.targetCalories}</div>
                </div>
                <div className="results-macro-box box-protein" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="macro-box-val" style={{ fontSize: '14px' }}>{totals.protein}г</div>
                  <div className="macro-box-label" style={{ fontSize: '9px' }}>білки</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-dark-muted)', marginTop: '2px' }}>Ціль: {profile.targetProtein}г</div>
                </div>
                <div className="results-macro-box box-fat" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="macro-box-val" style={{ fontSize: '14px' }}>{totals.fat}г</div>
                  <div className="macro-box-label" style={{ fontSize: '9px' }}>жири</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-dark-muted)', marginTop: '2px' }}>Ціль: {profile.targetFat}г</div>
                </div>
                <div className="results-macro-box box-carbs" style={{ background: 'rgba(255,255,255,0.01)' }}>
                  <div className="macro-box-val" style={{ fontSize: '14px' }}>{totals.carbs}г</div>
                  <div className="macro-box-label" style={{ fontSize: '9px' }}>вугл.</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-dark-muted)', marginTop: '2px' }}>Ціль: {profile.targetCarbs}г</div>
                </div>
              </div>
            </div>

            {/* List of meals by categories */}
            <div style={{ marginTop: '24px' }}>
              <div style={{ borderBottom: '1px solid var(--border-dark)', paddingBottom: '10px', marginBottom: '14px', fontWeight: 600, fontSize: '14px' }}>
                Список страв за категоріями
              </div>

              {(() => {
                const categories = [
                  { name: 'Сніданок', icon: '🍳' },
                  { name: 'Перший перекус', icon: '🍎' },
                  { name: 'Обід', icon: '🥣' },
                  { name: 'Другий перекус', icon: '🍌' },
                  { name: 'Вечеря', icon: '🥗' }
                ];
                return categories.map(cat => {
                  const catMeals = currentDayMeals.filter(m => {
                    const normalizedCat = m.category === 'Перекус' ? 'Перший перекус' : m.category;
                    return normalizedCat === cat.name;
                  });
                  const catCals = catMeals.reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
                  
                  return (
                    <div key={cat.name} className="meal-category-card">
                      <div className="category-header">
                        <div className="category-title">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {catCals > 0 && <span className="category-total-cals">{catCals} ккал</span>}
                          <button 
                            className="category-add-btn" 
                            onClick={() => {
                              setPreselectedCategory(cat.name);
                              setScannerMode('search');
                              changeTab('scanner');
                            }}
                            title={`Додати до: ${cat.name}`}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      </div>
                      
                      {catMeals.length === 0 ? (
                        <div className="category-empty-placeholder">
                          <span>Немає страв</span>
                        </div>
                      ) : (
                        <div className="category-meals-list">
                          {catMeals.map(meal => (
                            <div key={meal.id} className="timeline-item">
                              <div className="meal-info">
                                <div className="meal-text">
                                  <span className="meal-name" style={{ fontSize: '14px', fontWeight: 600 }}>{meal.name}</span>
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                    <input 
                                      type="number"
                                      value={meal.weight}
                                      onChange={(e) => handleUpdateMealWeight(meal.id, e.target.value)}
                                      className="meal-weight-input"
                                      min="1"
                                      max="5000"
                                    />
                                    <span>г</span>
                                  </span>
                                </div>
                              </div>
                              <div className="meal-calories-details">
                                <span className="meal-kcal">{meal.calories} ккал</span>
                                <div className="meal-macros">
                                  <label className="meal-macro-edit-field">
                                    <span>Білки</span>
                                    <input
                                      type="number"
                                      value={meal.protein}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'protein', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати білки"
                                    />
                                    <span>г</span>
                                  </label>
                                  <label className="meal-macro-edit-field">
                                    <span>Жири</span>
                                    <input
                                      type="number"
                                      value={meal.fat}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'fat', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати жири"
                                    />
                                    <span>г</span>
                                  </label>
                                  <label className="meal-macro-edit-field">
                                    <span>Вугл.</span>
                                    <input
                                      type="number"
                                      value={meal.carbs}
                                      onChange={(e) => handleUpdateMealMacro(meal.id, 'carbs', e.target.value)}
                                      className="meal-macro-inline-input"
                                      min="0"
                                      step="0.1"
                                      aria-label="Редагувати вуглеводи"
                                    />
                                    <span>г</span>
                                  </label>
                                </div>
                              </div>
                              <button 
                                className={`meal-favorite-btn ${isFavorite(meal.name) ? 'active' : ''}`} 
                                onClick={() => toggleFavoriteMeal(meal)} 
                                title={isFavorite(meal.name) ? "Видалити з обраного" : "Додати в обране"}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: isFavorite(meal.name) ? '#ffb800' : 'rgba(255, 255, 255, 0.4)',
                                  transition: 'color 0.2s ease',
                                  marginRight: '6px'
                                }}
                              >
                                <Star size={16} fill={isFavorite(meal.name) ? "#ffb800" : "none"} />
                              </button>
                              <button className="meal-delete-btn" onClick={() => deleteMeal(meal.id)} title="Видалити">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. PROFILE TAB */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <div>
            <h2 className="section-title">Профіль користувача</h2>
            
            {/* Profile Calculations Card */}
            <div className="glass-card">
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={18} style={{ color: 'var(--color-calories)' }} />
                Цілі калорійності та макросів
              </h3>

              <div className="settings-group">
                <div className="profile-grid-2col">
                  <div className="settings-row">
                    <span className="settings-label">Ваша вага (кг):</span>
                    <input 
                      type="number"
                      className="settings-input"
                      value={profile.weight}
                      onChange={(e) => handleProfileChange('weight', e.target.value)}
                    />
                  </div>
                  <div className="settings-row">
                    <span className="settings-label">Ваш зріст (см):</span>
                    <input 
                      type="number"
                      className="settings-input"
                      value={profile.height}
                      onChange={(e) => handleProfileChange('height', e.target.value)}
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <span className="settings-label">Ваша фітнес-ціль:</span>
                  <select 
                    className="settings-input settings-select"
                    value={profile.goal}
                    onChange={(e) => handleProfileChange('goal', e.target.value)}
                  >
                    <option value="lose">Схуднення (Дефіцит)</option>
                    <option value="maintain">Підтримка ваги (Баланс)</option>
                    <option value="gain">Набір маси (Профіцит)</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-dark)', paddingTop: '14px', marginTop: '4px' }}>
                  <span className="settings-label">Розраховані денні нормативи:</span>
                  <div className="settings-macros-calc">
                    <div className="target-pill">
                      <span style={{ color: 'var(--color-calories)', fontSize: '10px' }}>Калорії</span>
                      <span className="target-val">{profile.targetCalories} ккал</span>
                    </div>
                    <div className="target-pill">
                      <span style={{ color: 'var(--color-protein)', fontSize: '10px' }}>Білки</span>
                      <span className="target-val">{profile.targetProtein}г</span>
                    </div>
                    <div className="target-pill">
                      <span style={{ color: 'var(--color-fat)', fontSize: '10px' }}>Жири</span>
                      <span className="target-val">{profile.targetFat}г</span>
                    </div>
                    <div className="target-pill">
                      <span style={{ color: 'var(--color-carbs)', fontSize: '10px' }}>Вуглеводи</span>
                      <span className="target-val">{profile.targetCarbs}г</span>
                    </div>
                  </div>
                </div>

                {/* Direct override option for advanced users */}
                <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-dark)', paddingTop: '14px' }}>
                  <span className="settings-label" style={{ display: 'block', marginBottom: '10px', fontWeight: 600 }}>
                    Власне коригування цілей КБЖВ:
                  </span>
                  
                  <div className="settings-row" style={{ marginBottom: '12px' }}>
                    <span className="settings-label">Калорії (ккал):</span>
                    <input 
                      type="number" 
                      className="settings-input" 
                      value={profile.targetCalories} 
                      onChange={(e) => {
                        const cals = Math.max(0, Number(e.target.value) || 0);
                        // Також пропорційно скоригуємо макроси (30/25/45)
                        setProfile(prev => ({
                          ...prev,
                          targetCalories: cals,
                          targetProtein: Math.round(cals * 0.3 / 4),
                          targetFat: Math.round(cals * 0.25 / 9),
                          targetCarbs: Math.round(cals * 0.45 / 4)
                        }));
                      }}
                    />
                  </div>

                  <div className="settings-macros-calc" style={{ marginTop: '10px', gap: '8px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--color-protein)', fontWeight: 600 }}>Білки (г)</span>
                      <input 
                        type="number" 
                        className="settings-input" 
                        style={{ width: '100%', fontSize: '13px', padding: '6px', textAlign: 'center' }}
                        value={profile.targetProtein} 
                        onChange={(e) => {
                          const p = Math.max(0, Number(e.target.value) || 0);
                          setProfile(prev => {
                            const newProt = p;
                            const newFat = prev.targetFat;
                            const newCarbs = Math.max(0, Math.round((prev.targetCalories - newProt * 4 - newFat * 9) / 4));
                            return {
                              ...prev,
                              targetProtein: newProt,
                              targetCarbs: newCarbs
                            };
                          });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--color-fat)', fontWeight: 600 }}>Жири (г)</span>
                      <input 
                        type="number" 
                        className="settings-input" 
                        style={{ width: '100%', fontSize: '13px', padding: '6px', textAlign: 'center' }}
                        value={profile.targetFat} 
                        onChange={(e) => {
                          const f = Math.max(0, Number(e.target.value) || 0);
                          setProfile(prev => {
                            const newProt = prev.targetProtein;
                            const newFat = f;
                            const newCarbs = Math.max(0, Math.round((prev.targetCalories - newProt * 4 - newFat * 9) / 4));
                            return {
                              ...prev,
                              targetFat: newFat,
                              targetCarbs: newCarbs
                            };
                          });
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--color-carbs)', fontWeight: 600 }}>Вуглеводи (г)</span>
                      <input 
                        type="number" 
                        className="settings-input" 
                        style={{ width: '100%', fontSize: '13px', padding: '6px', textAlign: 'center' }}
                        value={profile.targetCarbs} 
                        onChange={(e) => {
                          const c = Math.max(0, Number(e.target.value) || 0);
                          setProfile(prev => {
                            const newProt = prev.targetProtein;
                            const newCarbs = c;
                            const newFat = Math.max(0, Math.round((prev.targetCalories - newProt * 4 - newCarbs * 4) / 9));
                            return {
                              ...prev,
                              targetCarbs: newCarbs,
                              targetFat: newFat
                            };
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. SETTINGS TAB */}
        {/* ========================================================================= */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="section-title">Налаштування додатку</h2>
            
            {/* AI Scanner Configuration Card */}
            <div className="glass-card">
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={18} style={{ color: 'var(--color-accent)' }} />
                Параметри розпізнавання ШІ
              </h3>
              
              <div className="settings-group">
                <div className="settings-row">
                  <span className="settings-label">Режим сканування:</span>
                  <select 
                    className="settings-input settings-select"
                    value={scanMode}
                    onChange={(e) => setScanMode(e.target.value)}
                  >
                    <option value="mock">Симуляція (Локальна база страв)</option>
                    <option value="openai">GPT (OpenAI API) - сканування їжі</option>
                    <option value="gemini">Реальний ШІ (Gemini API)</option>
                  </select>
                </div>

                {scanMode === 'gemini' && (
                  <>
                    <div className="settings-row" style={{ animation: 'slide-up-sheet 0.2s ease-out' }}>
                      <span className="settings-label">Модель Gemini API:</span>
                      <select 
                        className="settings-input settings-select"
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Швидко)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Точно)</option>
                      </select>
                    </div>

                    <div className="settings-row" style={{ animation: 'slide-up-sheet 0.2s ease-out' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Key size={14} /> Gemini API Ключ:
                        </span>
                        <a 
                          href="https://aistudio.google.com/" 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: '11px', color: 'var(--color-protein)', textDecoration: 'none' }}
                        >
                          Отримати безкоштовно
                        </a>
                      </div>
                      <input 
                        type="password"
                        className="settings-input"
                        placeholder="AIzaSy..."
                        value={apiKey === SERVER_GEMINI_API_KEY ? '' : apiKey}
                        onChange={(e) => setApiKey(e.target.value.trim() ? e.target.value : DEFAULT_API_KEY)}
                      />
                      <span className="settings-info-text">
                        Ваш API-ключ зберігається локально у браузері на цьому пристрої та надсилається лише напряму до Google API. Не вводьте ключ на спільних пристроях.
                      </span>
                      {(!apiKey || apiKey.trim() === '') && (
                        <div style={{
                          marginTop: '8px',
                          padding: '10px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          fontSize: '12px',
                          lineHeight: '1.4'
                        }}>
                          <strong>⚠️ Увага:</strong> Для роботи ШІ-сканера, будь ласка, отримайте свій власний безкоштовний ключ на <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#f87171', textDecoration: 'underline', fontWeight: 600 }}>Google AI Studio</a> та введіть його вище.
                          <div style={{ marginTop: '8px' }}>
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                padding: '6px 12px',
                                fontSize: '11px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#fff',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => {
                                setScanMode('mock');
                                localStorage.setItem('nutrisnap_scanmode', 'mock');
                                showToast("Режим сканування змінено на Симуляцію", "info");
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                              }}
                            >
                              Перемкнути на Симуляцію (Локальна база)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {scanMode === 'openai' && (
                  <>
                    <div className="settings-row" style={{ animation: 'slide-up-sheet 0.2s ease-out' }}>
                      <span className="settings-label">Модель OpenAI:</span>
                      <select
                        className="settings-input settings-select"
                        value={openAiModel}
                        onChange={(e) => setOpenAiModel(e.target.value)}
                      >
                        <option value="gpt-5.5">GPT-5.5 (Точніше)</option>
                        <option value="gpt-4.1-mini">GPT-4.1 Mini (Швидше)</option>
                      </select>
                    </div>

                    <div className="settings-row" style={{ animation: 'slide-up-sheet 0.2s ease-out' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="settings-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Key size={14} /> OpenAI API Ключ:
                        </span>
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '11px', color: 'var(--color-protein)', textDecoration: 'none' }}
                        >
                          Отримати ключ
                        </a>
                      </div>
                      <input
                        type="password"
                        className="settings-input"
                        placeholder="sk-..."
                        value={openAiApiKey}
                        onChange={(e) => setOpenAiApiKey(e.target.value)}
                      />
                      <input
                        type="url"
                        className="settings-input"
                        placeholder="Proxy URL, наприклад https://your-worker.workers.dev/api/openai/responses"
                        value={openAiProxyUrl}
                        onChange={(e) => setOpenAiProxyUrl(e.target.value)}
                        style={{ marginTop: '8px' }}
                      />
                      <span className="settings-info-text">
                        Якщо вказати proxy endpoint, OpenAI API-ключ у браузері не потрібен. Без proxy ключ зберігається локально у браузері на цьому пристрої.
                      </span>
                      {(!openAiApiKey || openAiApiKey.trim() === '') && (!openAiProxyUrl || openAiProxyUrl.trim() === '') && (
                        <div style={{
                          marginTop: '8px',
                          padding: '10px',
                          borderRadius: '8px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.2)',
                          color: '#fbbf24',
                          fontSize: '12px',
                          lineHeight: '1.4'
                        }}>
                          <strong>Потрібен доступ:</strong> для GPT-сканування введіть OpenAI API-ключ або proxy endpoint.
                          <div style={{ marginTop: '8px' }}>
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                padding: '6px 12px',
                                fontSize: '11px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                color: '#fff',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onClick={() => {
                                setScanMode('mock');
                                localStorage.setItem('nutrisnap_scanmode', 'mock');
                                showToast("Режим сканування змінено на Симуляцію", "info");
                              }}
                            >
                              Перемкнути на Симуляцію (Локальна база)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Product Database Card */}
            <div className="glass-card database-manager-card" style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: 'var(--color-calories)' }} />
                База продуктів
              </h3>

              <div className="database-stat-grid">
                <div className="database-stat-tile">
                  <span>Усього</span>
                  <strong>{databaseStats.total}</strong>
                </div>
                <div className="database-stat-tile">
                  <span>Каталог</span>
                  <strong>{databaseStats.catalog}</strong>
                </div>
                <div className="database-stat-tile">
                  <span>Моя база</span>
                  <strong>{databaseStats.custom}</strong>
                </div>
                <div className="database-stat-tile">
                  <span>Штрих-коди</span>
                  <strong>{databaseStats.customBarcodes}</strong>
                </div>
              </div>

              <div className="database-source-list">
                {databaseStats.topSources.map(([source, count]) => (
                  <div key={source} className="database-source-row">
                    <span>{source}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>

              <p className="settings-info-text" style={{ marginTop: '12px' }}>
                Власні продукти і штрих-коди мають пріоритет над зовнішніми підказками. Імпорт CSV/JSON додає продукти у вашу локальну базу на цьому пристрої.
              </p>

              <div className="database-action-grid">
                <button
                  type="button"
                  className="database-action-btn primary"
                  onClick={() => {
                    setCustomFoodName('');
                    setCustomFoodCalories('');
                    setCustomFoodProtein('');
                    setCustomFoodFat('');
                    setCustomFoodCarbs('');
                    setCustomFoodWeight('100');
                    setCustomFoodEditTarget(null);
                    setIsCustomFoodModalOpen(true);
                  }}
                >
                  <Plus size={16} />
                  Додати вручну
                </button>

                <label className="database-action-btn">
                  <Upload size={16} />
                  Імпорт CSV/JSON
                  <input
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={importProductDatabase}
                    style={{ display: 'none' }}
                  />
                </label>

                <button
                  type="button"
                  className="database-action-btn"
                  onClick={downloadProductImportTemplate}
                >
                  <Download size={16} />
                  Шаблон CSV
                </button>

                <button
                  type="button"
                  className="database-action-btn"
                  onClick={() => {
                    setScannerMode('search');
                    setActiveTab('scanner');
                  }}
                >
                  <Search size={16} />
                  Пошук у базі
                </button>
              </div>
            </div>

            {/* Backup Configuration Card */}
            <div className="glass-card" style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: 'var(--color-carbs)' }} />
                Резервне копіювання даних
              </h3>
              
              <div className="settings-group">
                <p style={{ fontSize: '12px', color: 'var(--text-dark-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                  Ви можете зберегти всі свої дані (профіль, історію споживання їжі та води, налаштування) у файл та згодом відновити їх на іншому пристрої.
                </p>
                
                <div className="backup-btn-group">
                  <button 
                    className="backup-btn-export" 
                    onClick={exportUserData}
                  >
                    <Download size={16} />
                    Зберегти копію
                  </button>
                  
                  <label 
                    className="backup-btn-import"
                  >
                    <Upload size={16} />
                    Відновити з файлу
                    <input 
                      type="file" 
                      accept=".json" 
                      onChange={importUserData} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Technical Information / Credits */}
            <div style={{ textAlign: 'center', padding: '15px 0', fontSize: '11px', color: 'var(--text-dark-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <p>NutriSnap v1.5.0 (Smart Scan Fallback)</p>
              <p>Працює локально на вашому пристрої.</p>
              <button
                onClick={() => {
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then((registrations) => {
                      for (let registration of registrations) {
                        registration.unregister();
                      }
                      if ('caches' in window) {
                        caches.keys().then((names) => {
                          Promise.all(names.map(name => caches.delete(name))).then(() => {
                            window.location.reload(true);
                          });
                        });
                      } else {
                        window.location.reload(true);
                      }
                    });
                  } else {
                    window.location.reload(true);
                  }
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  marginTop: '4px',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
              >
                Очистити кеш та оновити додаток
              </button>
            </div>
          </div>
        )}

      </main>

      {/* --- App Camera Floating Action Button --- */}
      {activeTab !== 'scanner' && (
        <button 
          className="scan-fab" 
          onClick={(e) => {
            e.stopPropagation();
            setActiveTab('scanner');
          }}
          title="Сканувати їжу"
        >
          <Camera size={30} />
        </button>
      )}

      {/* --- Bottom Navigation Tab Bar --- */}
      {activeTab !== 'scanner' && (
        <nav className="bottom-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={22} />
            <span>Головна</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'diary' ? 'active' : ''}`}
            onClick={() => setActiveTab('diary')}
          >
            <Calendar size={22} />
            <span>Щоденник</span>
          </button>

          {/* Center Spacer for Floating Action Button */}
          <div className="nav-item-spacer"></div>

          <button 
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={22} />
            <span>Профіль</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            aria-label="Налаштування"
            title="Налаштування"
          >
            <Settings size={22} />
            <span>Налашт.</span>
          </button>
        </nav>
      )}
      {/* Модальне вікно для створення продукту вручну */}
      {isCustomFoodModalOpen && (
        <div className="modal-backdrop" onClick={closeCustomFoodModal}>
          <div className="modal-content glassmorphic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{customFoodEditTarget ? '✏️ Редагувати продукт у моїй базі' : '➕ Додати продукт у мою базу'}</h3>
              <button className="modal-close-btn" onClick={closeCustomFoodModal}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="settings-group" style={{ textAlign: 'left' }}>
                <label className="modal-label">Назва продукту:</label>
                <input 
                  type="text"
                  className="modal-input"
                  placeholder="Наприклад: Вівсянка звичайна"
                  value={customFoodName}
                  onChange={(e) => setCustomFoodName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label">Вага порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="100"
                    value={customFoodWeight}
                    onChange={(e) => setCustomFoodWeight(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label">Калорії порції (ккал):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="350"
                    value={customFoodCalories}
                    onChange={(e) => setCustomFoodCalories(e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-protein)', fontSize: '11px' }}>Білки порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="12"
                    value={customFoodProtein}
                    onChange={(e) => setCustomFoodProtein(e.target.value)}
                    style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-fat)', fontSize: '11px' }}>Жири порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="2.5"
                    value={customFoodFat}
                    onChange={(e) => setCustomFoodFat(e.target.value)}
                    style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-carbs)', fontSize: '11px' }}>Вугл. порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="68"
                    value={customFoodCarbs}
                    onChange={(e) => setCustomFoodCarbs(e.target.value)}
                    style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dark-muted)', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', marginTop: '4px', textAlign: 'left', lineHeight: '1.4', border: '1px solid rgba(255,255,255,0.03)' }}>
                💡 <strong>Підказка:</strong> Введіть вагу та КБЖВ з етикетки для будь-якої порції. Додаток автоматично приведе продукт до 100 г і збереже його у вашій базі для наступних пошуків.
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button 
                className="btn-secondary" 
                onClick={closeCustomFoodModal}
                style={{ padding: '10px 16px' }}
              >
                Скасувати
              </button>
              <button 
                className="btn-primary" 
                onClick={handleSaveCustomFood}
                style={{ padding: '10px 20px' }}
              >
                <Check size={18} />
                {customFoodEditTarget ? 'Оновити продукт' : 'Зберегти в базу'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно для створення продукту зі штрих-кодом (який не знайдено) */}
      {isBarcodeNotFoundModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsBarcodeNotFoundModalOpen(false)}>
          <div className="modal-content glassmorphic-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>➕ Зберегти продукт у базу</h3>
                <span style={{ fontSize: '11px', opacity: 0.7, color: 'var(--color-water)' }}>Код: {barcodeNotFound}</span>
              </div>
              <button className="modal-close-btn" onClick={() => setIsBarcodeNotFoundModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="settings-group" style={{ textAlign: 'left' }}>
                <label className="modal-label">Назва продукту:</label>
                <input 
                  type="text"
                  className="modal-input"
                  placeholder="Введіть назву продукту"
                  value={fallbackName}
                  onChange={(e) => setFallbackName(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label">Вага порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="100"
                    value={fallbackWeight}
                    onChange={(e) => setFallbackWeight(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label">Калорії порції (ккал):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="350"
                    value={fallbackCalories}
                    onChange={(e) => setFallbackCalories(e.target.value)}
                    min="0"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-protein)', fontSize: '11px' }}>Білки порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="12"
                    value={fallbackProtein}
                    onChange={(e) => setFallbackProtein(e.target.value)}
                    style={{ borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-fat)', fontSize: '11px' }}>Жири порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="2.5"
                    value={fallbackFat}
                    onChange={(e) => setFallbackFat(e.target.value)}
                    style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
                <div className="settings-group" style={{ textAlign: 'left' }}>
                  <label className="modal-label" style={{ color: 'var(--color-carbs)', fontSize: '11px' }}>Вугл. порції (г):</label>
                  <input 
                    type="number"
                    className="modal-input"
                    placeholder="68"
                    value={fallbackCarbs}
                    onChange={(e) => setFallbackCarbs(e.target.value)}
                    style={{ borderColor: 'rgba(245, 158, 11, 0.2)' }}
                    step="0.1"
                    min="0"
                  />
                </div>
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-dark-muted)', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '12px', marginTop: '4px', textAlign: 'left', lineHeight: '1.4', border: '1px solid rgba(255,255,255,0.03)' }}>
                💡 <strong>Підказка:</strong> Введіть назву та КБЖВ з етикетки. Після збереження продукт буде у вашій базі та прив'яжеться до штрих-коду {barcodeNotFound}.
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button 
                className="btn-secondary" 
                onClick={() => setIsBarcodeNotFoundModalOpen(false)}
                style={{ padding: '10px 16px' }}
              >
                Скасувати
              </button>
              <button 
                className="btn-primary" 
                onClick={handleSaveCustomBarcode}
                style={{ padding: '10px 20px' }}
              >
                <Check size={18} />
                Зберегти в базу
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      {updateRegistration && (
        <div className="app-update-banner">
          <div>
            <strong>Доступна нова версія</strong>
            <span> Оновіть NutriSnap, щоб отримати останні виправлення.</span>
          </div>
          <button type="button" onClick={applyAppUpdate}>
            <RefreshCw size={14} />
            Оновити
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {toast.type === 'success' && <Check size={16} style={{ color: '#10b981' }} />}
              {toast.type === 'error' && <AlertCircle size={16} style={{ color: '#ef4444' }} />}
              {toast.type === 'info' && <AlertCircle size={16} style={{ color: '#3b82f6' }} />}
              {toast.type === 'warning' && <AlertCircle size={16} style={{ color: '#f59e0b' }} />}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}
