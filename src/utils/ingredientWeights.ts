import type { MeasurementUnit } from '@/types/units';

/**
 * Approximate weight in grams for 1 cup of common ingredients
 * Used to convert volume measurements to weight for nutrition calculations
 */
export const GRAMS_PER_CUP: Record<string, number> = {
  // Flours & Baking
  'flour': 125,
  'all-purpose flour': 125,
  'bread flour': 127,
  'whole wheat flour': 120,
  'almond flour': 96,
  'coconut flour': 112,
  'cornstarch': 128,
  'baking powder': 230,
  'baking soda': 230,

  // Sugars
  'sugar': 200,
  'granulated sugar': 200,
  'brown sugar': 220,
  'powdered sugar': 120,
  'confectioners sugar': 120,
  'honey': 340,
  'maple syrup': 315,
  'molasses': 328,

  // Dairy & Eggs
  'milk': 245,
  'whole milk': 245,
  'skim milk': 245,
  'buttermilk': 245,
  'heavy cream': 238,
  'sour cream': 242,
  'yogurt': 245,
  'greek yogurt': 280,
  'cream cheese': 232,
  'butter': 227,
  'cheese': 113, // shredded
  'cheddar cheese': 113,
  'mozzarella cheese': 113,
  'parmesan cheese': 100,
  'ricotta cheese': 246,
  'cottage cheese': 225,

  // Oils & Fats
  'oil': 218,
  'vegetable oil': 218,
  'olive oil': 216,
  'coconut oil': 218,

  // Grains & Pasta
  'rice': 185, // uncooked
  'white rice': 185,
  'brown rice': 190,
  'oats': 80,
  'rolled oats': 80,
  'quinoa': 170,
  'pasta': 100, // dry
  'breadcrumbs': 108,
  'panko': 60,

  // Proteins
  'chicken': 140, // diced
  'chicken breast': 140,
  'ground beef': 225,
  'ground turkey': 225,
  'ground pork': 225,
  'bacon': 150, // chopped
  'tofu': 252,
  'beans': 180, // cooked
  'black beans': 180,
  'chickpeas': 164,
  'lentils': 198,

  // Vegetables
  'onion': 160, // chopped
  'garlic': 136, // minced
  'tomato': 180, // chopped
  'tomatoes': 180,
  'bell pepper': 150,
  'carrot': 128, // chopped
  'carrots': 128,
  'celery': 101,
  'broccoli': 91,
  'spinach': 30,
  'lettuce': 47,
  'cabbage': 89,
  'mushrooms': 70,
  'corn': 154,
  'peas': 145,
  'green beans': 110,
  'zucchini': 124,
  'potato': 150, // diced
  'potatoes': 150,
  'sweet potato': 133,

  // Fruits
  'apple': 125, // chopped
  'banana': 150, // sliced
  'berries': 145,
  'blueberries': 145,
  'strawberries': 152,
  'raspberries': 123,
  'lemon juice': 244,
  'lime juice': 246,
  'orange juice': 248,
  'raisins': 145,

  // Nuts & Seeds
  'almonds': 143,
  'walnuts': 120,
  'pecans': 109,
  'peanuts': 146,
  'cashews': 137,
  'peanut butter': 258,
  'almond butter': 256,
  'sesame seeds': 144,
  'chia seeds': 170,
  'flax seeds': 168,

  // Liquids & Sauces
  'water': 237,
  'broth': 240,
  'chicken broth': 240,
  'beef broth': 240,
  'vegetable broth': 240,
  'stock': 240,
  'soy sauce': 255,
  'tomato sauce': 245,
  'tomato paste': 262,
  'marinara sauce': 250,
  'salsa': 259,
  'vinegar': 239,
  'wine': 236,

  // Condiments
  'mayonnaise': 220,
  'mustard': 250,
  'ketchup': 240,
  'hot sauce': 273,

  // Default fallback (approximate average for solid ingredients)
  '_default': 150,
};

/**
 * Weight in grams for count-based units
 */
