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

## Gemini API Key

For local development, put your Gemini key in `.env.local`:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

The development server proxies Gemini requests through `/api/gemini`, so the key stays outside the React source code and is not committed. `.env.local` is ignored by git.

Users can still enter their own key in the app settings if they do not use the local proxy.

Do not commit real API keys to this repository.
