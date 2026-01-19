/**
 * Types for recipe import functionality
 */
import type { NutritionInfo } from './recipe';
import type { ReprocessableField, ExtractedData } from './reprocessing';

/**
 * A parsed ingredient from imported recipe text
 */
export interface ParsedIngredient {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  notes?: string;
  storeSection?: string;
}

/**
 * A parsed recipe from any import source (photo, URL, text)
 */
export interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: ParsedIngredient[];
  instructions: string;
  notes?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  sourceUrl?: string;
  tags?: string[];
  nutrition?: NutritionInfo;
  referenceCookbook?: string;
  referencePageNumber?: number;
}

/**
 * Result of attempting to import/parse a recipe
 */
export interface RecipeImportResult {
  success: boolean;
  recipe?: ParsedRecipe;
  rawText?: string; // Original text for manual correction
  error?: string;
}

/**
 * Import method types
 */
export type ImportMethod = 'photo' | 'url' | 'text' | 'bulk';

/**
 * AI parsing mode
 */
export type AiParsingMode = 'api' | 'manual';

/**
 * Status of an import operation
 */
export type ImportStatus = 'idle' | 'extracting' | 'parsing' | 'ready' | 'error';

/**
 * AI prompt template for recipe parsing
 */
export const RECIPE_PARSE_PROMPT = `Parse the following recipe text into a structured JSON format.
Return ONLY valid JSON with no markdown code blocks or explanation.

Recipe text:
"""
{rawText}
"""

Return JSON in this exact format:
{
  "title": "Recipe Name",
  "description": "Brief description",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    {"name": "ingredient", "quantity": 2, "unit": "cups", "notes": "diced"}
  ],
  "instructions": "Step by step instructions...",
  "notes": "Any additional notes or tips"
}

For ingredients:
- Use standard units: tsp, tbsp, cup, oz, lb, g, kg, ml, L, each
- Include prep notes like "diced", "minced" in the notes field
- If quantity is "to taste" or not specified, set quantity to null
- If no unit applies (e.g., "2 eggs"), set unit to "each" or null

Extract prep time and cook time if mentioned. If not found, omit those fields.`;

/**
 * Generate a prompt for manual paste workflow
 */
export function generateManualParsePrompt(rawText: string): string {
  return RECIPE_PARSE_PROMPT.replace('{rawText}', rawText);
}

/**
 * AI prompt template for vision-based recipe parsing (directly from image)
 */
export const RECIPE_VISION_PROMPT = `Look at this image of a recipe and extract all the information you can see.
The image may contain handwritten text, printed text, or a combination.
Read the recipe carefully and return ONLY valid JSON with no markdown code blocks or explanation.

IMPORTANT: Pay special attention to distinguishing handwritten text from printed text.
If the recipe is primarily printed text with handwritten annotations, modifications, or notes:
- Extract the printed recipe content for the main fields (title, ingredients, instructions)
- Capture ALL handwritten text separately and include it in the "notes" field
- Prefix handwritten content in notes with "Handwritten notes:" followed by the handwritten text
- Handwritten additions might include recipe modifications, tips, corrections, ratings, dates, or personal comments

COOKBOOK AND PAGE DETECTION:
- Look for cookbook titles in the header, footer, or spine of the page
- Look for page numbers anywhere on the page
- If you can identify the cookbook name, include it in the "referenceCookbook" field
- If you can identify the page number, include it in the "referencePageNumber" field

RECIPE TITLE FORMATTING:
- Use proper title case capitalization for the recipe title
- Capitalize the first and last words, and all major words (nouns, verbs, adjectives, adverbs)
- Keep articles (a, an, the), coordinating conjunctions (and, but, or), and short prepositions (in, on, at, to, for, with) lowercase unless they are the first or last word
- Examples: "Chicken with Garlic and Herbs", "Grandma's Apple Pie", "Best Ever Chocolate Chip Cookies"
- If the title is all uppercase or all lowercase, convert it to proper title case

{USER_HINT}

Return JSON in this exact format:
{
  "title": "Roasted Chicken with Garlic and Herbs",
  "description": "Brief description",
  "servings": 4,
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 30,
  "ingredients": [
    {"name": "ingredient", "quantity": 2, "unit": "cups", "notes": "diced"}
  ],
  "instructions": "Step by step instructions...",
  "notes": "Any additional notes or tips. Handwritten notes: [any handwritten text found on the recipe]",
  "nutrition": {
    "calories": 250,
    "protein": 15,
    "carbohydrates": 30,
    "fat": 8,
    "fiber": 4,
    "sodium": 400
  },
  "referenceCookbook": "The Joy of Cooking",
  "referencePageNumber": 142
}

For ingredients:
- Use standard units: tsp, tbsp, cup, oz, lb, g, kg, ml, L, each
- Include prep notes like "diced", "minced" in the notes field
- If quantity is "to taste" or not specified, set quantity to null
- If no unit applies (e.g., "2 eggs"), set unit to "each" or null

For nutrition information:
- If the recipe includes nutrition facts or nutritional information, extract it into the "nutrition" field
- calories: total calories (number only, no units)
- protein: grams of protein (number only)
- carbohydrates: grams of carbs (number only)
- fat: grams of fat (number only)
- fiber: grams of fiber (number only)
- sodium: milligrams of sodium (number only)
- If nutrition information is not present in the image, omit the nutrition field entirely
- Only include nutrition values that are explicitly shown in the image

Extract prep time and cook time if mentioned. If not found, omit those fields.
If you cannot read part of the recipe clearly, make your best interpretation and note any uncertainty in the notes field.`;

