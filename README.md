# NutriSnap

NutriSnap is a mobile-first React/Vite app for tracking meals, water intake, calories, and macros. It supports food photo analysis through Gemini, barcode lookup through Open Food Facts, a local food database, custom foods, favorites, PWA install support, and local backup/restore.

## Setup

Install dependencies:

```bash
npm ci
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Check lint rules:

```bash
npm run lint
```

## GitHub Pages

The app is configured to deploy automatically to GitHub Pages from the `main` branch through GitHub Actions.

After GitHub Pages is enabled for this repository, the app will be available at:

```text
https://igsamchenko-cmyk.github.io/nutri-snap/
```

## Gemini API Key

For local development, put your Gemini key in `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

The development server proxies Gemini requests through `/api/gemini`, so the key stays outside the React source code and is not committed. `.env.local` is ignored by git.

GitHub Pages is static hosting and cannot keep runtime secrets. On GitHub Pages, users should enter their own Gemini key in the app settings, or the project should use a separate backend/serverless proxy.

Do not commit real API keys to this repository.
