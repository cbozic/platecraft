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

export interface PlannedMeal {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  slotId: string;
  recipeId: string;
  servings: number; // Can differ from recipe's default servings
  notes?: string;
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