/**
 * Build a vision prompt with an optional user hint
 */
export function buildVisionPromptWithHint(hint?: string): string {
  const hintText = hint
    ? `User hint: ${hint}\nPlease consider this hint when extracting cookbook/page information.\n\n`
    : '';

  return RECIPE_VISION_PROMPT.replace('{USER_HINT}', hintText);
}

/**
 * Generate a targeted prompt for reprocessing specific missing fields only
 */
export function generateReprocessingVisionPrompt(
  missingFields: ReprocessableField[],
  hint?: string
): string {
  const fieldInstructions: Record<ReprocessableField, string> = {
    nutrition: `Extract nutrition information if visible:
- calories: total calories (number only)
- protein: grams of protein (number only)
- carbohydrates: grams of carbs (number only)
- fat: grams of fat (number only)
- fiber: grams of fiber (number only)
- sodium: milligrams of sodium (number only)`,
    prepTimeMinutes: 'Extract prep time in minutes if mentioned (number only)',
    cookTimeMinutes: 'Extract cook time in minutes if mentioned (number only)',
    description: 'Extract or generate a brief description of the recipe (1-2 sentences)',
  };

  const instructions = missingFields.map((field) => fieldInstructions[field]).join('\n\n');

  const exampleFields: string[] = [];
  if (missingFields.includes('nutrition')) {
    exampleFields.push(
      '"nutrition": { "calories": 250, "protein": 15, "carbohydrates": 30, "fat": 8, "fiber": 4, "sodium": 400 }'
    );
  }
  if (missingFields.includes('prepTimeMinutes')) {
    exampleFields.push('"prepTimeMinutes": 15');
  }
  if (missingFields.includes('cookTimeMinutes')) {
    exampleFields.push('"cookTimeMinutes": 30');
  }
  if (missingFields.includes('description')) {
    exampleFields.push('"description": "A delicious recipe..."');
  }

  // Always include cookbook/page in examples (extracted opportunistically)
  exampleFields.push('"referenceCookbook": "The Joy of Cooking"');
  exampleFields.push('"referencePageNumber": 142');

  const hintText = hint
    ? `\nUser instructions: ${hint}\nPlease follow these instructions when processing the recipe.\n`
    : '';

  return `Look at this recipe image and extract ONLY the following specific information:

${instructions}

ADDITIONALLY, always attempt to extract cookbook and page information:
- Look for cookbook titles in the header, footer, or spine of the page
- Look for page numbers anywhere on the page
- Include "referenceCookbook" if you can identify the cookbook name
- Include "referencePageNumber" if you can identify the page number
${hintText}
Return ONLY valid JSON with no markdown code blocks. Only include fields you can confidently extract:
{
  ${exampleFields.join(',\n  ')}
}

If you cannot find or confidently extract a value, omit that field from the response.`;
}

/**
 * Parse the response from a reprocessing Vision call
 */
