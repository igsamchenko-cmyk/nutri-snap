// Безпечний запис у localStorage: не валить рендер при переповненні квоти,
// а сигналізує застосунку, щоб показати попередження користувачу.
export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.error(`localStorage setItem failed for "${key}":`, e);
    const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
    if (isQuota && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nutrisnap-storage-full', { detail: { key } }));
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nutrisnap-storage-error', { detail: { key } }));
    }
    return false;
  }
}

export function safeSetItemsAtomic(entries = []) {
  const previousValues = new Map();

  try {
    for (const [key, value] of entries) {
      if (!previousValues.has(key)) {
        previousValues.set(key, localStorage.getItem(key));
      }
      localStorage.setItem(key, String(value));
    }
    return true;
  } catch (error) {
    for (const [key, previousValue] of previousValues) {
      try {
        if (previousValue === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previousValue);
      } catch (rollbackError) {
        console.error('localStorage rollback failed for "' + key + '":', rollbackError);
      }
    }

    console.error('Atomic localStorage write failed:', error);
    const isQuota = error && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(
        isQuota ? 'nutrisnap-storage-full' : 'nutrisnap-storage-error',
        { detail: { keys: entries.map(([key]) => key) } }
      ));
    }
    return false;
  }
}

export function safeRemoveItem(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.error(`localStorage removeItem failed for "${key}":`, e);
  }
}
