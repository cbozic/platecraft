import type { NutritionInfo } from './recipe';

// Fields that can be reprocessed
export type ReprocessableField = 'nutrition' | 'prepTimeMinutes' | 'cookTimeMinutes' | 'description';

// Configuration for which fields to check/reprocess
export interface ReprocessingConfig {
  fields: ReprocessableField[];
}

// Proposed change for a single field
export interface FieldChange<T = unknown> {
  field: ReprocessableField;
  oldValue: T | undefined;
  newValue: T;
  source: 'notes' | 'vision'; // Where the value was extracted from
}

// Status of a recipe during reprocessing
export type RecipeReprocessingStatus =
  | 'pending'
  | 'scanning'
  | 'processing'
  | 'success'
  | 'skipped'
  | 'failed';

// Result for a single recipe
export interface RecipeReprocessingResult {
  recipeId: string;
  recipeTitle: string;
  status: RecipeReprocessingStatus;
  hasBlankFields: boolean;
  blankFields: ReprocessableField[];
  proposedChanges: FieldChange[];
  hasSourcePhoto: boolean;
  error?: string;
}

// Stage of the overall reprocessing operation
export type ReprocessingStage = 'scanning' | 'extracting' | 'complete';

// Overall progress tracking
export interface ReprocessingProgress {
  totalRecipes: number;
  scannedRecipes: number;
  processedRecipes: number;
  recipesWithChanges: number;
  currentRecipe?: { id: string; title: string };
  stage: ReprocessingStage;
}

// Data that can be extracted from notes or vision
export interface ExtractedData {
  nutrition?: NutritionInfo;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  description?: string;
}

// Map of recipe ID to approved changes
export type ApprovedChanges = Map<string, FieldChange[]>;
