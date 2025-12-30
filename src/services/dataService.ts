import { db } from '@/db/database';
import {
  recipeRepository,
  tagRepository,
  shoppingRepository,
  settingsRepository,
} from '@/db';
import type { PlatecraftExport, Tag, Recipe } from '@/types';
import { CURRENT_EXPORT_VERSION } from '@/types';
import { imageService } from './imageService';

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
   * Export all application data as a JSON object
   */
  async exportAllData(): Promise<PlatecraftExport> {
    const [
      recipes,
      allTags,
      plannedMeals,
      dayNotes,
      recurringMeals,
      shoppingLists,
      settings,
      externalCalendars,
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

    // Only export custom tags (system tags are rebuilt on import)
    const customTags = allTags.filter((tag) => !tag.isSystem);

    // Convert recipe image Blobs to Base64 for JSON serialization
    const recipesWithBase64Images = await Promise.all(
      recipes.map(async (recipe) => {
        if (recipe.images && recipe.images.length > 0) {
          const imagesWithBase64 = await imageService.prepareImagesForExport(recipe.images);
          return { ...recipe, images: imagesWithBase64 };
        }
        return recipe;
      })
    );

    return {
      version: CURRENT_EXPORT_VERSION,
      exportDate: new Date().toISOString(),
      recipes: recipesWithBase64Images,
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
   * Download export data as a JSON file
   */
  async downloadExport(): Promise<void> {
    const data = await this.exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const filename = `platecraft-backup-${date}.json`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
   * Read and parse a JSON file
   */
  async readImportFile(file: File): Promise<PlatecraftExport> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const data = JSON.parse(text);
          resolve(data);
        } catch (err) {
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
