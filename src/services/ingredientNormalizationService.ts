/**
 * Ingredient Normalization Service
 *
 * Provides deterministic normalization rules for ingredient names
 * to improve deduplication during shopping list aggregation.
 */

export interface NormalizedIngredient {
  normalizedName: string; // Lowercase, singular, no descriptors - used for matching
  displayName: string; // Cleaned up display name (preserves meaningful info)
  originalName: string; // The original input
  strippedDescriptors: string[]; // Descriptors that were removed
}

/**
 * Irregular plural forms common in cooking
 */
const IRREGULAR_PLURALS: Record<string, string> = {
  leaves: 'leaf',
  halves: 'half',
  loaves: 'loaf',
  knives: 'knife',
  wives: 'wife',
  shelves: 'shelf',
  calves: 'calf',
  wolves: 'wolf',
  selves: 'self',
  // -oes to -o
  tomatoes: 'tomato',
  potatoes: 'potato',
  heroes: 'hero',
  echoes: 'echo',
  // -ies to -y
  berries: 'berry',
  cherries: 'cherry',
  strawberries: 'strawberry',
  blueberries: 'blueberry',
  raspberries: 'raspberry',
  blackberries: 'blackberry',
  cranberries: 'cranberry',
  anchovies: 'anchovy',
  // Food-specific irregulars
  teeth: 'tooth',
  feet: 'foot',
  geese: 'goose',
  mice: 'mouse',
  dice: 'die',
  // Already singular (don't change)
  fish: 'fish',
  salmon: 'salmon',
  tuna: 'tuna',
  shrimp: 'shrimp',
  squid: 'squid',
  deer: 'deer',
  sheep: 'sheep',
  moose: 'moose',
  rice: 'rice',
  pasta: 'pasta',
  quinoa: 'quinoa',
  tofu: 'tofu',
  tempeh: 'tempeh',
  seitan: 'seitan',
  couscous: 'couscous',
  hummus: 'hummus',
  feta: 'feta',
  brie: 'brie',
  mozzarella: 'mozzarella',
  parmesan: 'parmesan',
  cheddar: 'cheddar',
  swiss: 'swiss',
  lettuce: 'lettuce',
  spinach: 'spinach',
  kale: 'kale',
  arugula: 'arugula',
  watercress: 'watercress',
  cabbage: 'cabbage',
  broccoli: 'broccoli',
  cauliflower: 'cauliflower',
  asparagus: 'asparagus',
  celery: 'celery',
  parsley: 'parsley',
  cilantro: 'cilantro',
  basil: 'basil',
  oregano: 'oregano',
  thyme: 'thyme',
  rosemary: 'rosemary',
  sage: 'sage',
  dill: 'dill',
  mint: 'mint',
  ginger: 'ginger',
  garlic: 'garlic',
  cinnamon: 'cinnamon',
  nutmeg: 'nutmeg',
  paprika: 'paprika',
  cumin: 'cumin',
  turmeric: 'turmeric',
  coriander: 'coriander',
  cardamom: 'cardamom',
  saffron: 'saffron',
  vanilla: 'vanilla',
  chocolate: 'chocolate',
  coffee: 'coffee',
  tea: 'tea',
  honey: 'honey',
  molasses: 'molasses',
  sugar: 'sugar',
  flour: 'flour',
  yeast: 'yeast',
  butter: 'butter',
  cream: 'cream',
  milk: 'milk',
  yogurt: 'yogurt',
  cheese: 'cheese',
  beef: 'beef',
  pork: 'pork',
  lamb: 'lamb',
  veal: 'veal',
  venison: 'venison',
  poultry: 'poultry',
  chicken: 'chicken',
  turkey: 'turkey',
  duck: 'duck',
  bacon: 'bacon',
  ham: 'ham',
  sausage: 'sausage',
  // -s words that shouldn't be singularized
  citrus: 'citrus',
};

