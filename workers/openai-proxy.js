const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/openai/responses') {
      return jsonResponse({ error: { message: 'Not found' } }, 404);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({ error: { message: 'OPENAI_API_KEY is not configured' } }, 500);
    }

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
        ...CORS_HEADERS,
        'Content-Type': openAiResponse.headers.get('content-type') || 'application/json'
      }
    });
  }
};

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}
