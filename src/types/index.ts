export * from './units';
export * from './recipe';
export * from './shopping';
export * from './tags';
export * from './mealPlan';
export * from './calendar';
export * from './settings';
export * from './import';
export * from './mealPlanAssistant';
export * from './reprocessing';

// Export/Import data format
export interface PlatecraftExport {
  version: string;
  exportDate: string; // ISO-8601
  recipes: import('./recipe').Recipe[];
  customTags: import('./tags').Tag[];
  mealPlans: import('./mealPlan').PlannedMeal[];
  dayNotes: import('./mealPlan').DayNote[];
  recurringMeals: import('./mealPlan').RecurringMeal[];
  shoppingLists: import('./shopping').ShoppingList[];
  settings: import('./settings').UserSettings;
  externalCalendars: import('./calendar').ExternalCalendar[];
}

export const CURRENT_EXPORT_VERSION = '1.2'; // v1.2: Name-based tags

// Re-export encryption types from cryptoService
export type { EncryptedField, EncryptedExport } from '@/services/cryptoService';
