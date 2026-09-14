# NutriSnap

NutriSnap is a mobile-first React/Vite app for tracking meals, water intake, calories, and macros. It supports food photo analysis through Gemini, barcode lookup through Open Food Facts, a local food database, custom foods, favorites, PWA install support, and local backup/restore.

## Product data

NutriSnap searches packaged foods through Open Food Facts and stores selected results locally on the user's device. Open Food Facts data is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Product cards keep their source metadata, and users should verify nutrition values against the product label.

The repository also contains a compact Ukrainian Open Food Facts snapshot for local name and barcode search. It includes only records with a valid barcode, a product name, complete plausible per-100 g nutrition, and no Open Food Facts quality errors. The default refresh combines products tagged as sold in Ukraine with GS1 Ukraine barcode prefix 482, deduplicates them by barcode, and keeps up to 4,000 valid products when the source has enough complete records. It retains official taxonomy categories plus Ukrainian, Russian, English, Polish, and Romanian name variants when available. The importer uses the official Search-a-licious API with pages of up to 500 results, identifies itself with a User-Agent, throttles requests, refreshes every configured page, and saves a checkpoint after every page.

The app also ships a compact snapshot of generic foods and prepared dishes from [USDA FoodData Central](https://fdc.nal.usda.gov/). USDA data are public domain under [CC0 1.0](https://fdc.nal.usda.gov/data-documentation/), so using the local catalogue needs no API key and creates no per-search cost. The importer combines Foundation Foods, FNDDS 2021-2023, and SR Legacy, keeps only complete plausible per-100 g calories and macros, merges duplicate descriptions, and adds controlled Ukrainian display names and search aliases for common foods and preparation states. Search ranking promotes simple staple foods above desserts, mixed dishes, and derivative products with the same alias. The original USDA description remains visible under the localized name for precise verification.

The large OFF and USDA snapshots are emitted as separate lazy-loaded application chunks. The dashboard starts with the smaller curated catalogue; the extended snapshots load when the user opens the scanner or product search, then participate in local name matching and barcode lookup before any network fallback. Once requested, the service worker caches them for later offline use.

```bash
npm run update:off-ukraine
```

Refresh the USDA snapshot directly from the official downloadable datasets:

~~~bash
npm run update:usda
~~~

The USDA refresh temporarily needs up to 2 GB of Node.js heap while it extracts and validates the source archives. The generated application snapshot is compact and is the only USDA data file committed to the app.

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
