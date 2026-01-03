import type { MeasurementUnit } from './units';

/**
 * An ingredient the user has on hand with quantity tracking
 */
export interface IngredientOnHand {
  id: string;
  name: string;
  quantity: number;
  unit: MeasurementUnit | null;
  originalQuantity: number; // Track original for display
}

/**
 * Tag rule for a specific day of the week
 */
export interface DayTagRule {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  tagIds: string[];
  priority: 'required' | 'preferred';
}

/**
 * Meal slot selection for the assistant
 */
export interface MealSlotSelection {
  slotId: string;
  slotName: string;
  isSelected: boolean;
}

/**
 * Configuration for meal plan generation
 */
export interface MealPlanConfig {
  ingredientsOnHand: IngredientOnHand[];
  dayTagRules: DayTagRule[];
  skippedDays: number[]; // Days of week to skip (0 = Sunday, 6 = Saturday)
  startDate: Date;
  endDate: Date;
  selectedSlots: string[]; // Slot IDs to fill
  defaultServings: number;
  favoritesWeight: number; // 0-100: percentage weight for preferring favorite recipes
}

/**
 * How a recipe was matched during generation
 */
export type MatchType = 'ingredient' | 'tag' | 'fallback';

/**
 * A proposed meal in the preview (before applying to calendar)
 */
export interface ProposedMeal {
  id: string; // Temporary ID for tracking in UI
  date: string; // YYYY-MM-DD
  slotId: string;
  slotName: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  matchType: MatchType;
  matchedIngredients?: string[]; // Names of matched ingredients
  matchedTags?: string[]; // Names of matched tags
  isRejected: boolean; // User rejected this suggestion
  isLocked: boolean; // User confirmed this choice
}

/**
 * Ingredient usage tracking
 */
export interface IngredientUsage {
  ingredientId: string;
  ingredientName: string;
  originalQuantity: number;
  usedQuantity: number;
  remainingQuantity: number;
  unit: MeasurementUnit | null;
}

/**
 * Coverage statistics for the generated plan
 */
export interface PlanCoverage {
  totalSlots: number;
  filledSlots: number;
  ingredientMatches: number;
  tagMatches: number;
  fallbacks: number;
  rejected: number;
}

/**
 * Result of meal plan generation
 */
export interface GeneratedMealPlan {
  proposedMeals: ProposedMeal[];
  ingredientUsage: IngredientUsage[];
  warnings: string[];
  coverage: PlanCoverage;
}

/**
 * Wizard step identifiers
 */
export type AssistantStep = 'ingredients' | 'dayRules' | 'dateRange' | 'preview';

/**
 * Recipe match score for algorithm
 */
export interface RecipeMatchScore {
  recipeId: string;
  recipeTitle: string;
  ingredientScore: number; // 0-1, how well it matches ingredients
  matchedIngredients: Array<{
    ingredientName: string;
    matchType: 'exact' | 'partial' | 'fuzzy';
    score: number;
  }>;
  requiredQuantities: Array<{
    ingredientId: string;
    quantity: number;
    unit: MeasurementUnit | null;
  }>;
}

/**
 * A slot to be filled (date + meal slot)
 */
export interface SlotToFill {
  date: string; // YYYY-MM-DD
  slotId: string;
  slotName: string;
  dayOfWeek: number;
}
