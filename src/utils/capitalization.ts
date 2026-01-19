import type { Recipe } from '@/types';

// Proper nouns that should preserve capitalization in ingredient names
const PROPER_NOUNS = new Set([
  // Cheese names
  'parmesan',
  'parmigiano',
  'reggiano',
  'gruyère',
  'gruyere',
  'brie',
  'cheddar',
  'gouda',
  'mozzarella',
  'feta',
  'ricotta',
  'gorgonzola',
  'camembert',
  'roquefort',
  'manchego',
  'pecorino',
  'romano',
  'asiago',
  'fontina',
  'havarti',
  'monterey',
  'jack',
  'colby',
  'swiss',
  'emmental',
  'emmentaler',
  'provolone',
  'mascarpone',
  'neufchâtel',
  'neufchatel',
  'boursin',
  'stilton',
  'halloumi',
  'paneer',
  'cotija',
  'queso',

  // Regional/nationality descriptors
  'italian',
  'french',
  'thai',
  'mexican',
  'chinese',
  'japanese',
  'korean',
  'vietnamese',
  'indian',
  'greek',
  'spanish',
  'portuguese',
  'german',
  'british',
  'american',
  'cajun',
  'creole',
  'mediterranean',
  'asian',
  'african',
  'caribbean',
  'cuban',
  'brazilian',
  'peruvian',
  'moroccan',
  'turkish',
  'lebanese',
  'middle eastern',
  'scandinavian',
  'polish',
  'russian',
  'hungarian',
  'austrian',
  'irish',
  'scottish',
  'welsh',
  'tex-mex',
  'szechuan',
  'sichuan',
  'cantonese',
  'mandarin',
  'hunan',
  'indonesian',
  'malaysian',
  'filipino',
  'hawaiian',
  'jamaican',
  'ethiopian',

  // Named sauces and condiments
  'worcestershire',
  'tabasco',
  'sriracha',
  'hoisin',
  'teriyaki',
  'ponzu',
  'tamari',
  'kikkoman',
  'heinz',
  'hellmann',
  "hellmann's",
  'franks',
  "frank's",
  'louisiana',
  'cholula',
  'valentina',
  'tapatío',
  'tapatio',

  // Named wines/spirits used in cooking
  'marsala',
  'madeira',
  'burgundy',
  'bordeaux',
  'champagne',
  'cognac',
  'armagnac',
  'sherry',
  'port',
  'vermouth',
  'kahlúa',
  'kahlua',
  'amaretto',
  'frangelico',
  'grand marnier',
  'cointreau',
  'kirsch',
  'calvados',

  // Named coffee/chocolate brands
  'arabica',
  'robusta',
  'valrhona',
  'callebaut',
  'ghirardelli',
  'guittard',

  // Named ingredients
  'dijon',
  'béarnaise',
  'bearnaise',
  'hollandaise',
  'béchamel',
  'bechamel',
  'bordelaise',
  'provençal',
  'provencal',
  'niçoise',
  'nicoise',
  'florentine',
  'lyonnaise',
  'véronique',
  'veronique',
  'caesar',
  'thousand island',
  'ranch',
  'russian',
  'catalina',
  'danish',
  'polish',
  'english',
  'boston',
  'new england',
  'manhattan',
  'kentucky',
  'tennessee',
  'virginia',
  'carolina',
  'texas',
  'california',
  'louisiana',
]);

// Words that should remain lowercase in title case (except at start)
const LOWERCASE_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'at',
  'by',
  'in',
  'of',
  'on',
  'to',
  'up',
  'as',
  'if',
  'via',
  'vs',
  'vs.',
  'per',
  'with',
]);

/**
 * Check if text appears to be ALL CAPS (common in OCR imports)
 */
export function isAllCaps(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // Only consider alphabetic characters
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false; // Need at least 3 letters to determine

  const upperCount = (letters.match(/[A-Z]/g) || []).length;
  const ratio = upperCount / letters.length;

  // Consider it ALL CAPS if more than 80% of letters are uppercase
  return ratio > 0.8;
}

/**
 * Check if text appears to be all lowercase
 */
export function isAllLowercase(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  // Only consider alphabetic characters
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false; // Need at least 3 letters to determine

  const lowerCount = (letters.match(/[a-z]/g) || []).length;
  const ratio = lowerCount / letters.length;

  // Consider it all lowercase if more than 95% of letters are lowercase
  return ratio > 0.95;
}

/**
 * Check if text needs capitalization fixing (either all caps or all lowercase)
 */
export function needsCapitalizationFix(text: string): boolean {
  return isAllCaps(text) || isAllLowercase(text);
}

/**
 * Convert text to Title Case
 * Used for recipe titles
 */
export function toTitleCase(text: string): string {
  if (!text) return text;

  const words = text.toLowerCase().split(/\s+/);

  return words
    .map((word, index) => {
      // Always capitalize first word
      if (index === 0) {
        return capitalizeWord(word);
      }

      // Check if it's a proper noun
      if (PROPER_NOUNS.has(word.toLowerCase())) {
        return capitalizeWord(word);
      }

      // Keep small words lowercase (except at start)
      if (LOWERCASE_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
      }

      return capitalizeWord(word);
    })
    .join(' ');
}

/**
 * Capitalize a single word, handling hyphens
 */
function capitalizeWord(word: string): string {
  if (!word) return word;

  // Handle hyphenated words
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part) => capitalizeWord(part))
      .join('-');
  }

  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Convert text to Sentence Case
 * Used for description, instructions, and notes
 */
