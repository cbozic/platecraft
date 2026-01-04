import { v4 as uuidv4 } from 'uuid';
import type {
  BulkImportOptions,
  BulkImportQueueItem,
  RecipeSearchResult,
  BulkImportProgress,
  RecipeSite,
  ProteinCategory,
} from '@/types/bulkImport';
import type { NutritionInfo } from '@/types/recipe';
import { buildCategoryUrl, parseSearchResultsPage, sortByRating, extractNutritionFromRecipePage, buildDuckDuckGoSearchUrl, parseDuckDuckGoResults } from './recipeSiteScrapers';
import { urlScraperService } from './urlScraperService';
import { duplicateDetectionService } from './duplicateDetectionService';
import { tagScanningService } from './tagScanningService';

/**
 * Execute bulk import of recipes from multiple sites
 */
export async function executeBulkImport(
  options: BulkImportOptions,
  signal?: AbortSignal
): Promise<BulkImportQueueItem[]> {
  const { config, onProgress } = options;

  // Phase 1: Search for recipes
  const searchResults = await searchForRecipes(config, onProgress, signal);

  if (signal?.aborted) {
    return [];
  }

  // Phase 2: Import recipes
  const queueItems = await importRecipes(searchResults, options, signal);

  return queueItems;
}

/**
 * Search for recipes across all configured sites and proteins
 */
async function searchForRecipes(
  config: { sites: RecipeSite[]; proteins: ProteinCategory[]; recipesPerCategory: number; lowFat: boolean },
  onProgress: (progress: BulkImportProgress) => void,
  signal?: AbortSignal
): Promise<RecipeSearchResult[]> {
  const allSearchResults: RecipeSearchResult[] = [];
  const combinations: Array<[RecipeSite, ProteinCategory]> = [];

  // Generate all site × protein combinations
  for (const site of config.sites) {
    for (const protein of config.proteins) {
      combinations.push([site, protein]);
    }
  }

  let completed = 0;
  const total = combinations.length;

  console.log(`[Bulk Import] Starting category page scraping for ${total} combinations`, config);

  // Scrape each category page sequentially to avoid overwhelming the servers
  for (const [site, protein] of combinations) {
    if (signal?.aborted) break;

    // Update progress
    onProgress({
      totalItems: total,
      completed,
      failed: 0,
      currentItem: { url: '', title: `Fetching ${site} ${protein} recipes...`, site, proteinCategory: protein },
      stage: 'searching',
    });

    try {
      // Use DuckDuckGo search for sites where direct scraping doesn't work
      const useDuckDuckGo = site === 'epicurious' || site === 'seriouseats' || site === 'bonappetit' || site === 'nytimes';
      const searchUrl = useDuckDuckGo
        ? buildDuckDuckGoSearchUrl(site, protein, config.lowFat)
        : buildCategoryUrl(site, protein, config.lowFat);

      console.log(`[Bulk Import] Fetching ${useDuckDuckGo ? 'DuckDuckGo search' : 'category page'}:`, searchUrl);

      const fetchResult = await urlScraperService.fetchUrl(searchUrl);
      console.log(`[Bulk Import] Fetch result for ${site}/${protein}:`, {
        success: fetchResult.success,
        htmlLength: fetchResult.html?.length,
        error: fetchResult.error
      });

      if (fetchResult.success && fetchResult.html) {
        // Use appropriate parser based on search method
        const results = useDuckDuckGo
          ? parseDuckDuckGoResults(fetchResult.html, site, protein)
          : parseSearchResultsPage(fetchResult.html, site, protein);
        console.log(`[Bulk Import] Parsed ${results.length} recipes from ${site}/${protein}:`, results.slice(0, 3));

        // Sort by rating (if available) and take top N
        const sortedResults = sortByRating(results);
        const topResults = sortedResults.slice(0, config.recipesPerCategory);

        allSearchResults.push(...topResults);
      } else {
        console.error(`[Bulk Import] Failed to fetch ${site}/${protein}:`, fetchResult.error);
      }
    } catch (error) {
      console.error(`[Bulk Import] Error fetching ${site}/${protein}:`, error);
      // Continue with other categories
    }

    completed++;

    // Small delay between requests
    await delay(500);
  }

  console.log(`[Bulk Import] Category scraping complete. Found ${allSearchResults.length} total recipes`);
  return allSearchResults;
}

/**
 * Import recipes from search results with queue management
 */
