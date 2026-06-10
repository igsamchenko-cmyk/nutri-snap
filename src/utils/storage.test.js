import { describe, it, expect, vi, beforeEach } from 'vitest';
import { safeSetItem, safeRemoveItem } from './storage';

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

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
    configurable: true
  });
}

describe('Storage Utilities', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should save items to localStorage successfully', () => {
    const success = safeSetItem('test-key', 'test-value');
    expect(success).toBe(true);
    expect(localStorage.getItem('test-key')).toBe('test-value');
  });

  it('should remove items from localStorage successfully', () => {
    localStorage.setItem('test-key', 'test-value');
    safeRemoveItem('test-key');
    expect(localStorage.getItem('test-key')).toBeNull();
  });

  it('should dispatch custom event and return false when QuotaExceededError is thrown', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    });

    const eventSpy = vi.fn();
    window.addEventListener('nutrisnap-storage-full', eventSpy);

    const success = safeSetItem('overflow-key', 'some-value');

    expect(success).toBe(false);
    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0][0].detail).toEqual({ key: 'overflow-key' });

    window.removeEventListener('nutrisnap-storage-full', eventSpy);
  });
});
