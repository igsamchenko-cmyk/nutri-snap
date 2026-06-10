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
