import type { NutritionInfo } from './recipe';
import type { ParsedRecipe } from './import';
import type { DuplicateCheckResult } from '@/services/duplicateDetectionService';

// Supported recipe sites
export type RecipeSite = 'allrecipes' | 'foodnetwork' | 'epicurious';

// Protein categories for filtering
export type ProteinCategory = 'beef' | 'chicken' | 'pork' | 'vegetarian';

// Configuration for bulk import
export interface BulkImportConfig {
  sites: RecipeSite[];
  proteins: ProteinCategory[];
  recipesPerCategory: number; // How many recipes to import per site/protein combination
  lowFat: boolean; // Whether to search for low-fat recipes
}

// Search result from a recipe site
export interface RecipeSearchResult {
  url: string;
  title: string;
  rating?: number; // 0-5 scale
  reviewCount?: number;
  thumbnailUrl?: string;
  site: RecipeSite;
  proteinCategory: ProteinCategory;
}

// Queue item for processing individual recipes
export interface BulkImportQueueItem {
  id: string;
  searchResult: RecipeSearchResult;
  status: 'pending' | 'fetching' | 'parsing' | 'success' | 'failed';
  recipe?: ParsedRecipe;
  error?: string;
  nutrition?: NutritionInfo;
  // Duplicate detection result
  duplicateInfo?: DuplicateCheckResult;
  // Auto-detected tags from content scanning
  detectedTags?: string[];
}

// Progress tracking for the bulk import process
export interface BulkImportProgress {
  totalItems: number;
  completed: number;
  failed: number;
  currentItem?: RecipeSearchResult;
  stage: 'searching' | 'importing' | 'complete' | 'error';
}

// Site-specific scraper configuration
export interface SiteScraperConfig {
  name: RecipeSite;
  displayName: string;
  searchUrlBuilder: (protein: ProteinCategory) => string;
  parseSearchResults: (html: string) => RecipeSearchResult[];
  extractNutrition?: (html: string) => NutritionInfo | null;
  hasSchemaOrg: boolean;
}

// Options for bulk import execution
export interface BulkImportOptions {
  config: BulkImportConfig;
  onProgress: (progress: BulkImportProgress) => void;
  onItemComplete: (item: BulkImportQueueItem) => void;
  concurrency?: number; // Number of concurrent requests (default 2)
  delayMs?: number; // Delay between requests in ms (default 500)
}
