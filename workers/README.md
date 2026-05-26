# OpenAI Proxy Worker

This Cloudflare Worker hides `OPENAI_API_KEY` from the browser while keeping NutriSnap on GitHub Pages.

1. Create a Cloudflare Worker.
2. Set Worker secret `OPENAI_API_KEY`.
3. Deploy `workers/openai-proxy.js`.
4. In NutriSnap settings, set OpenAI Proxy URL to:

```text
https://your-worker.workers.dev/api/openai/responses
```

When a proxy URL is configured, the browser does not need an OpenAI API key.
