const AI_PERFORMANCE_PREFIX = '[NutriSnap AI]';

export function isAiPerformanceLoggingEnabled() {
  return Boolean(import.meta.env?.DEV);
}

export function getAiPerformanceNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

export function roundDurationMs(durationMs) {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.round(durationMs * 10) / 10;
}

export function getBase64PayloadSizeKb(value = '') {
  if (typeof value !== 'string' || !value) return 0;

  const commaIndex = value.indexOf(',');
  const base64 = commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  if (!base64) return 0;

  const paddingLength = base64.match(/=+$/)?.[0]?.length || 0;
  const byteLength = Math.max(0, (base64.length * 3) / 4 - paddingLength);
  return Math.round(byteLength / 1024);
}

export function logAiPerformance(label, startTime, details = {}) {
  if (!isAiPerformanceLoggingEnabled()) return;

  const durationMs = roundDurationMs(getAiPerformanceNow() - startTime);
  console.info(`${AI_PERFORMANCE_PREFIX} ${label}`, {
    durationMs,
    ...details
  });
}

export function logAiPayload(label, details = {}) {
  if (!isAiPerformanceLoggingEnabled()) return;
  console.info(`${AI_PERFORMANCE_PREFIX} ${label}`, details);
}