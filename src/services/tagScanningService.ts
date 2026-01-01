import type { ParsedRecipe, ParsedIngredient } from '@/types/import';
import type { NutritionInfo } from '@/types/recipe';
import { SYSTEM_TAGS } from '@/types/tags';

/**
 * Tag detection rules for each system tag
 * Keywords are checked with fuzzy matching against recipe content
 */
interface TagRule {
  tagName: string;
  keywords: string[];
  checkFunction?: (recipe: RecipeContent) => boolean;
}

interface RecipeContent {
  title: string;
  description?: string;
  instructions: string;
  ingredients: ParsedIngredient[];
  notes?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  nutrition?: NutritionInfo;
}

/**
 * List of common meat/poultry/seafood ingredients for vegetarian/vegan detection
 */
const MEAT_INGREDIENTS = [
  'beef', 'steak', 'ground beef', 'hamburger', 'veal',
  'pork', 'bacon', 'ham', 'sausage', 'prosciutto', 'pancetta',
  'chicken', 'turkey', 'duck', 'poultry',
  'lamb', 'mutton',
  'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass',
  'shrimp', 'prawns', 'crab', 'lobster', 'scallops', 'clams', 'mussels', 'oysters',
  'anchovy', 'anchovies', 'sardine', 'sardines',
  'venison', 'bison', 'rabbit',
];

/**
 * Dairy ingredients for dairy-free detection
 */
const DAIRY_INGREDIENTS = [
  'milk', 'cream', 'butter', 'cheese', 'yogurt', 'sour cream',
  'half and half', 'half-and-half', 'whipping cream', 'heavy cream',
  'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'cottage cheese',
  'cream cheese', 'brie', 'gouda', 'swiss cheese',
  'ghee', 'buttermilk', 'condensed milk', 'evaporated milk',
];

/**
 * Animal products for vegan detection (includes dairy + eggs + honey)
 */
const ANIMAL_PRODUCTS = [
  ...MEAT_INGREDIENTS,
  ...DAIRY_INGREDIENTS,
  'egg', 'eggs', 'egg white', 'egg yolk',
  'honey', 'gelatin', 'lard',
];

/**
 * Tag detection rules
 */
const TAG_RULES: TagRule[] = [
  // Quick Prep - based on time or keywords
  {
    tagName: 'Quick Prep',
    keywords: ['quick', 'easy', 'fast', 'minute', 'speed', 'rapid', '15-minute', '20-minute', '30-minute', 'weeknight'],
    checkFunction: (recipe) => {
      if (recipe.prepTimeMinutes && recipe.prepTimeMinutes <= 15) return true;
      const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
      if (totalTime > 0 && totalTime <= 30) return true;
      return false;
    },
  },

  // Slow Cooker
  {
    tagName: 'Slow Cooker',
    keywords: ['slow cooker', 'slowcooker', 'slow-cooker', 'crock pot', 'crockpot', 'crock-pot'],
  },

  // Instant Pot
  {
    tagName: 'Instant Pot',
    keywords: ['instant pot', 'instantpot', 'instant-pot', 'pressure cooker', 'pressure cook'],
  },

  // One Pot
  {
    tagName: 'One Pot',
    keywords: ['one pot', 'one-pot', 'onepot', 'single pot', 'one pan', 'one-pan', 'sheet pan', 'all in one'],
  },

  // Meal Prep Friendly
  {
    tagName: 'Meal Prep Friendly',
    keywords: ['meal prep', 'make ahead', 'make-ahead', 'batch cook', 'batch cooking', 'prep ahead', 'reheats well', 'stores well', 'leftovers'],
  },

  // Freezer Friendly
  {
    tagName: 'Freezer Friendly',
    keywords: ['freeze', 'freezer', 'frozen', 'freeze well', 'freezes well', 'make ahead and freeze'],
  },

  // Kid Friendly
  {
    tagName: 'Kid Friendly',
    keywords: ['kid friendly', 'kid-friendly', 'family friendly', 'family-friendly', 'children', 'toddler', 'picky eater', 'mild'],
  },

  // Vegetarian
  {
    tagName: 'Vegetarian',
    keywords: ['vegetarian', 'veggie', 'meatless'],
    checkFunction: (recipe) => {
      // Check if any meat ingredients are present
      const ingredientText = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
      return !MEAT_INGREDIENTS.some(meat => ingredientText.includes(meat));
    },
  },

  // Vegan
  {
    tagName: 'Vegan',
    keywords: ['vegan', 'plant-based', 'plant based'],
    checkFunction: (recipe) => {
      // Check if any animal products are present
      const ingredientText = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
      return !ANIMAL_PRODUCTS.some(product => ingredientText.includes(product));
    },
  },

  // Gluten Free
  {
    tagName: 'Gluten Free',
    keywords: ['gluten free', 'gluten-free', 'glutenfree', 'no gluten', 'gf'],
  },

  // Dairy Free
  {
    tagName: 'Dairy Free',
    keywords: ['dairy free', 'dairy-free', 'dairyfree', 'no dairy', 'non-dairy', 'nondairy'],
    checkFunction: (recipe) => {
      // Check if any dairy ingredients are present
      const ingredientText = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
      return !DAIRY_INGREDIENTS.some(dairy => ingredientText.includes(dairy));
    },
  },

  // Low Carb
  {
    tagName: 'Low Carb',
    keywords: ['low carb', 'low-carb', 'lowcarb', 'keto', 'ketogenic', 'paleo', 'atkins'],
  },

  // High Protein
  {
    tagName: 'High Protein',
    keywords: ['high protein', 'high-protein', 'protein packed', 'protein-packed'],
    checkFunction: (recipe) => {
      // Check nutrition info for protein > 30g
      if (recipe.nutrition?.protein && recipe.nutrition.protein >= 30) return true;
      return false;
    },
  },

  // Budget Friendly
  {
    tagName: 'Budget Friendly',
    keywords: ['budget', 'cheap', 'inexpensive', 'economical', 'thrifty', 'affordable', 'frugal'],
  },

  // Holiday
  {
    tagName: 'Holiday',
    keywords: ['holiday', 'christmas', 'thanksgiving', 'easter', 'halloween', 'hanukkah', 'new year', 'festive', 'celebration'],
  },

  // Breakfast
  {
    tagName: 'Breakfast',
    keywords: ['breakfast', 'brunch', 'morning'],
    checkFunction: (recipe) => {
      const text = recipe.title.toLowerCase();
      const breakfastFoods = ['pancake', 'waffle', 'oatmeal', 'cereal', 'toast', 'eggs benedict', 'french toast', 'scrambled egg', 'omelet', 'omelette', 'frittata', 'hash brown', 'granola', 'smoothie bowl'];
      return breakfastFoods.some(food => text.includes(food));
    },
  },

  // Lunch
  {
    tagName: 'Lunch',
    keywords: ['lunch', 'lunchbox', 'lunch box'],
    checkFunction: (recipe) => {
      const text = recipe.title.toLowerCase();
      const lunchFoods = ['sandwich', 'wrap', 'salad', 'soup'];
      return lunchFoods.some(food => text.includes(food));
    },
  },

  // Dinner
  {
    tagName: 'Dinner',
    keywords: ['dinner', 'supper', 'main course', 'entree', 'entrée'],
  },

  // Dessert
  {
    tagName: 'Dessert',
    keywords: ['dessert', 'sweet', 'treat'],
    checkFunction: (recipe) => {
      const text = recipe.title.toLowerCase();
      const dessertFoods = ['cake', 'cookie', 'cookies', 'brownie', 'pie', 'chocolate', 'ice cream', 'pudding', 'cupcake', 'cheesecake', 'tart', 'pastry', 'donut', 'doughnut', 'macaron', 'fudge', 'truffle'];
      return dessertFoods.some(food => text.includes(food));
    },
  },

  // Snack
  {
    tagName: 'Snack',
    keywords: ['snack', 'nibble', 'bite-size', 'bite size', 'finger food'],
    checkFunction: (recipe) => {
      const text = recipe.title.toLowerCase();
      const snackFoods = ['dip', 'trail mix', 'popcorn', 'chips', 'nuts', 'crackers', 'energy ball', 'energy bite'];
      return snackFoods.some(food => text.includes(food));
    },
  },

  // Appetizer
  {
    tagName: 'Appetizer',
    keywords: ['appetizer', 'starter', 'hors d\'oeuvre', 'hors doeuvre', 'canape', 'canapé', 'tapas', 'antipasto', 'amuse-bouche'],
  },

  // Side Dish
  {
    tagName: 'Side Dish',
    keywords: ['side dish', 'side', 'accompaniment', 'garnish'],
  },

  // Beverage
  {
    tagName: 'Beverage',
    keywords: ['beverage', 'drink', 'cocktail', 'mocktail', 'smoothie', 'juice', 'lemonade', 'tea', 'coffee'],
  },
];