/**
 * Descriptors to strip for matching (but preserve for display context)
 * These don't change what ingredient you're buying, just preparation/quality
 */
const PREPARATION_DESCRIPTORS = new Set([
  // Cutting/preparation
  'diced',
  'chopped',
  'minced',
  'sliced',
  'cubed',
  'shredded',
  'grated',
  'crushed',
  'mashed',
  'pureed',
  'julienned',
  'halved',
  'quartered',
  'torn',
  'crumbled',
  'ground',
  'whole',
  // State
  'fresh',
  'dried',
  'frozen',
  'canned',
  'jarred',
  'packed',
  'drained',
  'rinsed',
  'thawed',
  'raw',
  'cooked',
  'roasted',
  'toasted',
  'grilled',
  'baked',
  'fried',
  'sautéed',
  'sauteed',
  'steamed',
  'boiled',
  'poached',
  'smoked',
  'cured',
  'pickled',
  'marinated',
  'blanched',
  // Size
  'large',
  'medium',
  'small',
  'extra-large',
  'xl',
  'jumbo',
  'baby',
  'mini',
  'petite',
  // Cut/form
  'thick-cut',
  'thin-cut',
  'thick',
  'thin',
  'bite-size',
  'bite-sized',
  // Quality
  'organic',
  'free-range',
  'grass-fed',
  'wild-caught',
  'farm-raised',
  'pasture-raised',
  'cage-free',
  'natural',
  'all-natural',
  'kosher',
  'halal',
  // Meat-specific
  'boneless',
  'skinless',
  'bone-in',
  'skin-on',
  'lean',
  'extra-lean',
  'fatty',
  'trimmed',
  'untrimmed',
  // Temperature
  'room-temperature',
  'cold',
  'chilled',
  'warm',
  'hot',
  // Ripeness
  'ripe',
  'unripe',
  'overripe',
  'firm',
  'soft',
]);

/**
 * Words to keep even if they look like descriptors (they identify the ingredient)
 */
const KEEP_WORDS = new Set([
  'black',
  'white',
  'red',
  'green',
  'yellow',
  'orange',
  'brown',
  'wild',
  'sweet',
  'hot',
  'bell',
  'roma',
  'cherry',
  'grape',
  'beefsteak',
  'plum',
  'heirloom',
  'vidalia',
  'yellow',
  'spanish',
  'italian',
  'greek',
  'french',
  'asian',
  'thai',
  'japanese',
  'chinese',
  'indian',
  'mexican',
  'cajun',
  'creole',
]);

/**
 * Singularize a word using rules and dictionary
 */
export function singularize(word: string): string {
  const lower = word.toLowerCase();

  // Check irregular plurals first
  if (IRREGULAR_PLURALS[lower]) {
    return IRREGULAR_PLURALS[lower];
  }

  // Don't singularize words that are already in the dictionary as singular
  if (Object.values(IRREGULAR_PLURALS).includes(lower)) {
    return lower;
  }

  // Standard English plural rules (in reverse)
  // -ies -> -y (applies to words not in irregular list)
  if (lower.endsWith('ies') && lower.length > 4) {
    return lower.slice(0, -3) + 'y';
  }

  // -ves -> -f (e.g., leaves -> leaf, loaves -> loaf)
  if (lower.endsWith('ves')) {
    return lower.slice(0, -3) + 'f';
  }

  // -oes -> -o (for words not in irregular list)
  if (lower.endsWith('oes') && lower.length > 4) {
    return lower.slice(0, -2);
  }

  // -es -> (various)
  if (lower.endsWith('es') && lower.length > 3) {
    const withoutEs = lower.slice(0, -2);
    const withoutS = lower.slice(0, -1);

    // -shes, -ches, -xes, -zes, -sses -> remove -es
    if (
      lower.endsWith('shes') ||
      lower.endsWith('ches') ||
      lower.endsWith('xes') ||
      lower.endsWith('zes') ||
      lower.endsWith('sses')
    ) {
      return withoutEs;
    }

    // Otherwise just remove -s (e.g., "tomatoes" already handled)
    return withoutS;
  }

  // -s -> remove (simple plural)
  if (lower.endsWith('s') && lower.length > 2 && !lower.endsWith('ss')) {
    return lower.slice(0, -1);
  }

  return lower;
}

