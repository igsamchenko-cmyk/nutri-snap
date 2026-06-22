import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRequestTimeout,
  fetchWithAbortTimeout,
  isAbortError,
  sleepWithAbort
} from './requestTimeout.js';

describe('request timeout utilities', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts after the configured timeout', async () => {
    vi.useFakeTimers();
    const timeout = createRequestTimeout(100, 'Request timed out');
    const aborted = new Promise(resolve => {
      timeout.signal.addEventListener('abort', () => resolve(timeout.signal.reason));
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(aborted).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Request timed out'
    });
    expect(isAbortError(timeout.signal.reason)).toBe(true);
    timeout.clear();
  });

  it('cleans up the timer when cleared before timeout', async () => {
    vi.useFakeTimers();
    const timeout = createRequestTimeout(100, 'Request timed out');

    timeout.clear();
    await vi.advanceTimersByTimeAsync(150);

    expect(timeout.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves fetch before timeout and clears the timer', async () => {
    vi.useFakeTimers();
    const response = { ok: true };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));

    await expect(fetchWithAbortTimeout('/ok', {}, { timeoutMs: 100 })).resolves.toBe(response);

    expect(fetch).toHaveBeenCalledWith('/ok', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not mutate original fetch options', async () => {
    vi.useFakeTimers();
    const response = { ok: true };
    const controller = new AbortController();
    const headers = { 'Content-Type': 'application/json' };
    const options = { method: 'POST', headers, signal: controller.signal };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)));

    await expect(fetchWithAbortTimeout('/ok', options, { timeoutMs: 100 })).resolves.toBe(response);

    expect(options).toEqual({ method: 'POST', headers, signal: controller.signal });
    expect(fetch).toHaveBeenCalledWith('/ok', expect.objectContaining({
      method: 'POST',
      headers,
      signal: expect.any(AbortSignal)
    }));
    expect(fetch.mock.calls[0][1]).not.toBe(options);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('respects an existing abort signal', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const options = { signal: controller.signal };
    vi.stubGlobal('fetch', vi.fn((resource, fetchOptions) => new Promise((resolve, reject) => {
      fetchOptions.signal.addEventListener('abort', () => {
        reject(fetchOptions.signal.reason || new DOMException('Aborted', 'AbortError'));
      });
    })));

    const request = fetchWithAbortTimeout('/abort', options, { timeoutMs: 1000 });
    const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(new DOMException('User cancelled', 'AbortError'));

    await assertion;
    expect(options.signal).toBe(controller.signal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects fetch with a friendly AbortError on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((resource, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    })));

    const request = fetchWithAbortTimeout('/slow', {}, {
      timeoutMs: 100,
      timeoutMessage: 'AI request timed out'
    });
    const assertion = expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: 'AI request timed out'
    });

    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts sleep when the signal is aborted', async () => {
    vi.useFakeTimers();
    const timeout = createRequestTimeout(50, 'Sleep timed out');
    const pendingSleep = sleepWithAbort(500, timeout.signal, 'Sleep timed out');
    const assertion = expect(pendingSleep).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Sleep timed out'
    });

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    timeout.clear();
  });
});