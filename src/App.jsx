import React, { useState, useEffect, useRef } from 'react';
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
  Star
} from 'lucide-react';
import { mockFoods } from './data/mockFood';
import { analyzeFoodImage, detectBarcodeFromImage } from './services/geminiService';
import { getProductByBarcode } from './services/openFoodFactsService';

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
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  
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
      if (stored && stored.trim() === 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4') {
        return '';
      }
      return stored ? stored.trim() : '';
    } catch (e) {
      return '';
    }
  });
  const [scanMode, setScanMode] = useState(() => {
    try {
      const storedMode = localStorage.getItem('nutrisnap_scanmode');
      if (storedMode === 'gemini') {
        // If they have the leaked key, fallback to mock by default for first experience
        const storedKey = localStorage.getItem('nutrisnap_apikey');
        if (!storedKey || storedKey.trim() === 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4') {
          return 'mock';
        }
      }
      return storedMode || 'mock';
    } catch (e) {
      return 'mock';
    }
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    try {
      return localStorage.getItem('nutrisnap_geminimodel') || 'gemini-2.5-flash';
    } catch (e) {
      return 'gemini-2.5-flash';
    }
  });

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
          image: selectedDemoFood?.image || ''
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

  // Автоматична чистка недійсного/витоку ключа та налаштування режиму сканування
  useEffect(() => {
    try {
      const currentApiKey = localStorage.getItem('nutrisnap_apikey');
      const LEAKED_KEY = 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4';
      if (currentApiKey && currentApiKey.trim() === LEAKED_KEY) {
        localStorage.removeItem('nutrisnap_apikey');
        setApiKey('');
      } else if (!currentApiKey) {
        setApiKey('');
      }
      
      const currentScanMode = localStorage.getItem('nutrisnap_scanmode');
      if (!currentScanMode) {
        localStorage.setItem('nutrisnap_scanmode', 'mock');
        setScanMode('mock');
      } else if (currentScanMode === 'gemini') {
        // If it was gemini but key is missing/leaked, switch to mock automatically
        if (!currentApiKey || currentApiKey.trim() === LEAKED_KEY) {
          localStorage.setItem('nutrisnap_scanmode', 'mock');
          setScanMode('mock');
        }
      }
    } catch (e) {
      console.error("Error auto-configuring API key:", e);
    }
  }, []);
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
  const [selectedDemoFood, setSelectedDemoFood] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);

  // Ghost click protection state
  const [allowCameraTrigger, setAllowCameraTrigger] = useState(false);

  // Barcode Lookup states
  const [scannerMode, setScannerMode] = useState('camera'); // 'camera' або 'barcode'
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState(null);
  const [barcodeEditedWeight, setBarcodeEditedWeight] = useState(100);
  const [barcodeScannedProtein, setBarcodeScannedProtein] = useState(0);
  const [barcodeScannedFat, setBarcodeScannedFat] = useState(0);
  const [barcodeScannedCarbs, setBarcodeScannedCarbs] = useState(0);
  const [barcodeScannedCalories, setBarcodeScannedCalories] = useState(0);
  const [barcodeError, setBarcodeError] = useState(null);
  const [isBarcodeScanning, setIsBarcodeScanning] = useState(false);

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
    localStorage.setItem('nutrisnap_apikey', apiKey.trim());
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_scanmode', scanMode);
  }, [scanMode]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_geminimodel', geminiModel);
  }, [geminiModel]);

  useEffect(() => {
    localStorage.setItem('nutrisnap_theme', theme);
    const bodyClass = document.body.classList;
    if (theme === 'light') {
      bodyClass.add('light-mode');
    } else {
      bodyClass.remove('light-mode');
    }
  }, [theme]);

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

  // Керування камерою при перемиканні вкладок
  useEffect(() => {
    if (activeTab !== 'scanner') {
      stopCamera();
      // Очищуємо результати пошуку штрих-кодів, якщо виходимо зі сканера повністю
      setScanResult(null);
      setSelectedDemoFood(null);
      setBarcodeResult(null);
      setBarcodeError(null);
      setBarcodeInput('');
    } else {
      startCamera();
    }
    return () => stopCamera();
  }, [activeTab]);

  // --- Camera Operations ---
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        "Ваш браузер не підтримує доступ до камери або з'єднання незахищене (потрібен HTTPS). Скористайтеся завантаженням фотографії."
      );
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

  // Запуск аналізу
  const triggerScan = async (imageDataBase64) => {
    setIsScanning(true);
    setScanResult(null);
    setScannedMealCategory(preselectedCategory || getDefaultCategory());
    try {
      if (scanMode === 'gemini') {
        const LEAKED_KEY = 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4';
        if (!apiKey || apiKey.trim() === '' || apiKey.trim() === LEAKED_KEY) {
          throw new Error("Вбудований демо-ключ деактивовано компанією Google з міркувань безпеки. Будь ласка, введіть власний безкоштовний Gemini API-ключ у налаштуваннях профілю.");
        }
        // Запит до реального Gemini API
        const result = await analyzeFoodImage(imageDataBase64, apiKey.trim(), geminiModel);
        setScanResult(result);
        setEditedWeight(Number(result.weight) || 200);
        setScannedProtein(Number(result.protein) || 0);
        setScannedFat(Number(result.fat) || 0);
        setScannedCarbs(Number(result.carbs) || 0);
        setScannedCalories(Number(result.calories) || 0);
      } else {
        // Демо-режим (симуляція аналізу 1.5 сек)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        let selectedFood = selectedDemoFood;
        // Якщо страву не вибрано вручну, беремо рандомну з бази
        if (!selectedFood) {
          const randomIndex = Math.floor(Math.random() * mockFoods.length);
          selectedFood = mockFoods[randomIndex];
        }
        
        const mockResult = {
          name: selectedFood.name,
          calories: selectedFood.calories,
          protein: selectedFood.protein,
          fat: selectedFood.fat,
          carbs: selectedFood.carbs,
          weight: selectedFood.weight,
          confidence: selectedFood.confidence,
          ingredients: selectedFood.ingredients
        };
        setScanResult(mockResult);
        setEditedWeight(Number(mockResult.weight) || 200);
        setScannedProtein(Number(mockResult.protein) || 0);
        setScannedFat(Number(mockResult.fat) || 0);
        setScannedCarbs(Number(mockResult.carbs) || 0);
        setScannedCalories(Number(mockResult.calories) || 0);
      }
    } catch (err) {
      console.error(err);
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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const base64Data = canvas.toDataURL('image/jpeg');
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

    const mealTimeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const category = scannedMealCategory;

    const baselineWeight = Number(scanResult.weight) || 200;
    const finalWeight = Number(editedWeight) || baselineWeight;

    const finalCalories = Number(scannedCalories) || 0;
    const finalProtein = Number(scannedProtein) || 0;
    const finalFat = Number(scannedFat) || 0;
    const finalCarbs = Number(scannedCarbs) || 0;

    const newMeal = {
      id: Date.now().toString(),
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
      time: mealTimeStr,
      date: selectedDate,
      icon: getEmojiForCategory(category)
    };

    setMeals(prev => [newMeal, ...prev]);
    setPreselectedCategory(null);
    
    showToast(`Страву "${scanResult.name}" додано до щоденника!`, "success");
    
    setScanResult(null);
    setSelectedDemoFood(null);
    setActiveTab('dashboard');
  };

  // Запуск аналізу штрих-коду ШІ
  const triggerBarcodeScan = async (imageDataBase64) => {
    setIsBarcodeScanning(true);
    setBarcodeError(null);
    setBarcodeResult(null);
    setBarcodeMealCategory(preselectedCategory || getDefaultCategory());
    try {
      let barcodeVal = null;
      if (scanMode === 'gemini') {
        const LEAKED_KEY = 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4';
        if (!apiKey || apiKey.trim() === '' || apiKey.trim() === LEAKED_KEY) {
          throw new Error("Вбудований демо-ключ деактивовано компанією Google з міркувань безпеки. Будь ласка, введіть власний безкоштовний Gemini API-ключ у налаштуваннях профілю.");
        }
        barcodeVal = await detectBarcodeFromImage(imageDataBase64, apiKey.trim(), geminiModel);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockBarcodes = ["8000500023976", "5449000000996", "5900311000361"];
        barcodeVal = mockBarcodes[Math.floor(Math.random() * mockBarcodes.length)];
      }

      if (!barcodeVal) {
        throw new Error("Не вдалося розпізнати штрих-код на фото. Спробуйте інший ракурс або введіть його вручну.");
      }

      setBarcodeInput(barcodeVal);
      
      setBarcodeLoading(true);
      const product = await getProductByBarcode(barcodeVal);
      setBarcodeResult(product);
      const w = product.weight || 100;
      setBarcodeEditedWeight(w);
      const scale = w / 100;
      setBarcodeScannedProtein(Math.round((product.protein || 0) * scale * 10) / 10);
      setBarcodeScannedFat(Math.round((product.fat || 0) * scale * 10) / 10);
      setBarcodeScannedCarbs(Math.round((product.carbs || 0) * scale * 10) / 10);
      setBarcodeScannedCalories(Math.round((product.calories || 0) * scale));
    } catch (err) {
      console.error(err);
      setBarcodeError(err.message || "Помилка при зчитуванні штрих-коду.");
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
    
    const base64Data = canvas.toDataURL('image/jpeg');
    triggerBarcodeScan(base64Data);
  };

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
    setBarcodeMealCategory(preselectedCategory || getDefaultCategory());
    
    try {
      const product = await getProductByBarcode(barcodeInput);
      setBarcodeResult(product);
      const w = product.weight || 100;
      setBarcodeEditedWeight(w);
      const scale = w / 100;
      setBarcodeScannedProtein(Math.round((product.protein || 0) * scale * 10) / 10);
      setBarcodeScannedFat(Math.round((product.fat || 0) * scale * 10) / 10);
      setBarcodeScannedCarbs(Math.round((product.carbs || 0) * scale * 10) / 10);
      setBarcodeScannedCalories(Math.round((product.calories || 0) * scale));
    } catch (err) {
      console.error("Barcode lookup error:", err);
      setBarcodeError(err.message || "Не вдалося знайти продукт.");
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
    
    setBarcodeScannedCalories(Math.round(pVal * 4 + fVal * 9 + cVal * 4));
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

    const mealTimeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const category = barcodeMealCategory;

    const baselineWeight = 100;
    const finalWeight = Number(barcodeEditedWeight) || 100;

    const finalCalories = Number(barcodeScannedCalories) || 0;
    const finalProtein = Number(barcodeScannedProtein) || 0;
    const finalFat = Number(barcodeScannedFat) || 0;
    const finalCarbs = Number(barcodeScannedCarbs) || 0;

    const newMeal = {
      id: Date.now().toString(),
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
      time: mealTimeStr,
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
      [selectedDate]: (prev[selectedDate] || 0) + amount
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
        apiKey,
        scanMode,
        geminiModel,
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
        if (importedData.apiKey !== undefined) {
          setApiKey(importedData.apiKey);
        }
        if (importedData.scanMode !== undefined) {
          setScanMode(importedData.scanMode);
        }
        if (importedData.geminiModel !== undefined) {
          setGeminiModel(importedData.geminiModel);
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
        <div className="brand">
          <span className="brand-logo">NutriSnap</span>
          {scanMode === 'gemini' && (
            <span style={{ 
              fontSize: '10px', 
              background: 'rgba(99, 102, 241, 0.15)', 
              color: '#818cf8', 
              padding: '2px 6px', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              fontWeight: 600
            }}>
              <Sparkles size={10} /> ШІ Gemini
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
                  <svg className="circular-progress-svg">
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
                      <span className="macro-bar-value">{totals.protein}г / {profile.targetProtein}г</span>
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
                      <span className="macro-bar-value">{totals.fat}г / {profile.targetFat}г</span>
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
                      <span className="macro-bar-value">{totals.carbs}г / {profile.targetCarbs}г</span>
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
                        width="28" 
                        height="28" 
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
                            const mealTimeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                            const newMeal = {
                              id: Date.now().toString(),
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
                              time: mealTimeStr,
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
                              setActiveTab('scanner');
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
                          <span 
                            className="category-quick-add-link"
                            onClick={() => {
                              setPreselectedCategory(cat.name);
                              setActiveTab('scanner');
                            }}
                          >
                            + Додати
                          </span>
                        </div>
                      ) : (
                        <div className="category-meals-list">
                          {catMeals.map(meal => (
                            <div key={meal.id} className="timeline-item">
                              <div className="meal-info">
                                <div className="meal-text">
                                  <span className="meal-name" style={{ fontSize: '14px', fontWeight: 600 }}>{meal.name}</span>
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                    <span>{meal.time} •</span>
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
                                <span className="meal-macros" style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', marginTop: '3px' }}>
                                  <span>Б:</span>
                                  <input 
                                    type="number"
                                    value={meal.protein}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'protein', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г Ж:</span>
                                  <input 
                                    type="number"
                                    value={meal.fat}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'fat', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г В:</span>
                                  <input 
                                    type="number"
                                    value={meal.carbs}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'carbs', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г</span>
                                </span>
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
          <div className="camera-view-container">
            {/* Top Bar on camera view */}
            <div className="app-header" style={{ position: 'absolute', top: 0, left: 0, width: '100%', background: 'rgba(0,0,0,0.6)', border: 'none', flexDirection: 'column', gap: '8px', padding: 'calc(12px + env(safe-area-inset-top, 0px)) 20px 12px', zIndex: 60 }}>
              <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  onClick={() => {
                    stopCamera();
                    setActiveTab('dashboard');
                  }}
                  className="btn-secondary"
                  style={{ width: 'auto', margin: 0, padding: '8px 16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', border: 'none' }}
                >
                  Назад
                </button>
                <div style={{ color: 'white', fontWeight: 600, fontSize: '16px' }}>
                  Сканування їжі
                </div>
                <div style={{ width: '60px' }}></div> {/* Spacer */}
              </div>

              {/* Режими сканування */}
              <div className="scanner-sub-tabs">
                <button 
                  className={`scanner-sub-tab ${scannerMode === 'camera' ? 'active' : ''}`}
                  onClick={() => setScannerMode('camera')}
                >
                  <Camera size={14} />
                  <span>Фото ШІ</span>
                </button>
                <button 
                  className={`scanner-sub-tab ${scannerMode === 'barcode' ? 'active' : ''}`}
                  onClick={() => setScannerMode('barcode')}
                >
                  <QrCode size={14} />
                  <span>Штрих-код</span>
                </button>
              </div>
            </div>

            {/* Shared Camera Preview Wrapper */}
            <div className="camera-preview-wrapper" style={{ paddingTop: 'calc(120px + env(safe-area-inset-top, 0px))' }}>
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
                    <div className="camera-placeholder" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-calories)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)', marginLeft: 'auto', marginRight: 'auto' }}>
                        <Camera size={40} style={{ display: 'block', margin: 'auto' }} />
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
                        NutriSnap Фотосканер
                      </h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', marginBottom: '24px', lineHeight: '1.6' }}>
                        Сфотогравуйте страву на камеру телефону або оберіть зображення з галереї для миттєвого розрахунку калорій та КБЖВ.
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
                            cameraFileInputRef.current?.click();
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
                        <span>Сфотогравувати їжу</span>
                      </button>
                      <input 
                        ref={cameraFileInputRef}
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        style={{ display: 'none' }} 
                        onChange={handleFileUpload} 
                      />
                      
                      {scanMode === 'mock' && (
                        <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-dark-secondary)', background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border-dark)' }}>
                          💡 Режим симуляції. Виберіть страву зі списку внизу та натисніть зелену кнопку вище для тесту!
                        </div>
                      )}
                    </div>
                  )}

                  {cameraActive && !isScanning && !scanResult && (
                    <div className="scanner-overlay">
                      <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '12px', fontSize: '12px', color: 'white', pointerEvents: 'auto' }}>
                        Наведіть камеру на страву
                      </div>
                      
                      <div className="scanner-box">
                        <div className="scanner-box-inner">
                          <div className="scanner-laser"></div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'center', pointerEvents: 'auto' }}>
                        {scanMode === 'mock' && (
                          <div className="demo-scanner-hint">
                            💡 Режим Симуляції. Виберіть страву нижче, потім натисніть білу кнопку знімка для імітації сканування.
                          </div>
                        )}
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
                      <div className="results-header" style={{ marginBottom: '8px' }}>
                        <div>
                          <span className="match-badge">
                            Точність розпізнавання: {scanResult.confidence}%
                          </span>
                          <h2 className="dish-title">{scanResult.name}</h2>
                        </div>
                        <span style={{ fontSize: '28px' }}>🥗</span>
                      </div>

                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: 'rgba(16, 185, 129, 0.1)', 
                        border: '1px solid rgba(16, 185, 129, 0.2)', 
                        borderRadius: '8px', 
                        padding: '4px 10px', 
                        fontSize: '12px', 
                        color: '#34d399', 
                        marginBottom: '16px',
                        fontWeight: 500
                      }}>
                        📅 Запис у щоденник за: <strong style={{ marginLeft: '4px' }}>{formatDateLabel(selectedDate)}</strong>
                      </div>

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
                          <span style={{ fontSize: '11px', opacity: 0.6 }}>(ориг. {baselineWeight}г)</span>
                        </div>
                      </div>

                      {scanResult.ingredients && (
                        <div className="detail-row">
                          <span className="detail-label">Склад страви:</span>
                          <span className="detail-value" style={{ fontStyle: 'italic', fontSize: '12px' }}>
                            {scanResult.ingredients}
                          </span>
                        </div>
                      )}

                      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="btn-primary" style={{ flex: 1 }} onClick={addScannedMealToDiary}>
                            <Check size={18} />
                            Додати до щоденника
                          </button>
                          <button 
                            className={`btn-favorite-toggle ${isFavorite(scanResult?.name) ? 'active' : ''}`}
                            onClick={toggleFavoriteScanned}
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
                            setSelectedDemoFood(null);
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
                    <div className="camera-placeholder" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', textAlign: 'center' }}>
                      <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-calories)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.15)', marginLeft: 'auto', marginRight: 'auto' }}>
                        <QrCode size={40} style={{ display: 'block', margin: 'auto' }} />
                      </div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '800', marginBottom: '8px', color: '#f8fafc' }}>
                        NutriSnap Сканер штрих-кодів
                      </h3>
                      <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '280px', marginBottom: '24px', lineHeight: '1.6' }}>
                        Сфотогравуйте штрих-код продукту або завантажте його з галереї для автоматичного розпізнавання продукту.
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
                            barcodeFileInputRef.current?.click();
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
                        <span>Сфотогравувати штрих-код</span>
                      </button>
                      <input 
                        ref={barcodeFileInputRef}
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        style={{ display: 'none' }} 
                        onChange={handleBarcodeFileUpload} 
                      />

                      {/* Manual input fallback when camera is not active */}
                      <div className="barcode-search-card" style={{ width: '100%', maxWidth: '340px', marginTop: '20px' }}>
                        <form onSubmit={handleBarcodeSearch} className="barcode-input-wrapper" style={{ margin: 0 }}>
                          <input 
                            type="tel"
                            className="barcode-input"
                            placeholder="Штрих-код (EAN) вручну"
                            value={barcodeInput}
                            onChange={(e) => setBarcodeInput(e.target.value.replace(/\D/g, ''))}
                            maxLength={15}
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
                    </div>
                  )}

                  {cameraActive && !isBarcodeScanning && !barcodeLoading && !barcodeResult && (
                    <div className="scanner-overlay">
                      <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '12px', fontSize: '12px', color: 'white', pointerEvents: 'auto' }}>
                        Наведіть камеру на штрих-код продукту
                      </div>
                      
                      <div className="barcode-scanner-box">
                        <div className="barcode-scanner-box-inner">
                          <div className="barcode-laser"></div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignSelf: 'center', pointerEvents: 'auto' }}>
                        {scanMode === 'mock' && (
                          <div className="demo-scanner-hint">
                            💡 Режим Симуляції. Натисніть червону кнопку затвора внизу для імітації розпізнавання.
                          </div>
                        )}
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
                      <p style={{ fontSize: '13px', color: '#94a3b8', width: '80%', textAlign: 'center' }}>
                        {isBarcodeScanning ? "Визначаємо цифри штрих-коду за допомогою Gemini OCR" : "Отримуємо харчову цінність з бази Open Food Facts"}
                      </p>
                    </div>
                  )}

                  {barcodeResult && (
                    <div className="scan-result-card" style={{ zIndex: 100 }}>
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
                          </div>
                        </div>
                      </div>

                      <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: 'rgba(59, 130, 246, 0.1)', 
                        border: '1px solid rgba(59, 130, 246, 0.2)', 
                        borderRadius: '8px', 
                        padding: '4px 10px', 
                        fontSize: '12px', 
                        color: '#60a5fa', 
                        marginBottom: '16px',
                        fontWeight: 500
                      }}>
                        📅 Запис у щоденник за: <strong style={{ marginLeft: '4px' }}>{formatDateLabel(selectedDate)}</strong>
                      </div>

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
                        <span className="detail-label">Вага порції (грам):</span>
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
                </>
              )}
            </div>

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

            {/* Quick Food Selector for Simulation Mode */}
            {scannerMode === 'camera' && scanMode === 'mock' && cameraActive && !scanResult && !isScanning && (
              <div style={{ background: '#090d16', padding: '16px 12px calc(16px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border-dark)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-dark-secondary)', fontWeight: 600, margin: 0 }}>
                    Оберіть страву для симуляції сканування:
                  </p>
                  {selectedDemoFood && (
                    <span style={{ fontSize: '11px', color: 'var(--color-calories)', fontWeight: 500 }}>
                      Обрано: {selectedDemoFood.name}
                    </span>
                  )}
                </div>
                
                <div className="demo-food-tray">
                  {mockFoods.map(food => {
                    const isSelected = selectedDemoFood?.id === food.id;
                    return (
                      <div 
                        key={food.id} 
                        className={`demo-food-card ${isSelected ? 'active' : ''}`}
                        onClick={() => setSelectedDemoFood(food)}
                        style={{
                          backgroundImage: `linear-gradient(to top, rgba(9, 13, 22, 0.95) 0%, rgba(9, 13, 22, 0.4) 60%, rgba(9, 13, 22, 0.1) 100%), url(${food.image})`
                        }}
                      >
                        <div className="demo-food-card-icon">{food.icon}</div>
                        
                        <div className="demo-food-card-content">
                          <h4 className="demo-food-card-title">{food.name}</h4>
                          <div className="demo-food-card-nutrients">
                            <span className="demo-food-kcal">{food.calories} ккал</span>
                            <span className="demo-food-macros">
                              Б:{food.protein}г • Ж:{food.fat}г • В:{food.carbs}г
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
                              setActiveTab('scanner');
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
                          <span 
                            className="category-quick-add-link"
                            onClick={() => {
                              setPreselectedCategory(cat.name);
                              setActiveTab('scanner');
                            }}
                          >
                            + Додати
                          </span>
                        </div>
                      ) : (
                        <div className="category-meals-list">
                          {catMeals.map(meal => (
                            <div key={meal.id} className="timeline-item">
                              <div className="meal-info">
                                <div className="meal-text">
                                  <span className="meal-name" style={{ fontSize: '14px', fontWeight: 600 }}>{meal.name}</span>
                                  <span className="meal-meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                    <span>{meal.time} •</span>
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
                                <span className="meal-macros" style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'wrap', marginTop: '3px' }}>
                                  <span>Б:</span>
                                  <input 
                                    type="number"
                                    value={meal.protein}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'protein', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г Ж:</span>
                                  <input 
                                    type="number"
                                    value={meal.fat}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'fat', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г В:</span>
                                  <input 
                                    type="number"
                                    value={meal.carbs}
                                    onChange={(e) => handleUpdateMealMacro(meal.id, 'carbs', e.target.value)}
                                    className="meal-macro-inline-input"
                                    min="0"
                                    step="0.1"
                                  />
                                  <span>г</span>
                                </span>
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
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                      />
                      <span className="settings-info-text">
                        Ваш API-ключ зберігається локально на вашому пристрої у безпечному сховищі браузера та надсилається лише напряму до Google API.
                      </span>
                      {(!apiKey || apiKey.trim() === '' || apiKey.trim() === 'AIzaSyCzENcpXKN36SmWqGyOkep8H4FZhzREMV4') && (
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
                          <strong>⚠️ Увага:</strong> Вбудований демо-ключ деактивовано компанією Google з міркувань безпеки. Для роботи ШІ-сканера, будь ласка, отримайте свій власний безкоштовний ключ на <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#f87171', textDecoration: 'underline', fontWeight: 600 }}>Google AI Studio</a> та введіть його вище.
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
              <p>NutriSnap v1.1.0 (Оновлено: Safe Area + Top Toasts)</p>
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
          >
            <Settings size={22} />
            <span>Налаштування</span>
          </button>
        </nav>
      )}
      {/* Toast Notification Container */}
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