/**
 * Normalize punctuation and whitespace
 */
export function normalizePunctuation(name: string): string {
  return (
    name
      // Remove content in parentheses (e.g., "chicken breast (large)")
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      // Replace commas with spaces
      .replace(/,/g, ' ')
      // Replace hyphens with spaces for matching (but keep compound words)
      .replace(/-/g, ' ')
      // Collapse multiple spaces
      .replace(/\s+/g, ' ')
      // Trim
      .trim()
  );
}

/**
 * Strip preparation descriptors from ingredient name
 * Returns the cleaned name and list of stripped descriptors
 */
export function stripDescriptors(name: string): {
  cleaned: string;
  descriptors: string[];
} {
  const words = name.toLowerCase().split(/\s+/);
  const kept: string[] = [];
  const stripped: string[] = [];

  for (const word of words) {
    // Keep words that identify the ingredient type
    if (KEEP_WORDS.has(word)) {
      kept.push(word);
    }
    // Strip preparation descriptors
    else if (PREPARATION_DESCRIPTORS.has(word)) {
      stripped.push(word);
    }
    // Keep everything else
    else {
      kept.push(word);
    }
  }

  return {
    cleaned: kept.join(' '),
    descriptors: stripped,
  };
}

/**
 * Main normalization function
 * Takes an ingredient name and returns normalized forms for matching and display
 */
export function normalizeIngredientName(name: string): NormalizedIngredient {
  const original = name;

  // Step 1: Normalize punctuation
  const cleaned = normalizePunctuation(name);

  // Step 2: Strip descriptors (for matching only)
  const { cleaned: withoutDescriptors, descriptors } =
    stripDescriptors(cleaned);

  // Step 3: Singularize each word for the normalized (matching) name
  const words = withoutDescriptors.split(/\s+/);
  const singularWords = words.map((word) => singularize(word));
  const normalizedName = singularWords.join(' ').toLowerCase();

  // For display, keep the cleaned version but singularize
  const displayWords = cleaned.toLowerCase().split(/\s+/);
  const displaySingular = displayWords.map((word) => singularize(word));
  const displayName = displaySingular.join(' ');

  return {
    normalizedName,
    displayName,
    originalName: original,
    strippedDescriptors: descriptors,
  };
}

/**
 * Check if two ingredient names should be considered the same
 * after normalization
 */
export function ingredientNamesMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeIngredientName(name1);
  const norm2 = normalizeIngredientName(name2);
  return norm1.normalizedName === norm2.normalizedName;
}

/**
 * Get a canonical display name from multiple variants
 * Prefers shorter names without descriptors, but keeps important qualifiers
 */
export function selectCanonicalName(variants: string[]): string {
  if (variants.length === 0) return '';
  if (variants.length === 1) return variants[0];

  // Normalize all variants
  const normalized = variants.map((v) => ({
    original: v,
    ...normalizeIngredientName(v),
  }));

  // Prefer names with fewer stripped descriptors (more specific/intentional)
  // but if all have same descriptors, prefer shorter
  normalized.sort((a, b) => {
    // Fewer stripped descriptors = more intentional naming
    const descDiff = a.strippedDescriptors.length - b.strippedDescriptors.length;
    if (descDiff !== 0) return descDiff;

    // Shorter display name
    return a.displayName.length - b.displayName.length;
  });

  // Return the display name (cleaned, singularized) of the best variant
  // Capitalize first letter
  const best = normalized[0].displayName;
  return best.charAt(0).toUpperCase() + best.slice(1);
}
