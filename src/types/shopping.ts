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
  isManual: boolean; // true if added manually, not from a recipe
  isRecurring: boolean; // Auto-add to every list
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