export function toSentenceCase(text: string): string {
  if (!text) return text;

  // Split into sentences (by period, exclamation, question mark followed by space or end)
  const sentences = text.split(/(?<=[.!?])\s+/);

  return sentences
    .map((sentence) => {
      if (!sentence.trim()) return sentence;

      // Lowercase everything first
      let result = sentence.toLowerCase();

      // Capitalize first letter
      result = result.charAt(0).toUpperCase() + result.slice(1);

      // Restore proper nouns
      for (const noun of PROPER_NOUNS) {
        const regex = new RegExp(`\\b${noun}\\b`, 'gi');
        result = result.replace(regex, capitalizeWord(noun));
      }

      return result;
    })
    .join(' ');
}

/**
 * Convert text to Ingredient Case
 * Used for ingredient names - lowercase with proper nouns preserved
 */
export function toIngredientCase(text: string): string {
  if (!text) return text;

  // Lowercase everything first
  let result = text.toLowerCase();

  // Restore proper nouns
  for (const noun of PROPER_NOUNS) {
    const regex = new RegExp(`\\b${noun}\\b`, 'gi');
    result = result.replace(regex, capitalizeWord(noun));
  }

  return result;
}

/**
 * Convert text to Preparation Case
 * Used for preparation notes - all lowercase
 */
export function toPreparationCase(text: string): string {
  if (!text) return text;
  return text.toLowerCase();
}

/**
 * Proposed capitalization change for a field
 */
export interface CapitalizationChange {
  field: 'title' | 'description' | 'instructions' | 'notes' | 'ingredient';
  ingredientIndex?: number;
  ingredientField?: 'name' | 'preparationNotes';
  oldValue: string;
  newValue: string;
}

/**
 * Result of analyzing a recipe for capitalization issues
 */
export interface CapitalizationAnalysis {
  needsFixes: boolean;
  changes: CapitalizationChange[];
}

/**
 * Analyze a recipe and return proposed capitalization changes
 */
export function analyzeCapitalization(recipe: Recipe): CapitalizationAnalysis {
  const changes: CapitalizationChange[] = [];

  // Check title - should be in Title Case
  if (recipe.title && needsCapitalizationFix(recipe.title)) {
    const newValue = toTitleCase(recipe.title);
    if (newValue !== recipe.title) {
      changes.push({
        field: 'title',
        oldValue: recipe.title,
        newValue,
      });
    }
  }

  // Check description - should be in Sentence Case
  if (recipe.description && needsCapitalizationFix(recipe.description)) {
    const newValue = toSentenceCase(recipe.description);
    if (newValue !== recipe.description) {
      changes.push({
        field: 'description',
        oldValue: recipe.description,
        newValue,
      });
    }
  }

  // Check instructions - should be in Sentence Case
  if (recipe.instructions && needsCapitalizationFix(recipe.instructions)) {
    const newValue = toSentenceCase(recipe.instructions);
    if (newValue !== recipe.instructions) {
      changes.push({
        field: 'instructions',
        oldValue: recipe.instructions,
        newValue,
      });
    }
  }

  // Check notes - should be in Sentence Case
  if (recipe.notes && needsCapitalizationFix(recipe.notes)) {
    const newValue = toSentenceCase(recipe.notes);
    if (newValue !== recipe.notes) {
      changes.push({
        field: 'notes',
        oldValue: recipe.notes,
        newValue,
      });
    }
  }

  // Check ingredients
  recipe.ingredients.forEach((ingredient, index) => {
    // Check ingredient name - should be lowercase with proper nouns
    if (ingredient.name && needsCapitalizationFix(ingredient.name)) {
      const newValue = toIngredientCase(ingredient.name);
      if (newValue !== ingredient.name) {
        changes.push({
          field: 'ingredient',
          ingredientIndex: index,
          ingredientField: 'name',
          oldValue: ingredient.name,
          newValue,
        });
      }
    }

    // Check preparation notes - should be lowercase
    if (ingredient.preparationNotes && needsCapitalizationFix(ingredient.preparationNotes)) {
      const newValue = toPreparationCase(ingredient.preparationNotes);
      if (newValue !== ingredient.preparationNotes) {
        changes.push({
          field: 'ingredient',
          ingredientIndex: index,
          ingredientField: 'preparationNotes',
          oldValue: ingredient.preparationNotes,
          newValue,
        });
      }
    }
  });

  return {
    needsFixes: changes.length > 0,
    changes,
  };
}

/**
 * Apply capitalization changes to a recipe
 * Returns a new object with the changes applied (does not mutate original)
 */
export function applyCapitalizationChanges(
  recipe: Recipe,
  changes: CapitalizationChange[]
): Partial<Recipe> {
  const updates: Partial<Recipe> = {};
  let ingredientsUpdated = false;
  const newIngredients = [...recipe.ingredients.map((i) => ({ ...i }))];

  for (const change of changes) {
    switch (change.field) {
      case 'title':
        updates.title = change.newValue;
        break;
      case 'description':
        updates.description = change.newValue;
        break;
      case 'instructions':
        updates.instructions = change.newValue;
        break;
      case 'notes':
        updates.notes = change.newValue;
        break;
      case 'ingredient':
        if (change.ingredientIndex !== undefined && change.ingredientField) {
          ingredientsUpdated = true;
          const ingredient = newIngredients[change.ingredientIndex];
          if (change.ingredientField === 'name') {
            ingredient.name = change.newValue;
          } else if (change.ingredientField === 'preparationNotes') {
            ingredient.preparationNotes = change.newValue;
          }
        }
        break;
    }
  }

  if (ingredientsUpdated) {
    updates.ingredients = newIngredients;
  }

  return updates;
}
