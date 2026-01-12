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
 * @deprecated Use MealSlotTagConfig within WeekdayConfig instead
 */
export interface DayTagRule {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  tags: string[]; // Tag names
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
 * Tag configuration for a specific meal slot on a day
 */
export interface MealSlotTagConfig {
  tags: string[]; // Tag names
  priority: 'required' | 'preferred';
}

/**
 * Configuration for a single meal slot on a specific day of week
 */
export interface DayMealSlotConfig {
  slotId: string;
  isEnabled: boolean;
  tagConfig?: MealSlotTagConfig;
}

/**
 * Configuration for a single day of the week (Sun-Sat)
 */
export interface WeekdayConfig {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  slots: DayMealSlotConfig[];
}

/**
 * Quick preset identifiers for common meal schedule configurations
 */
export type MealSchedulePreset =
  | 'weekday-dinners'
  | 'dinner-only'
  | 'lunch-dinner'
  | 'weekend-lunches'
  | 'custom';

/**
 * Configuration for meal plan generation
 */
export interface MealPlanConfig {
  ingredientsOnHand: IngredientOnHand[];
  weekdayConfigs: WeekdayConfig[];
  startDate: Date;
  endDate: Date;
  defaultServings: number;
  favoritesWeight: number; // 0-100: percentage weight for preferring favorite recipes
  overwriteMode: boolean; // false = fill gaps only, true = replace all existing meals
  // Deprecated fields - kept for migration
  dayTagRules?: DayTagRule[];
  skippedDays?: number[];
  selectedSlots?: string[];
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
export type AssistantStep = 'ingredients' | 'mealSchedule' | 'preview';

/**
 * Recipe match score for algorithm
 */
export interface RecipeMatchScore {
  recipeId: string;
  recipeTitle: string;
  ingredientScore: number; // 0-1, how well it matches ingredients
  matchedIngredients: Array<{
    ingredientName: string;
    matchType: 'exact' | 'partial' | 'contains' | 'fuzzy';
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
