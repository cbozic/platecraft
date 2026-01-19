import { settingsRepository, recipeRepository } from '@/db';
import type { Recipe, RecipeImage, NutritionInfo, RecipeFormData } from '@/types';
import type {
  ReprocessableField,
  ReprocessingConfig,
  FieldChange,
  RecipeReprocessingResult,
  ExtractedData,
  ApprovedChanges,
} from '@/types/reprocessing';
import { imageService } from './imageService';
import { generateReprocessingVisionPrompt, parseReprocessingResponse } from '@/types/import';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Rate limiting delay between Vision API calls (ms)
const VISION_API_DELAY = 1000;

// Regex patterns for extracting data from notes
const PATTERNS = {
  // Prep time: "prep: 15 min", "prep time: 15 minutes", "15 min prep"
  prepTime: /(?:prep(?:\s*time)?[:\s]+)?(\d+)\s*(?:min(?:ute)?s?)(?:\s+prep)?/i,

  // Cook time: "cook: 30 min", "cooking time: 30 minutes", "bake for 30 min"
  cookTime: /(?:cook(?:ing)?(?:\s*time)?[:\s]+|bake\s+(?:for\s+)?)(\d+)\s*(?:min(?:ute)?s?)/i,

  // Calories: "250 cal", "calories: 250", "250 kcal"
  calories: /(?:calories?[:\s]+)?(\d+)\s*(?:cal(?:ories)?|kcal)/i,

  // Protein: "15g protein", "protein: 15g"
  protein: /(?:protein[:\s]+)?(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:protein)?/i,

  // Carbs: "30g carbs", "carbohydrates: 30g"
  carbs: /(?:carb(?:ohydrate)?s?[:\s]+)?(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:carb(?:ohydrate)?s?)?/i,

  // Fat: "8g fat", "fat: 8g"
  fat: /(?:fat[:\s]+)?(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:fat)?/i,

  // Fiber: "4g fiber"
  fiber: /(?:fiber[:\s]+)?(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*(?:fiber)?/i,

  // Sodium: "400mg sodium"
  sodium: /(?:sodium[:\s]+)?(\d+)\s*mg\s*(?:sodium)?/i,

  // Cookbook: "Cookbook: American Heart Association", "Source: Joy of Cooking"
  cookbook: /(?:cookbook|source|from)[:\s]+(.+?)(?:\s*(?:page|p\.?|pg\.?)\s*\d+|\s*$)/i,

  // Page number: "page 142", "p. 142", "pg 142"
  pageNumber: /(?:page|p\.?|pg\.?)\s*(\d+)/i,
};

export const recipeReprocessingService = {
  /**
   * Check if a recipe has any of the specified fields blank
   */
  getBlankFields(recipe: Recipe, config: ReprocessingConfig): ReprocessableField[] {
    const blankFields: ReprocessableField[] = [];

    for (const field of config.fields) {
      if (this.isFieldBlank(recipe, field)) {
        blankFields.push(field);
      }
    }

    return blankFields;
  },

  /**
   * Check if a specific field is blank
   */
  isFieldBlank(recipe: Recipe, field: ReprocessableField): boolean {
    switch (field) {
      case 'nutrition':
        return !recipe.nutrition;
      case 'prepTimeMinutes':
        return recipe.prepTimeMinutes === undefined || recipe.prepTimeMinutes === null;
      case 'cookTimeMinutes':
        return recipe.cookTimeMinutes === undefined || recipe.cookTimeMinutes === null;
      case 'description':
        return !recipe.description || recipe.description.trim() === '';
      default:
        return false;
    }
  },

  /**
   * Find source photo(s) in a recipe's images array
   * Source photos have captions starting with "Source photo"
   */
  findSourcePhotos(recipe: Recipe): RecipeImage[] {
    return recipe.images.filter((image) => {
      if (!image.caption) return false;
      return image.caption.toLowerCase().startsWith('source photo');
    });
  },

  /**
   * Extract data from Notes field using regex patterns
   */
  extractFromNotes(notes: string | undefined, fields: ReprocessableField[]): ExtractedData {
    const extracted: ExtractedData = {};

    if (!notes || notes.trim() === '') {
      return extracted;
    }

    for (const field of fields) {
      switch (field) {
        case 'prepTimeMinutes': {
          const match = notes.match(PATTERNS.prepTime);
          if (match) {
            extracted.prepTimeMinutes = parseInt(match[1], 10);
          }
          break;
        }
        case 'cookTimeMinutes': {
          const match = notes.match(PATTERNS.cookTime);
          if (match) {
            extracted.cookTimeMinutes = parseInt(match[1], 10);
          }
          break;
        }
        case 'nutrition': {
          const nutrition = this.extractNutritionFromText(notes);
          if (nutrition) {
            extracted.nutrition = nutrition;
          }
          break;
        }
        case 'description': {
          // Can't reliably extract description from notes
          // Description requires contextual understanding
          break;
        }
      }
    }

    // Always attempt to extract cookbook and page number (opportunistically)
    const cookbookMatch = notes.match(PATTERNS.cookbook);
    if (cookbookMatch && cookbookMatch[1]) {
      extracted.referenceCookbook = cookbookMatch[1].trim();
    }

    const pageMatch = notes.match(PATTERNS.pageNumber);
    if (pageMatch && pageMatch[1]) {
      extracted.referencePageNumber = parseInt(pageMatch[1], 10);
    }

    return extracted;
  },

  /**
   * Try to extract nutrition info from text
   * Returns NutritionInfo only if at least calories is found
   */
  extractNutritionFromText(text: string): NutritionInfo | undefined {
    const caloriesMatch = text.match(PATTERNS.calories);
    if (!caloriesMatch) {
      return undefined;
    }

    const proteinMatch = text.match(PATTERNS.protein);
    const carbsMatch = text.match(PATTERNS.carbs);
    const fatMatch = text.match(PATTERNS.fat);
    const fiberMatch = text.match(PATTERNS.fiber);
    const sodiumMatch = text.match(PATTERNS.sodium);

    return {
      calories: parseInt(caloriesMatch[1], 10),
      protein: proteinMatch ? parseFloat(proteinMatch[1]) : 0,
      carbohydrates: carbsMatch ? parseFloat(carbsMatch[1]) : 0,
      fat: fatMatch ? parseFloat(fatMatch[1]) : 0,
      fiber: fiberMatch ? parseFloat(fiberMatch[1]) : 0,
      sodium: sodiumMatch ? parseInt(sodiumMatch[1], 10) : 0,
    };
  },

  /**
   * Re-analyze source photo with Claude Vision for specific missing fields
   */
  async reanalyzeWithVision(
    sourcePhotos: RecipeImage[],
    missingFields: ReprocessableField[],
    hint?: string
  ): Promise<ExtractedData | null> {
    const apiKey = await settingsRepository.getAnthropicApiKey();

    if (!apiKey) {
      return null;
    }

    if (sourcePhotos.length === 0) {
      return null;
    }

    try {
      // Build content array with all source images
      const contentParts: Array<
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
        | { type: 'text'; text: string }
      > = [];

      for (const photo of sourcePhotos) {
        let base64Data: string;
        let mediaType = 'image/jpeg';

        if (typeof photo.data === 'string') {
          // Already a data URL or base64
          if (photo.data.startsWith('data:')) {
            const match = photo.data.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              mediaType = match[1];
              base64Data = match[2];
            } else {
              continue;
            }
          } else {
            base64Data = photo.data;
          }
        } else {
          // It's a Blob
          const base64Full = await imageService.blobToBase64(photo.data);
          const match = base64Full.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mediaType = match[1];
            base64Data = match[2];
          } else {
            continue;
          }
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

      if (contentParts.length === 0) {
        return null;
      }

      // Add the targeted prompt (with optional hint)
      const prompt = generateReprocessingVisionPrompt(missingFields, hint);
      contentParts.push({
        type: 'text',
        text: prompt,
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
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: contentParts,
            },
          ],
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return null;
      }

      return parseReprocessingResponse(content);
    } catch {
      return null;
    }
  },

  /**
   * Process a single recipe and return proposed changes
   */
  async processRecipe(
    recipe: Recipe,
    config: ReprocessingConfig,
    hint?: string
  ): Promise<RecipeReprocessingResult> {
    const result: RecipeReprocessingResult = {
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      status: 'processing',
      hasBlankFields: false,
      blankFields: [],
      proposedChanges: [],
      hasSourcePhoto: false,
    };

    // Find blank fields
    const blankFields = this.getBlankFields(recipe, config);
    result.blankFields = blankFields;
    result.hasBlankFields = blankFields.length > 0;

    // Check for source photos
    const sourcePhotos = this.findSourcePhotos(recipe);
    result.hasSourcePhoto = sourcePhotos.length > 0;

    // Track which fields still need data
    let remainingFields = [...blankFields];
    const proposedChanges: FieldChange[] = [];

    // Step 1: Try to extract from notes (always, even if no blank fields)
    if (recipe.notes) {
      const notesData = this.extractFromNotes(recipe.notes, remainingFields);

      for (const field of remainingFields) {
        const value = this.getExtractedValue(notesData, field);
        if (value !== undefined) {
          proposedChanges.push({
            field,
            oldValue: undefined,
            newValue: value,
            source: 'notes',
          });
          remainingFields = remainingFields.filter((f) => f !== field);
        }
      }

      // Extract cookbook/page opportunistically from notes
      if (notesData.referenceCookbook) {
        result.extractedCookbook = notesData.referenceCookbook;
      }
      if (notesData.referencePageNumber) {
        result.extractedPageNumber = notesData.referencePageNumber;
      }
    }

    // Step 2: If fields remain and source photo exists, try vision
    if (remainingFields.length > 0 && sourcePhotos.length > 0) {
      const visionData = await this.reanalyzeWithVision(sourcePhotos, remainingFields, hint);

      if (visionData) {
        for (const field of remainingFields) {
          const value = this.getExtractedValue(visionData, field);
          if (value !== undefined) {
            proposedChanges.push({
              field,
              oldValue: undefined,
              newValue: value,
              source: 'vision',
            });
          }
        }

        // Extract cookbook/page opportunistically
        if (visionData.referenceCookbook) {
          result.extractedCookbook = visionData.referenceCookbook;
        }
        if (visionData.referencePageNumber) {
          result.extractedPageNumber = visionData.referencePageNumber;
        }
      }
    }

    result.proposedChanges = proposedChanges;
    const hasExtractedData =
      proposedChanges.length > 0 || result.extractedCookbook || result.extractedPageNumber;
    result.status = hasExtractedData ? 'success' : 'skipped';

    return result;
  },

  /**
   * Get the value for a specific field from extracted data
   */
  getExtractedValue(data: ExtractedData, field: ReprocessableField): unknown {
    switch (field) {
      case 'nutrition':
        return data.nutrition;
      case 'prepTimeMinutes':
        return data.prepTimeMinutes;
      case 'cookTimeMinutes':
        return data.cookTimeMinutes;
      case 'description':
        return data.description;
      default:
        return undefined;
    }
  },

  /**
   * Apply approved changes to recipes
   */
  async applyChanges(
    changes: ApprovedChanges,
    results?: RecipeReprocessingResult[]
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const [recipeId, fieldChanges] of changes.entries()) {
      try {
        const updates: Partial<RecipeFormData> = {};

        for (const change of fieldChanges) {
          switch (change.field) {
            case 'nutrition':
              updates.nutrition = change.newValue as NutritionInfo;
              break;
            case 'prepTimeMinutes':
              updates.prepTimeMinutes = change.newValue as number;
              break;
            case 'cookTimeMinutes':
              updates.cookTimeMinutes = change.newValue as number;
              break;
            case 'description':
              updates.description = change.newValue as string;
              break;
          }
        }

        // Apply cookbook/page if extracted
        if (results) {
          const result = results.find((r) => r.recipeId === recipeId);
          if (result) {
            if (result.extractedCookbook) {
              updates.referenceCookbook = result.extractedCookbook;
            }
            if (result.extractedPageNumber) {
              updates.referencePageNumber = result.extractedPageNumber;
            }
          }
        }

        // Only update if we have changes to apply
        if (Object.keys(updates).length > 0) {
          await recipeRepository.update(recipeId, updates);
          success++;
        }
      } catch (error) {
        console.error(`Failed to update recipe ${recipeId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  },

  /**
   * Delay helper for rate limiting
   */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Get the rate limiting delay
   */
  getVisionApiDelay(): number {
    return VISION_API_DELAY;
  },
};
