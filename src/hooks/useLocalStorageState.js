import { useCallback, useEffect, useRef, useState } from 'react';
import { safeSetItem } from '../utils/storage';

export default function useLocalStorageState(key, defaultValue, options = {}) {
  const { raw = false } = options;

  const readStoredValue = useCallback((fallback) => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        return raw ? saved : JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error reading localStorage key "' + key + '":', error);
    }
    return typeof fallback === 'function' ? fallback() : fallback;
  }, [key, raw]);

  const [state, setInternalState] = useState(() => readStoredValue(defaultValue));
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const valueToStore = raw ? String(stateRef.current) : JSON.stringify(stateRef.current);
    safeSetItem(key, valueToStore);
  }, [key, raw]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.storageArea !== localStorage || event.key !== key || event.newValue === null) return;
      try {
        const nextValue = raw ? event.newValue : JSON.parse(event.newValue);
        stateRef.current = nextValue;
        setInternalState(nextValue);
      } catch (error) {
        console.error('Error syncing localStorage key "' + key + '":', error);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, raw]);

  const setState = useCallback((nextState) => {
    let latestState = stateRef.current;
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) latestState = raw ? saved : JSON.parse(saved);
    } catch (error) {
      console.error('Error reading latest localStorage key "' + key + '":', error);
    }

    const resolvedState = typeof nextState === 'function' ? nextState(latestState) : nextState;
    const valueToStore = raw ? String(resolvedState) : JSON.stringify(resolvedState);
    if (!safeSetItem(key, valueToStore)) return false;

    stateRef.current = resolvedState;
    setInternalState(resolvedState);
    return true;
  }, [key, raw]);

  return [state, setState];
}
