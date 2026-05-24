# Product Import

Use this importer to add a larger local product catalog without editing the app code.

## CSV format

Create a UTF-8 CSV file with these columns. Ukrainian column names are also supported.

```csv
name,brand,supermarket,category,calories,protein,fat,carbs,fiber,weight,barcode,aliases,ingredients,icon
Молоко 2.5%,Своя Лінія,АТБ,Сніданок,52,2.8,2.5,4.7,,100,,молоко;атб;своя лінія,,🥛
Яблуко Голден,Свіжі фрукти,,Перекус,57,0.4,0.2,12.7,2.4,100,,яблуко;golden;голден,,🍎
```

Supported aliases for columns:

- `name`, `назва`, `продукт`
- `brand`, `бренд`, `виробник`
- `supermarket`, `магазин`, `мережа`, `супермаркет`
- `category`, `категорія`
- `calories`, `kcal`, `ккал`, `калорії`
- `protein`, `білки`
- `fat`, `жири`
- `carbs`, `вуглеводи`
- `fiber`, `клітковина`, `волокна`
- `weight`, `вага`, `порція`
- `barcode`, `штрихкод`, `штрих-код`
- `aliases`, `синоніми`, `аліаси`
- `ingredients`, `склад`, `інгредієнти`
- `icon`, `emoji`

## Import

```bash
npm run import:products -- ./products.csv
```

The command writes `src/data/products/importedProducts.js`. Commit that generated file after checking the app.

## JSON format

You can also pass a JSON array of product objects with the same fields.

