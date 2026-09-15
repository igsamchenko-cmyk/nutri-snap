// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map();
const stores = new Map();

function requestKey(request) {
  return typeof request === 'string'
    ? new URL(request, globalThis.self?.location?.origin || 'https://example.com').href
    : request.url;
}

const cacheStorage = {
  open: vi.fn(async name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      put: async (request, response) => entries.set(requestKey(request), response),
      match: async request => entries.get(requestKey(request))
    };
  }),
  keys: vi.fn(async () => [...stores.keys()]),
  delete: vi.fn(async name => stores.delete(name))
};

beforeAll(async () => {
  vi.stubGlobal('caches', cacheStorage);
  vi.stubGlobal('self', {
    location: { origin: 'https://example.com' },
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type, handler) => handlers.set(type, handler)
  });
  await import('../public/sw.js');
});

beforeEach(() => {
  stores.clear();
  vi.clearAllMocks();
});

describe('NutriSnap service worker', () => {
  it('discovers hashed build assets while precaching the shell', async () => {
    vi.stubGlobal('fetch', vi.fn(async resource => {
      const url = requestKey(resource);
      if (url.endsWith('/index.html')) {
        return new Response('<script src="/nutri-snap/assets/index-abc.js"></script>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        });
      }
      return new Response('asset', { status: 200 });
    }));

    let installPromise;
    handlers.get('install')({ waitUntil: promise => { installPromise = promise; } });
    await installPromise;

    const appCache = stores.get('nutrisnap-cache-v78');
    expect(appCache.has('https://example.com/nutri-snap/assets/index-abc.js')).toBe(true);
  });

  it('deletes only old NutriSnap caches during activation', async () => {
    stores.set('nutrisnap-cache-v76', new Map());
    stores.set('nutrisnap-cache-v77', new Map());
    stores.set('nutrisnap-cache-v78', new Map());
    stores.set('another-app-cache', new Map());

    let activatePromise;
    handlers.get('activate')({ waitUntil: promise => { activatePromise = promise; } });
    await activatePromise;

    expect(stores.has('nutrisnap-cache-v76')).toBe(false);
    expect(stores.has('nutrisnap-cache-v77')).toBe(false);
    expect(stores.has('nutrisnap-cache-v78')).toBe(true);
    expect(stores.has('another-app-cache')).toBe(true);
  });

  it('uses the cached shell when navigation returns a server error', async () => {
    const cache = await cacheStorage.open('nutrisnap-cache-v78');
    await cache.put(
      'https://example.com/nutri-snap/index.html',
      new Response('offline shell', { status: 200 })
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })));

    let responsePromise;
    handlers.get('fetch')({
      request: new Request('https://example.com/nutri-snap/', { method: 'GET' }),
      respondWith: promise => { responsePromise = promise; }
    });
    const response = await responsePromise;

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('offline shell');
  });
});
