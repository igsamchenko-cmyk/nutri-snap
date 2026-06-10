import { useState, useEffect } from 'react';
import { safeSetItem } from '../utils/storage';

export default function useLocalStorageState(key, defaultValue, options = {}) {
  const { raw = false } = options;

  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        if (raw) return saved;
        try {
          return JSON.parse(saved);
        } catch {
          // Fallback if JSON parsing fails on a raw string
          return saved;
        }
      }
    } catch (e) {
      console.error(`Error reading localStorage key "${key}":`, e);
    }
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  });

  useEffect(() => {
    const valueToStore = raw ? String(state) : JSON.stringify(state);
    safeSetItem(key, valueToStore);
  }, [key, state, raw]);

  return [state, setState];
}
