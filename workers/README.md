# OpenAI Proxy Worker

This Cloudflare Worker hides `OPENAI_API_KEY` from the browser while NutriSnap stays hosted on GitHub Pages.

## One-time setup

1. Install project dependencies:

```bash
npm install
```

2. Log in to Cloudflare:

```bash
npm run worker:login
```

You can verify the login with:

```bash
npm run worker:whoami
```

3. Set the OpenAI secret:
```bash
npm run worker:secret:openai
```

4. Deploy the Worker:

```bash
npm run worker:deploy
```

5. In NutriSnap settings, set OpenAI Proxy URL to:

```text
https://nutrisnap-openai-proxy.<your-cloudflare-subdomain>.workers.dev/api/openai/responses
```

When a proxy URL is configured, the browser does not need an OpenAI API key.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, set `OPENAI_API_KEY`, then run:

```bash
npm run worker:dev
```

The health check endpoint is:

```text
https://nutrisnap-openai-proxy.<your-cloudflare-subdomain>.workers.dev/api/openai/health
```

## Security

`ALLOWED_ORIGIN` is configured in `wrangler.toml` for the production GitHub Pages origin:

```text
https://igsamchenko-cmyk.github.io
```

For multiple origins, set `ALLOWED_ORIGIN` or `ALLOWED_ORIGINS` as a comma-separated list.
