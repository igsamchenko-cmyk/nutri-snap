const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_ALLOWED_ORIGINS = [
  'https://igsamchenko-cmyk.github.io',
  'http://localhost:5180',
  'http://127.0.0.1:5180'
];

export default {
  async fetch(request, env) {
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

    if (!env.AI_RATE_LIMITER?.limit) {
      return jsonResponse(
        { error: { message: 'Rate limiter is not configured' } },
        503,
        corsHeaders
      );
    }

    const clientKey = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.AI_RATE_LIMITER.limit({ key: clientKey });
    if (!success) {
      return jsonResponse(
        { error: { message: 'Забагато AI-запитів. Спробуйте через хвилину.' } },
        429,
        { ...corsHeaders, 'Retry-After': '60' }
      );
    }

    try {
      const body = await request.text();
      if (body.length > 2_000_000) {
        return jsonResponse({ error: { message: 'Payload too large' } }, 413, corsHeaders);
      }

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        return jsonResponse({ error: { message: 'Invalid JSON' } }, 400, corsHeaders);
      }

      const ALLOWED_MODELS = ['gpt-4o', 'gpt-4o-mini'];
      if (!parsed.model || !ALLOWED_MODELS.includes(parsed.model)) {
        return jsonResponse({ error: { message: `Model ${parsed.model} is not allowed` } }, 400, corsHeaders);
      }

      const sanitizedBody = sanitizeOpenAIRequest(parsed);
      if (!sanitizedBody) {
        return jsonResponse({ error: { message: 'Request input or response schema is invalid' } }, 400, corsHeaders);
      }

      const openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sanitizedBody)
      });

      return new Response(await openAiResponse.text(), {
        status: openAiResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': openAiResponse.headers.get('content-type') || 'application/json'
        }
      });
    } catch (e) {
      console.error('OpenAI Proxy execution error:', e);
      return jsonResponse({ error: { message: 'OpenAI proxy request failed' } }, 502, corsHeaders);
    }
  }
};

function sanitizeOpenAIRequest(parsed) {
  if (!Array.isArray(parsed.input) || parsed.input.length < 1 || parsed.input.length > 10) return null;
  const safeInput = parsed.input.every(message => (
    message
    && message.role === 'user'
    && Array.isArray(message.content)
    && message.content.length > 0
    && message.content.length <= 10
    && message.content.every(content => {
      if (!content || typeof content !== 'object') return false;
      if (content.type === 'input_text') {
        return typeof content.text === 'string' && content.text.length <= 20_000;
      }
      if (content.type === 'input_image') {
        return typeof content.image_url === 'string'
          && /^data:image\/(?:jpeg|png|webp);base64,/i.test(content.image_url);
      }
      return false;
    })
  ));
  if (!safeInput) return null;

  const format = parsed.text?.format;
  if (
    !format
    || format.type !== 'json_schema'
    || typeof format.name !== 'string'
    || format.name.length > 100
    || format.strict !== true
    || !format.schema
    || typeof format.schema !== 'object'
    || Array.isArray(format.schema)
  ) {
    return null;
  }

  const requestedTokens = Number(parsed.max_output_tokens);
  const sanitized = {
    model: parsed.model,
    input: parsed.input,
    max_output_tokens: Number.isFinite(requestedTokens)
      ? Math.min(2000, Math.max(1, Math.round(requestedTokens)))
      : 1200,
    text: parsed.text
  };

  if (parsed.reasoning?.effort === 'low') sanitized.reasoning = { effort: 'low' };
  if (Number.isFinite(parsed.temperature)) {
    sanitized.temperature = Math.min(1, Math.max(0, parsed.temperature));
  }
  return sanitized;
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = getAllowedOrigins(env);

  if (request.method !== 'OPTIONS' && !origin) {
    return null;
  }

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
