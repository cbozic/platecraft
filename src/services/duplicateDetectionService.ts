import { db } from '@/db/database';
import type { Recipe } from '@/types/recipe';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType: 'none' | 'title' | 'url' | 'both';
  existingRecipe?: Recipe;
  message?: string;
}

export interface BulkDuplicateCheckResult {
  url: string;
  title: string;
  result: DuplicateCheckResult;
}

/**
 * Service for detecting duplicate recipes during import
 */
export const duplicateDetectionService = {
  /**
   * Check if a recipe with the given title already exists (case-insensitive)
   */
  async checkByTitle(title: string): Promise<Recipe | undefined> {
    const normalizedTitle = title.toLowerCase().trim();
    const recipes = await db.recipes.toArray();
    return recipes.find(
      (recipe) => recipe.title.toLowerCase().trim() === normalizedTitle
    );
  },

  /**
   * Check if a recipe with the given source URL already exists
   */
  async checkBySourceUrl(sourceUrl: string): Promise<Recipe | undefined> {
    if (!sourceUrl) return undefined;

    // Normalize URL by removing trailing slashes and www prefix
    const normalizedUrl = normalizeUrl(sourceUrl);
    const recipes = await db.recipes.toArray();
    return recipes.find((recipe) => {
      if (!recipe.sourceUrl) return false;
      return normalizeUrl(recipe.sourceUrl) === normalizedUrl;
    });
  },

  /**
   * Check for duplicates by both title and URL
   * Returns the first match found (URL match takes priority)
   */
  async checkDuplicate(
    title: string,
    sourceUrl?: string
  ): Promise<DuplicateCheckResult> {
    // Check URL first (more reliable indicator of duplicate)
    if (sourceUrl) {
      const urlMatch = await this.checkBySourceUrl(sourceUrl);
      if (urlMatch) {
        // Also check if title matches
        const titleMatch = await this.checkByTitle(title);
        const isBoth = titleMatch && titleMatch.id === urlMatch.id;

        return {
          isDuplicate: true,
          matchType: isBoth ? 'both' : 'url',
          existingRecipe: urlMatch,
          message: isBoth
            ? `Recipe "${urlMatch.title}" already exists with same URL and title`
            : `A recipe from this URL already exists: "${urlMatch.title}"`,
        };
      }
    }

    // Check title
    const titleMatch = await this.checkByTitle(title);
    if (titleMatch) {
      return {
        isDuplicate: true,
        matchType: 'title',
        existingRecipe: titleMatch,
        message: `A recipe with the title "${titleMatch.title}" already exists`,
      };
    }

    return {
      isDuplicate: false,
      matchType: 'none',
    };
  },

  /**
   * Check multiple recipes for duplicates at once
   * More efficient for bulk imports
   */
  async checkBulkDuplicates(
    items: Array<{ title: string; sourceUrl?: string }>
  ): Promise<Map<string, DuplicateCheckResult>> {
    // Load all recipes once for efficiency
    const existingRecipes = await db.recipes.toArray();

    // Create lookup maps
    const titleMap = new Map<string, Recipe>();
    const urlMap = new Map<string, Recipe>();

    for (const recipe of existingRecipes) {
      titleMap.set(recipe.title.toLowerCase().trim(), recipe);
      if (recipe.sourceUrl) {
        urlMap.set(normalizeUrl(recipe.sourceUrl), recipe);
      }
    }

    // Check each item
    const results = new Map<string, DuplicateCheckResult>();

    for (const item of items) {
      const key = item.sourceUrl || item.title;
      const normalizedTitle = item.title.toLowerCase().trim();
      const normalizedUrl = item.sourceUrl ? normalizeUrl(item.sourceUrl) : null;

      // Check URL first
      if (normalizedUrl && urlMap.has(normalizedUrl)) {
        const urlMatch = urlMap.get(normalizedUrl)!;
        const titleMatch = titleMap.get(normalizedTitle);
        const isBoth = titleMatch && titleMatch.id === urlMatch.id;

        results.set(key, {
          isDuplicate: true,
          matchType: isBoth ? 'both' : 'url',
          existingRecipe: urlMatch,
          message: isBoth
            ? `Recipe "${urlMatch.title}" already exists with same URL and title`
            : `A recipe from this URL already exists: "${urlMatch.title}"`,
        });
        continue;
      }

      // Check title
      if (titleMap.has(normalizedTitle)) {
        const titleMatch = titleMap.get(normalizedTitle)!;
        results.set(key, {
          isDuplicate: true,
          matchType: 'title',
          existingRecipe: titleMatch,
          message: `A recipe with the title "${titleMatch.title}" already exists`,
        });
        continue;
      }

      results.set(key, {
        isDuplicate: false,
        matchType: 'none',
      });
    }

    return results;
  },
};

/**
 * Normalize a URL for comparison
 * Removes protocol, www prefix, trailing slashes, and query parameters
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove www. prefix and convert to lowercase
    let normalized = parsed.hostname.replace(/^www\./, '').toLowerCase();
    // Add pathname (without trailing slash)
    normalized += parsed.pathname.replace(/\/$/, '');
    return normalized;
  } catch {
    // If URL parsing fails, just do basic normalization
    return url
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('?')[0];
  }
}
