import { db } from '@/db/database';
import {
  recipeRepository,
  tagRepository,
  shoppingRepository,
  settingsRepository,
} from '@/db';
import type { PlatecraftExport, Tag, Recipe, ExternalCalendar } from '@/types';
import { CURRENT_EXPORT_VERSION } from '@/types';
import { imageService } from './imageService';
import { cryptoService, type EncryptedExport } from './cryptoService';

export interface ExportOptions {
  includeImages: boolean;
  chunked: boolean;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeImages: true,
  chunked: false,
};

// Process images in batches of this size to reduce peak memory usage
const CHUNK_SIZE = 5;

export interface ImportResult {
  success: boolean;
  errors: string[];
  imported: {
    recipes: number;
    tags: number;
    mealPlans: number;
    dayNotes: number;
    recurringMeals: number;
    shoppingLists: number;
  };
}

export const dataService = {
  /**
   * Check if Web Share API with files is supported (iOS 15+, some Android)
   */
  canShareFiles(): boolean {
    return 'share' in navigator && 'canShare' in navigator;
  },

  /**
   * Share export via Web Share API (iOS Files, AirDrop, iCloud, etc.)
   * Returns true if shared successfully, false if share not supported
   */
  async shareExport(password?: string, options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<boolean> {
    const data = await this.exportAllData(options);
    const json = JSON.stringify(data, null, 2);

    let content: string;
    if (password) {
      const encrypted = await cryptoService.encryptExport(json, password);
      content = JSON.stringify(encrypted, null, 2);
    } else {
      content = json;
    }

    const date = new Date().toISOString().split('T')[0];
    const file = new File([content], `platecraft-backup-${date}.json`, {
      type: 'application/json',
    });

    // Check if the browser can share this file
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        // Track the backup date for reminder purposes
        await settingsRepository.setLastBackupDate(new Date());
        return true;
      } catch (err) {
        // User cancelled or share failed - check if it was a user cancel
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled, don't treat as error
          return false;
        }
        throw err;
      }
    }

    return false; // Share not supported, caller should fall back to download
  },

  /**
   * Export all application data as a JSON object
   * Decrypts sensitive fields so export contains plaintext
   * @param options - Export options (includeImages, chunked)
   */
  async exportAllData(options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<PlatecraftExport> {
    const [
      recipes,
      allTags,
      plannedMeals,
      dayNotes,
      recurringMeals,
      shoppingLists,
      rawSettings,
      rawExternalCalendars,
    ] = await Promise.all([
      recipeRepository.getAll(),
      tagRepository.getAll(),
      db.plannedMeals.toArray(),
      db.dayNotes.toArray(),
      db.recurringMeals.toArray(),
      shoppingRepository.getAllLists(),
      settingsRepository.get(),
      db.externalCalendars.toArray(),
    ]);

    // Decrypt API keys from settings (they're stored encrypted)
    const settings = { ...rawSettings };
    if (settings.anthropicApiKey) {
      settings.anthropicApiKey = await settingsRepository.getAnthropicApiKey();
    }
    if (settings.usdaApiKey) {
      settings.usdaApiKey = await settingsRepository.getUsdaApiKey();
    }

    // Decrypt calendar URLs
    const externalCalendars = await Promise.all(
      rawExternalCalendars.map(async (calendar): Promise<ExternalCalendar> => {
        if (calendar.icalUrl) {
          try {
            const parsed = JSON.parse(calendar.icalUrl);
            if (cryptoService.isEncryptedField(parsed)) {
              const decryptedUrl = await cryptoService.decryptField(parsed);
              return { ...calendar, icalUrl: decryptedUrl };
            }
          } catch {
            // Not encrypted, use as-is
          }
        }
        return calendar;
      })
    );

    // Only export custom tags (system tags are rebuilt on import)
    const customTags = allTags.filter((tag) => !tag.isSystem);

    // Process recipes based on export options
    let processedRecipes: Recipe[];

    if (!options.includeImages) {
      // Export without images - strip image data but keep metadata
      processedRecipes = recipes.map((recipe) => ({
        ...recipe,
        images: [], // Remove all images
      }));
    } else if (options.chunked) {
      // Chunked export - process images in batches to reduce peak memory
      processedRecipes = await this.processRecipesInChunks(recipes);
    } else {
      // Standard export - convert all images to Base64 at once
      processedRecipes = await Promise.all(
        recipes.map(async (recipe) => {
          if (recipe.images && recipe.images.length > 0) {
            const imagesWithBase64 = await imageService.prepareImagesForExport(recipe.images);
            return { ...recipe, images: imagesWithBase64 };
          }
          return recipe;
        })
      );
    }

    return {
      version: CURRENT_EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      recipes: processedRecipes,
      customTags,
      mealPlans: plannedMeals,
      dayNotes,
      recurringMeals,
      shoppingLists,
      settings,
      externalCalendars,
    };
  },

  /**
   * Process recipes in chunks to reduce peak memory usage.
   * Converts images to Base64 in small batches, allowing garbage collection between batches.
   */
  async processRecipesInChunks(recipes: Recipe[]): Promise<Recipe[]> {
    const processedRecipes: Recipe[] = [];

    for (let i = 0; i < recipes.length; i += CHUNK_SIZE) {
      const chunk = recipes.slice(i, i + CHUNK_SIZE);

      // Process this chunk of recipes
      const processedChunk = await Promise.all(
        chunk.map(async (recipe) => {
          if (recipe.images && recipe.images.length > 0) {
            const imagesWithBase64 = await imageService.prepareImagesForExport(recipe.images);
            return { ...recipe, images: imagesWithBase64 };
          }
          return recipe;
        })
      );

      processedRecipes.push(...processedChunk);

      // Yield to the event loop to allow garbage collection and prevent UI freeze
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return processedRecipes;
  },

  /**
   * Download export data as a JSON file (unencrypted)
   */
  async downloadExport(options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<void> {
    const data = await this.exportAllData(options);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const suffix = !options.includeImages ? '-no-images' : '';
    const filename = `platecraft-backup-${date}${suffix}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Download export data as an encrypted JSON file
   */
  async downloadEncryptedExport(password: string, options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<void> {
    const data = await this.exportAllData(options);
    const json = JSON.stringify(data, null, 2);

    // Encrypt the entire JSON with the user's password
    const encrypted = await cryptoService.encryptExport(json, password);

    const blob = new Blob([JSON.stringify(encrypted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const suffix = !options.includeImages ? '-no-images' : '';
    const filename = `platecraft-backup-${date}${suffix}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Track the backup date for reminder purposes
    await settingsRepository.setLastBackupDate(new Date());
  },

  /**
   * Check if data is an encrypted export
   */
  isEncryptedExport(data: unknown): data is EncryptedExport {
    return cryptoService.isEncryptedExport(data);
  },

  /**
   * Validate import data structure
   */
  validateImportData(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Invalid data format: expected JSON object'] };
    }

    const obj = data as Record<string, unknown>;

    // Check version
    if (!obj.version || typeof obj.version !== 'string') {
      errors.push('Missing or invalid version field');
    }

    // Check required arrays
    const requiredArrays = ['recipes', 'customTags', 'mealPlans', 'shoppingLists'];
    for (const field of requiredArrays) {
      if (obj[field] !== undefined && !Array.isArray(obj[field])) {
        errors.push(`Invalid ${field}: expected array`);
      }
    }

    // Validate recipes have required fields
    if (Array.isArray(obj.recipes)) {
      for (let i = 0; i < obj.recipes.length; i++) {
        const recipe = obj.recipes[i] as Record<string, unknown>;
        if (!recipe.id || typeof recipe.id !== 'string') {
          errors.push(`Recipe at index ${i}: missing or invalid id`);
        }
        if (!recipe.title || typeof recipe.title !== 'string') {
          errors.push(`Recipe at index ${i}: missing or invalid title`);
        }
      }
    }

    // Validate custom tags
    if (Array.isArray(obj.customTags)) {
      for (let i = 0; i < obj.customTags.length; i++) {
        const tag = obj.customTags[i] as Record<string, unknown>;
        if (!tag.id || typeof tag.id !== 'string') {
          errors.push(`Custom tag at index ${i}: missing or invalid id`);
        }
        if (!tag.name || typeof tag.name !== 'string') {
          errors.push(`Custom tag at index ${i}: missing or invalid name`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Import data from a JSON export (merge mode - adds to existing data)
   */
  async importData(data: PlatecraftExport, mode: 'merge' | 'replace' = 'merge'): Promise<ImportResult> {
    const errors: string[] = [];
    const imported = {
      recipes: 0,
      tags: 0,
      mealPlans: 0,
      dayNotes: 0,
      recurringMeals: 0,
      shoppingLists: 0,
    };

    try {
      // If replace mode, clear existing data first
      if (mode === 'replace') {
        await this.clearAllData(false); // Don't clear settings
      }

      // Import custom tags first (recipes may reference them)
      if (data.customTags && data.customTags.length > 0) {
        const existingTags = await tagRepository.getAll();
        const existingNames = new Set(existingTags.map((t) => t.name.toLowerCase()));

        for (const tag of data.customTags) {
          // Skip if tag with same name exists
          if (!existingNames.has(tag.name.toLowerCase())) {
            try {
              // Ensure it's marked as custom tag
              const tagToImport: Tag = {
                ...tag,
                isSystem: false,
              };
              await db.tags.add(tagToImport);
              imported.tags++;
              existingNames.add(tag.name.toLowerCase());
            } catch (err) {
              errors.push(`Failed to import tag "${tag.name}": ${err}`);
            }
          }
        }
      }

      // Import recipes
      if (data.recipes && data.recipes.length > 0) {
        const existingRecipes = await recipeRepository.getAll();
        const existingIds = new Set(existingRecipes.map((r) => r.id));

        for (const recipe of data.recipes) {
          if (mode === 'merge' && existingIds.has(recipe.id)) {
            // Skip existing recipes in merge mode
            continue;
          }

          try {
            // Ensure dates are Date objects
            const recipeToImport: Recipe = {
              ...recipe,
              createdAt: new Date(recipe.createdAt),
              updatedAt: new Date(recipe.updatedAt),
            };

            // Convert Base64 images back to Blobs
            if (recipeToImport.images && recipeToImport.images.length > 0) {
              recipeToImport.images = imageService.restoreImagesFromImport(recipeToImport.images);
            }

            await db.recipes.put(recipeToImport);
            imported.recipes++;
          } catch (err) {
            errors.push(`Failed to import recipe "${recipe.title}": ${err}`);
          }
        }
      }

      // Import meal plans
      if (data.mealPlans && data.mealPlans.length > 0) {
        const existingMeals = await db.plannedMeals.toArray();
        const existingIds = new Set(existingMeals.map((m) => m.id));

        for (const meal of data.mealPlans) {
          if (mode === 'merge' && existingIds.has(meal.id)) {
            continue;
          }

          try {
            await db.plannedMeals.put(meal);
            imported.mealPlans++;
          } catch (err) {
            errors.push(`Failed to import meal plan: ${err}`);
          }
        }
      }

      // Import day notes
      if (data.dayNotes && data.dayNotes.length > 0) {
        const existingNotes = await db.dayNotes.toArray();
        const existingIds = new Set(existingNotes.map((n) => n.id));

        for (const note of data.dayNotes) {
          if (mode === 'merge' && existingIds.has(note.id)) {
            continue;
          }

          try {
            await db.dayNotes.put(note);
            imported.dayNotes++;
          } catch (err) {
            errors.push(`Failed to import day note: ${err}`);
          }
        }
      }

      // Import recurring meals
      if (data.recurringMeals && data.recurringMeals.length > 0) {
        const existingRecurring = await db.recurringMeals.toArray();
        const existingIds = new Set(existingRecurring.map((r) => r.id));

        for (const recurring of data.recurringMeals) {
          if (mode === 'merge' && existingIds.has(recurring.id)) {
            continue;
          }

          try {
            await db.recurringMeals.put(recurring);
            imported.recurringMeals++;
          } catch (err) {
            errors.push(`Failed to import recurring meal: ${err}`);
          }
        }
      }

      // Import shopping lists
      if (data.shoppingLists && data.shoppingLists.length > 0) {
        const existingLists = await shoppingRepository.getAllLists();
        const existingIds = new Set(existingLists.map((l) => l.id));

        for (const list of data.shoppingLists) {
          if (mode === 'merge' && existingIds.has(list.id)) {
            continue;
          }

          try {
            // Ensure dates are Date objects
            const listToImport = {
              ...list,
              dateRangeStart: new Date(list.dateRangeStart),
              dateRangeEnd: new Date(list.dateRangeEnd),
              createdAt: new Date(list.createdAt),
              updatedAt: new Date(list.updatedAt),
            };
            await db.shoppingLists.put(listToImport);
            imported.shoppingLists++;
          } catch (err) {
            errors.push(`Failed to import shopping list "${list.name}": ${err}`);
          }
        }
      }

      // Import external calendars
      if (data.externalCalendars && data.externalCalendars.length > 0) {
        const existingCalendars = await db.externalCalendars.toArray();
        const existingIds = new Set(existingCalendars.map((c) => c.id));

        for (const calendar of data.externalCalendars) {
          if (mode === 'merge' && existingIds.has(calendar.id)) {
            continue;
          }

          try {
            // Re-encrypt the icalUrl for storage (it's decrypted in the export)
            const calendarToImport = { ...calendar };
            if (calendarToImport.icalUrl) {
              const encrypted = await cryptoService.encryptField(calendarToImport.icalUrl);
              calendarToImport.icalUrl = JSON.stringify(encrypted);
            }

            // Convert date fields to Date objects
            if (calendarToImport.lastSynced) {
              calendarToImport.lastSynced = new Date(calendarToImport.lastSynced);
            }
            if (calendarToImport.lastImported) {
              calendarToImport.lastImported = new Date(calendarToImport.lastImported);
            }

            await db.externalCalendars.put(calendarToImport);
          } catch (err) {
            errors.push(`Failed to import calendar "${calendar.name}": ${err}`);
          }
        }
      }

      // Import settings (only in replace mode or if specified)
      if (mode === 'replace' && data.settings) {
        try {
          await settingsRepository.update(data.settings);
        } catch (err) {
          errors.push(`Failed to import settings: ${err}`);
        }
      }

      return {
        success: errors.length === 0,
        errors,
        imported,
      };
    } catch (err) {
      return {
        success: false,
        errors: [`Import failed: ${err}`],
        imported,
      };
    }
  },

  /**
   * Read and parse a JSON file (returns raw parsed JSON, may be encrypted)
   */
  async readImportFile(file: File): Promise<PlatecraftExport | EncryptedExport> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          resolve(data);
        } catch {
          reject(new Error('Failed to parse JSON file'));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file);
    });
  },

  /**
   * Decrypt an encrypted export file with the provided password
   */
  async decryptImportData(encryptedData: EncryptedExport, password: string): Promise<PlatecraftExport> {
    const json = await cryptoService.decryptExport(encryptedData, password);
    return JSON.parse(json);
  },

  /**
   * Clear all application data
   */
  async clearAllData(includeSettings = true): Promise<void> {
    await Promise.all([
      db.recipes.clear(),
      db.tags.filter((tag) => !tag.isSystem).delete(), // Keep system tags
      db.plannedMeals.clear(),
      db.dayNotes.clear(),
      db.recurringMeals.clear(),
      db.shoppingLists.clear(),
      db.externalCalendars.clear(),
    ]);

    if (includeSettings) {
      await settingsRepository.reset();
    }
  },

  /**
   * Get data statistics for display
   */
  async getDataStats(): Promise<{
    recipes: number;
    customTags: number;
    mealPlans: number;
    shoppingLists: number;
  }> {
    const [recipes, tags, mealPlans, shoppingLists] = await Promise.all([
      db.recipes.count(),
      db.tags.filter((tag) => !tag.isSystem).count(),
      db.plannedMeals.count(),
      db.shoppingLists.count(),
    ]);

    return {
      recipes,
      customTags: tags,
      mealPlans,
      shoppingLists,
    };
  },
};