/**
 * Simple fuzzy match - checks if any of the keywords appear in the text
 * Uses word boundary awareness for better matching
 */
function fuzzyMatch(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();

    // Direct substring match
    if (lowerText.includes(lowerKeyword)) {
      return true;
    }

    // Also check with word boundaries for partial matches
    // This helps catch variations like "slow-cooker" matching "slow cooker"
    const normalizedText = lowerText.replace(/[-_]/g, ' ');
    const normalizedKeyword = lowerKeyword.replace(/[-_]/g, ' ');
    if (normalizedText.includes(normalizedKeyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all searchable text from a recipe
 */
function getRecipeText(recipe: RecipeContent): string {
  const parts = [
    recipe.title,
    recipe.description || '',
    recipe.instructions,
    recipe.notes || '',
    ...recipe.ingredients.map(i => `${i.name} ${i.notes || ''}`),
  ];
  return parts.join(' ').toLowerCase();
}

/**
 * Tag scanning service for auto-detecting and applying system tags
 */
export const tagScanningService = {
  /**
   * Scan a recipe and return list of detected tag names
   */
  detectTags(recipe: ParsedRecipe): string[] {
    const detectedTags: string[] = [];
    const recipeText = getRecipeText(recipe);

    const content: RecipeContent = {
      title: recipe.title,
      description: recipe.description,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      notes: recipe.notes,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      nutrition: recipe.nutrition,
    };

    for (const rule of TAG_RULES) {
      let matched = false;

      // Check keywords via fuzzy matching
      if (rule.keywords.length > 0 && fuzzyMatch(recipeText, rule.keywords)) {
        matched = true;
      }

      // Check custom function if provided and not already matched
      if (!matched && rule.checkFunction && rule.checkFunction(content)) {
        matched = true;
      }

      if (matched) {
        // Verify this is actually a system tag
        const isSystemTag = SYSTEM_TAGS.some(st => st.name === rule.tagName);
        if (isSystemTag) {
          detectedTags.push(rule.tagName);
        }
      }
    }

    return detectedTags;
  },

  /**
   * Get all available system tag names
   */
  getSystemTagNames(): string[] {
    return SYSTEM_TAGS.map(tag => tag.name);
  },

  /**
   * Check if a tag name is a system tag
   */
  isSystemTag(tagName: string): boolean {
    return SYSTEM_TAGS.some(tag => tag.name === tagName);
  },
};
