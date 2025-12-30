import { db } from '../database';
import type { ShoppingList, ShoppingItem, AggregatedIngredient } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { mealPlanRepository } from './mealPlanRepository';
import { recipeRepository } from './recipeRepository';

export const shoppingRepository = {
  // Shopping Lists
  async getAllLists(): Promise<ShoppingList[]> {
    return db.shoppingLists.orderBy('createdAt').reverse().toArray();
  },

  async getListById(id: string): Promise<ShoppingList | undefined> {
    return db.shoppingLists.get(id);
  },

  async createList(
    name: string,
    dateRangeStart: Date,
    dateRangeEnd: Date
  ): Promise<ShoppingList> {
    const now = new Date();
    const list: ShoppingList = {
      id: uuidv4(),
      name,
      items: [],
      dateRangeStart,
      dateRangeEnd,
      createdAt: now,
      updatedAt: now,
    };
    await db.shoppingLists.add(list);
    return list;
  },

  async updateList(
    id: string,
    updates: Partial<Pick<ShoppingList, 'name' | 'items'>>
  ): Promise<void> {
    await db.shoppingLists.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
  },

  async deleteList(id: string): Promise<void> {
    await db.shoppingLists.delete(id);
  },

  // Shopping Items
  async addItemToList(listId: string, item: Omit<ShoppingItem, 'id'>): Promise<ShoppingItem> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const newItem: ShoppingItem = {
      ...item,
      id: uuidv4(),
    };

    const updatedItems = [...list.items, newItem];
    await this.updateList(listId, { items: updatedItems });
    return newItem;
  },

  async updateItemInList(
    listId: string,
    itemId: string,
    updates: Partial<Omit<ShoppingItem, 'id'>>
  ): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const updatedItems = list.items.map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    await this.updateList(listId, { items: updatedItems });
  },

  async removeItemFromList(listId: string, itemId: string): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const updatedItems = list.items.filter((item) => item.id !== itemId);
    await this.updateList(listId, { items: updatedItems });
  },

  async toggleItemChecked(listId: string, itemId: string): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const updatedItems = list.items.map((item) =>
      item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
    );
    await this.updateList(listId, { items: updatedItems });
  },

  async uncheckAllItems(listId: string): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const updatedItems = list.items.map((item) => ({ ...item, isChecked: false }));
    await this.updateList(listId, { items: updatedItems });
  },

  async clearCheckedItems(listId: string): Promise<void> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const updatedItems = list.items.filter((item) => !item.isChecked);
    await this.updateList(listId, { items: updatedItems });
  },

  // Generate shopping list from planned meals
  async generateFromMealPlan(
    name: string,
    startDate: Date,
    endDate: Date
  ): Promise<ShoppingList> {
    // Get all planned meals for the date range
    const meals = await mealPlanRepository.getMealsForDateRange(startDate, endDate);

    // Get all recipes for these meals
    const recipeIds = [...new Set(meals.map((m) => m.recipeId))];
    const recipes = await recipeRepository.getByIds(recipeIds);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // Aggregate ingredients from recipes
    const aggregated = new Map<string, AggregatedIngredient>();

    for (const meal of meals) {
      const recipe = recipeMap.get(meal.recipeId);
      if (!recipe) continue;

      const servingMultiplier = meal.servings / recipe.servings;

      for (const ingredient of recipe.ingredients) {
        const key = `${ingredient.name.toLowerCase()}-${ingredient.unit || 'each'}`;
        const existing = aggregated.get(key);

        const scaledQuantity = ingredient.quantity
          ? ingredient.quantity * servingMultiplier
          : null;

        if (existing) {
          existing.totalQuantity =
            existing.totalQuantity !== null && scaledQuantity !== null
              ? existing.totalQuantity + scaledQuantity
              : null;
          existing.sourceRecipes.push({
            recipeId: recipe.id,
            recipeName: recipe.title,
            quantity: scaledQuantity,
          });
        } else {
          aggregated.set(key, {
            name: ingredient.name,
            totalQuantity: scaledQuantity,
            unit: ingredient.unit,
            storeSection: ingredient.storeSection || 'other',
            sourceRecipes: [
              {
                recipeId: recipe.id,
                recipeName: recipe.title,
                quantity: scaledQuantity,
              },
            ],
          });
        }
      }
    }

    // Aggregate extra items from meals (side dishes, extras)
    const extraAggregated = new Map<string, { name: string; quantity: number | null; unit: string | null; storeSection: string }>();

    for (const meal of meals) {
      if (!meal.extraItems || meal.extraItems.length === 0) continue;

      for (const extra of meal.extraItems) {
        const key = `${extra.name.toLowerCase()}-${extra.unit || 'each'}`;
        const existing = extraAggregated.get(key);

        if (existing) {
          existing.quantity =
            existing.quantity !== null && extra.quantity !== undefined
              ? existing.quantity + extra.quantity
              : existing.quantity ?? extra.quantity ?? null;
        } else {
          extraAggregated.set(key, {
            name: extra.name,
            quantity: extra.quantity ?? null,
            unit: extra.unit ?? null,
            storeSection: extra.storeSection || 'other',
          });
        }
      }
    }

    // Convert aggregated ingredients to shopping items
    const items: ShoppingItem[] = Array.from(aggregated.values()).map((agg) => ({
      id: uuidv4(),
      name: agg.name,
      quantity: agg.totalQuantity,
      unit: agg.unit,
      storeSection: agg.storeSection,
      isChecked: false,
      sourceRecipeIds: agg.sourceRecipes.map((r) => r.recipeId),
      isManual: false,
      isRecurring: false,
    }));

    // Add extra items (meal extras/side dishes)
    for (const extra of extraAggregated.values()) {
      items.push({
        id: uuidv4(),
        name: extra.name,
        quantity: extra.quantity,
        unit: extra.unit as ShoppingItem['unit'],
        storeSection: extra.storeSection,
        isChecked: false,
        sourceRecipeIds: [], // Not from a recipe, from meal extras
        isManual: false,
        isRecurring: false,
      });
    }

    // Create the shopping list
    const list = await this.createList(name, startDate, endDate);
    await this.updateList(list.id, { items });

    return { ...list, items };
  },

  // Recurring items
  async getRecurringItems(): Promise<ShoppingItem[]> {
    const lists = await this.getAllLists();
    const recurringItems: ShoppingItem[] = [];

    for (const list of lists) {
      for (const item of list.items) {
        if (item.isRecurring) {
          recurringItems.push(item);
        }
      }
    }

    return recurringItems;
  },

  // Duplicate a list
  async duplicateList(id: string, newName: string): Promise<ShoppingList> {
    const original = await this.getListById(id);
    if (!original) throw new Error('Shopping list not found');

    const now = new Date();
    const newList: ShoppingList = {
      id: uuidv4(),
      name: newName,
      items: original.items.map((item) => ({
        ...item,
        id: uuidv4(),
        isChecked: false,
      })),
      dateRangeStart: original.dateRangeStart,
      dateRangeEnd: original.dateRangeEnd,
      createdAt: now,
      updatedAt: now,
    };

    await db.shoppingLists.add(newList);
    return newList;
  },

  // Bulk operations
  async bulkAddLists(lists: ShoppingList[]): Promise<void> {
    await db.shoppingLists.bulkAdd(lists);
  },

  async clearAll(): Promise<void> {
    await db.shoppingLists.clear();
  },
};
