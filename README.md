# NutriSnap

NutriSnap is a mobile-first React/Vite app for tracking meals, water intake, calories, and macros. It supports food photo analysis through Gemini, barcode lookup through Open Food Facts, a local food database, custom foods, favorites, PWA install support, and local backup/restore.

## Product data

NutriSnap searches packaged foods through Open Food Facts and stores selected results locally on the user's device. Open Food Facts data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Product cards keep their source metadata, and users should verify nutrition values against the product label.

The built-in catalogue passes through one quality pipeline before it reaches search. The pipeline normalizes names and aliases, identifies raw, dry, cooked, prepared, and frozen foods, removes duplicate name-brand-state or barcode entries, and rejects impossible per-100g nutrition values. Default portion weight remains separate from nutrition values per 100 g.

Bulk CSV or JSON files can be added with:

```bash
npm run import:products -- path/to/products.csv
```

Imported rows may include Ukrainian or English column names. At minimum, provide a product name plus calories, protein, fat, and carbohydrates per 100 g. Use `aliases` or `синоніми`, separated by semicolons, to make regional names and common spelling variants searchable.

Validate the complete built-in catalogue after an import:

```bash
npm run check:products
```

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
