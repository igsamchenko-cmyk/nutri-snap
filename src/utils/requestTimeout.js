export const AI_PHOTO_REQUEST_TIMEOUT_MS = 60000;
export const AI_PHOTO_REQUEST_TIMEOUT_MESSAGE = 'AI-аналіз триває занадто довго. Спробуйте ще раз або зробіть менше/чіткіше фото.';

export function createRequestTimeoutError(message = AI_PHOTO_REQUEST_TIMEOUT_MESSAGE) {
  const error = new Error(message);
  error.name = 'AbortError';
  error.code = 'AI_REQUEST_TIMEOUT';
  return error;
}

export function isAbortError(error) {
  return error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR'
    || error?.code === 'AI_REQUEST_TIMEOUT';
}

export function normalizeAbortError(error, message = AI_PHOTO_REQUEST_TIMEOUT_MESSAGE) {
  if (!isAbortError(error)) return error;
  return createRequestTimeoutError(message);
}

export function createRequestTimeout(timeoutMs, message = AI_PHOTO_REQUEST_TIMEOUT_MESSAGE) {
  const safeTimeoutMs = Number(timeoutMs);
  if (!Number.isFinite(safeTimeoutMs) || safeTimeoutMs <= 0) {
    return {
      signal: undefined,
      clear: () => {},
      throwIfAborted: () => {}
    };
  }

  const controller = new AbortController();
  let timeoutId = setTimeout(() => {
    controller.abort(createRequestTimeoutError(message));
  }, safeTimeoutMs);

  return {
    signal: controller.signal,
    clear: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
    throwIfAborted: () => {
      if (controller.signal.aborted) {
        throw normalizeAbortError(controller.signal.reason, message);
      }
    }
  };
}

function createCombinedAbortSignal(signals) {
  const activeSignals = signals.filter(Boolean);
  if (activeSignals.length <= 1) {
    return {
      signal: activeSignals[0],
      clear: () => {}
    };
  }


  const controller = new AbortController();
  const cleanup = activeSignals.map(signal => {
    const onAbort = () => {
      if (!controller.signal.aborted) {
        controller.abort(signal.reason);
      }
    };

    if (signal.aborted) {
      onAbort();
      return () => {};
    }

    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  });

  return {
    signal: controller.signal,
    clear: () => cleanup.forEach(clear => clear())
  };
}

export function sleepWithAbort(ms, signal, message = AI_PHOTO_REQUEST_TIMEOUT_MESSAGE) {
  if (!signal) return new Promise(resolve => setTimeout(resolve, ms));

  if (signal.aborted) {
    return Promise.reject(normalizeAbortError(signal.reason, message));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeoutId);
      reject(normalizeAbortError(signal.reason, message));
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchWithAbortTimeout(resource, options = {}, timeoutOptions = {}) {
  const timeout = createRequestTimeout(timeoutOptions.timeoutMs, timeoutOptions.timeoutMessage);
  const combinedSignal = createCombinedAbortSignal([options.signal, timeout.signal]);

  try {
    const fetchOptions = combinedSignal.signal
      ? { ...options, signal: combinedSignal.signal }
      : { ...options };
    return await fetch(resource, fetchOptions);
  } catch (error) {
    if (timeout.signal?.aborted && isAbortError(error)) {
      throw normalizeAbortError(timeout.signal.reason || error, timeoutOptions.timeoutMessage);
    }
    throw error;
  } finally {
    combinedSignal.clear();
    timeout.clear();
  }
}
