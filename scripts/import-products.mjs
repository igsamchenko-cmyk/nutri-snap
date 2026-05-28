import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const OUTPUT_FILE = resolve("src/data/products/importedProducts.js");

const FIELD_ALIASES = {
  id: ["id", "code", "sku"],
  barcode: ["barcode", "bar_code", "штрихкод", "штрих-код"],
  name: ["name", "title", "назва", "продукт"],
  brand: ["brand", "бренд", "виробник", "торгова марка"],
  supermarket: ["supermarket", "store", "stores", "магазин", "мережа", "супермаркет"],
  category: ["category", "категорія", "тип"],
  calories: ["calories", "kcal", "energy", "енергія", "ккал", "калорії"],
  protein: ["protein", "proteins", "білки", "белки"],
  fat: ["fat", "fats", "жири", "жиры"],
  carbs: ["carbs", "carbohydrates", "вуглеводи", "углеводы"],
  fiber: ["fiber", "fibre", "клітковина", "волокна"],
  weight: ["weight", "portion", "вага", "порція"],
  icon: ["icon", "emoji"],
  aliases: ["aliases", "synonyms", "синоніми", "аліаси"],
  ingredients: ["ingredients", "склад", "інгредієнти"]
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function csvParse(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some(value => value.trim() !== "")) rows.push(row);
  return rows;
}

function getField(row, field) {
  const aliases = FIELD_ALIASES[field] || [field];
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function toNumber(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const num = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(num) ? num : fallback;
}

function toAliases(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return String(value)
    .split(/[;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function slug(value) {
  return String(value || "product")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeProduct(row, index) {
  const name = String(getField(row, "name")).trim();
  if (!name) return null;

  const brand = String(getField(row, "brand") || "").trim();
  const supermarket = String(getField(row, "supermarket") || "").trim();
  const category = String(getField(row, "category") || "Інше").trim();
  const barcode = String(getField(row, "barcode") || "").trim();
  const aliases = toAliases(getField(row, "aliases"));
  const id = String(getField(row, "id") || barcode || `import-${slug(`${brand}-${name}`)}-${index + 1}`).trim();

  const product = {
    id,
    barcode,
    name,
    brand,
    supermarket,
    category,
    calories: Math.round(toNumber(getField(row, "calories"))),
    protein: toNumber(getField(row, "protein")),
    fat: toNumber(getField(row, "fat")),
    carbs: toNumber(getField(row, "carbs")),
    fiber: toNumber(getField(row, "fiber"), undefined),
    weight: Math.round(toNumber(getField(row, "weight"), 100)) || 100,
    icon: String(getField(row, "icon") || "🥗").trim(),
    aliases,
    ingredients: String(getField(row, "ingredients") || "").trim(),
    confidence: 95,
    source: "ua-import",
    sourceLabel: "Імпорт UA"
  };

  product.searchText = [
    product.name,
    product.brand,
    product.supermarket,
    product.category,
    product.barcode,
    product.aliases.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();

  return Object.fromEntries(
    Object.entries(product).filter(([, value]) => value !== "" && value !== undefined)
  );
}

function rowsFromCsv(text) {
  const [headers, ...rows] = csvParse(text);
  if (!headers || headers.length === 0) return [];

  const normalizedHeaders = headers.map(normalizeHeader);
  return rows.map(values => {
    const row = {};
    normalizedHeaders.forEach((header, index) => {
      row[header] = String(values[index] || "").trim();
    });
    return row;
  });
}

function rowsFromJson(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("JSON import must be an array of product objects.");
  }

  return data.map(item => {
    const row = {};
    for (const [key, value] of Object.entries(item)) {
      row[normalizeHeader(key)] = Array.isArray(value) ? value.join(";") : String(value ?? "");
    }
    return row;
  });
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npm run import:products -- path/to/products.csv");
    process.exit(1);
  }

  const inputPath = resolve(input);
  const text = await readFile(inputPath, "utf8");
  const ext = extname(inputPath).toLowerCase();
  const rows = ext === ".json" ? rowsFromJson(text) : rowsFromCsv(text);
  const products = rows.map(normalizeProduct).filter(Boolean);

  const output = `// This file is generated by \`npm run import:products -- <file.csv|file.json>\`.
// Keep manual seed products in ukrainianProductSeeds.js and put bulk imports here.
export const importedProducts = ${JSON.stringify(products, null, 2)};
`;

  await writeFile(OUTPUT_FILE, output, "utf8");
  console.log(`Imported ${products.length} products into ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

