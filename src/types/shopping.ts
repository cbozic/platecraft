import type { MeasurementUnit } from './units';

export type StoreSection =
  | 'produce'
  | 'dairy'
  | 'meat_seafood'
  | 'bakery'
  | 'frozen'
  | 'canned_goods'
  | 'dry_goods'
  | 'condiments'
  | 'snacks'
  | 'beverages'
  | 'household'
  | 'other';

export interface StoreSectionInfo {
  id: StoreSection | string;
  name: string;
  order: number;
  isCustom: boolean;
}

export const DEFAULT_STORE_SECTIONS: StoreSectionInfo[] = [
  { id: 'produce', name: 'Produce', order: 0, isCustom: false },
  { id: 'dairy', name: 'Dairy', order: 1, isCustom: false },
  { id: 'meat_seafood', name: 'Meat & Seafood', order: 2, isCustom: false },
  { id: 'bakery', name: 'Bakery', order: 3, isCustom: false },
  { id: 'frozen', name: 'Frozen', order: 4, isCustom: false },
  { id: 'canned_goods', name: 'Canned Goods', order: 5, isCustom: false },
  { id: 'dry_goods', name: 'Dry Goods & Pasta', order: 6, isCustom: false },
  { id: 'condiments', name: 'Condiments & Sauces', order: 7, isCustom: false },
  { id: 'snacks', name: 'Snacks', order: 8, isCustom: false },
  { id: 'beverages', name: 'Beverages', order: 9, isCustom: false },
  { id: 'household', name: 'Household', order: 10, isCustom: false },
  { id: 'other', name: 'Other', order: 11, isCustom: false },
];

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: MeasurementUnit | null;
  storeSection: StoreSection | string;
  isChecked: boolean;
  notes?: string;
  sourceRecipeIds: string[]; // Which recipes this item came from
  sourceRecipeDetails?: SourceRecipeDetail[]; // Detailed breakdown for UI
  isManual: boolean; // true if added manually, not from a recipe
  isRecurring: boolean; // Auto-add to every list
  // Unit conversion support
  alternateUnits?: AlternateUnit[]; // Other available unit displays for toggle
  selectedUnitIndex?: number; // Which unit is currently displayed (0 = primary)
  isEstimated?: boolean; // True if quantity involves estimation (e.g., "each" to "lb")
  estimationNote?: string; // Note explaining the estimation (e.g., "~6 oz per breast")
  originalAmounts?: OriginalAmount[]; // Preserve all original amounts for transparency
}

export interface AlternateUnit {
  quantity: number;
  unit: MeasurementUnit;
}

export interface OriginalAmount {
  quantity: number | null;
  unit: MeasurementUnit | null;
  recipeId: string;
  recipeName: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingItem[];
  dateRangeStart: Date;
  dateRangeEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AggregatedIngredient {
  name: string;
  totalQuantity: number | null;
  unit: MeasurementUnit | null;
  storeSection: StoreSection | string;
  sourceRecipes: Array<{ recipeId: string; recipeName: string; quantity: number | null }>;
}

// Recipe source details for shopping item breakdown UI
export interface SourceRecipeDetail {
  recipeId: string;
  recipeName: string;
  quantity: number | null;
  unit: MeasurementUnit | null;
  originalIngredientName: string;
}

// Stored ingredient equivalency mapping
export interface IngredientMapping {
  id: string;
  canonicalName: string; // The primary name to display (e.g., "chicken breast")
  variants: string[]; // All equivalent names (lowercase for matching)
  createdAt: Date;
  updatedAt: Date;
  isUserConfirmed: boolean; // true if user explicitly confirmed this mapping
}

// AI-suggested match awaiting user confirmation
export interface PendingIngredientMatch {
  id: string;
  ingredientNames: string[]; // Names AI identified as equivalent
  suggestedCanonicalName: string; // AI's suggested display name
  confidence: number; // 0-1 confidence score
  affectedRecipes: Array<{
    recipeId: string;
    recipeName: string;
    ingredientName: string;
  }>;
}

// Return type from shopping list generation with AI deduplication
export interface ShoppingListGenerationResult {
  list: ShoppingList;
  pendingMatches: PendingIngredientMatch[];
  usedAI: boolean;
  cancelled?: boolean;
}

// A refined group of ingredients for manual splitting/regrouping
export interface RefinedIngredientGroup {
  id: string;
  ingredientNames: string[];
  canonicalName: string;
  affectedRecipes: Array<{
    recipeId: string;
    recipeName: string;
    ingredientName: string;
  }>;
}
