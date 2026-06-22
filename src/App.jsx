import React, { Suspense, useState, useEffect, useMemo, useRef } from 'react';
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
  X,
  BarChart2,
  TrendingUp,
  Zap,
  CalendarDays,
  Copy,
  Scale
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
import { GEMINI_MODEL_OPTIONS } from './constants';
import { getProductByBarcode, searchProductsByName } from './services/openFoodFactsService';
import { safeSetItem, safeRemoveItem } from './utils/storage';
import { getLearnedProducts, mergeLearnedProducts, saveLearnedProduct, setLearnedProducts } from './utils/learnedProducts';
import { exportProductsToFile, importProductsFromFile } from './utils/productShare';
import {
  createBackupFilename,
  createBackupPayload,
  parseBackupFileContent,
  prepareRestoreData
} from './services/backup';
import {
  calculateCaloriesFromMacros,
  roundNutritionValues,
  scaleNutritionPer100g
} from './services/nutrition';
import {
  createAiConfirmationDraft,
  scaleAiConfirmationDraftByWeight,
  validateAiConfirmationDraft
} from './services/aiConfirmation';
import {
  cloneMealEntryForDate,
  copyMealEntriesForDate,
  createCustomFoodItem,
  createFavoriteFromMealEntry,
  createFoodItem,
  createBarcodeMealEntry,
  createManualMealEntry,
  createMealEntryFromCustomFood,
  createMealEntryFromFavorite,
  createMealEntryFromFoodItem,
  normalizeCustomFoods,
  normalizeFavoriteFoods,
  normalizeMealEntries
} from './models/food';
import {
  getCalendarMealIndicators,
  getCategoryTotals,
  getDailyTotals,
  getMacroProgress,
  getMealsByCategory,
  getMealsByDate,
  getRecentDatesForCategory as selectRecentDatesForCategory,
  getStreakStats,
  getThirtyDayAverage,
  getUsageStats,
  getWeeklyAverages,
  getWeeklyTotals
} from './selectors/meals';
import {
  getWeightForDate,
  getWeightTrendData
} from './selectors/weight';
import {
  PRODUCT_IMPORT_FIELDS,
  parseCsvText,
  normalizeImportHeader,
  getImportField,
  numberFromImport,
  aliasesFromImport,
  rowsFromProductImport,
  normalizeImportedProduct,
  parseLocalDate,
  getTodayString,
  createMealId,
  formatDateLabel,
  getDashboardTitle,
  calculateBMR,
  getActivityMultiplier
} from './utils';
import {
  getAiPerformanceNow,
  getBase64PayloadSizeKb,
  logAiPayload,
  logAiPerformance
} from './utils/aiPerformance';
import useLocalStorageState from './hooks/useLocalStorageState';

const DEFAULT_API_KEY = import.meta.env.DEV ? SERVER_GEMINI_API_KEY : '';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_PROXY_URL = import.meta.env.DEV ? '/api/openai/responses' : '';
const MAX_LOCAL_SEARCH_RESULTS = 80;
const MAX_SEARCH_SUGGESTIONS = 6;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const BarcodeScanner = React.lazy(() => import('./components/BarcodeScanner'));

const normalizeSearchText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[ʼ'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const areBrandAndSupermarketEquivalent = (brand, supermarket) => {
  if (!brand || !supermarket) return false;
  const b = brand.toLowerCase().trim();
  const s = supermarket.toLowerCase().trim();
  if (b === s) return true;
  
  const equivalents = [
    ['auchan', 'ашан'],
    ['silpo', 'сільпо'],
    ['metro', 'метро'],
    ['atb', 'атб'],
    ['fora', 'фора'],
    ['novus', 'новус'],
    ['varus', 'варус'],
    ['rukavychka', 'рукавичка'],
    ['blyzenko', 'близенько']
  ];
  
  for (const pair of equivalents) {
    if ((b.includes(pair[0]) || b.includes(pair[1])) && (s.includes(pair[0]) || s.includes(pair[1]))) {
      return true;
    }
  }
  return false;
};

const shouldShowBrandPrefix = (food, isSupermarketShown) => {
  if (!food.brand) return false;
  
  const brandLower = food.brand.toLowerCase();
  
  // 1. If product name already contains the brand, don't repeat it
  if (food.name.toLowerCase().includes(brandLower)) {
    return false;
  }
  
  // 2. If supermarket badge is displayed and it is equivalent to the brand
  if (isSupermarketShown && food.supermarket) {
    if (areBrandAndSupermarketEquivalent(food.brand, food.supermarket)) {
      return false;
    }
  }
  
  return true;
};

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

const getFoodPortionKey = (food) => {
  if (!food) return '';
  if (food.barcode) return `barcode:${String(food.barcode).trim()}`;
  if (food.id) return `id:${String(food.id).trim()}`;
  return `name:${normalizeSearchText([food.name, food.brand].filter(Boolean).join(' '))}`;
};

const getQuickPortionPresets = (baseWeight = 100, name = '', preferredWeight = null) => {
  const normalizedName = normalizeSearchText(name);
  const presets = new Map();

  const addPreset = (label, value, options = {}) => {
    const { preferLabel = false, isPreferred = false } = options;
    const numericValue = Math.round(Number(value));
    if (!numericValue || numericValue < 1 || numericValue > 5000) return;
    if (presets.has(numericValue) && !preferLabel) return;
    presets.set(numericValue, { label, value: numericValue, isPreferred });
  };

  addPreset('Звично', preferredWeight, { preferLabel: true, isPreferred: true });
  [50, 100, 150, 200].forEach(value => addPreset(`${value} г`, value));

  const numericBaseWeight = Math.round(Number(baseWeight) || 100);
  if (numericBaseWeight !== 100) {
    const servingLabel = (
      normalizedName.includes('шт') ? '1 шт' :
      normalizedName.includes('порц') ? '1 порція' :
      normalizedName.includes('лож') || normalizedName.includes('ст. л') ? '1 ст. л.' :
      normalizedName.includes('ч. л') ? '1 ч. л.' :
      `${numericBaseWeight} г`
    );

    addPreset(servingLabel, numericBaseWeight, { preferLabel: true });
    addPreset('2 порції', numericBaseWeight * 2);
  }

  addPreset('Звично', preferredWeight, { preferLabel: true, isPreferred: true });

  return Array.from(presets.values()).slice(0, 6);
};