export const GRAMS_PER_EACH: Record<string, number> = {
  'egg': 50,
  'eggs': 50,
  'large egg': 50,
  'chicken breast': 170,
  'chicken thigh': 115,
  'garlic clove': 3,
  'clove garlic': 3,
  'garlic': 3, // per clove
  'onion': 150, // medium
  'potato': 150, // medium
  'carrot': 60, // medium
  'celery stalk': 40,
  'celery': 40,
  'banana': 118,
  'apple': 182,
  'lemon': 84,
  'lime': 67,
  'orange': 131,
  'avocado': 200,
  'tomato': 123,
  'bell pepper': 120,
  'jalapeño': 14,
  'jalapeno': 14,
  'slice bread': 30,
  'bread': 30,
  'tortilla': 45,
  'burger bun': 50,
  'hot dog bun': 43,
  'bacon strip': 8,
  'bacon slice': 8,
  'bacon': 8,
  '_default': 50,
};

/**
 * Convert tablespoon measurements to cups for lookup
 */
const TBSP_PER_CUP = 16;
const TSP_PER_CUP = 48;
const ML_PER_CUP = 237;
const FL_OZ_PER_CUP = 8;

/**
 * Estimate weight in grams for an ingredient based on its quantity and unit
 */
export function estimateIngredientWeight(
  ingredientName: string,
  quantity: number | null,
  unit: MeasurementUnit | null
): number {
  if (quantity === null || quantity === 0) {
    return 0;
  }

  const name = ingredientName.toLowerCase().trim();

  // Handle count-based units (each, slice, clove, etc.)
  if (!unit || unit === 'each' || unit === 'slice' || unit === 'clove' || unit === 'bunch') {
    const gramsPerEach = findBestMatch(name, GRAMS_PER_EACH);
    return quantity * gramsPerEach;
  }

  // Handle weight units directly
  if (unit === 'g') return quantity;
  if (unit === 'kg') return quantity * 1000;
  if (unit === 'oz') return quantity * 28.35;
  if (unit === 'lb') return quantity * 453.6;

  // Convert volume to cups, then to grams
  let cups = 0;
  switch (unit) {
    case 'cup':
      cups = quantity;
      break;
    case 'tbsp':
      cups = quantity / TBSP_PER_CUP;
      break;
    case 'tsp':
      cups = quantity / TSP_PER_CUP;
      break;
    case 'ml':
      cups = quantity / ML_PER_CUP;
      break;
    case 'l':
      cups = (quantity * 1000) / ML_PER_CUP;
      break;
    case 'fl_oz':
      cups = quantity / FL_OZ_PER_CUP;
      break;
    case 'pint_us':
      cups = quantity * 2;
      break;
    case 'pint_uk':
      cups = quantity * 2.4;
      break;
    case 'quart':
      cups = quantity * 4;
      break;
    case 'gallon_us':
      cups = quantity * 16;
      break;
    case 'gallon_uk':
      cups = quantity * 19.2;
      break;
    default:
      // For unknown units, assume it's similar to tablespoons
      cups = quantity / TBSP_PER_CUP;
  }

  const gramsPerCup = findBestMatch(name, GRAMS_PER_CUP);
  return cups * gramsPerCup;
}

/**
 * Find the best matching ingredient name in the lookup table
 */
export function findBestWeightMatch(name: string, lookup: Record<string, number>): number {
  // Exact match
  if (lookup[name]) {
    return lookup[name];
  }

  // Check if name contains any key
  for (const key of Object.keys(lookup)) {
    if (key !== '_default' && name.includes(key)) {
      return lookup[key];
    }
  }

  // Check if any key contains the name
  for (const key of Object.keys(lookup)) {
    if (key !== '_default' && key.includes(name)) {
      return lookup[key];
    }
  }

  // Check individual words
  const words = name.split(/\s+/);
  for (const word of words) {
    if (word.length > 2 && lookup[word]) {
      return lookup[word];
    }
  }

  return lookup['_default'] || 100;
}

// Internal alias for backward compatibility
const findBestMatch = findBestWeightMatch;

/**
 * Format weight for display
 */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(1)}kg`;
  }
  return `${Math.round(grams)}g`;
}
