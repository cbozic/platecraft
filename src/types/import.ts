/**
 * Types for recipe import functionality
 */

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
export type ImportMethod = 'photo' | 'url' | 'text';

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

Extract prep time and cook time if mentioned. If not found, omit those fields.
If you cannot read part of the recipe clearly, make your best interpretation and note any uncertainty in the notes field.`;

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
