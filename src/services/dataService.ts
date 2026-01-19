import { db } from '@/db/database';
import {
  recipeRepository,
  tagRepository,
  shoppingRepository,
  settingsRepository,
} from '@/db';
import type { PlatecraftExport, Tag, Recipe, ExternalCalendar } from '@/types';
import { CURRENT_EXPORT_VERSION } from '@/types';
import { DEFAULT_TAGS, type LegacyTag } from '@/types/tags';
import { imageService } from './imageService';
import { cryptoService, type EncryptedExport } from './cryptoService';

export interface ExportOptions {
  includeImages: boolean;
  chunked: boolean;
  excludeSensitiveData: boolean;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includeImages: true,
  chunked: false,
  excludeSensitiveData: false,
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
    let file: File;
    const date = new Date().toISOString().split('T')[0];
    const suffix = !options.includeImages ? '-no-images' : '';

    if (options.chunked && options.includeImages) {
      // Use streaming export for chunked mode with images
      const blob = await this.streamExportToBlob(options);

      if (password) {
        // For encryption, we need to read the blob as text
        const json = await blob.text();
        const encrypted = await cryptoService.encryptExport(json, password);
        file = new File([JSON.stringify(encrypted)], `platecraft-backup-${date}${suffix}.json`, {
          type: 'application/json',
        });
      } else {
        file = new File([blob], `platecraft-backup-${date}${suffix}.json`, {
          type: 'application/json',
        });
      }
    } else {
      // Use standard export for non-chunked or no-images mode
      const data = await this.exportAllData(options);
      const json = JSON.stringify(data);

      let content: string;
      if (password) {
        const encrypted = await cryptoService.encryptExport(json, password);
        content = JSON.stringify(encrypted);
      } else {
        content = json;
      }

      file = new File([content], `platecraft-backup-${date}${suffix}.json`, {
        type: 'application/json',
      });
    }

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

    // Handle settings - decrypt or exclude sensitive data
    const settings = { ...rawSettings };
    if (options.excludeSensitiveData) {
      // Remove sensitive fields
      settings.anthropicApiKey = undefined;
      settings.usdaApiKey = undefined;
    } else {
      // Decrypt API keys
      if (settings.anthropicApiKey) {
        settings.anthropicApiKey = await settingsRepository.getAnthropicApiKey();
      }
      if (settings.usdaApiKey) {
        settings.usdaApiKey = await settingsRepository.getUsdaApiKey();
      }
    }