const QuickPortionButtons = ({ baseWeight, name, currentWeight, preferredWeight, onSelect }) => {
  const presets = getQuickPortionPresets(baseWeight, name, preferredWeight);
  const currentNumericWeight = Math.round(Number(currentWeight) || 0);

  return (
    <div className="quick-portion-row" aria-label="Швидкі порції">
      {presets.map(preset => (
        <button
          key={`${preset.label}-${preset.value}`}
          type="button"
          className={`quick-portion-chip ${preset.isPreferred ? 'preferred' : ''} ${currentNumericWeight === preset.value ? 'active' : ''}`}
          onClick={() => onSelect(preset.value)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
};

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
  const [foodSortOption, setFoodSortOption] = useState('rank');
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
  const [meals, setMeals] = useLocalStorageState('nutrisnap_meals', []);
  const [waterIntake, setWaterIntake] = useLocalStorageState('nutrisnap_water', {});
  const [weightLog, setWeightLog] = useLocalStorageState('nutrisnap_weight_log', {});
  const normalizedMeals = useMemo(() => normalizeMealEntries(meals), [meals]);

  // Показувати трекер води (вимкнено за замовчуванням)
  const [showWaterTracker, setShowWaterTracker] = useLocalStorageState('nutrisnap_show_water', false);

  // Профіль користувача та цілі КБЖВ
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('nutrisnap_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Міграція: додати нові поля якщо їх немає
        return {
          age: 25,
          gender: 'male',
          activityLevel: 'moderate',
          targetWater: 2100,
          ...parsed
        };
      }
    } catch (e) {
      console.error("Error reading nutrisnap_profile:", e);
    }
    return {
      weight: 70,
      height: 170,
      age: 25,
      gender: 'male',
      activityLevel: 'moderate',
      goal: 'maintain',
      targetCalories: 2000,
      targetProtein: 150,
      targetFat: 55,
      targetCarbs: 225,
      targetWater: 2100
    };
  });

  const [weightInput, setWeightInput] = useState(profile.weight || '');

  useEffect(() => {
    setWeightInput(profile.weight || '');
  }, [profile.weight]);

  // Налаштування ШІ
  const [apiKey, setApiKey] = useState(() => {
    try {
      const stored = localStorage.getItem('nutrisnap_apikey');
      return stored ? stored.trim() : DEFAULT_API_KEY;
    } catch {
      return DEFAULT_API_KEY;
    }
  });
  const [openAiApiKey, setOpenAiApiKey] = useLocalStorageState('nutrisnap_openai_apikey', '', { raw: true });
  const [openAiProxyUrl, setOpenAiProxyUrl] = useLocalStorageState('nutrisnap_openai_proxy_url', DEFAULT_OPENAI_PROXY_URL, { raw: true });
  const [scanMode, setScanMode] = useLocalStorageState('nutrisnap_scanmode', DEFAULT_API_KEY ? 'gemini' : 'mock', { raw: true });
  const [geminiModel, setGeminiModel] = useLocalStorageState('nutrisnap_geminimodel', 'gemini-2.5-flash', { raw: true });
  const [openAiModel, setOpenAiModel] = useLocalStorageState('nutrisnap_openai_model', DEFAULT_OPENAI_MODEL, { raw: true });
  const [aiPhotoNoticeAccepted, setAiPhotoNoticeAccepted] = useLocalStorageState('nutrisnap_ai_photo_notice_ack', false);
  const [updateRegistration, setUpdateRegistration] = useState(null);

  // --- Favorite Meals & Toast Notification States ---
  const [favorites, setFavorites] = useLocalStorageState('nutrisnap_favorites', []);
  const normalizedFavorites = useMemo(() => normalizeFavoriteFoods(favorites), [favorites]);

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.duration || (toast.actionLabel ? 6000 : 3000));
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message, type = 'success', options = {}) => {
    setToast({ message, type, ...options });
  };

  const acknowledgeAiPhotoNotice = () => {
    setAiPhotoNoticeAccepted(true);
    showToast("Попередження збережено. Ви можете користуватися фото-аналізом.", "info");
  };

  const ensureAiPhotoNoticeAccepted = () => {
    if (aiPhotoNoticeAccepted) return true;
    showToast("Перед фото-аналізом підтвердьте коротке попередження про AI-оцінку.", "warning", { duration: 5000 });
    return false;
  };

  const renderAiPhotoNotice = (compact = false) => (
    <div className={`ai-photo-notice ${compact ? 'compact' : ''}`} role="note">
      <div className="ai-photo-notice-title">
        <AlertCircle size={16} />
        <strong>Перед AI-аналізом фото</strong>
      </div>
      <p>
        Фото їжі може надсилатися до обраного AI-провайдера. КБЖВ є приблизною оцінкою; NutriSnap не надає медичних порад. Перевірте і скоригуйте результат вручну перед збереженням.
      </p>
      <button type="button" onClick={acknowledgeAiPhotoNotice}>
        Зрозуміло
      </button>
    </div>
  );

  const refreshLearnedProducts = () => {
    setLearnedProductsState(getLearnedProducts());
  };

  const rememberConfirmedProduct = (product, source) => {
    saveLearnedProduct(product, source);
    refreshLearnedProducts();
  };

  const isFavorite = (name) => {
    const normalizedName = normalizeSearchText(name);
    if (!normalizedName) return false;
    return normalizedFavorites.some(f => normalizeSearchText(f.name) === normalizedName);
  };

  const toggleFavoriteScanned = () => {
    if (!scanResult) return;
    const name = scanResult.name;
    setFavorites(prev => {
      const exists = prev.some(f => normalizeSearchText(f.name) === normalizeSearchText(name));
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => normalizeSearchText(f.name) !== normalizeSearchText(name));
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        const favoriteWeight = Number(editedWeight) || 100;
        const favoriteTotals = {
          calories: Number(scannedCalories) || 0,
          protein: Number(scannedProtein) || 0,
          fat: Number(scannedFat) || 0,
          carbs: Number(scannedCarbs) || 0
        };
        return [...prev, createFavoriteFromMealEntry({
          ...scanResult,
          name,
          ...favoriteTotals,
          totals: favoriteTotals,
          weight: favoriteWeight,
          servingGrams: favoriteWeight,
          source: scanResult.source || (scanResult.dataQuality === 'database_match' ? 'local_db' : 'ai_photo'),
          dataQuality: scanResult.dataQuality,
          confidence: scanResult.confidence,
          warning: scanResult.warning,
          image: scanResult?.image || ''
        })];
      }
    });
  };

  const toggleFavoriteBarcode = () => {
    if (!barcodeResult) return;
    const name = barcodeResult.name;
    setFavorites(prev => {
      const exists = prev.some(f => normalizeSearchText(f.name) === normalizeSearchText(name));
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => normalizeSearchText(f.name) !== normalizeSearchText(name));
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        const favoriteWeight = Number(barcodeEditedWeight) || 100;
        const favoriteTotals = {
          calories: Number(barcodeScannedCalories) || 0,
          protein: Number(barcodeScannedProtein) || 0,
          fat: Number(barcodeScannedFat) || 0,
          carbs: Number(barcodeScannedCarbs) || 0
        };
        const favoriteSource = (barcodeResult.isCustom || barcodeResult.isCustomBarcode) ? 'custom' : 'barcode_off';
        return [...prev, createFavoriteFromMealEntry({
          ...barcodeResult,
          name,
          ...favoriteTotals,
          totals: favoriteTotals,
          weight: favoriteWeight,
          servingGrams: favoriteWeight,
          source: favoriteSource,
          dataQuality: barcodeResult.dataQuality || (favoriteSource === 'custom' ? 'manual' : 'database'),
          warning: barcodeResult.warning,
          image: barcodeResult.image || ''
        })];
      }
    });
  };

  const toggleFavoriteMeal = (meal) => {
    if (!meal) return;
    const name = meal.name;
    setFavorites(prev => {
      const exists = prev.some(f => normalizeSearchText(f.name) === normalizeSearchText(name));
      if (exists) {
        showToast(`"${name}" видалено з обраного`, 'info');
        return prev.filter(f => normalizeSearchText(f.name) !== normalizeSearchText(name));
      } else {
        showToast(`"${name}" додано до обраного`, 'success');
        return [...prev, createFavoriteFromMealEntry(meal, {
          image: meal.image || ''
        })];
      }
    });
  };

  const streakStats = useMemo(() => getStreakStats(normalizedMeals, getTodayString(), { waterIntake }), [normalizedMeals, waterIntake]);
  const calculateStreak = () => streakStats.currentStreak;

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
  const aiScanInFlightRef = useRef(false);

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
  const [isBarcodeLiveScannerOpen, setIsBarcodeLiveScannerOpen] = useState(false);

  // --- States for Custom Barcodes & Custom Foods ---
  const [customBarcodes, setCustomBarcodes] = useLocalStorageState('nutrisnap_custom_barcodes', {});
  const [customFoods, setCustomFoods] = useLocalStorageState('nutrisnap_custom_foods', []);
  const normalizedCustomFoods = useMemo(() => normalizeCustomFoods(customFoods), [customFoods]);
  const [rememberedFoodPortions, setRememberedFoodPortions] = useLocalStorageState('nutrisnap_food_portions', {});
  const [learnedProducts, setLearnedProductsState] = useState(() => getLearnedProducts());

  const [isCustomFoodModalOpen, setIsCustomFoodModalOpen] = useState(false);
  const [customFoodName, setCustomFoodName] = useState('');
  const [customFoodCalories, setCustomFoodCalories] = useState('');
  const [customFoodProtein, setCustomFoodProtein] = useState('');
  const [customFoodFat, setCustomFoodFat] = useState('');
  const [customFoodCarbs, setCustomFoodCarbs] = useState('');
  const [customFoodWeight, setCustomFoodWeight] = useState('100');
  const [customFoodEditTarget, setCustomFoodEditTarget] = useState(null);
  const [customFoodNotice, setCustomFoodNotice] = useState('');

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
  const calendarMealIndicators = useMemo(
    () => getCalendarMealIndicators(normalizedMeals, calendarDate),
    [normalizedMeals, calendarDate]
  );

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
    safeSetItem('nutrisnap_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (apiKey === SERVER_GEMINI_API_KEY) {
      safeRemoveItem('nutrisnap_apikey');
    } else {
      safeSetItem('nutrisnap_apikey', apiKey.trim());
    }
  }, [apiKey]);

  useEffect(() => {
    safeSetItem('nutrisnap_theme', theme);
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

  useEffect(() => {
    const handleStorageFull = () => {
      showToast(
        'Сховище пристрою переповнене. Старі записи можуть не зберігатися — експортуйте резервну копію та видаліть давню історію.',
        'error',
        { duration: 7000 }
      );
    };
    window.addEventListener('nutrisnap-storage-full', handleStorageFull);
    return () => window.removeEventListener('nutrisnap-storage-full', handleStorageFull);
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
    const handleDocumentClick = () => {
      setActiveCopyMenu(null);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const getRememberedFoodPortion = (food) => {
    const key = getFoodPortionKey(food);
    const rememberedWeight = Number(rememberedFoodPortions[key]);
    return rememberedWeight > 0 && rememberedWeight <= 5000 ? rememberedWeight : null;
  };

  const getPreferredFoodWeight = (food, fallbackWeight = 100) => {
    const fallback = Number(fallbackWeight || food?.weight || 100);
    return getRememberedFoodPortion(food) || (fallback > 0 ? fallback : 100);
  };

  const rememberFoodPortion = (food, weight) => {
    const key = getFoodPortionKey(food);
    const numericWeight = Math.round(Number(weight));
    if (!key || !numericWeight || numericWeight < 1 || numericWeight > 5000) return;

    setRememberedFoodPortions(prev => {
      if (Number(prev[key]) === numericWeight) return prev;
      return { ...prev, [key]: numericWeight };
    });
  };

  const selectSearchFood = (food) => {
    setSelectedSearchFood(food);
    setSearchFoodWeight(getPreferredFoodWeight(food, food?.weight));
  };

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
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: { ideal: 'continuous' },
        advanced: [{ focusMode: 'continuous' }]
      },
      audio: false
    };

    const constraints2 = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
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

      // Спроба ввімкнути неперервний автофокус на Android (best-effort)
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const advanced = [];
        if (caps.focusMode && caps.focusMode.includes('continuous')) {
          advanced.push({ focusMode: 'continuous' });
        }
        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch (focusErr) {
        console.warn('Autofocus constraint not supported:', focusErr);
      }

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
    setCustomFoodNotice('');
  };

  const closeCustomFoodModal = () => {
    setIsCustomFoodModalOpen(false);
    setCustomFoodEditTarget(null);
    setCustomFoodNotice('');
  };

  const openCustomFoodForm = (prefill = {}, editTarget = null) => {
    setCustomFoodName(prefill.name || '');
    setCustomFoodCalories(prefill.calories !== undefined ? String(prefill.calories) : '');
    setCustomFoodProtein(prefill.protein !== undefined ? String(prefill.protein) : '');
    setCustomFoodFat(prefill.fat !== undefined ? String(prefill.fat) : '');
    setCustomFoodCarbs(prefill.carbs !== undefined ? String(prefill.carbs) : '');
    setCustomFoodWeight(prefill.weight !== undefined ? String(prefill.weight) : '100');
    setCustomFoodEditTarget(editTarget);
    setCustomFoodNotice(prefill.notice || '');
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
    if (aiScanInFlightRef.current) {
      logAiPayload('duplicate scan ignored', { provider: scanMode });
      return;
    }
    if (!ensureAiPhotoNoticeAccepted()) return;

    const scanStartedAt = getAiPerformanceNow();
    let scanOutcome = 'unknown';
    aiScanInFlightRef.current = true;
    logAiPayload('photo scan started', {
      provider: scanMode,
      inputSizeKb: getBase64PayloadSizeKb(imageDataBase64)
    });
    setIsScanning(true);
    setScanResult(null);
    setScannedMealCategory(preselectedCategory || getDefaultCategory());
    try {
      if (scanMode === 'mock') {
        throw new Error("Для фото-сканування оберіть GPT (OpenAI) або Gemini у налаштуваннях ШІ.");
      }

      const providerStartedAt = getAiPerformanceNow();
      const result = await analyzeFoodWithCurrentProvider(imageDataBase64);
      logAiPerformance('provider + validation', providerStartedAt, { provider: scanMode });
      const localNutritionMatch = findBestFoodMatchByName(result.name, [
        ...Object.values(customBarcodes).map(food => ({ ...food, isCustomBarcode: true })),
        ...normalizedCustomFoods.map(food => ({ ...food, isCustom: true })),
        ...learnedProducts.map(food => ({ ...food, isLearned: true })),
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
          scanOutcome = 'fallback_search';
          return;
        }
        throw new Error(scanData.warning || "Не вдалося надійно визначити КБЖВ з фото. Щоб не показувати неправильні дані, введіть значення з етикетки вручну.");
      }

      const verifiedResult = {
        ...scanData,
        dataQuality: scanData.dataQuality || "estimate",
        warning: scanData.warning || "КБЖВ з фото є приблизною оцінкою. Перевірте дані перед додаванням."
      };

      const confirmationStartedAt = getAiPerformanceNow();
      const confirmationDraft = createAiConfirmationDraft(verifiedResult);
      logAiPerformance('confirmation draft creation', confirmationStartedAt, {
        confidence: confirmationDraft.confidence,
        dataQuality: confirmationDraft.dataQuality
      });
      setScanResult(confirmationDraft);
      setEditedWeight(confirmationDraft.weight || 200);
      setScannedProtein(confirmationDraft.protein ?? 0);
      setScannedFat(confirmationDraft.fat ?? 0);
      setScannedCarbs(confirmationDraft.carbs ?? 0);
      setScannedCalories(confirmationDraft.calories ?? 0);
      scanOutcome = 'confirmation';
      logAiPerformance('confirmation state update', confirmationStartedAt, {
        name: confirmationDraft.name,
        weight: confirmationDraft.weight
      });
    } catch (err) {
      scanOutcome = 'error';
      console.error(err);
      openCustomFoodForm({ weight: 100 });
      showToast(err.message || "Помилка під час аналізу страви.", "error");
    } finally {
      logAiPerformance('total', scanStartedAt, {
        provider: scanMode,
        result: scanOutcome
      });
      aiScanInFlightRef.current = false;
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
    if (!ensureAiPhotoNoticeAccepted()) return;
    if (!videoRef.current) return;
    
    const captureStartedAt = getAiPerformanceNow();
    const video = videoRef.current;
    const sourceWidth = video.videoWidth || 640;
    const sourceHeight = video.videoHeight || 480;
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sourceWidth * scale);
    canvas.height = Math.round(sourceHeight * scale);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Data = canvas.toDataURL('image/jpeg', 0.75);
    logAiPerformance('capture preprocessing', captureStartedAt, {
      sourceWidth,
      sourceHeight,
      width: canvas.width,
      height: canvas.height,
      payloadSizeKb: getBase64PayloadSizeKb(base64Data)
    });
    triggerScan(base64Data);
  };

  // Стиснення та масштабування зображення для ШІ
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const filePreprocessingStartedAt = getAiPerformanceNow();
          const canvas = document.createElement('canvas');
          const sourceWidth = img.width;
          const sourceHeight = img.height;
          let width = img.width;
          let height = img.height;
          
          // Обмежуємо максимальний розмір до 1024px (баланс деталь/розмір)
          const max_size = 1024;
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
          
          // Якість 75% — достатньо чітко для сканування страви
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          logAiPerformance('file preprocessing', filePreprocessingStartedAt, {
            originalFileSizeKb: Math.round((file?.size || 0) / 1024),
            sourceWidth,
            sourceHeight,
            width: canvas.width,
            height: canvas.height,
            payloadSizeKb: getBase64PayloadSizeKb(dataUrl)
          });
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
    if (!ensureAiPhotoNoticeAccepted()) {
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
    
    setScannedCalories(Math.round(calculateCaloriesFromMacros(pVal, fVal, cVal) ?? 0));
  };

  // Обробник ручної зміни ваги страви з масштабуванням КБЖВ
  const handleScanWeightChange = (value) => {
    setEditedWeight(value);
    if (!scanResult) return;
    
    const scaledNutrition = scaleAiConfirmationDraftByWeight(scanResult, value);
    if (!scaledNutrition) return;
    
    setScannedProtein(scaledNutrition.protein);
    setScannedFat(scaledNutrition.fat);
    setScannedCarbs(scaledNutrition.carbs);
    setScannedCalories(scaledNutrition.calories);
  };

  // Додавання розпізнаної страви у щоденник
  const addScannedMealToDiary = () => {
    if (!scanResult) return;

    const confirmationDraft = createAiConfirmationDraft(scanResult, {
      calories: scannedCalories,
      protein: scannedProtein,
      fat: scannedFat,
      carbs: scannedCarbs,
      weight: editedWeight,
      needsManualNutrition: false
    });
    const confirmationValidation = validateAiConfirmationDraft(confirmationDraft);

    if (!confirmationValidation.isValid) {
      showToast("Перевірте вагу та КБЖВ: значення мають бути невід'ємними числами, а калорії мають узгоджуватися з макросами.", "error", { duration: 7000 });
      return;
    }

    const confirmedResult = confirmationValidation.result;
    const category = scannedMealCategory;

    const baselineWeight = Number(scanResult.weight) || 200;
    const finalWeight = Number(confirmedResult.weight);

    const finalCalories = Number(confirmedResult.calories);
    const finalProtein = Number(confirmedResult.protein);
    const finalFat = Number(confirmedResult.fat);
    const finalCarbs = Number(confirmedResult.carbs);

    const confirmedSource = scanResult.dataQuality === 'database_match' ? 'local_db' : 'ai_photo';
    const confirmedFoodItem = createFoodItem({
      ...confirmedResult,
      id: scanResult.id,
      brand: scanResult.brand,
      barcode: scanResult.barcode,
      source: confirmedSource,
      dataQuality: confirmedResult.dataQuality || scanResult.dataQuality || 'estimate',
      confidence: scanResult.confidence,
      warning: scanResult.warning,
      weight: finalWeight,
      defaultPortionGrams: finalWeight
    });
    const newMeal = createMealEntryFromFoodItem(confirmedFoodItem, finalWeight, {
      id: createMealId(),
      date: selectedDate,
      category,
      mealType: category,
      icon: getEmojiForCategory(category),
      source: confirmedSource,
      confidence: confirmedFoodItem.confidence,
      warning: confirmedFoodItem.warning,
      original: {
        calories: Number(scanResult.calories),
        protein: Number(scanResult.protein),
        fat: Number(scanResult.fat),
        carbs: Number(scanResult.carbs),
        weight: baselineWeight
      }
    });

    rememberFoodPortion(confirmedResult, finalWeight);
    if (!scanResult.isCustom && !scanResult.isCustomBarcode && !scanResult.isLearned) {
      rememberConfirmedProduct({
        ...scanResult,
        calories: finalCalories,
        protein: finalProtein,
        fat: finalFat,
        carbs: finalCarbs,
        weight: finalWeight
      }, scanResult.dataQuality === 'database_match' ? 'ai-photo-local-match' : 'ai-photo');
    }
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
    const w = getPreferredFoodWeight(product, product.weight || 100);
    setBarcodeEditedWeight(w);
    const scaledNutrition = scaleNutritionPer100g({
      calories: Number(product.calories) || 0,
      protein: Number(product.protein) || 0,
      fat: Number(product.fat) || 0,
      carbs: Number(product.carbs) || 0
    }, w) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    setBarcodeScannedProtein(scaledNutrition.protein);
    setBarcodeScannedFat(scaledNutrition.fat);
    setBarcodeScannedCarbs(scaledNutrition.carbs);
    setBarcodeScannedCalories(scaledNutrition.calories);
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

  const handleBarcodeDetectedLocally = async (barcodeVal) => {
    setIsBarcodeLiveScannerOpen(false);
    await triggerBarcodeSearchDirect(barcodeVal);
  };

  const handleBarcodeScannerFallback = () => {
    setIsBarcodeLiveScannerOpen(false);
    setCameraRequested(true);
    setCameraError(null);
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
    const normalizedNutrition = roundNutritionValues({
      calories: kcalVal * scaleTo100,
      protein: proteinVal * scaleTo100,
      fat: fatVal * scaleTo100,
      carbs: carbsVal * scaleTo100
    }) || {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    };
    const now = new Date().toISOString();
    const legacyCustomFood = {
      name: customFoodName.trim(),
      calories: normalizedNutrition.calories,
      protein: normalizedNutrition.protein,
      fat: normalizedNutrition.fat,
      carbs: normalizedNutrition.carbs,
      weight: 100,
      brand: "Моя база",
      icon: "🏷️",
      source: "manual",
      sourceLabel: "Моя база",
      dataQuality: "manual",
      searchText: `${customFoodName.trim()} моя база введено вручну`.toLowerCase(),
      updatedAt: now
    };
    const normalizedFood = createCustomFoodItem({
      ...legacyCustomFood,
      defaultPortionGrams: defaultWeightVal,
      per100g: normalizedNutrition
    });

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
      rememberFoodPortion(updatedProduct, defaultWeightVal);
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
      rememberFoodPortion(updatedFood, defaultWeightVal);
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
    rememberFoodPortion(newFood, defaultWeightVal);

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
    const normalizedNutrition = roundNutritionValues({
      calories: kcalVal * scaleTo100,
      protein: proteinVal * scaleTo100,
      fat: fatVal * scaleTo100,
      carbs: carbsVal * scaleTo100
    }) || {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0
    };
    const newProduct = {
      barcode: barcodeNotFound,
      name: fallbackName.trim(),
      calories: normalizedNutrition.calories,
      protein: normalizedNutrition.protein,
      fat: normalizedNutrition.fat,
      carbs: normalizedNutrition.carbs,
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
    rememberFoodPortion(newProduct, defaultWeightVal);

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
    
    const caloriesVal = Math.round(calculateCaloriesFromMacros(pVal, fVal, cVal) ?? 0);
    setBarcodeScannedCalories(caloriesVal);

    if (barcodeResult) {
      const portionWeight = Number(barcodeEditedWeight) || 100;
      const scaleTo100 = portionWeight > 0 ? (100 / portionWeight) : 1;
      const normalizedNutrition = roundNutritionValues({
        protein: pVal * scaleTo100,
        fat: fVal * scaleTo100,
        carbs: cVal * scaleTo100,
        calories: caloriesVal * scaleTo100
      }) || { protein: 0, fat: 0, carbs: 0, calories: 0 };
      
      setBarcodeResult(prev => ({
        ...prev,
        protein: normalizedNutrition.protein,
        fat: normalizedNutrition.fat,
        carbs: normalizedNutrition.carbs,
        calories: normalizedNutrition.calories
      }));
    }
  };

  // Обробник ручної зміни ваги порції для штрих-коду з масштабуванням КБЖВ
  const handleBarcodeWeightChange = (value) => {
    setBarcodeEditedWeight(value);
    if (!barcodeResult) return;
    
    const currentWeightVal = Number(value) || 0;
    const scaledNutrition = scaleNutritionPer100g({
      calories: 0,
      protein: Number(barcodeResult.protein) || 0,
      fat: Number(barcodeResult.fat) || 0,
      carbs: Number(barcodeResult.carbs) || 0
    }, currentWeightVal) || { protein: 0, fat: 0, carbs: 0 };
    const { protein: p, fat: f, carbs: c } = scaledNutrition;
    
    setBarcodeScannedProtein(p);
    setBarcodeScannedFat(f);
    setBarcodeScannedCarbs(c);
    setBarcodeScannedCalories(Math.round(calculateCaloriesFromMacros(p, f, c) ?? 0));
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
    const mealSource = (barcodeResult.isCustom || barcodeResult.isCustomBarcode) ? 'custom' : 'barcode_off';
    const per100g = roundNutritionValues({
      calories: finalCalories * (100 / finalWeight),
      protein: finalProtein * (100 / finalWeight),
      fat: finalFat * (100 / finalWeight),
      carbs: finalCarbs * (100 / finalWeight)
    });

    const newMeal = createBarcodeMealEntry({
      ...barcodeResult,
      source: mealSource,
      dataQuality: barcodeResult.dataQuality || (mealSource === 'custom' ? 'manual' : 'database'),
      per100g,
      defaultPortionGrams: finalWeight
    }, finalWeight, {
      id: createMealId(),
      date: selectedDate,
      category,
      mealType: category,
      icon: getEmojiForCategory(category),
      source: mealSource,
      warning: barcodeResult.warning,
      totals: { calories: finalCalories, protein: finalProtein, fat: finalFat, carbs: finalCarbs },
      original: {
        calories: Number(barcodeResult.calories),
        protein: Number(barcodeResult.protein),
        fat: Number(barcodeResult.fat),
        carbs: Number(barcodeResult.carbs),
        weight: baselineWeight
      }
    });

    rememberFoodPortion(barcodeResult, finalWeight);
    if (!barcodeResult.isCustom && !barcodeResult.isCustomBarcode && !barcodeResult.isLearned) {
      rememberConfirmedProduct({
        ...barcodeResult,
        calories: finalCalories,
        protein: finalProtein,
        fat: finalFat,
        carbs: finalCarbs,
        weight: finalWeight
      }, 'barcode');
    }
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

    const category = searchMealCategory;
    const baselineWeight = Number(selectedSearchFood.weight) || 100;
    const finalWeight = Number(searchFoodWeight) || baselineWeight;
    const scaleTo100 = 100 / baselineWeight;
    const isOffProduct = selectedSearchFood.source === 'openfoodfacts';
    const isCustomProduct = selectedSearchFood.isCustom || selectedSearchFood.isCustomBarcode;
    const foodSource = isOffProduct
      ? 'barcode_off'
      : selectedSearchFood.isAiSearch || selectedSearchFood.source === 'ai-search'
        ? 'ai_estimate'
        : selectedSearchFood.source || 'manual';
    const per100g = roundNutritionValues({
      calories: (Number(selectedSearchFood.calories) || 0) * (isOffProduct ? 1 : scaleTo100),
      protein: (Number(selectedSearchFood.protein) || 0) * (isOffProduct ? 1 : scaleTo100),
      fat: (Number(selectedSearchFood.fat) || 0) * (isOffProduct ? 1 : scaleTo100),
      carbs: (Number(selectedSearchFood.carbs) || 0) * (isOffProduct ? 1 : scaleTo100)
    });
    const scaledNutrition = scaleNutritionPer100g(per100g, finalWeight) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    const createMealEntry = isOffProduct
      ? createBarcodeMealEntry
      : isCustomProduct
        ? createMealEntryFromCustomFood
        : createManualMealEntry;

    const newMeal = createMealEntry({
      ...selectedSearchFood,
      source: foodSource,
      dataQuality: selectedSearchFood.dataQuality || (foodSource === 'manual' ? 'manual' : 'unknown'),
      per100g,
      defaultPortionGrams: finalWeight
    }, finalWeight, {
      id: createMealId(),
      date: selectedDate,
      category,
      mealType: category,
      icon: selectedSearchFood.icon || getEmojiForCategory(category),
      source: foodSource,
      confidence: selectedSearchFood.confidence,
      warning: selectedSearchFood.warning,
      totals: scaledNutrition,
      original: {
        calories: Number(selectedSearchFood.calories),
        protein: Number(selectedSearchFood.protein),
        fat: Number(selectedSearchFood.fat),
        carbs: Number(selectedSearchFood.carbs),
        weight: baselineWeight
      }
    });

    const finalCalories = newMeal.calories;
    const finalProtein = newMeal.protein;
    const finalFat = newMeal.fat;
    const finalCarbs = newMeal.carbs;

    rememberFoodPortion(selectedSearchFood, finalWeight);
    if (
      !selectedSearchFood.isCustom &&
      !selectedSearchFood.isCustomBarcode &&
      !selectedSearchFood.isLearned &&
      (selectedSearchFood.isAiSearch || selectedSearchFood.source === 'openfoodfacts')
    ) {
      rememberConfirmedProduct({
        ...selectedSearchFood,
        calories: finalCalories,
        protein: finalProtein,
        fat: finalFat,
        carbs: finalCarbs,
        weight: finalWeight
      }, selectedSearchFood.source === 'openfoodfacts' ? 'barcode' : 'ai-search');
    }
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
        icon: p.icon || "🔮",
        isAiSearch: true,
        source: 'ai-search',
        dataQuality: p.dataQuality || 'estimate',
        needsManualNutrition: true,
        confidence: Number.isFinite(Number(p.confidence)) ? Number(p.confidence) : null,
        warning: p.warning || 'Підказка ШІ може бути приблизною. Введіть КБЖВ з етикетки або перевіреного джерела перед збереженням.'
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

  // Об'єднана база продуктів: learned + вбудовані + користувацькі без штрих-коду + користувацькі зі штрих-кодом
  const combinedFoods = useMemo(() => [
    ...learnedProducts.map(f => ({
      ...f,
      isLearned: true,
      id: f.id || `learned-${f.name}`,
      brand: f.brand || f.sourceLabel || "Збережено зі сканувань",
      sourceLabel: f.sourceLabel || "🧠 Збережено зі сканувань",
      icon: f.icon || "🍽️"
    })),
    ...normalizedCustomFoods.map(f => ({
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
  ], [learnedProducts, normalizedCustomFoods, customBarcodes]);

  const indexedCombinedFoods = useMemo(() => (
    combinedFoods.map((food, index) => ({
      ...food,
      searchIndexText: getFoodSearchText(food),
      catalogOrder: index
    }))
  ), [combinedFoods]);

  const normalizedSearchQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);
  const searchTokens = useMemo(() => normalizedSearchQuery.split(/\s+/).filter(Boolean), [normalizedSearchQuery]);
  const favoriteNameSet = useMemo(() => new Set(normalizedFavorites.map(fav => normalizeSearchText(fav.name))), [normalizedFavorites]);
  const mealUsageStats = useMemo(
    () => getUsageStats(normalizedMeals, { normalizeKey: normalizeSearchText }),
    [normalizedMeals]
  );

  const getFoodUsageCount = (food) => mealUsageStats.get(normalizeSearchText(food.name))?.count || 0;

  const getFoodSearchRank = (food) => {
    let score = 0;
    const usage = getFoodUsageCount(food);
    const normalizedName = normalizeSearchText(food.name);

    if (food.isCustom || food.isCustomBarcode || food.isLearned || food.source === 'manual' || food.dataQuality === 'manual') score += 100000;
    if (favoriteNameSet.has(normalizedName)) score += 600;
    if (usage > 0) score += Math.min(usage, 30) * 450;
    if (food.source === 'ua-core') score += 120;
    if (food.source === 'ua-seed') score += 60;

    if (normalizedSearchQuery) {
      if (normalizedName === normalizedSearchQuery) score += 900;
      else if (normalizedName.startsWith(normalizedSearchQuery)) score += 500;
      else if (normalizedName.includes(normalizedSearchQuery)) score += 220;
    }

    return score;
  };

  const filteredSearchFoods = useMemo(() => indexedCombinedFoods.filter(food => {
    const matchesQuery = searchTokens.length === 0 || searchTokens.every(token => food.searchIndexText.includes(token));
    if (!matchesQuery) return false;

    if (selectedCategoryFilter === 'Усі') return true;
    if (selectedCategoryFilter === 'Моя база') {
      return Boolean(food.isCustom || food.isCustomBarcode || food.source === 'manual' || food.dataQuality === 'manual');
    }
    if (selectedCategoryFilter === 'Часті') return getFoodUsageCount(food) > 0;
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
  }).sort((a, b) => {
    if (foodSortOption === 'caloriesAsc') {
      return (a.calories || 0) - (b.calories || 0);
    }
    if (foodSortOption === 'caloriesDesc') {
      return (b.calories || 0) - (a.calories || 0);
    }
    if (foodSortOption === 'protein') {
      return (b.protein || 0) - (a.protein || 0);
    }
    if (foodSortOption === 'name') {
      return a.name.localeCompare(b.name, 'uk');
    }
    const rankDiff = getFoodSearchRank(b) - getFoodSearchRank(a);
    if (rankDiff !== 0) return rankDiff;
    return a.catalogOrder - b.catalogOrder;
  }).slice(0, MAX_LOCAL_SEARCH_RESULTS), [indexedCombinedFoods, searchTokens, selectedCategoryFilter, favoriteNameSet, mealUsageStats, normalizedSearchQuery, foodSortOption]);

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
      .sort((a, b) => {
        const rankDiff = getFoodSearchRank(b) - getFoodSearchRank(a);
        if (rankDiff !== 0) return rankDiff;
        return a.catalogOrder - b.catalogOrder;
      })
      .slice(0, MAX_SEARCH_SUGGESTIONS);
  }, [indexedCombinedFoods, searchTokens, showSuggestions, favoriteNameSet, mealUsageStats, normalizedSearchQuery]);

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
      learned: learnedProducts.length,
      verifiedCustom: verifiedCustomFoods + verifiedBarcodes,
      total: productCatalog.length + mockFoods.length + customFoods.length + Object.keys(customBarcodes).length + learnedProducts.length,
      topSources: Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 4)
    };
  }, [customFoods, customBarcodes, learnedProducts]);
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
          const clearedTotals = { calories: 0, protein: 0, fat: 0, carbs: 0 };
          return {
            ...meal,
            weight: "",
            ...(meal.totals ? { servingGrams: "", totals: clearedTotals } : {}),
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

        const scaleTo100 = 100 / origWeight;
        const scaledNutrition = scaleNutritionPer100g({
          calories: origCals * scaleTo100,
          protein: origProt * scaleTo100,
          fat: origFat * scaleTo100,
          carbs: origCarbs * scaleTo100
        }, newWeight) || { calories: 0, protein: 0, fat: 0, carbs: 0 };

        return {
          ...meal,
          weight: newWeight,
          ...(meal.totals ? { servingGrams: newWeight, totals: scaledNutrition } : {}),
          calories: scaledNutrition.calories,
          protein: scaledNutrition.protein,
          fat: scaledNutrition.fat,
          carbs: scaledNutrition.carbs,
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

        const newCals = Math.round(calculateCaloriesFromMacros(pVal, fVal, cVal) ?? 0);
        const nextTotals = { calories: newCals, protein: pVal, fat: fVal, carbs: cVal };

        return {
          ...meal,
          ...(meal.totals ? { totals: nextTotals } : {}),
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
  const currentDayMeals = useMemo(() => getMealsByDate(normalizedMeals, selectedDate), [normalizedMeals, selectedDate]);
  const totals = useMemo(() => getDailyTotals(currentDayMeals), [currentDayMeals]);
  const currentDayMealsByCategory = useMemo(() => getMealsByCategory(currentDayMeals), [currentDayMeals]);
  const currentDayCategoryTotals = useMemo(() => getCategoryTotals(currentDayMeals), [currentDayMeals]);
  const macroProgress = useMemo(() => getMacroProgress(totals, profile), [totals, profile]);

  const currentWater = waterIntake[selectedDate] || 0;

  const handleWaterAdd = (amount = 250) => {
    setWaterIntake(prev => ({
      ...prev,
      [selectedDate]: Math.max(0, (prev[selectedDate] || 0) + amount)
    }));
  };

  const deleteMeal = (id) => {
    const deletedIndex = meals.findIndex(meal => meal.id === id);
    if (deletedIndex === -1) return;

    const deletedMeal = meals[deletedIndex];
    setMeals(prev => prev.filter(m => m.id !== id));
    showToast(`"${deletedMeal.name}" видалено`, "warning", {
      actionLabel: "Скасувати",
      onAction: () => {
        setMeals(prev => {
          if (prev.some(meal => meal.id === deletedMeal.id)) return prev;
          const nextMeals = [...prev];
          nextMeals.splice(Math.min(deletedIndex, nextMeals.length), 0, deletedMeal);
          return nextMeals;
        });
      }
    });
  };

  const repeatMeal = (meal) => {
    const sourceMeal = meals.find(m => m.id === meal.id) || meal;
    const repeatedMeal = cloneMealEntryForDate(sourceMeal, selectedDate, {
      id: createMealId(),
      repeatedFrom: sourceMeal.id,
      repeatedAt: new Date().toISOString()
    });

    setMeals(prev => [repeatedMeal, ...prev]);
    showToast(`"${sourceMeal.name}" додано ще раз`, "success");
  };

  const [activeCopyMenu, setActiveCopyMenu] = useState(null);

  const getRecentDatesForCategory = (categoryName) => (
    selectRecentDatesForCategory(normalizedMeals, categoryName, selectedDate)
  );

  const copyCategoryMeals = (categoryName, sourceDate) => {
    const sourceMeals = meals.filter(m => {
      const mCat = m.category === 'Перекус' ? 'Перший перекус' : m.category;
      return mCat === categoryName && m.date === sourceDate;
    });
    
    if (sourceMeals.length === 0) {
      showToast("Немає страв для копіювання з цієї дати", "warning");
      return;
    }
    
    const copiedAt = new Date().toISOString();
    const copiedTime = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const newMeals = copyMealEntriesForDate(sourceMeals, selectedDate, {
      createId: createMealId,
      time: copiedTime,
      copiedAt
    });
    
    setMeals(prev => [...newMeals, ...prev]);
    showToast(`Скопійовано ${categoryName} (${newMeals.length} шт.)`, "success");
  };



  const handleProfileChange = (key, value) => {
    const updated = { ...profile, [key]: value };
    
    if (['goal', 'weight', 'height', 'age', 'gender', 'activityLevel'].includes(key)) {
      const weightNum = Number(updated.weight) || 70;
      const bmr = calculateBMR(updated.weight, updated.height, updated.age, updated.gender);
      const tdee = Math.round(bmr * getActivityMultiplier(updated.activityLevel));
      
      let baseCals;
      if (updated.goal === 'lose') {
        baseCals = Math.round(tdee * 0.8);
      } else if (updated.goal === 'gain') {
        baseCals = Math.round(tdee * 1.15);
      } else {
        baseCals = tdee;
      }
      
      updated.targetCalories = baseCals;
      updated.bmr = bmr;
      updated.tdee = tdee;
      updated.targetProtein = Math.round(weightNum * (updated.goal === 'lose' ? 2.0 : 1.8));
      updated.targetFat = Math.round(weightNum * 0.9);
      const fatCals = updated.targetFat * 9;
      const protCals = updated.targetProtein * 4;
      updated.targetCarbs = Math.round((baseCals - fatCals - protCals) / 4);
      updated.targetWater = Math.round(weightNum * 33);
    }
    
    setProfile(updated);
  };

  const handleRecordWeight = () => {
    const weightNum = parseFloat(weightInput);
    if (isNaN(weightNum) || weightNum <= 0) {
      showToast("Будь ласка, введіть коректне значення ваги", "error");
      return;
    }
    const today = getTodayString();
    setWeightLog(prev => ({
      ...prev,
      [today]: weightNum
    }));
    
    if (window.confirm("Бажаєте автоматично перерахувати цілі калорійності та макросів на основі нової ваги?")) {
      handleProfileChange('weight', weightNum);
    } else {
      setProfile(prev => ({ ...prev, weight: weightNum }));
    }
    showToast(`Вагу ${weightNum} кг успішно записано на сьогодні!`, "success");
  };

  // Експорт та імпорт даних користувача (Бекапи)
  const exportUserData = () => {
    try {
      const exportData = createBackupPayload({
        meals,
        waterIntake,
        weightLog,
        profile,
        customFoods,
        customBarcodes,
        favorites,
        learnedProducts,
        rememberedFoodPortions,
        scanMode,
        geminiModel,
        openAiModel,
        theme
      });
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = createBackupFilename(getTodayString());
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
        const importedData = parseBackupFileContent(event.target.result);
        const restoreData = prepareRestoreData(importedData);
        
        // Restore state here; DOM, state setters and toasts stay in App.jsx.
        if (restoreData.meals !== undefined) {
          setMeals(restoreData.meals);
        }
        if (restoreData.waterIntake !== undefined) {
          setWaterIntake(restoreData.waterIntake);
        }
        if (restoreData.weightLog !== undefined) {
          setWeightLog(restoreData.weightLog);
        }
        if (restoreData.profile !== undefined) {
          setProfile(prev => ({ ...prev, ...restoreData.profile }));
        }
        if (restoreData.customFoods !== undefined) {
          setCustomFoods(restoreData.customFoods);
        }
        if (restoreData.favorites !== undefined) {
          setFavorites(restoreData.favorites);
        }
        if (restoreData.learnedProducts !== undefined) {
          setLearnedProducts(restoreData.learnedProducts);
          refreshLearnedProducts();
        }
        if (restoreData.customBarcodes !== undefined) {
          setCustomBarcodes(restoreData.customBarcodes);
        }
        if (restoreData.rememberedFoodPortions !== undefined) {
          setRememberedFoodPortions(restoreData.rememberedFoodPortions);
        }
        // Legacy backups may contain credentials. New backups intentionally omit them.
        if (restoreData.apiKey !== undefined) {
          const importedApiKey = String(restoreData.apiKey || '').trim();
          setApiKey(importedApiKey || DEFAULT_API_KEY);
        }
        if (restoreData.openAiApiKey !== undefined) {
          setOpenAiApiKey(String(restoreData.openAiApiKey || '').trim());
        }
        if (restoreData.openAiProxyUrl !== undefined) {
          setOpenAiProxyUrl(String(restoreData.openAiProxyUrl || '').trim());
        }
        if (restoreData.scanMode !== undefined) {
          setScanMode(restoreData.scanMode);
        }
        if (restoreData.geminiModel !== undefined) {
          setGeminiModel(restoreData.geminiModel);
        }
        if (restoreData.openAiModel !== undefined) {
          setOpenAiModel(restoreData.openAiModel);
        }
        if (restoreData.theme !== undefined) {
          setTheme(restoreData.theme);
        }
        
        if (restoreData.hasCredentialFields) {
          showToast("Дані успішно імпортовано! Додаток оновлено.", "success");
        } else {
          showToast("Дані імпортовано. API-ключі не входять у резервну копію — введіть їх повторно у налаштуваннях ШІ.", "warning", { duration: 7000 });
        }
        e.target.value = '';
      } catch (error) {
        console.error("Помилка імпорту даних:", error);
        showToast("Не вдалося імпортувати дані. Перевірте, чи файл правильного формату та чи він не пошкоджений.\nДеталі: " + error.message, "error");
      }
    };
    reader.readAsText(file);
  };

  const importSharedProductDatabase = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const products = await importProductsFromFile(file);
      const completeProducts = products.filter(hasCompleteNutritionValues);
      if (completeProducts.length === 0) {
        throw new Error("У файлі немає продуктів з повними КБЖВ.");
      }

      mergeLearnedProducts(completeProducts);
      refreshLearnedProducts();
      showToast(`Імпортовано ${completeProducts.length} продуктів`, "success");
    } catch (error) {
      console.error("Shared product database import error:", error);
      showToast(`Не вдалося імпортувати базу продуктів: ${error.message}`, "error");
    } finally {
      event.target.value = "";
    }
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

  const calPercent = macroProgress.calories;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (calPercent / 100) * circumference;



  // Дані аналітики за 7 днів
  const weeklyAnalytics = useMemo(() => getWeeklyTotals(normalizedMeals, getTodayString(), {
    waterIntake,
    targetCalories: profile.targetCalories
  }), [normalizedMeals, waterIntake, profile.targetCalories]);
  const weeklyAverages = useMemo(() => getWeeklyAverages(weeklyAnalytics), [weeklyAnalytics]);

  // Дані аналітики ваги за 30 днів
  const weightTrendData = useMemo(() => getWeightTrendData(weightLog, {
    endDate: getTodayString(),
    days: 30
  }), [weightLog]);
  const weightAnalytics = weightTrendData.days;
  const weightTrend = weightTrendData.trend;
  const todayWeight = useMemo(() => getWeightForDate(weightLog, getTodayString()), [weightLog]);

  const thirtyDayCaloriesAvg = useMemo(() => getThirtyDayAverage(normalizedMeals, getTodayString()), [normalizedMeals]);

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
      {isBarcodeLiveScannerOpen && (
        <Suspense fallback={(
          <div className="barcode-scanner-overlay">
            <p className="barcode-scanner-status">Завантаження сканера...</p>
          </div>
        )}>
          <BarcodeScanner
            onDetected={handleBarcodeDetectedLocally}
            onError={(message) => {
              setBarcodeError(message);
              showToast(message, 'error');
            }}
            onClose={() => setIsBarcodeLiveScannerOpen(false)}
            onFallback={handleBarcodeScannerFallback}
          />
        </Suspense>
      )}
      
      {/* --- App Header --- */}
      <header className="app-header">
        <div className="brand">
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
          <div className="brand-identity">
            <span className="brand-logo">NutriSnap</span>
            <span className="brand-credit">
              developed by <strong>Ihor Samchenko</strong>
            </span>
          </div>
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
                {selectedDate !== getTodayString() && (
                  <button
                    className="today-jump-btn"
                    onClick={() => setSelectedDate(getTodayString())}
                    title="Перейти до сьогодні"
                  >
                    <CalendarDays size={14} />
                    <span>Сьогодні</span>
                  </button>
                )}
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
                        style={{ width: `${macroProgress.protein}%` }}
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
                        style={{ width: `${macroProgress.fat}%` }}
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
                        style={{ width: `${macroProgress.carbs}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Water Tracker */}
            {showWaterTracker && (
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
                  <p className="water-progress">{currentWater} мл / {profile.targetWater || 2000} мл</p>
                </div>
                  <div className="water-progress-track" aria-hidden="true">
                    <div
                      className="water-progress-fill"
                      style={{ width: `${Math.min((currentWater / 2000) * 100, 100)}%` }}
                    ></div>
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
                <button className="btn-water-add" onClick={() => handleWaterAdd(150)} title="Додати 150мл">
                  +150
                </button>
                <button className="btn-water-add" onClick={() => handleWaterAdd(250)} title="Додати 250мл">
                  +250
                </button>
                <button className="btn-water-add" onClick={() => handleWaterAdd(330)} title="Додати 330мл">
                  +330
                </button>
                <button className="btn-water-add" onClick={() => handleWaterAdd(500)} title="Додати 500мл">
                  +500
                </button>
              </div>
            </div>
            )}

            {/* Favorites Scroll Tray */}
            {normalizedFavorites.length > 0 && (
              <div className="favorites-container" style={{ marginTop: '24px' }}>
                <h3 className="section-title" style={{ marginBottom: '12px' }}>Обрані страви</h3>
                <div className="favorites-scroll-tray">
                  {normalizedFavorites.map((fav, index) => (
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
                            const newMeal = createMealEntryFromFavorite(fav, {
                              id: createMealId(),
                              date: selectedDate,
                              category,
                              mealType: category,
                              icon: getEmojiForCategory(category)
                            });
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
                            setFavorites(prev => prev.filter(f => normalizeSearchText(f.name) !== normalizeSearchText(fav.name)));
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
                  const catMeals = currentDayMealsByCategory[cat.name] || [];
                  const catCals = currentDayCategoryTotals[cat.name]?.calories || 0;
                  
                  return (
                    <div key={cat.name} className="meal-category-card">
                      <div className="category-header">
                        <div className="category-title">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                          {catCals > 0 && <span className="category-total-cals">{catCals} ккал</span>}
                          
                          <button 
                            className="category-copy-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCopyMenu(activeCopyMenu?.category === cat.name && activeCopyMenu?.tab === 'dashboard' ? null : { category: cat.name, tab: 'dashboard' });
                            }}
                            title={`Копіювати ${cat.name} з іншого дня`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'rgba(255, 255, 255, 0.4)',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Copy size={14} />
                          </button>

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

                          {activeCopyMenu?.category === cat.name && activeCopyMenu?.tab === 'dashboard' && (
                            <div className="copy-dropdown-menu" style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              zIndex: 100,
                              background: '#1f1f24',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                              padding: '6px',
                              minWidth: '160px',
                              marginTop: '4px'
                            }}>
                              <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--text-dark-muted)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                                КОПІЮВАТИ З:
                              </div>
                              {(() => {
                                const recentDates = getRecentDatesForCategory(cat.name);
                                if (recentDates.length === 0) {
                                  return <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-dark-muted)' }}>Немає історії страв</div>;
                                }
                                return recentDates.map(dString => {
                                  const dateObj = new Date(dString);
                                  const formattedDate = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
                                  
                                  const today = new Date();
                                  const yesterday = new Date(today);
                                  yesterday.setDate(yesterday.getDate() - 1);
                                  const yesterdayStr = yesterday.toISOString().split('T')[0];
                                  
                                  let label = formattedDate;
                                  if (dString === yesterdayStr) {
                                    label = `Вчора (${formattedDate})`;
                                  } else {
                                    const twoDaysAgo = new Date(today);
                                    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                                    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];
                                    if (dString === twoDaysAgoStr) {
                                      label = `Позавчора (${formattedDate})`;
                                    }
                                  }

                                  return (
                                    <button
                                      key={dString}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyCategoryMeals(cat.name, dString);
                                        setActiveCopyMenu(null);
                                      }}
                                      style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        display: 'block',
                                        transition: 'background 0.2s'
                                      }}
                                      className="copy-dropdown-item"
                                    >
                                      {label}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                          )}
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
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', whiteSpace: 'nowrap' }}>
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
                                className="meal-repeat-btn"
                                onClick={() => repeatMeal(meal)}
                                title="Додати ще раз"
                                aria-label={`Додати "${meal.name}" ще раз`}
                              >
                                <Plus size={16} />
                              </button>
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

                      {!aiPhotoNoticeAccepted && renderAiPhotoNotice()}
                      
                      {cameraError && (
                        <p style={{ fontSize: '12px', color: '#f87171', maxWidth: '280px', marginBottom: '16px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          ⚠️ {cameraError}
                        </p>
                      )}

                      <button
                        className="btn-primary"
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            setIsBarcodeLiveScannerOpen(true);
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
                        <QrCode size={20} />
                        <span>Сканувати без ШІ</span>
                      </button>
                      
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (allowCameraTrigger && (Date.now() - scannerOpenedTimeRef.current >= 350)) {
                            setCameraRequested(true);
                          }
                        }}
                        style={{ 
                          cursor: allowCameraTrigger ? 'pointer' : 'default', 
                          width: '100%', 
                          maxWidth: '260px', 
                          marginTop: '10px',
                          padding: '16px', 
                          borderRadius: '16px', 
                          gap: '10px', 
                          display: 'flex', 
                          justifyContent: 'center', 
                          alignItems: 'center',
                          pointerEvents: allowCameraTrigger ? 'auto' : 'none',
                          opacity: allowCameraTrigger ? 1 : 0.6,
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
                      {!aiPhotoNoticeAccepted && renderAiPhotoNotice(true)}
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
                          <div className="macro-box-val-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <input
                              type="number"
                              className="macro-box-input"
                              value={scannedCalories}
                              onChange={(e) => setScannedCalories(e.target.value)}
                              style={{ color: 'var(--color-calories)' }}
                              min="0"
                              step="1"
                            />
                          </div>
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

                      <QuickPortionButtons
                        baseWeight={scanResult.weight || editedWeight}
                        name={scanResult.name}
                        currentWeight={editedWeight}
                        preferredWeight={getRememberedFoodPortion(scanResult)}
                        onSelect={handleScanWeightChange}
                      />

                      <div className="detail-row">
                        <span className="detail-label">Інгредієнти:</span>
                        <span className="detail-value">{scanResult.ingredients || "Не визначено"}</span>
                      </div>

                      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={addScannedMealToDiary}>
                            <Check size={18} />
                            Зберегти
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
                          Скасувати
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

                      <QuickPortionButtons
                        baseWeight={barcodeResult.weight || 100}
                        name={barcodeResult.name}
                        currentWeight={barcodeEditedWeight}
                        preferredWeight={getRememberedFoodPortion(barcodeResult)}
                        onSelect={handleBarcodeWeightChange}
                      />

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
                              selectSearchFood(food);
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
                                {shouldShowBrandPrefix(food, false) ? `${food.brand} • ` : ''}{food.calories} ккал
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
                  {['Усі', 'Моя база', 'Часті', 'Супермаркети', 'Страви', 'Обрані', 'Сніданок', 'Обід', 'Вечеря', 'Перекуси'].map(filter => (
                    <button
                      key={filter}
                      className={`filter-chip ${selectedCategoryFilter === filter ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>

                {/* Сортування */}
                <div className="search-sort-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-dark-muted)' }}>
                  <span>Сортувати за:</span>
                  <select 
                    value={foodSortOption} 
                    onChange={(e) => setFoodSortOption(e.target.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '6px',
                      color: 'var(--text-dark)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="rank" style={{ background: '#1e1e24', color: '#fff' }}>Релевантністю</option>
                    <option value="caloriesAsc" style={{ background: '#1e1e24', color: '#fff' }}>Калоріями (зростання)</option>
                    <option value="caloriesDesc" style={{ background: '#1e1e24', color: '#fff' }}>Калоріями (спадання)</option>
                    <option value="protein" style={{ background: '#1e1e24', color: '#fff' }}>Білками</option>
                    <option value="name" style={{ background: '#1e1e24', color: '#fff' }}>Назвою (А-Я)</option>
                  </select>
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
                      {filteredSearchFoods.map(food => {
                        const borderCol = food.supermarket ? getSupermarketColor(food.supermarket) : undefined;
                        const badgeClass = food.supermarket ? getSupermarketClass(food.supermarket) : '';

                        return (
                          <div
                            key={food.id}
                            className="search-food-item"
                            style={borderCol ? { borderLeft: `4px solid ${borderCol}` } : undefined}
                            onClick={() => {
                              selectSearchFood(food);
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
                                {shouldShowBrandPrefix(food, !!food.supermarket) ? `${food.brand} • ` : ''}{food.calories} ккал / {food.weight}г
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
                            {getFoodUsageCount(food) > 0 && (
                              <span className="search-brand-badge search-usage-badge">
                                {getFoodUsageCount(food)}x
                              </span>
                            )}
                            {food.supermarket ? (
                              <span className={`search-brand-badge ${badgeClass}`}>{food.supermarket}</span>
                            ) : food.brand ? (
                              <span className="search-brand-badge">{food.brand}</span>
                            ) : null}
                          </div>
                        );
                      })}

                      {/* AI Supermarket Results */}
                      {filteredAiSearchFoods.map(food => {
                        const borderCol = getSupermarketColor(food.supermarket);
                        const badgeClass = getSupermarketClass(food.supermarket);

                        return (
                          <div
                            key={food.id}
                            className="search-food-item"
                            style={{ borderLeft: `4px solid ${borderCol}` }}
                            onClick={() => {
                              openCustomFoodForm({
                                name: food.name,
                                weight: food.weight || '100',
                                notice: food.warning || 'Підказка ШІ може бути приблизною. Введіть КБЖВ з етикетки або перевіреного джерела перед збереженням.'
                              });
                            }}
                          >
                            <span style={{ fontSize: '24px', marginRight: '8px' }}>{food.icon || '🔮'}</span>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                              <span style={{ fontWeight: 600, fontSize: '14px', color: theme === 'light' ? 'var(--text-light-primary)' : 'var(--text-dark-primary)' }}>
                                {food.name}
                              </span>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                {shouldShowBrandPrefix(food, true) ? `${food.brand} • ` : ''}ШІ-підказка назви, КБЖВ внесіть вручну
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
                              {shouldShowBrandPrefix(food, true) ? `${food.brand} • ` : ''}Зовнішня база: КБЖВ підтвердіть з етикетки
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

                          <QuickPortionButtons
                            baseWeight={selectedSearchFood.weight || 100}
                            name={selectedSearchFood.name}
                            currentWeight={searchFoodWeight}
                            preferredWeight={getRememberedFoodPortion(selectedSearchFood)}
                            onSelect={setSearchFoodWeight}
                          />

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
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    stopCamera();
                    setIsBarcodeLiveScannerOpen(true);
                  }}
                  style={{ width: '100%', margin: 0, borderRadius: '14px' }}
                >
                  <QrCode size={18} />
                  Сканувати без ШІ
                </button>

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
                      const hasMeals = calendarMealIndicators.has(cell.dateString);
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
                  const catMeals = currentDayMealsByCategory[cat.name] || [];
                  const catCals = currentDayCategoryTotals[cat.name]?.calories || 0;
                  
                  return (
                    <div key={cat.name} className="meal-category-card">
                      <div className="category-header">
                        <div className="category-title">
                          <span>{cat.icon}</span>
                          <span>{cat.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                          {catCals > 0 && <span className="category-total-cals">{catCals} ккал</span>}
                          
                          <button 
                            className="category-copy-btn" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveCopyMenu(activeCopyMenu?.category === cat.name && activeCopyMenu?.tab === 'diary' ? null : { category: cat.name, tab: 'diary' });
                            }}
                            title={`Копіювати ${cat.name} з іншого дня`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'rgba(255, 255, 255, 0.4)',
                              cursor: 'pointer',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Copy size={14} />
                          </button>

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

                          {activeCopyMenu?.category === cat.name && activeCopyMenu?.tab === 'diary' && (
                            <div className="copy-dropdown-menu" style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              zIndex: 100,
                              background: '#1f1f24',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '8px',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                              padding: '6px',
                              minWidth: '160px',
                              marginTop: '4px'
                            }}>
                              <div style={{ padding: '4px 8px', fontSize: '10px', color: 'var(--text-dark-muted)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '4px' }}>
                                КОПІЮВАТИ З:
                              </div>
                              {(() => {
                                const recentDates = getRecentDatesForCategory(cat.name);
                                if (recentDates.length === 0) {
                                  return <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--text-dark-muted)' }}>Немає історії страв</div>;
                                }
                                return recentDates.map(dString => {
                                  const dateObj = new Date(dString);
                                  const formattedDate = dateObj.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
                                  
                                  const today = new Date();
                                  const yesterday = new Date(today);
                                  yesterday.setDate(yesterday.getDate() - 1);
                                  const yesterdayStr = yesterday.toISOString().split('T')[0];
                                  
                                  let label = formattedDate;
                                  if (dString === yesterdayStr) {
                                    label = `Вчора (${formattedDate})`;
                                  } else {
                                    const twoDaysAgo = new Date(today);
                                    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                                    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];
                                    if (dString === twoDaysAgoStr) {
                                      label = `Позавчора (${formattedDate})`;
                                    }
                                  }

                                  return (
                                    <button
                                      key={dString}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyCategoryMeals(cat.name, dString);
                                        setActiveCopyMenu(null);
                                      }}
                                      style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '6px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                        display: 'block',
                                        transition: 'background 0.2s'
                                      }}
                                      className="copy-dropdown-item"
                                    >
                                      {label}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                          )}
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
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', whiteSpace: 'nowrap' }}>
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
                                className="meal-repeat-btn"
                                onClick={() => repeatMeal(meal)}
                                title="Додати ще раз"
                                aria-label={`Додати "${meal.name}" ще раз`}
                              >
                                <Plus size={16} />
                              </button>
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

            {/* Блок «Вага» (Журнал ваги) */}
            <div className="glass-card" style={{ marginTop: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Scale size={18} style={{ color: 'var(--color-accent)' }} />
                Журнал ваги
              </h3>
              
              <div className="settings-group">
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <span className="settings-label" style={{ display: 'block', marginBottom: '8px' }}>
                      Поточна вага для запису (кг):
                    </span>
                    <input 
                      type="number"
                      step="0.1"
                      className="settings-input"
                      style={{ width: '100%' }}
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder="напр. 70.5"
                    />
                  </div>
                  <button 
                    className="btn-primary"
                    style={{ 
                      height: '42px', 
                      padding: '0 20px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '8px',
                      borderRadius: '12px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                    onClick={handleRecordWeight}
                  >
                    <Check size={18} />
                    Записати на сьогодні
                  </button>
                </div>
                
                {todayWeight && (
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '8px 12px', 
                    background: 'rgba(16, 185, 129, 0.1)', 
                    border: '1px solid rgba(16, 185, 129, 0.2)', 
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#34d399',
                    display: 'inline-block'
                  }}>
                    Сьогодні вже записано: <strong>{todayWeight} кг</strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. SETTINGS TAB */}
        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* ANALYTICS TAB */}
        {/* ========================================================================= */}
        {activeTab === 'analytics' && (
          <div>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={20} style={{ color: 'var(--color-accent)' }} />
              Аналітика за 7 днів
            </h2>

            <div className="glass-card analytics-chart-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Калорії по днях</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-dark-muted)' }}>Ціль: {profile.targetCalories} ккал</span>
              </div>
              <div className="analytics-bars-container">
                {weeklyAnalytics.map((day, i) => {
                  const maxVal = Math.max(...weeklyAnalytics.map(d => Math.max(d.calories, profile.targetCalories)));
                  const barHeight = day.calories > 0 ? Math.max((day.calories / maxVal) * 100, 4) : 0;
                  const isOver = day.calories > profile.targetCalories;
                  return (
                    <div key={i} className={`analytics-bar-col ${day.isToday ? 'today' : ''}`}>
                      <div className="analytics-bar-val">{day.calories > 0 ? day.calories : ''}</div>
                      <div className="analytics-bar-track">
                        <div className="analytics-goal-line" style={{ bottom: `${Math.min((profile.targetCalories / maxVal) * 100, 100)}%` }} />
                        <div className={`analytics-bar-fill ${isOver ? 'over-goal' : ''}`} style={{ height: `${barHeight}%` }} />
                      </div>
                      <div className="analytics-bar-label">{day.label}</div>
                      <div className="analytics-bar-day">{day.dayNum}</div>
                    </div>
                  );
                })}
              </div>
              <div className="analytics-legend">
                <span className="legend-item"><span className="legend-dot" style={{ background: 'var(--color-accent)' }}></span>Калорії</span>
                <span className="legend-item"><span className="legend-line"></span>Ціль</span>
                <span className="legend-item"><span className="legend-dot" style={{ background: '#f87171' }}></span>Перевищення</span>
              </div>
            </div>

            <div className="glass-card" style={{ marginTop: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Середні показники за тиждень</h3>
              {(() => {
                const avgCals = weeklyAverages.calories;
                const avgProtein = weeklyAverages.protein;
                const avgWater = weeklyAverages.water;
                const loggedDays = weeklyAverages.loggedDays;
                return (
                  <div className="analytics-stats-grid">
                    <div className="analytics-stat-card">
                      <div className="analytics-stat-val" style={{ color: 'var(--color-calories)' }}>{avgCals}</div>
                      <div className="analytics-stat-label">ккал/день</div>
                      <div className="analytics-stat-sub">{avgCals > 0 ? `${Math.round((avgCals/profile.targetCalories)*100)}% від цілі` : '–'}</div>
                    </div>
                    <div className="analytics-stat-card">
                      <div className="analytics-stat-val" style={{ color: 'var(--color-protein)' }}>{avgProtein}г</div>
                      <div className="analytics-stat-label">білки/день</div>
                      <div className="analytics-stat-sub">{avgProtein > 0 ? `${Math.round((avgProtein/profile.targetProtein)*100)}% від цілі` : '–'}</div>
                    </div>
                    <div className="analytics-stat-card">
                      <div className="analytics-stat-val" style={{ color: '#3b82f6' }}>{avgWater}</div>
                      <div className="analytics-stat-label">мл води/день</div>
                      <div className="analytics-stat-sub">{avgWater > 0 ? `${Math.round((avgWater/(profile.targetWater||2000))*100)}% від цілі` : '–'}</div>
                    </div>
                    <div className="analytics-stat-card">
                      <div className="analytics-stat-val" style={{ color: '#f59e0b' }}>{loggedDays}/7</div>
                      <div className="analytics-stat-label">днів у щоденнику</div>
                      <div className="analytics-stat-sub">{loggedDays === 7 ? '🔥 Ідеально!' : loggedDays >= 5 ? '👍 Добре!' : 'Продовжуй!'}</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="glass-card" style={{ marginTop: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Виконання цілі по днях</h3>
              <div className="heatmap-container">
                {weeklyAnalytics.map((day, i) => (
                  <div key={i} className="heatmap-day" onClick={() => { setSelectedDate(day.dateStr); setActiveTab('dashboard'); }}>
                    <div
                      className="heatmap-cell"
                      style={{
                        background: day.calories === 0
                          ? 'rgba(255,255,255,0.04)'
                          : day.goalPercent >= 90 && day.goalPercent <= 110
                          ? 'rgba(16,185,129,0.7)'
                          : day.goalPercent > 110
                          ? 'rgba(239,68,68,0.6)'
                          : `rgba(16,185,129,${day.goalPercent / 100 * 0.6 + 0.1})`,
                        border: day.isToday ? '2px solid var(--color-accent)' : '2px solid transparent'
                      }}
                      title={`${day.goalPercent}% від цілі (${day.calories} ккал)`}
                    >
                      {day.goalPercent > 0 && <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{day.goalPercent}%</span>}
                    </div>
                    <div className="heatmap-label">{day.label}</div>
                    <div className="heatmap-day-num">{day.dayNum}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-dark-muted)' }}>
                <span>🟩 90–110% = В нормі</span>
                <span>🟥 &gt;110% = Перевищення</span>
                <span>🟦 &lt;90% = Недобір</span>
              </div>
            </div>

            {/* Блок «Графік ваги» */}
            <div className="glass-card" style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} style={{ color: 'var(--color-accent)' }} />
                  Динаміка ваги за останні 30 днів
                </h3>
              </div>
              
              {(() => {
                const loggedPoints = weightAnalytics.filter(day => day.weight !== null);
                const pointsCount = loggedPoints.length;
                
                if (pointsCount === 0) {
                  return (
                    <div style={{ 
                      padding: '40px 20px', 
                      textAlign: 'center', 
                      color: 'var(--text-dark-muted)', 
                      fontSize: '13px' 
                    }}>
                      Записи ваги відсутні. Додайте вагу на вкладці <strong>Профіль</strong>, щоб почати відстеження.
                    </div>
                  );
                }
                
                const weights = loggedPoints.map(p => p.weight);
                let minW = Math.min(...weights);
                let maxW = Math.max(...weights);
                
                if (minW === maxW) {
                  minW -= 2;
                  maxW += 2;
                } else {
                  const margin = (maxW - minW) * 0.15 || 1;
                  minW -= margin;
                  maxW += margin;
                }
                
                // SVG dimensions: width 500, height 220
                // Padding: left 45, right 20, top 25, bottom 40
                const svgW = 500;
                const svgH = 220;
                const padL = 45;
                const padR = 20;
                const padT = 25;
                const padB = 40;
                
                const chartW = svgW - padL - padR;
                const chartH = svgH - padT - padB;
                
                const getX = (idx) => padL + (idx * chartW / 29);
                const getY = (w) => svgH - padB - ((w - minW) / (maxW - minW) * chartH);
                
                // Generate points string for polyline
                const polylinePoints = loggedPoints.map(p => {
                  const dayIdx = weightAnalytics.findIndex(day => day.dateStr === p.dateStr);
                  return `${getX(dayIdx)},${getY(p.weight)}`;
                }).join(' ');
                
                // Linear regression line coords
                let trendLineElement = null;
                if (weightTrend.hasTrend) {
                  const x1 = 0;
                  const y1 = weightTrend.slope * x1 + weightTrend.intercept;
                  const x2 = 29;
                  const y2 = weightTrend.slope * x2 + weightTrend.intercept;
                  
                  trendLineElement = (
                    <line 
                      x1={getX(x1)} 
                      y1={getY(y1)} 
                      x2={getX(x2)} 
                      y2={getY(y2)} 
                      stroke="#f59e0b" 
                      strokeWidth="2" 
                      strokeDasharray="4,4" 
                      opacity="0.8" 
                    />
                  );
                }
                
                // Grid lines (3 horizontal lines)
                const gridVals = [
                  maxW,
                  (minW + maxW) / 2,
                  minW
                ];
                
                return (
                  <div>
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <svg 
                        viewBox={`0 0 ${svgW} ${svgH}`} 
                        style={{ 
                          width: '100%', 
                          minWidth: '400px', 
                          height: 'auto', 
                          display: 'block' 
                        }}
                      >
                        {/* Grid lines & values */}
                        {gridVals.map((val, idx) => {
                          const y = getY(val);
                          return (
                            <g key={idx}>
                              <line 
                                x1={padL} 
                                y1={y} 
                                x2={svgW - padR} 
                                y2={y} 
                                stroke="rgba(255, 255, 255, 0.08)" 
                                strokeDasharray="3,3" 
                              />
                              <text 
                                x={padL - 8} 
                                y={y + 4} 
                                textAnchor="end" 
                                fill="rgba(255, 255, 255, 0.4)" 
                                fontSize="9"
                              >
                                {val.toFixed(1)} кг
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* Trend line */}
                        {trendLineElement}
                        
                        {/* Weight Polyline */}
                        {polylinePoints && (
                          <polyline 
                            points={polylinePoints} 
                            fill="none" 
                            stroke="var(--color-accent)" 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                          />
                        )}
                        
                        {/* Weight Data Points (dots and values) */}
                        {loggedPoints.map((p, idx) => {
                          const dayIdx = weightAnalytics.findIndex(day => day.dateStr === p.dateStr);
                          const cx = getX(dayIdx);
                          const cy = getY(p.weight);
                          return (
                            <g key={idx}>
                              <circle 
                                cx={cx} 
                                cy={cy} 
                                r="5" 
                                fill="var(--color-accent)" 
                                stroke="rgba(255,255,255,0.9)" 
                                strokeWidth="1.5" 
                              />
                              <text 
                                x={cx} 
                                y={cy - 10} 
                                textAnchor="middle" 
                                fill="#fff" 
                                fontSize="9" 
                                fontWeight="600"
                                style={{
                                  textShadow: '0 1px 3px rgba(0,0,0,0.8)'
                                }}
                              >
                                {p.weight}
                              </text>
                            </g>
                          );
                        })}
                        
                        {/* Day labels at the bottom */}
                        {weightAnalytics.map((day, idx) => {
                          if (idx % 6 !== 0 && idx !== 29) return null;
                          const cx = getX(idx);
                          return (
                            <text 
                              key={idx} 
                              x={cx} 
                              y={svgH - 15} 
                              textAnchor="middle" 
                              fill="rgba(255, 255, 255, 0.4)" 
                              fontSize="9"
                            >
                              {day.label}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                    
                    {/* Weight Insight */}
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px', 
                      marginTop: '14px', 
                      padding: '10px 14px', 
                      background: 'rgba(255,255,255,0.03)', 
                      borderRadius: '12px', 
                      border: '1px solid rgba(255,255,255,0.06)' 
                    }}>
                      <span style={{ fontSize: '16px' }}>📉</span>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-dark)' }}>
                        {weightTrend.hasTrend ? (
                          <>
                            Тижневий тренд: <strong style={{ color: weightTrend.slope * 7 <= 0 ? '#10b981' : '#f59e0b' }}>
                              {weightTrend.slope * 7 > 0 ? '+' : ''}{(weightTrend.slope * 7).toFixed(1)} кг/тиж
                            </strong> при <strong style={{ color: 'var(--color-calories)' }}>~{thirtyDayCaloriesAvg} ккал/день</strong> за останні 30 днів.
                          </>
                        ) : (
                          "Потрібно щонайменше 2 записи ваги за 30 днів для розрахунку тренду."
                        )}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h2 className="section-title">Налаштування додатку</h2>

            {/* Interface Settings Card */}
            <div className="glass-card">
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Інтерфейс
              </h3>
              <div className="settings-group">
                <label className="settings-row" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="settings-label" style={{ marginBottom: 0 }}>Показувати трекер води</span>
                  <input
                    type="checkbox"
                    checked={showWaterTracker}
                    onChange={(e) => setShowWaterTracker(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                  />
                </label>
              </div>
            </div>

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
                        {GEMINI_MODEL_OPTIONS.map(model => (
                          <option key={model.value} value={model.value}>{model.label}</option>
                        ))}
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
                                safeSetItem('nutrisnap_scanmode', 'mock');
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
                        <option value="gpt-4o">GPT-4o (Точніше)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Швидше)</option>
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
                                safeSetItem('nutrisnap_scanmode', 'mock');
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
                  onClick={() => exportProductsToFile([...customFoods, ...Object.values(customBarcodes)])}
                >
                  <Download size={16} />
                  Експортувати базу продуктів
                </button>

                <label className="database-action-btn">
                  <Upload size={16} />
                  Імпортувати базу продуктів
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={importSharedProductDatabase}
                    style={{ display: 'none' }}
                  />
                </label>

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
                <p style={{ fontSize: '12px', color: 'var(--text-dark-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                  API-ключі Gemini/OpenAI та OpenAI proxy URL не входять у резервну копію. Після відновлення введіть їх повторно у налаштуваннях ШІ.
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
              <p>NutriSnap v1.5.6 (Typography Polish)</p>
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
            className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            <BarChart2 size={22} />
            <span>Аналітика</span>
          </button>
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

              {customFoodNotice && (
                <div className="manual-food-notice">
                  <AlertCircle size={16} />
                  <span>{customFoodNotice}</span>
                </div>
              )}

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
            {toast.actionLabel && (
              <button
                type="button"
                className="toast-action-btn"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
