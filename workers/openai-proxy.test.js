import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './openai-proxy.js';

const origin = 'https://igsamchenko-cmyk.github.io';

function createRequest(body) {
  return new Request('https://proxy.example.com/api/openai/responses', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.10'
    },
    body: JSON.stringify(body)
  });
}

function createBody(overrides = {}) {
  return {
    model: 'gpt-4o-mini',
    input: [{
      role: 'user',
      content: [{ type: 'input_text', text: 'Return JSON' }]
    }],
    max_output_tokens: 1200,
    text: {
      format: {
        type: 'json_schema',
        name: 'result',
        strict: true,
        schema: { type: 'object', properties: {}, additionalProperties: false }
      }
    },
    ...overrides
  };
}

function createEnv(success = true) {
  return {
    OPENAI_API_KEY: 'secret',
    AI_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success })
    },
    ALLOWED_ORIGIN: origin
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenAI proxy', () => {
  it('forwards only supported fields and clamps output tokens', async () => {
    const env = createEnv();
    const upstreamFetch = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await worker.fetch(createRequest(createBody({
      max_output_tokens: 999999,
      tools: [{ type: 'web_search' }],
      store: true
    })), env);

    expect(response.status).toBe(200);
    const forwarded = JSON.parse(upstreamFetch.mock.calls[0][1].body);
    expect(forwarded.max_output_tokens).toBe(2000);
    expect(forwarded).not.toHaveProperty('tools');
    expect(forwarded).not.toHaveProperty('store');
    expect(env.AI_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '203.0.113.10' });
  });

  it('returns 429 without contacting OpenAI when the rate limit is exceeded', async () => {
    const env = createEnv(false);
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await worker.fetch(createRequest(createBody()), env);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(env.AI_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '203.0.113.10' });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the rate limiter binding is missing', async () => {
    const env = createEnv();
    delete env.AI_RATE_LIMITER;
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);

    const response = await worker.fetch(createRequest(createBody()), env);

    expect(response.status).toBe(503);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects remote image URLs', async () => {
    const env = createEnv();
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);
    const body = createBody({
      input: [{
        role: 'user',
        content: [{ type: 'input_image', image_url: 'https://example.com/image.jpg' }]
      }]
    });

    const response = await worker.fetch(createRequest(body), env);

    expect(response.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it('rejects requests from an unapproved origin', async () => {
    const request = createRequest(createBody());
    request.headers.set('Origin', 'https://attacker.example.com');
    const upstreamFetch = vi.fn();
    vi.stubGlobal('fetch', upstreamFetch);

    const env = createEnv();
    const response = await worker.fetch(request, env);

    expect(response.status).toBe(403);
    expect(env.AI_RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