    // Handle calendar URLs - decrypt or exclude sensitive data
    const externalCalendars = await Promise.all(
      rawExternalCalendars.map(async (calendar): Promise<ExternalCalendar> => {
        if (options.excludeSensitiveData) {
          // Remove sensitive URL but keep calendar metadata
          return { ...calendar, icalUrl: undefined };
        }
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

    // Export all tags (name-based system - no system/custom distinction)
    // The export format uses 'customTags' field name for backwards compatibility
    const customTags = allTags;

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
   * Stream export data to a Blob, processing one recipe at a time to minimize memory usage.
   * This builds the JSON incrementally without holding all data in memory at once.
   */
  async streamExportToBlob(options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<Blob> {
    // Get all non-recipe data first (this is small)
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

    // Handle settings - decrypt or exclude sensitive data
    const settings = { ...rawSettings };
    if (options.excludeSensitiveData) {
      // Remove sensitive fields
      settings.anthropicApiKey = undefined;
      settings.usdaApiKey = undefined;
    } else {
      // Decrypt API keys
      if (settings.anthropicApiKey) {
        settings.anthropicApiKey = await settingsRepository.getAnthropicApiKey();
      }
      if (settings.usdaApiKey) {
        settings.usdaApiKey = await settingsRepository.getUsdaApiKey();
      }
    }

    // Handle calendar URLs - decrypt or exclude sensitive data
    const externalCalendars = await Promise.all(
      rawExternalCalendars.map(async (calendar): Promise<ExternalCalendar> => {
        if (options.excludeSensitiveData) {
          // Remove sensitive URL but keep calendar metadata
          return { ...calendar, icalUrl: undefined };
        }
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

    // Export all tags (name-based system - no system/custom distinction)
    const customTags = allTags;

    // Build JSON parts array - this is more memory efficient than concatenating strings
    const parts: string[] = [];

    // Start the JSON object
    parts.push(`{"version":${JSON.stringify(CURRENT_EXPORT_VERSION)},`);
    parts.push(`"exportDate":${JSON.stringify(new Date().toISOString())},`);

    // Stream recipes array - process ONE recipe at a time
    parts.push('"recipes":[');

    for (let i = 0; i < recipes.length; i++) {
      const recipe = recipes[i];
      let processedRecipe: Recipe;

      if (!options.includeImages) {
        processedRecipe = { ...recipe, images: [] };
      } else if (recipe.images && recipe.images.length > 0) {
        // Convert this recipe's images to Base64
        const imagesWithBase64 = await imageService.prepareImagesForExport(recipe.images);
        processedRecipe = { ...recipe, images: imagesWithBase64 };
      } else {
        processedRecipe = recipe;
      }

      // Stringify this single recipe (no pretty printing to save memory)
      parts.push(JSON.stringify(processedRecipe));
      if (i < recipes.length - 1) {
        parts.push(',');
      }

      // Yield every recipe to allow GC
      if (i % 3 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    parts.push('],');

    // Add remaining data (these are small)
    parts.push(`"customTags":${JSON.stringify(customTags)},`);
    parts.push(`"mealPlans":${JSON.stringify(plannedMeals)},`);
    parts.push(`"dayNotes":${JSON.stringify(dayNotes)},`);
    parts.push(`"recurringMeals":${JSON.stringify(recurringMeals)},`);
    parts.push(`"shoppingLists":${JSON.stringify(shoppingLists)},`);
    parts.push(`"settings":${JSON.stringify(settings)},`);
    parts.push(`"externalCalendars":${JSON.stringify(externalCalendars)}`);
    parts.push('}');

    // Create Blob from parts array - browser can handle this more efficiently
    // than a single massive string
    return new Blob(parts, { type: 'application/json' });
  },

  /**
   * Download export data as a JSON file (unencrypted)
   */
  async downloadExport(options: ExportOptions = DEFAULT_EXPORT_OPTIONS): Promise<void> {
    let blob: Blob;

    if (options.chunked && options.includeImages) {
      // Use streaming export for chunked mode with images
      blob = await this.streamExportToBlob(options);
    } else {
      const data = await this.exportAllData(options);
      const json = JSON.stringify(data);
      blob = new Blob([json], { type: 'application/json' });
    }

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
    let blob: Blob;

    if (options.chunked && options.includeImages) {
      // Use streaming export for chunked mode with images
      const exportBlob = await this.streamExportToBlob(options);
      // For encryption, we need to read the blob as text
      const json = await exportBlob.text();
      const encrypted = await cryptoService.encryptExport(json, password);
      blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
    } else {
      const data = await this.exportAllData(options);
      const json = JSON.stringify(data);
      const encrypted = await cryptoService.encryptExport(json, password);
      blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
    }

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

    // Validate custom tags (support both legacy id-based and new name-based formats)
    if (Array.isArray(obj.customTags)) {
      for (let i = 0; i < obj.customTags.length; i++) {
        const tag = obj.customTags[i] as Record<string, unknown>;
        // Name is required in both formats
        if (!tag.name || typeof tag.name !== 'string') {
          errors.push(`Custom tag at index ${i}: missing or invalid name`);
        }
        // Note: 'id' is optional (present in legacy format, absent in new format)
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Import data from a JSON export (merge mode - adds to existing data)
   * Supports both legacy ID-based tags and new name-based tags
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

      // Detect if this is a legacy export (ID-based tags)
      const isLegacyFormat = data.customTags?.some(
        (t) => 'id' in t && 'isSystem' in t
      );

      if (isLegacyFormat) {
        console.log('[Import] Detected legacy ID-based tag format, converting to name-based');
      }

      // Build tag ID→Name map for legacy format conversion
      const tagIdToName = new Map<string, string>();
      if (isLegacyFormat && data.customTags) {
        for (const tag of data.customTags as LegacyTag[]) {
          // Skip hidden system tags from old exports
          if (tag.isSystem && tag.isHidden) {
            continue;
          }
          tagIdToName.set(tag.id, tag.name);
        }
      }

      // Get all current tags in the database
      const existingTags = await tagRepository.getAll();
      const existingTagsByName = new Map(
        existingTags.map((t) => [t.name.toLowerCase(), t])
      );

      // Import tags (handling both legacy and new formats)
      if (data.customTags && data.customTags.length > 0) {
        for (const rawTag of data.customTags) {
          // For legacy format, skip hidden system tags
          if (isLegacyFormat) {
            const legacyTag = rawTag as LegacyTag;
            if (legacyTag.isSystem && legacyTag.isHidden) {
              continue;
            }
          }

          const existingTag = existingTagsByName.get(rawTag.name.toLowerCase());
          if (!existingTag) {
            // New tag - import it
            try {
              const tagToImport: Tag = {
                id: crypto.randomUUID(),
                name: rawTag.name,
                color: rawTag.color,
              };
              await db.tags.add(tagToImport);
              imported.tags++;
              existingTagsByName.set(rawTag.name.toLowerCase(), tagToImport);
            } catch (err) {
              errors.push(`Failed to import tag "${rawTag.name}": ${err}`);
            }
          }
        }
      }

      // Log conversion info for debugging
      if (isLegacyFormat && tagIdToName.size > 0) {
        console.log(`[Import] Built ID→Name mapping for ${tagIdToName.size} legacy tags`);
      }

      // Import recipes with tag conversion for legacy format
      if (data.recipes && data.recipes.length > 0) {
        const existingRecipes = await recipeRepository.getAll();
        const existingIds = new Set(existingRecipes.map((r) => r.id));

        for (const recipe of data.recipes) {
          if (mode === 'merge' && existingIds.has(recipe.id)) {
            // Skip existing recipes in merge mode
            continue;
          }

          try {
            // Convert tag IDs to names for legacy format, otherwise use as-is (already names)
            let tags: string[];
            if (isLegacyFormat) {
              // Convert IDs to names, filtering out any unmapped IDs
              tags = recipe.tags
                .map((tagId) => tagIdToName.get(tagId))
                .filter((name): name is string => name !== undefined);
            } else {
              tags = recipe.tags;
            }

            // Ensure dates are Date objects
            const recipeToImport: Recipe = {
              ...recipe,
              tags,
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

      // Track the import date
      await settingsRepository.setLastImportDate(new Date());

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
      db.tags.clear(),
      db.plannedMeals.clear(),
      db.dayNotes.clear(),
      db.recurringMeals.clear(),
      db.shoppingLists.clear(),
      db.externalCalendars.clear(),
    ]);

    // Re-add default tags
    await db.tags.bulkAdd(DEFAULT_TAGS);

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
      db.tags.count(),
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

  /**
   * Clean up orphaned recipe tags (tag names that don't exist in the database)
   * This fixes data integrity issues from old exports/imports
   */
  async cleanupOrphanedRecipeTags(): Promise<{
    recipesUpdated: number;
    orphanedTagsRemoved: number;
  }> {
    const allRecipes = await recipeRepository.getAll();
    const allTags = await tagRepository.getAll();
    const validTagNames = new Set(allTags.map((t) => t.name.toLowerCase()));

    let recipesUpdated = 0;
    let orphanedTagsRemoved = 0;

    for (const recipe of allRecipes) {
      const orphanedTags = recipe.tags.filter(
        (tagName) => !validTagNames.has(tagName.toLowerCase())
      );

      if (orphanedTags.length > 0) {
        const validTags = recipe.tags.filter((tagName) =>
          validTagNames.has(tagName.toLowerCase())
        );
        await db.recipes.update(recipe.id, { tags: validTags });
        recipesUpdated++;
        orphanedTagsRemoved += orphanedTags.length;
      }
    }

    console.log(`[Cleanup] Updated ${recipesUpdated} recipes, removed ${orphanedTagsRemoved} orphaned tag references`);

    return { recipesUpdated, orphanedTagsRemoved };
  },
};
