import { settingsRepository } from '@/db';
import type { ParsedRecipe, RecipeImportResult, MeasurementUnit, StoreSection, RecipeImage, NutritionInfo } from '@/types';
import { UNIT_INFO } from '@/types/units';
import { generateManualParsePrompt, parseClaudeResponse, buildVisionPromptWithHint } from '@/types/import';
import { imageService } from './imageService';

// Valid store sections
const VALID_STORE_SECTIONS: StoreSection[] = [
  'produce', 'dairy', 'meat_seafood', 'bakery', 'frozen',
  'canned_goods', 'dry_goods', 'condiments', 'snacks', 'beverages',
  'household', 'other'
];

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

export const recipeImportService = {
  /**
   * Check if API mode is available (API key is configured)
   */
  async isApiModeAvailable(): Promise<boolean> {
    return settingsRepository.hasAnthropicApiKey();
  },

  /**
   * Get the preferred import mode from settings
   */
  async getPreferredMode(): Promise<'api' | 'manual'> {
    const hasKey = await this.isApiModeAvailable();
    if (!hasKey) return 'manual';
    return settingsRepository.getPreferredImportMode();
  },

  /**
   * Parse recipe text using Claude API (requires API key)
   */
  async parseWithApi(rawText: string): Promise<RecipeImportResult> {
    const apiKey = await settingsRepository.getAnthropicApiKey();

    if (!apiKey) {
      return {
        success: false,
        error: 'No API key configured. Please add your Anthropic API key in Settings.',
        rawText,
      };
    }

    const prompt = generateManualParsePrompt(rawText);

    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `API request failed: ${response.status}`;

        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid API key. Please check your API key in Settings.',
            rawText,
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error: 'Rate limit exceeded. Please try again later or use manual mode.',
            rawText,
          };
        }

        return {
          success: false,
          error: errorMessage,
          rawText,
        };
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return {
          success: false,
          error: 'No response received from API',
          rawText,
        };
      }

      return parseClaudeResponse(content);
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rawText,
      };
    }
  },

  /**
   * Generate a prompt for manual paste workflow
   */
  getManualPrompt(rawText: string): string {
    return generateManualParsePrompt(rawText);
  },

  /**
   * Parse a response pasted from Claude (manual workflow)
   */
  parseManualResponse(jsonResponse: string): RecipeImportResult {
    return parseClaudeResponse(jsonResponse);
  },

  /**
   * Parse a recipe directly from images using Claude Vision
   * Accepts multiple images which are all sent to Claude for analysis
   */
  async parseWithVision(imageBlobs: Blob | Blob[], hint?: string): Promise<RecipeImportResult> {
    const apiKey = await settingsRepository.getAnthropicApiKey();

    if (!apiKey) {
      return {
        success: false,
        error: 'No API key configured. Please add your Anthropic API key in Settings.',
      };
    }

    // Normalize to array
    const blobs = Array.isArray(imageBlobs) ? imageBlobs : [imageBlobs];

    if (blobs.length === 0) {
      return {
        success: false,
        error: 'No images provided.',
      };
    }

    try {
      // Build content array with all images
      const contentParts: Array<{ type: 'image'; source: { type: 'base64'; media_type: string; data: string } } | { type: 'text'; text: string }> = [];

      for (const blob of blobs) {
        // Convert blob to base64
        const base64 = await imageService.blobToBase64(blob);
        // Remove the data URL prefix to get just the base64 data
        const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, '');

        // Determine media type
        let mediaType = 'image/jpeg';
        if (blob.type) {
          mediaType = blob.type;
        }

        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Data,
          },
        });
      }

      // Add the text prompt at the end (with optional hint)
      contentParts.push({
        type: 'text',
        text: buildVisionPromptWithHint(hint),
      });

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: contentParts,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `API request failed: ${response.status}`;

        if (response.status === 401) {
          return {
            success: false,
            error: 'Invalid API key. Please check your API key in Settings.',
          };
        }

        if (response.status === 429) {
          return {
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
          };
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return {
          success: false,
          error: 'No response received from API',
        };
      }

      return parseClaudeResponse(content);
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  /**
   * Validate and convert a unit string to MeasurementUnit
   */
  validateUnit(unit: string | null | undefined): MeasurementUnit | null {
    if (!unit) return null;
    const normalizedUnit = unit.toLowerCase().trim();
    // Check if it's a valid unit
    if (normalizedUnit in UNIT_INFO) {
      return normalizedUnit as MeasurementUnit;
    }
    // Try common aliases
    const aliases: Record<string, MeasurementUnit> = {
      'teaspoon': 'tsp',
      'teaspoons': 'tsp',
      'tablespoon': 'tbsp',
      'tablespoons': 'tbsp',
      'cups': 'cup',
      'ounce': 'oz',
      'ounces': 'oz',
      'pound': 'lb',
      'pounds': 'lb',
      'gram': 'g',
      'grams': 'g',
      'kilogram': 'kg',
      'kilograms': 'kg',
      'milliliter': 'ml',
      'milliliters': 'ml',
      'liter': 'l',
      'liters': 'l',
      'quarts': 'quart',
      'pints': 'pint_us',
      'pint': 'pint_us',
      'gallons': 'gallon_us',
      'gallon': 'gallon_us',
      'cloves': 'clove',
      'slices': 'slice',
      'bunches': 'bunch',
      'cans': 'can',
      'packages': 'package',
    };
    if (normalizedUnit in aliases) {
      return aliases[normalizedUnit];
    }
    // Return null for unrecognized units
    return null;
  },

  /**
   * Validate and convert a store section string
   */
  validateStoreSection(section: string | null | undefined): StoreSection {
    if (!section) return 'other';
    const normalized = section.toLowerCase().trim().replace(/\s+/g, '_');
    if (VALID_STORE_SECTIONS.includes(normalized as StoreSection)) {
      return normalized as StoreSection;
    }
    return 'other';
  },

  /**
   * Convert a ParsedRecipe to the format needed for recipe creation
   */
  convertToRecipeFormData(parsed: ParsedRecipe, sourceImages?: RecipeImage[]): {
    title: string;
    description: string;
    ingredients: Array<{
      name: string;
      quantity: number | null;
      unit: MeasurementUnit | null;
      preparationNotes?: string;
      isOptional: boolean;
      storeSection: StoreSection;
    }>;
    instructions: string;
    notes: string;
    tags: string[];
    servings: number;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    sourceUrl: string;
    referenceCookbook: string;
    referencePageNumber: number | null;
    referenceOther: string;
    nutrition: NutritionInfo | null;
    images?: RecipeImage[];
  } {
    return {
      title: parsed.title,
      description: parsed.description || '',
      ingredients: parsed.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity ?? null,
        unit: this.validateUnit(ing.unit),
        preparationNotes: ing.notes || undefined,
        isOptional: false,
        storeSection: this.validateStoreSection(ing.storeSection),
      })),
      instructions: parsed.instructions,
      notes: parsed.notes || '',
      tags: parsed.tags || [],
      servings: parsed.servings || 4,
      prepTimeMinutes: parsed.prepTimeMinutes || null,
      cookTimeMinutes: parsed.cookTimeMinutes || null,
      sourceUrl: parsed.sourceUrl || '',
      referenceCookbook: parsed.referenceCookbook || '',
      referencePageNumber: parsed.referencePageNumber || null,
      referenceOther: '',
      nutrition: parsed.nutrition || null,
      images: sourceImages && sourceImages.length > 0 ? sourceImages : undefined,
    };
  },
};