async function importRecipes(
  searchResults: RecipeSearchResult[],
  options: BulkImportOptions,
  signal?: AbortSignal
): Promise<BulkImportQueueItem[]> {
  const { onProgress, onItemComplete, concurrency = 2, delayMs = 500 } = options;

  // Run bulk duplicate detection on all search results
  console.log('[Bulk Import] Running duplicate detection...');
  const duplicateResults = await duplicateDetectionService.checkBulkDuplicates(
    searchResults.map((r) => ({ title: r.title, sourceUrl: r.url }))
  );

  // Create queue items with duplicate info
  const queueItems: BulkImportQueueItem[] = searchResults.map((searchResult) => {
    const duplicateKey = searchResult.url || searchResult.title;
    const duplicateInfo = duplicateResults.get(duplicateKey);

    return {
      id: uuidv4(),
      searchResult,
      status: 'pending' as const,
      duplicateInfo,
    };
  });

  // Log duplicate detection results
  const duplicateCount = queueItems.filter((item) => item.duplicateInfo?.isDuplicate).length;
  console.log(`[Bulk Import] Found ${duplicateCount} potential duplicates out of ${queueItems.length} recipes`);

  const total = queueItems.length;
  let completed = 0;
  let failed = 0;

  // Process queue in batches with concurrency control
  for (let i = 0; i < queueItems.length; i += concurrency) {
    if (signal?.aborted) break;

    const batch = queueItems.slice(i, i + concurrency);

    // Process batch concurrently
    const batchPromises = batch.map((item) => processRecipe(item, signal));

    const results = await Promise.allSettled(batchPromises);

    // Update queue items with results
    results.forEach((result, index) => {
      const item = batch[index];

      if (result.status === 'fulfilled') {
        Object.assign(item, result.value);

        if (item.status === 'success') {
          completed++;
        } else if (item.status === 'failed') {
          failed++;
        }
      } else {
        item.status = 'failed';
        item.error = 'Processing failed';
        failed++;
      }

      // Notify completion of individual item
      onItemComplete(item);
    });

    // Update overall progress
    onProgress({
      totalItems: total,
      completed: completed + failed,
      failed,
      currentItem: batch[0]?.searchResult,
      stage: 'importing',
    });

    // Delay between batches to avoid rate limiting
    if (i + concurrency < queueItems.length) {
      await delay(delayMs);
    }
  }

  // Final progress update
  onProgress({
    totalItems: total,
    completed: completed + failed,
    failed,
    stage: 'complete',
  });

  return queueItems;
}

/**
 * Process a single recipe: fetch, parse, extract nutrition
 */
async function processRecipe(
  item: BulkImportQueueItem,
  signal?: AbortSignal
): Promise<BulkImportQueueItem> {
  if (signal?.aborted) {
    return { ...item, status: 'failed', error: 'Cancelled' };
  }

  try {
    // Update status
    item.status = 'fetching';
    console.log(`[Bulk Import] Fetching recipe: ${item.searchResult.url}`);

    // Fetch recipe page
    const scrapeResult = await urlScraperService.scrapeRecipeUrl(item.searchResult.url);
    console.log(`[Bulk Import] Scrape result for ${item.searchResult.url}:`, {
      success: scrapeResult.success,
      usedSchemaOrg: scrapeResult.usedSchemaOrg,
      hasRecipe: !!scrapeResult.recipe,
      hasRawText: !!scrapeResult.rawText,
      error: scrapeResult.error,
    });

    if (!scrapeResult.success) {
      return {
        ...item,
        status: 'failed',
        error: scrapeResult.error || 'Failed to fetch recipe',
      };
    }

    // If schema.org recipe was found, use it
    if (scrapeResult.usedSchemaOrg && scrapeResult.recipe) {
      item.status = 'success';
      item.recipe = {
        ...scrapeResult.recipe,
        sourceUrl: item.searchResult.url,
      };

      // Try to extract nutrition from schema.org or page HTML
      if (scrapeResult.recipe.nutrition) {
        item.nutrition = scrapeResult.recipe.nutrition;
      }

      // Run tag scanning to auto-detect applicable tags
      try {
        item.detectedTags = tagScanningService.detectTags(item.recipe);
        console.log(`[Bulk Import] Detected tags for "${item.recipe.title}":`, item.detectedTags);
      } catch (tagError) {
        console.warn('[Bulk Import] Tag scanning failed:', tagError);
        item.detectedTags = [];
      }

      return item;
    }

    // If we have raw text but no structured recipe, we need AI parsing
    // For bulk import, we'll skip recipes that don't have schema.org data
    // to avoid requiring API keys and to speed up the process
    if (scrapeResult.rawText) {
      console.log(`[Bulk Import] No schema.org data for ${item.searchResult.url}, raw text length: ${scrapeResult.rawText.length}`);
      return {
        ...item,
        status: 'failed',
        error: 'Recipe requires manual parsing (no structured data found)',
      };
    }

    console.log(`[Bulk Import] No data found for ${item.searchResult.url}`);
    return {
      ...item,
      status: 'failed',
      error: 'No recipe data found',
    };
  } catch (error) {
    console.error(`[Bulk Import] Error processing ${item.searchResult.url}:`, error);
    return {
      ...item,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch a recipe page and extract nutrition information
 * Used as a separate step if nutrition needs to be added to existing recipes
 */
export async function extractNutritionForRecipe(
  url: string,
  site: RecipeSite
): Promise<{ success: boolean; nutrition?: NutritionInfo; error?: string }> {
  try {
    const fetchResult = await urlScraperService.fetchUrl(url);

    if (!fetchResult.success || !fetchResult.html) {
      return {
        success: false,
        error: fetchResult.error || 'Failed to fetch URL',
      };
    }

    const nutrition = extractNutritionFromRecipePage(fetchResult.html, site);

    if (nutrition) {
      return { success: true, nutrition };
    }

    return { success: false, error: 'No nutrition information found' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Helper function to create a delay promise
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get display name for a protein category
 */
export function getProteinDisplayName(protein: ProteinCategory): string {
  return protein.charAt(0).toUpperCase() + protein.slice(1);
}

/**
 * Get display name for a recipe site
 */
export function getSiteDisplayName(site: RecipeSite): string {
  const names: Record<RecipeSite, string> = {
    allrecipes: 'AllRecipes',
    foodnetwork: 'Food Network',
    epicurious: 'Epicurious',
    seriouseats: 'Serious Eats',
    bonappetit: 'Bon Appetit',
    nytimes: 'NY Times Cooking',
  };
  return names[site];
}
