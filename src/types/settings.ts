import type { UnitSystem } from './units';
import type { MealSlot } from './mealPlan';
import type { StoreSectionInfo } from './shopping';
import type { AiParsingMode } from './import';

export type Theme = 'light' | 'dark' | 'light-forest' | 'light-fuchsia' | 'dark-forest' | 'dark-fuchsia' | 'system';
export type CalendarStartDay = 0 | 1; // 0 = Sunday, 1 = Monday
export type PhotoImportMode = 'ocr' | 'vision'; // OCR first, or skip straight to vision

export interface UserSettings {
  // Display
  theme: Theme;

  // Measurements
  defaultUnitSystem: UnitSystem;
  defaultServings: number;

  // Calendar
  calendarStartDay: CalendarStartDay;

  // Meal slots
  mealSlots: MealSlot[];

  // Store sections
  storeSections: StoreSectionInfo[];

  // Staple ingredients (auto-checked on new shopping lists)
  stapleIngredients: string[];
  stapleExclusions: string[]; // Patterns to exclude from staple matching

  // Daily nutritional goals (optional)
  dailyCalorieGoal?: number;

  // Recipe Import Settings
  anthropicApiKey?: string; // Stored locally, never sent anywhere except Anthropic
  preferredImportMode?: AiParsingMode; // 'api' or 'manual'
  defaultPhotoImportMode?: PhotoImportMode; // 'ocr' or 'vision' - default behavior for photo import

  // Nutrition API Settings
  usdaApiKey?: string; // USDA FoodData Central API key

  // Backup tracking
  lastBackupDate?: string; // ISO-8601 date string of last export
  lastImportDate?: string; // ISO-8601 date string of last import
  lastModifiedDate?: string; // ISO-8601 date string of last user data modification
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  defaultUnitSystem: 'us',
  defaultServings: 4,
  calendarStartDay: 0, // Sunday
  mealSlots: [
    { id: 'breakfast', name: 'Breakfast', order: 0, isDefault: true },
    { id: 'lunch', name: 'Lunch', order: 1, isDefault: true },
    { id: 'dinner', name: 'Dinner', order: 2, isDefault: true },
    { id: 'snack', name: 'Snack', order: 3, isDefault: true },
  ],
  storeSections: [
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
  ],
  stapleIngredients: [],
  stapleExclusions: [],
};
