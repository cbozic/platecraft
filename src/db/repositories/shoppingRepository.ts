import { db } from '../database';
import type {
  ShoppingList,
  ShoppingItem,
  ShoppingListGenerationResult,
  PendingIngredientMatch,
  SourceRecipeDetail,
  MeasurementUnit,
  AlternateUnit,
  OriginalAmount,
} from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { mealPlanRepository } from './mealPlanRepository';
import { recipeRepository } from './recipeRepository';
import { settingsRepository } from './settingsRepository';
import {
  ingredientDeduplicationService,
  type UnitEstimationRequest,
} from '@/services/ingredientDeduplicationService';
import {
  normalizeIngredientName,
  selectCanonicalName,
} from '@/services/ingredientNormalizationService';
import {
  getUnitCategory,
  aggregateAmounts,
  generateAlternateUnits,
} from '@/utils/unitConversion';

// Helper function to auto-check staple ingredients
async function applyStapleChecking(items: ShoppingItem[]): Promise<ShoppingItem[]> {
  const [staples, exclusions] = await Promise.all([
    settingsRepository.getStapleIngredients(),
    settingsRepository.getStapleExclusions(),
  ]);

  if (staples.length === 0) {
    return items;
  }

  // For each item, check if any staple is contained within the item name
  // BUT also check if any exclusion pattern is present - exclusions override staples
  return items.map((item) => {
    const itemNameLower = item.name.toLowerCase();
    const containsStaple = staples.some((staple) => itemNameLower.includes(staple));
    const containsExclusion = exclusions.some((exclusion) => itemNameLower.includes(exclusion));

    // Only auto-check if it contains a staple AND does NOT contain an exclusion
    const isStaple = containsStaple && !containsExclusion;

    return {
      ...item,
      isChecked: isStaple,
    };
  });
}

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
    await settingsRepository.touchLastModified();
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
    await settingsRepository.touchLastModified();
  },

  async deleteList(id: string): Promise<void> {
    await db.shoppingLists.delete(id);
    await settingsRepository.touchLastModified();
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

  // Generate shopping list from planned meals with intelligent ingredient deduplication
  async generateFromMealPlan(
    name: string,
    startDate: Date,
    endDate: Date,
    options?: {
      useAI?: boolean;
      signal?: AbortSignal;
      onProgress?: (phase: 'gathering' | 'analyzing') => void;
    }
  ): Promise<ShoppingListGenerationResult> {
    const useAI = options?.useAI ?? true;
    const { signal, onProgress } = options || {};

    // Notify that we're gathering ingredients
    onProgress?.('gathering');

    // Get all planned meals for the date range
    const meals = await mealPlanRepository.getMealsForDateRange(startDate, endDate);

    // Get all recipes for these meals
    const recipeIds = [...new Set(meals.map((m) => m.recipeId))];
    const recipes = await recipeRepository.getByIds(recipeIds);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    // Collect all ingredients with full details for deduplication
    interface IngredientWithSource {
      name: string;
      originalName: string; // Keep original name for sourceRecipeDetails
      quantity: number | null;
      unit: MeasurementUnit | null;
      storeSection: string;
      recipeId: string;
      recipeName: string;
    }

    const allIngredients: IngredientWithSource[] = [];

    for (const meal of meals) {
      const recipe = recipeMap.get(meal.recipeId);
      if (!recipe) continue;

      const servingMultiplier = meal.servings / recipe.servings;

      for (const ingredient of recipe.ingredients) {
        const scaledQuantity = ingredient.quantity
          ? ingredient.quantity * servingMultiplier
          : null;

        allIngredients.push({
          name: ingredient.name,
          originalName: ingredient.name,
          quantity: scaledQuantity,
          unit: ingredient.unit,
          storeSection: ingredient.storeSection || 'other',
          recipeId: recipe.id,
          recipeName: recipe.title,
        });
      }
    }

    // Get saved ingredient mappings
    const mappingsMap = await ingredientDeduplicationService.getMappingsMap();

    // Apply saved mappings to get canonical names
    for (const ing of allIngredients) {
      const canonical = mappingsMap.get(ing.name.toLowerCase());
      if (canonical) {
        ing.name = canonical;
      }
    }

    // Step 1: Normalize all ingredient names for better matching
    interface NormalizedIngredient extends IngredientWithSource {
      normalizedName: string;
      displayName: string;
    }

    const normalizedIngredients: NormalizedIngredient[] = allIngredients.map((ing) => {
      const normalized = normalizeIngredientName(ing.name);
      return {
        ...ing,
        normalizedName: normalized.normalizedName,
        displayName: normalized.displayName,
      };
    });

    // Step 2: Group by NORMALIZED name only (not unit!) to allow unit merging
    const groupedByName = new Map<
      string,
      {
        ingredients: NormalizedIngredient[];
        storeSection: string;
        originalNames: string[];
      }
    >();

    for (const ing of normalizedIngredients) {
      const key = ing.normalizedName;
      const existing = groupedByName.get(key);

      if (existing) {
        existing.ingredients.push(ing);
        if (!existing.originalNames.includes(ing.originalName)) {
          existing.originalNames.push(ing.originalName);
        }
      } else {
        groupedByName.set(key, {
          ingredients: [ing],
          storeSection: ing.storeSection,
          originalNames: [ing.originalName],
        });
      }
    }

    // Step 3: For each group, aggregate amounts with unit conversion
    interface AggregatedItem {
      normalizedName: string;
      displayName: string;
      quantity: number | null;
      unit: MeasurementUnit | null;
      storeSection: string;
      sourceRecipeDetails: SourceRecipeDetail[];
      alternateUnits: AlternateUnit[];
      originalAmounts: OriginalAmount[];
      isEstimated: boolean;
      estimationNote?: string;
      needsEstimation: boolean;
    }

    const aggregatedItems: AggregatedItem[] = [];
    const needsEstimation: Array<{
      normalizedName: string;
      item: AggregatedItem;
    }> = [];

    for (const [normalizedName, group] of groupedByName) {
      // Build amounts array for aggregation
      const amounts = group.ingredients.map((ing) => ({
        quantity: ing.quantity,
        unit: ing.unit,
        recipeId: ing.recipeId,
        recipeName: ing.recipeName,
      }));

      // Select the best display name from the original names
      const displayName = selectCanonicalName(group.originalNames);

      // Aggregate using unit conversion utilities
      const aggregated = aggregateAmounts(amounts, normalizedName);

      // Build source recipe details
      const sourceRecipeDetails: SourceRecipeDetail[] = group.ingredients.map(
        (ing) => ({
          recipeId: ing.recipeId,
          recipeName: ing.recipeName,
          quantity: ing.quantity,
          unit: ing.unit,
          originalIngredientName: ing.originalName,
        })
      );

      const item: AggregatedItem = {
        normalizedName,
        displayName,
        quantity: aggregated.displayQuantity,
        unit: aggregated.displayUnit,
        storeSection: group.storeSection,
        sourceRecipeDetails,
        alternateUnits: aggregated.alternateUnits,
        originalAmounts: aggregated.originalAmounts,
        isEstimated: aggregated.isEstimated,
        estimationNote: aggregated.estimationNote,
        needsEstimation: aggregated.needsAIEstimation || false,
      };

      aggregatedItems.push(item);

      if (item.needsEstimation) {
        needsEstimation.push({ normalizedName, item });
      }
    }

    // Step 4: Handle cross-category estimation if needed
    if (needsEstimation.length > 0 && useAI && !signal?.aborted) {
      onProgress?.('analyzing');

      // Build estimation requests for items with mixed unit categories
      const estimationRequests: UnitEstimationRequest[] = [];

      for (const { normalizedName, item } of needsEstimation) {
        // Find the amounts that need conversion
        const countAmounts = item.originalAmounts.filter(
          (a) => a.quantity && getUnitCategory(a.unit) === 'count'
        );
        const weightAmounts = item.originalAmounts.filter(
          (a) => a.quantity && getUnitCategory(a.unit) === 'weight'
        );

        // If we have count amounts and weight amounts, convert count to weight
        if (countAmounts.length > 0 && weightAmounts.length > 0) {
          for (const countAmt of countAmounts) {
            if (countAmt.quantity) {
              estimationRequests.push({
                ingredientName: normalizedName,
                fromQuantity: countAmt.quantity,
                fromUnit: countAmt.unit,
                toCategory: 'weight',
              });
            }
          }
        }
        // If we only have count amounts, estimate weight for typical shopping
        else if (countAmounts.length > 0) {
          const totalCount = countAmounts.reduce(
            (sum, a) => sum + (a.quantity || 0),
            0
          );
          estimationRequests.push({
            ingredientName: normalizedName,
            fromQuantity: totalCount,
            fromUnit: 'each',
            toCategory: 'weight',
          });
        }
      }

      if (estimationRequests.length > 0) {
        const estimationResults =
          await ingredientDeduplicationService.estimateUnitConversion(
            estimationRequests,
            signal
          );

        // Apply estimations to items
        for (const result of estimationResults) {
          const itemToUpdate = aggregatedItems.find(
            (i) => i.normalizedName === result.ingredientName
          );
          if (itemToUpdate && result.confidence > 0.5) {
            // Add the estimated weight to existing weight amounts
            const existingWeightBase =
              itemToUpdate.originalAmounts
                .filter((a) => getUnitCategory(a.unit) === 'weight')
                .reduce((sum, a) => {
                  if (!a.quantity || !a.unit) return sum;
                  const info = { lb: 453.592, oz: 28.3495, g: 1, kg: 1000 }[
                    a.unit as string
                  ];
                  return sum + (a.quantity * (info || 0));
                }, 0) || 0;

            const totalGrams =
              existingWeightBase + result.estimatedQuantityInGrams;
            const totalLbs = totalGrams / 453.592;

            itemToUpdate.quantity = Math.round(totalLbs * 100) / 100;
            itemToUpdate.unit = 'lb';
            itemToUpdate.isEstimated = true;
            itemToUpdate.estimationNote = result.displayNote;
            itemToUpdate.alternateUnits = generateAlternateUnits(
              itemToUpdate.quantity,
              'lb',
              'weight'
            );
          }
        }
      }
    }

    // Aggregate extra items from meals (side dishes, extras)
    const extraAggregated = new Map<
      string,
      { name: string; quantity: number | null; unit: string | null; storeSection: string }
    >();

    for (const meal of meals) {
      if (!meal.extraItems || meal.extraItems.length === 0) continue;

      for (const extra of meal.extraItems) {
        // Normalize extra item names too
        const normalized = normalizeIngredientName(extra.name);
        const key = normalized.normalizedName;
        const existing = extraAggregated.get(key);

        if (existing) {
          existing.quantity =
            existing.quantity !== null && extra.quantity !== undefined
              ? existing.quantity + extra.quantity
              : existing.quantity ?? extra.quantity ?? null;
        } else {
          extraAggregated.set(key, {
            name: normalized.displayName || extra.name,
            quantity: extra.quantity ?? null,
            unit: extra.unit ?? null,
            storeSection: extra.storeSection || 'other',
          });
        }
      }
    }

    // Convert aggregated ingredients to shopping items with all new fields
    const items: ShoppingItem[] = aggregatedItems.map((agg) => ({
      id: uuidv4(),
      name: agg.displayName,
      quantity: agg.quantity,
      unit: agg.unit,
      storeSection: agg.storeSection,
      isChecked: false,
      sourceRecipeIds: [...new Set(agg.sourceRecipeDetails.map((r) => r.recipeId))],
      sourceRecipeDetails: agg.sourceRecipeDetails,
      isManual: false,
      isRecurring: false,
      alternateUnits: agg.alternateUnits.length > 0 ? agg.alternateUnits : undefined,
      isEstimated: agg.isEstimated || undefined,
      estimationNote: agg.estimationNote,
      originalAmounts: agg.originalAmounts.length > 0 ? agg.originalAmounts : undefined,
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
        sourceRecipeIds: [],
        sourceRecipeDetails: [],
        isManual: false,
        isRecurring: false,
      });
    }

    // Apply staple ingredient auto-checking
    const itemsWithStaplesChecked = await applyStapleChecking(items);

    // Create the shopping list
    const list = await this.createList(name, startDate, endDate);
    await this.updateList(list.id, { items: itemsWithStaplesChecked });

    const finalList = { ...list, items: itemsWithStaplesChecked };

    // Check for potential AI matches on unmapped ingredients
    let pendingMatches: PendingIngredientMatch[] = [];
    let usedAI = false;
    let cancelled = false;

    if (useAI && !signal?.aborted && (await ingredientDeduplicationService.isAIAvailable())) {
      // Find ingredients that weren't mapped (still using original names)
      const unmappedIngredients = allIngredients.filter(
        (ing) => !mappingsMap.has(ing.originalName.toLowerCase())
      );

      if (unmappedIngredients.length >= 2) {
        // Notify that we're now analyzing with AI
        onProgress?.('analyzing');

        const result = await ingredientDeduplicationService.identifyPotentialMatches(
          unmappedIngredients.map((ing) => ({
            name: ing.originalName,
            recipeId: ing.recipeId,
            recipeName: ing.recipeName,
            quantity: ing.quantity,
            unit: ing.unit,
          })),
          signal
        );

        if (result.cancelled) {
          cancelled = true;
        } else {
          pendingMatches = result.matches;
          usedAI = true;
        }
      }
    }

    return {
      list: finalList,
      pendingMatches,
      usedAI,
      cancelled,
    };
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

    // Reset items and apply staple checking
    const resetItems = original.items.map((item) => ({
      ...item,
      id: uuidv4(),
      isChecked: false,
    }));
    const itemsWithStaplesChecked = await applyStapleChecking(resetItems);

    const now = new Date();
    const newList: ShoppingList = {
      id: uuidv4(),
      name: newName,
      items: itemsWithStaplesChecked,
      dateRangeStart: original.dateRangeStart,
      dateRangeEnd: original.dateRangeEnd,
      createdAt: now,
      updatedAt: now,
    };

    await db.shoppingLists.add(newList);
    return newList;
  },

  // Group multiple items into one
  async groupItemsInList(
    listId: string,
    itemIds: string[],
    canonicalName: string,
    targetSection: string
  ): Promise<ShoppingItem> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    // Get items to be grouped
    const itemsToGroup = list.items.filter((item) => itemIds.includes(item.id));
    if (itemsToGroup.length < 2) {
      throw new Error('Need at least 2 items to group');
    }

    // Merge sourceRecipeDetails from all items
    const mergedSourceRecipeDetails: SourceRecipeDetail[] = [];
    const mergedOriginalAmounts: OriginalAmount[] = [];

    for (const item of itemsToGroup) {
      if (item.sourceRecipeDetails && item.sourceRecipeDetails.length > 0) {
        mergedSourceRecipeDetails.push(...item.sourceRecipeDetails);
      } else if (item.isManual) {
        // For manual items without recipe sources, create a pseudo-source
        mergedSourceRecipeDetails.push({
          recipeId: '',
          recipeName: 'Manual',
          quantity: item.quantity,
          unit: item.unit,
          originalIngredientName: item.name,
        });
      }
      if (item.originalAmounts) {
        mergedOriginalAmounts.push(...item.originalAmounts);
      }
    }

    // Aggregate quantities using unit conversion
    const amounts = itemsToGroup.map((item) => ({
      quantity: item.quantity,
      unit: item.unit,
      recipeId: '',
      recipeName: '',
    }));
    const aggregated = aggregateAmounts(amounts, canonicalName);

    // Create the new grouped item
    const newItem: ShoppingItem = {
      id: uuidv4(),
      name: canonicalName,
      quantity: aggregated.displayQuantity,
      unit: aggregated.displayUnit,
      storeSection: targetSection,
      isChecked: false, // Grouped item starts unchecked
      sourceRecipeIds: [
        ...new Set(mergedSourceRecipeDetails.map((s) => s.recipeId).filter(Boolean)),
      ],
      sourceRecipeDetails: mergedSourceRecipeDetails,
      isManual: itemsToGroup.every((item) => item.isManual),
      isRecurring: false,
      alternateUnits:
        aggregated.alternateUnits.length > 0 ? aggregated.alternateUnits : undefined,
      isEstimated: aggregated.isEstimated || undefined,
      estimationNote: aggregated.estimationNote,
      originalAmounts:
        mergedOriginalAmounts.length > 0 ? mergedOriginalAmounts : undefined,
    };

    // Remove original items and add new grouped item
    const updatedItems = list.items.filter((item) => !itemIds.includes(item.id));
    updatedItems.push(newItem);
    await this.updateList(listId, { items: updatedItems });

    return newItem;
  },

  // Ungroup an item back into separate items
  async ungroupItemInList(listId: string, itemId: string): Promise<ShoppingItem[]> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const itemToUngroup = list.items.find((item) => item.id === itemId);
    if (!itemToUngroup) throw new Error('Item not found');

    if (
      !itemToUngroup.sourceRecipeDetails ||
      itemToUngroup.sourceRecipeDetails.length < 2
    ) {
      throw new Error('Item cannot be ungrouped - no sources to separate');
    }

    // Group source details by original ingredient name to create separate items
    const groupedBySources = new Map<
      string,
      {
        sources: SourceRecipeDetail[];
        storeSection: string;
      }
    >();

    for (const source of itemToUngroup.sourceRecipeDetails) {
      const key = source.originalIngredientName.toLowerCase();
      if (!groupedBySources.has(key)) {
        groupedBySources.set(key, {
          sources: [],
          storeSection: itemToUngroup.storeSection,
        });
      }
      groupedBySources.get(key)!.sources.push(source);
    }

    // Create separate items for each original ingredient
    const newItems: ShoppingItem[] = [];

    for (const [_key, group] of groupedBySources) {
      const amounts = group.sources.map((s) => ({
        quantity: s.quantity,
        unit: s.unit,
        recipeId: s.recipeId,
        recipeName: s.recipeName,
      }));
      const aggregated = aggregateAmounts(amounts, group.sources[0].originalIngredientName);

      const newItem: ShoppingItem = {
        id: uuidv4(),
        name: group.sources[0].originalIngredientName,
        quantity: aggregated.displayQuantity,
        unit: aggregated.displayUnit,
        storeSection: group.storeSection,
        isChecked: false,
        sourceRecipeIds: [...new Set(group.sources.map((s) => s.recipeId).filter(Boolean))],
        sourceRecipeDetails: group.sources,
        isManual: group.sources.every((s) => !s.recipeId),
        isRecurring: false,
        alternateUnits:
          aggregated.alternateUnits.length > 0 ? aggregated.alternateUnits : undefined,
        isEstimated: aggregated.isEstimated || undefined,
        originalAmounts:
          aggregated.originalAmounts.length > 0 ? aggregated.originalAmounts : undefined,
      };

      newItems.push(newItem);
    }

    // Remove original grouped item and add new separate items
    const updatedItems = list.items.filter((item) => item.id !== itemId);
    updatedItems.push(...newItems);
    await this.updateList(listId, { items: updatedItems });

    return newItems;
  },

  // Partially ungroup an item - remove selected sources, keep rest grouped
  async partialUngroupItemInList(
    listId: string,
    itemId: string,
    sourceIndicesToRemove: number[]
  ): Promise<{ removedItems: ShoppingItem[]; updatedGroupItem?: ShoppingItem }> {
    const list = await this.getListById(listId);
    if (!list) throw new Error('Shopping list not found');

    const itemToUngroup = list.items.find((item) => item.id === itemId);
    if (!itemToUngroup) throw new Error('Item not found');

    if (!itemToUngroup.sourceRecipeDetails || itemToUngroup.sourceRecipeDetails.length === 0) {
      throw new Error('Item has no sources to ungroup');
    }

    if (sourceIndicesToRemove.length === 0) {
      throw new Error('No sources specified for removal');
    }

    // Separate sources into removed and remaining
    const removedSources: SourceRecipeDetail[] = [];
    const remainingSources: SourceRecipeDetail[] = [];

    itemToUngroup.sourceRecipeDetails.forEach((source, index) => {
      if (sourceIndicesToRemove.includes(index)) {
        removedSources.push(source);
      } else {
        remainingSources.push(source);
      }
    });

    if (removedSources.length === 0) {
      throw new Error('No valid sources to remove');
    }

    // Group removed sources by original ingredient name
    const groupedRemovedSources = new Map<
      string,
      {
        sources: SourceRecipeDetail[];
        storeSection: string;
      }
    >();

    for (const source of removedSources) {
      const key = source.originalIngredientName.toLowerCase();
      if (!groupedRemovedSources.has(key)) {
        groupedRemovedSources.set(key, {
          sources: [],
          storeSection: itemToUngroup.storeSection,
        });
      }
      groupedRemovedSources.get(key)!.sources.push(source);
    }

    // Create new items for removed sources
    const newItems: ShoppingItem[] = [];

    for (const [_key, group] of groupedRemovedSources) {
      const amounts = group.sources.map((s) => ({
        quantity: s.quantity,
        unit: s.unit,
        recipeId: s.recipeId,
        recipeName: s.recipeName,
      }));
      const aggregated = aggregateAmounts(amounts, group.sources[0].originalIngredientName);

      const newItem: ShoppingItem = {
        id: uuidv4(),
        name: group.sources[0].originalIngredientName,
        quantity: aggregated.displayQuantity,
        unit: aggregated.displayUnit,
        storeSection: group.storeSection,
        isChecked: false,
        sourceRecipeIds: [...new Set(group.sources.map((s) => s.recipeId).filter(Boolean))],
        sourceRecipeDetails: group.sources,
        isManual: group.sources.every((s) => !s.recipeId),
        isRecurring: false,
        alternateUnits:
          aggregated.alternateUnits.length > 0 ? aggregated.alternateUnits : undefined,
        isEstimated: aggregated.isEstimated || undefined,
        originalAmounts:
          aggregated.originalAmounts.length > 0 ? aggregated.originalAmounts : undefined,
      };

      newItems.push(newItem);
    }

    let updatedGroupItem: ShoppingItem | undefined;
    let updatedItems = list.items.filter((item) => item.id !== itemId);

    // Handle remaining sources
    if (remainingSources.length === 0) {
      // All sources removed, delete the grouped item entirely
      updatedGroupItem = undefined;
    } else if (remainingSources.length === 1) {
      // Only 1 source remaining, convert to non-grouped item
      const singleSource = remainingSources[0];
      updatedGroupItem = {
        id: uuidv4(),
        name: singleSource.originalIngredientName,
        quantity: singleSource.quantity,
        unit: singleSource.unit,
        storeSection: itemToUngroup.storeSection,
        isChecked: itemToUngroup.isChecked,
        sourceRecipeIds: singleSource.recipeId ? [singleSource.recipeId] : [],
        sourceRecipeDetails: remainingSources,
        isManual: !singleSource.recipeId,
        isRecurring: false,
      };
      updatedItems.push(updatedGroupItem);
    } else {
      // Multiple sources remaining, update the grouped item with remaining sources
      const amounts = remainingSources.map((s) => ({
        quantity: s.quantity,
        unit: s.unit,
        recipeId: s.recipeId,
        recipeName: s.recipeName,
      }));
      const aggregated = aggregateAmounts(amounts, itemToUngroup.name);

      updatedGroupItem = {
        ...itemToUngroup,
        quantity: aggregated.displayQuantity,
        unit: aggregated.displayUnit,
        sourceRecipeIds: [...new Set(remainingSources.map((s) => s.recipeId).filter(Boolean))],
        sourceRecipeDetails: remainingSources,
        alternateUnits:
          aggregated.alternateUnits.length > 0 ? aggregated.alternateUnits : undefined,
        isEstimated: aggregated.isEstimated || undefined,
        estimationNote: aggregated.estimationNote,
        originalAmounts:
          aggregated.originalAmounts.length > 0 ? aggregated.originalAmounts : undefined,
      };
      updatedItems.push(updatedGroupItem);
    }

    // Add new separate items
    updatedItems.push(...newItems);
    await this.updateList(listId, { items: updatedItems });

    return { removedItems: newItems, updatedGroupItem };
  },

  // Bulk operations
  async bulkAddLists(lists: ShoppingList[]): Promise<void> {
    await db.shoppingLists.bulkAdd(lists);
  },

  async clearAll(): Promise<void> {
    await db.shoppingLists.clear();
  },
};
