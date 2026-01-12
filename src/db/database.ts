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
  ExternalEvent,
  UserSettings,
} from '@/types';
import { DEFAULT_TAGS, type LegacyTag } from '@/types/tags';
import { DEFAULT_SETTINGS } from '@/types/settings';

export class PlatecraftDatabase extends Dexie {
  recipes!: Table<Recipe, string>;
  tags!: Table<Tag, string>;
  plannedMeals!: Table<PlannedMeal, string>;
  dayNotes!: Table<DayNote, string>;
  recurringMeals!: Table<RecurringMeal, string>;
  shoppingLists!: Table<ShoppingList, string>;
  shoppingItems!: Table<ShoppingItem, string>;
  externalCalendars!: Table<ExternalCalendar, string>;
  externalEvents!: Table<ExternalEvent, string>;
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

    // Version 2: Add external events for iCal support
    this.version(2).stores({
      recipes: 'id, title, *tags, isFavorite, createdAt, updatedAt',
      tags: 'id, name, isSystem',
      plannedMeals: 'id, date, slotId, recipeId, [date+slotId]',
      dayNotes: 'id, date',
      recurringMeals: 'id, recipeId, dayOfWeek, slotId',
      shoppingLists: 'id, createdAt',
      shoppingItems: 'id, shoppingListId, isChecked, storeSection',
      externalCalendars: 'id, provider',
      externalEvents: 'id, calendarId, [calendarId+startTime]',
      settings: 'id',
    });

    // Version 3: Simplify tags - keep id as PK (Dexie limitation), but use name as unique identifier
    // Remove isSystem from index (field will be ignored)
    this.version(3)
      .stores({
        recipes: 'id, title, *tags, isFavorite, createdAt, updatedAt',
        tags: 'id, &name', // Keep id as PK, add unique index on name
        plannedMeals: 'id, date, slotId, recipeId, [date+slotId]',
        dayNotes: 'id, date',
        recurringMeals: 'id, recipeId, dayOfWeek, slotId',
        shoppingLists: 'id, createdAt',
        shoppingItems: 'id, shoppingListId, isChecked, storeSection',
        externalCalendars: 'id, provider',
        externalEvents: 'id, calendarId, [calendarId+startTime]',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        console.log('[Migration v3] Starting tag system migration...');

        // 1. Get all old tags and build ID->Name mapping
        const oldTags = (await tx.table('tags').toArray()) as LegacyTag[];
        const idToName = new Map<string, string>();
        oldTags.forEach((tag) => {
          idToName.set(tag.id, tag.name);
        });
        console.log(`[Migration v3] Found ${oldTags.length} old tags`);

        // 2. Convert all recipe tag arrays from IDs to names
        const recipes = await tx.table('recipes').toArray();
        let recipesUpdated = 0;
        for (const recipe of recipes) {
          if (recipe.tags && recipe.tags.length > 0) {
            // Convert IDs to names
            const names = recipe.tags
              .map((tagId: string) => idToName.get(tagId))
              .filter((name: string | undefined): name is string => !!name);

            // Deduplicate case-insensitively (keep first occurrence's casing)
            const seenLower = new Set<string>();
            const uniqueNames: string[] = [];
            for (const name of names) {
              const lower = name.toLowerCase();
              if (!seenLower.has(lower)) {
                seenLower.add(lower);
                uniqueNames.push(name);
              }
            }

            await tx.table('recipes').update(recipe.id, { tags: uniqueNames });
            recipesUpdated++;
          }
        }
        console.log(`[Migration v3] Updated tags on ${recipesUpdated} recipes`);

        // 3. Update tags table - remove isSystem/isHidden, set id=name for new lookups
        // We keep existing tags but clean up the structure
        const seenNames = new Set<string>();
        for (const oldTag of oldTags) {
          const lowerName = oldTag.name.toLowerCase();
          if (!seenNames.has(lowerName)) {
            seenNames.add(lowerName);
            // Update to remove isSystem/isHidden, keep id unchanged
            await tx.table('tags').update(oldTag.id, {
              name: oldTag.name,
              color: oldTag.color,
              isSystem: undefined,
              isHidden: undefined,
            });
          } else {
            // Delete duplicate (case-insensitive)
            await tx.table('tags').delete(oldTag.id);
          }
        }
        console.log(`[Migration v3] Updated ${seenNames.size} tags`);

        console.log('[Migration v3] Migration complete!');
      });
  }

  async initialize(): Promise<void> {
    // Initialize default tags if none exist
    const existingTagCount = await this.tags.count();
    if (existingTagCount === 0) {
      console.log('[Initialize] Adding default tags');
      await this.tags.bulkAdd(DEFAULT_TAGS);
    }

    // Initialize settings if they don't exist
    const existingSettings = await this.settings.count();
    if (existingSettings === 0) {
      await this.settings.add({
        ...DEFAULT_SETTINGS,
        id: 'user-settings',
      });
    }

    // Migrate existing calendars to have sourceType
    await this.migrateCalendarSourceTypes();
  }

  async migrateCalendarSourceTypes(): Promise<void> {
    const calendarsWithoutType = await this.externalCalendars
      .filter((c) => !c.sourceType)
      .toArray();

    if (calendarsWithoutType.length > 0) {
      console.log(`Migrating ${calendarsWithoutType.length} calendars to add sourceType`);
      await this.externalCalendars.bulkPut(
        calendarsWithoutType.map((c) => ({
          ...c,
          sourceType: c.icalUrl ? 'url' : 'file',
        }))
      );
    }
  }
}

export const db = new PlatecraftDatabase();
