import Dexie, { type Table } from 'dexie';
import type {
  Recipe,
  Tag,
  PlannedMeal,
  DayNote,
  RecurringMeal,
  ShoppingList,
  ShoppingItem,
  ExternalCalendar,
  UserSettings,
} from '@/types';
import { SYSTEM_TAGS } from '@/types/tags';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';

export class PlatecraftDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  tags!: Table<Tag, string>;
  plannedMeals!: Table<PlannedMeal, string>;
  dayNotes!: Table<DayNote, string>;
  recurringMeals!: Table<RecurringMeal, string>;
  shoppingLists!: Table<ShoppingList, string>;
  shoppingItems!: Table<ShoppingItem, string>;
  externalCalendars!: Table<ExternalCalendar, string>;
  settings!: Table<UserSettings & { id: string }, string>;

  constructor() {
    super('platecraft');

    this.version(1).stores({
      recipes: 'id, title, *tags, isFavorite, createdAt, updatedAt',
      tags: 'id, name, isSystem',
      plannedMeals: 'id, date, slotId, recipeId, [date+slotId]',
      dayNotes: 'id, date',
      recurringMeals: 'id, recipeId, dayOfWeek, slotId',
      shoppingLists: 'id, createdAt',
      shoppingItems: 'id, shoppingListId, isChecked, storeSection',
      externalCalendars: 'id, provider',
      settings: 'id',
    });
  }

  async initialize(): Promise<void> {
    // Clean up duplicate system tags first
    await this.deduplicateSystemTags();

    // Initialize system tags if they don't exist
    const existingTags = await this.tags.filter((tag) => tag.isSystem === true).count();
    if (existingTags === 0) {
      const systemTags: Tag[] = SYSTEM_TAGS.map((tag) => ({
        ...tag,
        id: uuidv4(),
      }));
      await this.tags.bulkAdd(systemTags);
    }

    // Initialize settings if they don't exist
    const existingSettings = await this.settings.count();
    if (existingSettings === 0) {
      await this.settings.add({
        ...DEFAULT_SETTINGS,
        id: 'user-settings',
      });
    }
  }

  async deduplicateSystemTags(): Promise<void> {
    const allTags = await this.tags.toArray();
    const seen = new Map<string, Tag>();
    const duplicateIds: string[] = [];

    for (const tag of allTags) {
      if (tag.isSystem) {
        const key = tag.name.toLowerCase();
        if (seen.has(key)) {
          // This is a duplicate - mark for deletion
          duplicateIds.push(tag.id);
        } else {
          seen.set(key, tag);
        }
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`Removing ${duplicateIds.length} duplicate system tags`);
      await this.tags.bulkDelete(duplicateIds);
    }
  }
}

export const db = new PlatecraftDatabase();
