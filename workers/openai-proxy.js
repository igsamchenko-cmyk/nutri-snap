const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://igsamchenko-cmyk.github.io',
  'http://localhost:5180',
  'http://127.0.0.1:5180'
];

// Rate limit: MAX_REQUESTS per IP per WINDOW_SECONDS
const MAX_REQUESTS = 30;
const WINDOW_SECONDS = 3600; // 1 година

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: corsHeaders ? 204 : 403, headers: corsHeaders || {} });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/openai/health') {
      return jsonResponse({
        ok: true,
        proxy: 'nutrisnap-openai-proxy',
        openAiKeyConfigured: Boolean(env.OPENAI_API_KEY)
      }, 200, corsHeaders);
    }

    if (request.method !== 'POST' || url.pathname !== '/api/openai/responses') {
      return jsonResponse({ error: { message: 'Not found' } }, 404, corsHeaders);
    }

    if (!corsHeaders) {
      return jsonResponse({ error: { message: 'Origin is not allowed' } }, 403);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: { message: 'OPENAI_API_KEY is not configured' } }, 500, corsHeaders);
    }

    // ── Rate limiting via Workers Cache API ──────────────────────────────────
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const windowKey = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    const cacheKey = new Request(`https://rate-limit.internal/${windowKey}/${ip}`);

    let count = 0;
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      count = parseInt(await cached.text(), 10) || 0;
    }

    if (count >= MAX_REQUESTS) {
      const retryAfter = WINDOW_SECONDS - (Math.floor(Date.now() / 1000) % WINDOW_SECONDS);
      return jsonResponse(
        { error: { message: `Перевищено ліміт: ${MAX_REQUESTS} запитів/годину. Спробуйте через ${Math.ceil(retryAfter / 60)} хв.` } },
        429,
        { ...corsHeaders, 'Retry-After': String(retryAfter) }
      );
    }

    // Increment counter asynchronously (non-blocking)
    ctx.waitUntil(
      cache.put(cacheKey, new Response(String(count + 1), {
        headers: { 'Cache-Control': `max-age=${WINDOW_SECONDS}` }
      }))
    );
    // ────────────────────────────────────────────────────────────────────────

    try {
      const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: await request.text()
      });

      return new Response(await openAiResponse.text(), {
        status: openAiResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': openAiResponse.headers.get('content-type') || 'application/json'
        }
      });
    } catch {
      return jsonResponse({ error: { message: 'OpenAI proxy request failed' } }, 502, corsHeaders);
    }
  }
};

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (origin && !allowedOrigins.includes(origin)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin || allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function getAllowedOrigins(env) {
  const configuredOrigins = String(env.ALLOWED_ORIGIN || env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;
}

function jsonResponse(payload, status, corsHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...(corsHeaders || {}),
      'Content-Type': 'application/json'
    }
  });
}
