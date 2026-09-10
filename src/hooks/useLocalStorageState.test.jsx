import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLocalStorageState from './useLocalStorageState';

class MockStorage {
  constructor() {
    this.store = {};
  }
  clear() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  get length() {
    return Object.keys(this.store).length;
  }
}

const mockLocalStorage = new MockStorage();
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

describe('useLocalStorageState hook', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should initialize with default value when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));
    expect(result.current[0]).toBe('default');
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('default'));
  });

  it('should initialize with value from localStorage if present', () => {
    localStorage.setItem('test-key', JSON.stringify('existing'));
    const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));
    expect(result.current[0]).toBe('existing');
  });

  it('should update localStorage when state changes', () => {
    const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));
    act(() => {
      result.current[1]('new-value');
    });
    expect(result.current[0]).toBe('new-value');
    expect(localStorage.getItem('test-key')).toBe(JSON.stringify('new-value'));
  });

  it('should support raw string mode without JSON encoding/decoding', () => {
    localStorage.setItem('raw-key', 'raw-value');
    const { result } = renderHook(() => useLocalStorageState('raw-key', 'default', { raw: true }));
    expect(result.current[0]).toBe('raw-value');

    act(() => {
      result.current[1]('new-raw-value');
    });
    expect(result.current[0]).toBe('new-raw-value');
    expect(localStorage.getItem('raw-key')).toBe('new-raw-value');
  });

  it('should keep the previous state when persistence fails', () => {
    const { result } = renderHook(() => useLocalStorageState('test-key', 'default'));
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    });

    act(() => {
      result.current[1]('lost-value');
    });

    expect(result.current[0]).toBe('default');
  });

  it('should merge functional updates with the latest value written by another tab', () => {
    const { result } = renderHook(() => useLocalStorageState('list-key', []));
    localStorage.setItem('list-key', JSON.stringify(['from-other-tab']));

    act(() => {
      result.current[1](items => [...items, 'local']);
    });

    expect(result.current[0]).toEqual(['from-other-tab', 'local']);
    expect(JSON.parse(localStorage.getItem('list-key'))).toEqual(['from-other-tab', 'local']);
  });
});