export function parseReprocessingResponse(jsonString: string): ExtractedData | null {
  try {
    let cleanJson = jsonString.trim();

    // Remove markdown code blocks if present
    const jsonMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      cleanJson = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(cleanJson);
    const result: ExtractedData = {};

    if (typeof parsed.prepTimeMinutes === 'number') {
      result.prepTimeMinutes = parsed.prepTimeMinutes;
    }

    if (typeof parsed.cookTimeMinutes === 'number') {
      result.cookTimeMinutes = parsed.cookTimeMinutes;
    }

    if (typeof parsed.description === 'string' && parsed.description.trim()) {
      result.description = parsed.description.trim();
    }

    if (parsed.nutrition && typeof parsed.nutrition === 'object') {
      const n = parsed.nutrition;
      if (typeof n.calories === 'number') {
        result.nutrition = {
          calories: n.calories,
          protein: typeof n.protein === 'number' ? n.protein : 0,
          carbohydrates: typeof n.carbohydrates === 'number' ? n.carbohydrates : 0,
          fat: typeof n.fat === 'number' ? n.fat : 0,
          fiber: typeof n.fiber === 'number' ? n.fiber : 0,
          sodium: typeof n.sodium === 'number' ? n.sodium : 0,
        };
      }
    }

    if (typeof parsed.referenceCookbook === 'string' && parsed.referenceCookbook.trim()) {
      result.referenceCookbook = parsed.referenceCookbook.trim();
    }

    if (typeof parsed.referencePageNumber === 'number') {
      result.referencePageNumber = parsed.referencePageNumber;
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

/**
 * Validate and parse a JSON response from Claude
 */
export function parseClaudeResponse(jsonString: string): RecipeImportResult {
  try {
    // Try to extract JSON from the response (in case it's wrapped in markdown)
    let cleanJson = jsonString.trim();

    // Remove markdown code blocks if present
    const jsonMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      cleanJson = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(cleanJson);

    // Validate required fields
    if (!parsed.title || typeof parsed.title !== 'string') {
      return { success: false, error: 'Missing or invalid title' };
    }

    if (!Array.isArray(parsed.ingredients)) {
      return { success: false, error: 'Missing or invalid ingredients array' };
    }

    if (!parsed.instructions || typeof parsed.instructions !== 'string') {
      return { success: false, error: 'Missing or invalid instructions' };
    }

    // Parse nutrition data if present
    let nutrition: NutritionInfo | undefined = undefined;
    if (parsed.nutrition && typeof parsed.nutrition === 'object') {
      const n = parsed.nutrition;
      // Only include nutrition if at least calories is present
      if (typeof n.calories === 'number') {
        nutrition = {
          calories: n.calories,
          protein: typeof n.protein === 'number' ? n.protein : 0,
          carbohydrates: typeof n.carbohydrates === 'number' ? n.carbohydrates : 0,
          fat: typeof n.fat === 'number' ? n.fat : 0,
          fiber: typeof n.fiber === 'number' ? n.fiber : 0,
          sodium: typeof n.sodium === 'number' ? n.sodium : 0,
        };
      }
    }

    // Normalize the parsed recipe
    const recipe: ParsedRecipe = {
      title: parsed.title,
      description: parsed.description || undefined,
      ingredients: parsed.ingredients.map((ing: ParsedIngredient) => ({
        name: ing.name || '',
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        notes: ing.notes || undefined,
        storeSection: ing.storeSection || 'other',
      })),
      instructions: parsed.instructions,
      notes: parsed.notes || undefined,
      servings: parsed.servings || undefined,
      prepTimeMinutes: parsed.prepTimeMinutes || undefined,
      cookTimeMinutes: parsed.cookTimeMinutes || undefined,
      sourceUrl: parsed.sourceUrl || undefined,
      tags: parsed.tags || undefined,
      nutrition,
      referenceCookbook:
        typeof parsed.referenceCookbook === 'string' && parsed.referenceCookbook.trim()
          ? parsed.referenceCookbook.trim()
          : undefined,
      referencePageNumber:
        typeof parsed.referencePageNumber === 'number' ? parsed.referencePageNumber : undefined,
    };

    return { success: true, recipe };
  } catch (e) {
    return {
      success: false,
      error: `Failed to parse JSON response: ${e instanceof Error ? e.message : 'Unknown error'}`,
      rawText: jsonString,
    };
  }
}
