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
  .replace(/[ʼ’'`]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PRODUCT_TYPE_RULES = [
  {
    type: 'Готові страви',
    phrases: ['готова страва', 'готовое блюдо', 'ready meal', 'instant meal'],
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
      'sauce', 'mayonnaise', 'ketchup', 'mustard', 'dressing', 'sos', 'majonez', 'musztard'
    ]
  },
  {
    type: 'Молочне',
    phrases: ['вершкове масло', 'сливочное масло', 'maslo mleczne'],
    exactWords: ['butter', 'beurre', 'masło', 'maslo'],
    roots: [
      'молок', 'молоч', 'сир', 'йогурт', 'кефір', 'кефир', 'сметан', 'вершк',
      'ряжанк', 'творог', 'milk', 'cheese', 'yogurt', 'yoghurt', 'kefir', 'dairy',
      'cream', 'mleko', 'jogurt', 'smietan', 'twarog', 'lapte', 'branz', 'iaurt', 'smantan'
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
      'herbata', 'refresco', 'coca', 'cola', 'pepsi', 'sprite', 'fanta'
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
      'soczew', 'naut', 'legum'
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
      'noodle', 'kasz', 'ryz', 'platk', 'makaron', 'orez', 'paste', 'гранол',
      'мюсл', 'пластів', 'хлоп', 'granola', 'muesli', 'flakes'
    ]
  },
  {
    type: 'Хліб і випічка',
    roots: [
      'хліб', 'хлеб', 'булк', 'лаваш', 'багет', 'круасан', 'пиріг',
      'пирог', 'bread', 'baguette', 'croissant', 'bun', 'loaf', 'toast', 'chleb',
      'bulka', 'paine'
    ],
    exactWords: ['батон']
  },
  {
    type: 'Солодощі',
    roots: [
      'шоколад', 'цукерк', 'конфет', 'печив', 'печень', 'вафл', 'торт', 'тістеч',
      'пирож', 'десерт', 'морозив', 'морожен', 'зефір', 'мармелад', 'цукор',
      'сахар', 'chocolate', 'candy', 'sweet', 'cookie', 'biscuit', 'wafer', 'cake',
      'dessert', 'icecream', 'czekolad', 'cukier', 'ciastk', 'bomboan', 'oreo',
      'hanuta', 'toblerone', 'raffaello', 'ferrero', 'kitkat', 'snickers', 'marshmallow'
    ]
  },
  {
    type: 'Снеки',
    roots: [
      'чипс', 'сухар', 'крекер', 'горіх', 'орех', 'насін', 'семеч', 'попкорн',
      'снек', 'chips', 'crisp', 'cracker', 'nut', 'seed', 'popcorn', 'snack',
      'chipsy', 'orzech'
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
      'ziemniak', 'marchew', 'fruct', 'legum', 'cartof'
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

export function inferProductType(product = {}) {
  if (VALID_PRODUCT_TYPES.has(product.productType)) return product.productType;

  const text = normalizeProductTypeText([
    product.name,
    ...(Array.isArray(product.aliases) ? product.aliases : [product.aliases])
  ].filter(Boolean).join(' '));
  const words = text.split(' ').filter(Boolean);

  for (const rule of ORDERED_PRODUCT_TYPE_RULES) {
    const hasPhrase = rule.phrases?.some(phrase => text.includes(normalizeProductTypeText(phrase)));
    const hasExactWord = rule.exactWords?.some(word => words.includes(normalizeProductTypeText(word)));
    const hasRoot = rule.roots.some(root => words.some(word => word.startsWith(root)));
    if (hasPhrase || hasExactWord || hasRoot) return rule.type;
  }

  return 'Інше';
}
