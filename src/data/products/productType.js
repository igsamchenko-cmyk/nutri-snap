export const PRODUCT_TYPES = [
  'Молочне',
  'М’ясо та птиця',
  'Риба та морепродукти',
  'Напої',
  'Крупи та макарони',
  'Хліб і випічка',
  'Овочі та фрукти',
  'Яйця',
  'Бобові',
  'Олії та жири',
  'Спортивне харчування',
  'Солодощі',
  'Снеки',
  'Соуси',
  'Готові страви',
  'Інше'
];

export const ALL_PRODUCT_TYPES = 'Усі категорії';

const VALID_PRODUCT_TYPES = new Set(PRODUCT_TYPES);

const normalizeProductTypeText = (value = '') => String(value)
  .normalize('NFKC')
  .toLocaleLowerCase('uk-UA')
  .replace(/[áàâäãåăą]/g, 'a')
  .replace(/[čćç]/g, 'c')
  .replace(/[ď]/g, 'd')
  .replace(/[éèêëěę]/g, 'e')
  .replace(/[íìîï]/g, 'i')
  .replace(/[ł]/g, 'l')
  .replace(/[ńň]/g, 'n')
  .replace(/[óòôöõ]/g, 'o')
  .replace(/[ř]/g, 'r')
  .replace(/[śšșş]/g, 's')
  .replace(/[ťțţ]/g, 't')
  .replace(/[úùûüů]/g, 'u')
  .replace(/[ýÿ]/g, 'y')
  .replace(/[źżž]/g, 'z')
  .replace(/ß/g, 'ss')
  .replace(/[ʼ’'`]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PRODUCT_TYPE_RULES = [
  {
    type: 'Готові страви',
    phrases: ['готова страва', 'готовое блюдо', 'ready meal', 'instant meal', 'instant nudel', 'instant noodle'],
    exactWords: ['борщ', 'суп'],
    roots: [
      'пельмен', 'вареник', 'голубц', 'котлет', 'сирник', 'піца', 'пицц',
      'pizza', 'ravioli', 'pierogi', 'dumpling', 'lasagn', 'burger', 'sandwich'
    ]
  },
  {
    type: 'Соуси',
    roots: [
      'соус', 'майонез', 'кетчуп', 'гірчиц', 'горчиц', 'аджик', 'заправк',
      'sauce', 'mayonnaise', 'ketchup', 'mustard', 'dressing', 'sos', 'majonez', 'musztard',
      'adzik', 'adjik'
    ]
  },
  {
    type: 'Молочне',
    phrases: ['вершкове масло', 'сливочное масло', 'maslo mleczne'],
    exactWords: ['butter', 'beurre', 'masło', 'maslo'],
    roots: [
      'молок', 'молоч', 'сир', 'йогурт', 'кефір', 'кефир', 'сметан', 'вершк',
      'ряжанк', 'творог', 'milk', 'cheese', 'yogurt', 'yoghurt', 'kefir', 'dairy',
      'cream', 'mleko', 'jogurt', 'smietan', 'twarog', 'tvorog', 'lapte', 'branz', 'iaurt', 'smantan',
      'serek', 'skyr', 'mozzarel', 'camembert', 'fromage', 'philadelphia'
    ]
  },
  {
    type: 'Риба та морепродукти',
    roots: [
      'риб', 'лосос', 'сьомг', 'семг', 'оселед', 'селед', 'тунец', 'скумбр',
      'сардин', 'кревет', 'міді', 'кальмар', 'fish', 'salmon', 'tuna', 'herring',
      'mackerel', 'sardine', 'shrimp', 'seafood', 'ryb', 'losos', 'sledz', 'peste'
    ]
  },
  {
    type: 'М’ясо та птиця',
    roots: [
      'мяс', 'кур', 'індич', 'индей', 'свинин', 'ялович', 'говяд', 'теляти',
      'ковбас', 'колбас', 'сосиск', 'шинка', 'ветчин', 'бекон', 'салям',
      'chicken', 'turkey', 'pork', 'beef', 'veal', 'meat', 'sausage', 'salami',
      'bacon', 'ham', 'mies', 'kurcz', 'wieprz', 'wolow', 'kielbas', 'carne', 'pui'
    ]
  },
  {
    type: 'Яйця',
    roots: ['яйц', 'egg', 'jaj', 'oua']
  },
  {
    type: 'Напої',
    exactWords: [
      'вода', 'сік', 'сок', 'квас', 'кава', 'кофе', 'чай', 'пиво', 'вино',
      'water', 'drink', 'juice', 'coffee', 'tea', 'beer', 'wine', 'woda', 'sok',
      'kawa', 'piwo', 'vin', 'bere', 'ceai', 'cafea', 'zumo', 'jus', 'borjomi'
    ],
    roots: [
      'напій', 'напит', 'нектар', 'лимонад', 'beverage', 'lemonade', 'napoj',
      'herbata', 'refresco', 'bebida', 'coca', 'cola', 'pepsi', 'sprite', 'fanta', 'schweppes',
      'kvasov'
    ]
  },
  {
    type: 'Олії та жири',
    phrases: ['арахісова паста', 'peanut butter'],
    roots: [
      'олія', 'масло', 'маргарин', 'oil', 'oliveoil', 'oliwa', 'olej', 'ulei',
      'aceite', 'olio', 'margarine', 'margaryn'
    ]
  },
  {
    type: 'Бобові',
    exactWords: ['нут', 'горох', 'peas'],
    roots: [
      'квасол', 'сочев', 'bean', 'lentil', 'chickpea', 'fasol', 'groch',
      'soczew', 'naut', 'legum', 'горош'
    ]
  },
  {
    type: 'Спортивне харчування',
    roots: ['протеїн', 'протеин', 'protein', 'гейнер', 'creatine', 'креатин']
  },
  {
    type: 'Крупи та макарони',
    roots: [
      'круп', 'греч', 'рис', 'вівс', 'овсян', 'пшен', 'ячмін', 'перлов', 'булгур',
      'кускус', 'макарон', 'спагет', 'локшин', 'каша', 'rice', 'oat', 'cereal',
      'buckwheat', 'wheat', 'barley', 'bulgur', 'couscous', 'pasta', 'spaghetti',
      'noodle', 'nudel', 'kasz', 'ryz', 'platk', 'makaron', 'orez', 'paste', 'гранол',
      'мюсл', 'пластів', 'хлоп', 'granola', 'muesli', 'flakes', 'fusilli', 'flour', 'брашн',
      'risotto', 'riso', 'rijst', 'кіноа', 'киноа', 'quinoa', 'cini'
    ]
  },
  {
    type: 'Хліб і випічка',
    roots: [
      'хліб', 'хлеб', 'булк', 'лаваш', 'багет', 'круасан', 'пиріг',
      'пирог', 'bread', 'baguette', 'croissant', 'bun', 'loaf', 'toast', 'chleb',
      'bulka', 'paine', 'knackebrot', 'sourdough', 'brioch', 'panettone'
    ],
    exactWords: ['батон']
  },
  {
    type: 'Солодощі',
    phrases: ['bob snail'],
    roots: [
      'шоколад', 'цукерк', 'конфет', 'печив', 'печень', 'вафл', 'торт', 'тістеч',
      'пирож', 'десерт', 'морозив', 'морожен', 'зефір', 'мармелад', 'цукор',
      'сахар', 'chocolate', 'candy', 'sweet', 'cookie', 'biscuit', 'wafer', 'cake',
      'dessert', 'icecream', 'czekolad', 'cukier', 'ciastk', 'bomboan', 'oreo',
      'hanuta', 'toblerone', 'raffaello', 'ferrero', 'kitkat', 'snickers', 'marshmallow',
      'waffer', 'wafel', 'ciocolat', 'cokolad'
    ]
  },
  {
    type: 'Снеки',
    roots: [
      'чипс', 'сухар', 'крекер', 'горіх', 'орех', 'насін', 'семеч', 'попкорн',
      'снек', 'chips', 'crisp', 'cracker', 'nut', 'seed', 'popcorn', 'snack',
      'chipsy', 'orzech', 'orzesz', 'pringles', 'арахіс', 'арахис', 'peanut', 'nuss', 'noix',
      'przekask'
    ]
  },
  {
    type: 'Овочі та фрукти',
    roots: [
      'овоч', 'фрукт', 'яблук', 'яблок', 'банан', 'апельс', 'мандарин', 'лимон',
      'виноград', 'ягід', 'ягод', 'томат', 'помідор', 'огір', 'огур', 'картопл',
      'картоф', 'моркв', 'морков', 'капуст', 'цибул', 'лук', 'буряк', 'свекл',
      'fruit', 'vegetable', 'apple', 'banana', 'orange', 'grape', 'berry', 'tomato',
      'cucumber', 'potato', 'carrot', 'cabbage', 'onion', 'owoc', 'warzyw', 'jablk',
      'ziemniak', 'marchew', 'fruct', 'legum', 'cartof', 'манго', 'mango', 'фінік', 'финик'
    ]
  }
];

const PRODUCT_TYPE_RULE_PRIORITY = [
  'Готові страви',
  'Соуси',
  'Молочне',
  'Риба та морепродукти',
  'Яйця',
  'М’ясо та птиця',
  'Напої',
  'Олії та жири',
  'Бобові',
  'Спортивне харчування',
  'Солодощі',
  'Снеки',
  'Хліб і випічка',
  'Крупи та макарони',
  'Овочі та фрукти'
];

const ORDERED_PRODUCT_TYPE_RULES = [...PRODUCT_TYPE_RULES].sort(
  (left, right) => PRODUCT_TYPE_RULE_PRIORITY.indexOf(left.type) - PRODUCT_TYPE_RULE_PRIORITY.indexOf(right.type)
);

const OFF_CATEGORY_SIGNALS = [
  { type: 'Готові страви', tags: ['en:meals', 'en:prepared-meals', 'en:frozen-meals'], aliases: ['готові страви'] },
  { type: 'Готові страви', tags: ['en:pizzas-pies-and-quiches', 'en:pizzas'], aliases: ['піца'] },
  { type: 'Готові страви', tags: ['en:soups'], aliases: ['суп'] },
  { type: 'Соуси', tags: ['en:sauces'], aliases: ['соус'] },
  { type: 'Соуси', tags: ['en:mayonnaises'], aliases: ['майонез'] },
  { type: 'Соуси', tags: ['en:ketchups'], aliases: ['кетчуп'] },
  { type: 'Молочне', tags: ['en:dairies', 'en:dairy-products'], aliases: ['молочне'] },
  { type: 'Молочне', tags: ['en:milks'], aliases: ['молоко'] },
  { type: 'Молочне', tags: ['en:yogurts'], aliases: ['йогурт'] },
  { type: 'Молочне', tags: ['en:cheeses'], aliases: ['сир'] },
  { type: 'Молочне', tags: ['en:creams'], aliases: ['вершки'] },
  { type: 'Молочне', tags: ['en:butters'], aliases: ['вершкове масло'] },
  { type: 'Риба та морепродукти', tags: ['en:seafood', 'en:fishes', 'en:fish-products'], aliases: ['риба та морепродукти'] },
  { type: 'Яйця', tags: ['en:eggs'], aliases: ['яйця'] },
  { type: 'М’ясо та птиця', tags: ['en:meats', 'en:meat-products', 'en:meats-and-their-products', 'en:prepared-meats'], aliases: ['м’ясо'] },
  { type: 'М’ясо та птиця', tags: ['en:poultries', 'en:chickens'], aliases: ['птиця'] },
  { type: 'М’ясо та птиця', tags: ['en:sausages'], aliases: ['ковбаса'] },
  { type: 'Напої', tags: ['en:beverages', 'en:plant-based-beverages'], aliases: ['напої'] },
  { type: 'Напої', tags: ['en:waters', 'en:mineral-waters'], aliases: ['вода'] },
  { type: 'Напої', tags: ['en:fruit-juices', 'en:juices-and-nectars'], aliases: ['сік'] },
  { type: 'Напої', tags: ['en:teas'], aliases: ['чай'] },
  { type: 'Напої', tags: ['en:coffees'], aliases: ['кава'] },
  { type: 'Олії та жири', tags: ['en:fats', 'en:vegetable-oils', 'en:olive-oils'], aliases: ['олії та жири'] },
  { type: 'Бобові', tags: ['en:legumes', 'en:pulses', 'en:legumes-and-their-products', 'en:tofu'], aliases: ['бобові'] },
  { type: 'Спортивне харчування', tags: ['en:dietary-supplements', 'en:protein-powders'], aliases: ['спортивне харчування'] },
  { type: 'Солодощі', tags: ['en:sugary-snacks', 'en:sweet-snacks', 'en:confectioneries', 'en:desserts'], aliases: ['солодощі'] },
  { type: 'Солодощі', tags: ['en:chocolates', 'en:cocoa-and-its-products', 'en:chocolate-candies', 'en:bars-covered-with-chocolate'], aliases: ['шоколад'] },
  { type: 'Солодощі', tags: ['en:biscuits-and-cakes', 'en:sweet-pastries-and-pies', 'en:viennoiseries'], aliases: ['печиво та торти'] },
  { type: 'Солодощі', tags: ['en:candies', 'en:bonbons', 'en:halva'], aliases: ['цукерки'] },
  { type: 'Солодощі', tags: ['en:ice-creams-and-sorbets', 'en:frozen-desserts'], aliases: ['морозиво'] },
  { type: 'Солодощі', tags: ['en:sweet-spreads', 'en:jams', 'en:honeys', 'en:sweeteners'], aliases: ['солодкі намазки'] },
  { type: 'Снеки', tags: ['en:snacks', 'en:salty-snacks'], aliases: ['снеки'] },
  { type: 'Снеки', tags: ['en:chips-and-fries', 'en:crisps'], aliases: ['чипси'] },
  { type: 'Снеки', tags: ['en:nuts', 'en:nuts-and-their-products', 'en:seeds'], aliases: ['горіхи та насіння'] },
  { type: 'Хліб і випічка', tags: ['en:breads', 'en:breads-and-bread-products', 'en:bakery-products'], aliases: ['хліб і випічка'] },
  { type: 'Хліб і випічка', tags: ['en:pastries'], aliases: ['випічка'] },
  { type: 'Крупи та макарони', tags: ['en:cereals-and-potatoes', 'en:cereals-and-their-products'], aliases: ['крупи'] },
  { type: 'Крупи та макарони', tags: ['en:pastas'], aliases: ['макарони'] },
  { type: 'Крупи та макарони', tags: ['en:rices'], aliases: ['рис'] },
  { type: 'Крупи та макарони', tags: ['en:breakfast-cereals', 'en:breakfasts'], aliases: ['сухі сніданки'] },
  { type: 'Овочі та фрукти', tags: ['en:fruits-and-vegetables-based-foods', 'en:fruit-and-vegetable-preserves'], aliases: ['овочі та фрукти'] },
  { type: 'Овочі та фрукти', tags: ['en:fruits', 'en:dried-fruits'], aliases: ['фрукти'] },
  { type: 'Овочі та фрукти', tags: ['en:vegetables', 'en:frozen-vegetables', 'en:pickles', 'en:olives'], aliases: ['овочі'] }
];

const getSourceCategorySet = product => new Set(
  (Array.isArray(product.sourceCategories) ? product.sourceCategories : [product.sourceCategories])
    .map(category => String(category || '').trim().toLocaleLowerCase('en-US'))
    .filter(Boolean)
);

const getMatchingCategorySignals = product => {
  const sourceCategories = getSourceCategorySet(product);
  if (sourceCategories.size === 0) return [];
  return OFF_CATEGORY_SIGNALS.filter(signal => signal.tags.some(tag => sourceCategories.has(tag)));
};

const BRAND_TYPE_SIGNALS = [
  { type: 'Напої', brands: ['coca cola', 'pepsi', 'lavazza', 'rauch', 'borjomi', 'greenfield', 'schweppes'] },
  { type: 'Солодощі', brands: ['roshen', 'ferrero', 'snickers', 'toblerone', 'kitkat', 'wawel'] },
  { type: 'Снеки', brands: ['pringles', 'tuc'] },
  { type: 'Молочне', brands: ['mlekpol', 'mlekovita', 'hochland', 'valio', 'baltais'] },
  { type: 'Олії та жири', brands: ['oleyna', 'олейна', 'monini', 'la española'] }
];

const inferBrandProductType = product => {
  const brand = normalizeProductTypeText(product.brand);
  return BRAND_TYPE_SIGNALS.find(signal => (
    signal.brands.some(candidate => brand.includes(normalizeProductTypeText(candidate)))
  ))?.type;
};

export function getProductTaxonomySearchAliases(product = {}) {
  const aliases = getMatchingCategorySignals(product).flatMap(signal => signal.aliases);
  return [...new Set(aliases)];
}

export function inferProductType(product = {}) {
  if (VALID_PRODUCT_TYPES.has(product.productType)) return product.productType;

  const text = normalizeProductTypeText([
    product.name,
    ...(Array.isArray(product.aliases) ? product.aliases : [product.aliases]),
    ...(Array.isArray(product.sourceCategories) ? product.sourceCategories : [product.sourceCategories])
      .filter(category => category && !String(category).toLocaleLowerCase('en-US').startsWith('en:'))
  ].filter(Boolean).join(' '));
  const words = text.split(' ').filter(Boolean);

  for (const rule of ORDERED_PRODUCT_TYPE_RULES) {
    const hasPhrase = rule.phrases?.some(phrase => text.includes(normalizeProductTypeText(phrase)));
    const hasExactWord = rule.exactWords?.some(word => words.includes(normalizeProductTypeText(word)));
    const hasRoot = rule.roots.some(root => words.some(word => word.startsWith(root)));
    if (hasPhrase || hasExactWord || hasRoot) return rule.type;
  }

  const taxonomyMatch = getMatchingCategorySignals(product)[0];
  if (taxonomyMatch) return taxonomyMatch.type;

  const brandMatch = inferBrandProductType(product);
  if (brandMatch) return brandMatch;

  return 'Інше';
}
