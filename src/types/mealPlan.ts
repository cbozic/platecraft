import type { MeasurementUnit } from './units';
import type { StoreSection } from './shopping';

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | string;

export interface MealSlot {
  id: string;
  name: string;
  order: number;
  isDefault: boolean; // Default slots can't be deleted
}

export const DEFAULT_MEAL_SLOTS: MealSlot[] = [
  { id: 'breakfast', name: 'Breakfast', order: 0, isDefault: true },
  { id: 'lunch', name: 'Lunch', order: 1, isDefault: true },
  { id: 'dinner', name: 'Dinner', order: 2, isDefault: true },
  { id: 'snack', name: 'Snack', order: 3, isDefault: true },
];

// Extra item for a planned meal (side dishes, extras that go on shopping list)
export interface MealExtraItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: MeasurementUnit | null;
  storeSection?: StoreSection | string;
}

export interface PlannedMeal {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  slotId: string;
  recipeId?: string; // Optional: either recipeId OR freeText should be set
  freeText?: string; // Optional: meal name for free-text meals (no recipe)
  servings: number; // Can differ from recipe's default servings
  notes?: string; // Free text reminders for this meal
  extraItems?: MealExtraItem[]; // Side dishes/extras to add to shopping list
}

export interface DayNote {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  content: string;
}

export interface RecurringMeal {
  id: string;
  recipeId: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  slotId: string;
  servings: number;
  isActive: boolean;
}
