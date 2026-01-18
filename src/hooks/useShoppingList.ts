import { useState, useEffect, useCallback, useMemo } from 'react';
import { shoppingRepository } from '@/db';
import type {
  ShoppingList,
  ShoppingItem,
  StoreSectionInfo,
  ShoppingListGenerationResult,
  PendingIngredientMatch,
  RefinedIngredientGroup,
} from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types/shopping';
import { ingredientDeduplicationService } from '@/services/ingredientDeduplicationService';

interface UseShoppingListOptions {
  listId?: string;
}

export function useShoppingList(options: UseShoppingListOptions = {}) {
  const { listId } = options;

  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [currentList, setCurrentList] = useState<ShoppingList | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load all lists
  const loadLists = useCallback(async () => {
    try {
      const data = await shoppingRepository.getAllLists();
      setLists(data);
    } catch (error) {
      console.error('Failed to load shopping lists:', error);
    }
  }, []);

  // Load specific list
  const loadList = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      const list = await shoppingRepository.getListById(id);
      setCurrentList(list || null);
    } catch (error) {
      console.error('Failed to load shopping list:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await loadLists();
      if (listId) {
        await loadList(listId);
      }
      setIsLoading(false);
    };
    init();
  }, [listId, loadLists, loadList]);

  // Group items by store section
  const itemsBySection = useMemo(() => {
    if (!currentList) return new Map<string, ShoppingItem[]>();

    const map = new Map<string, ShoppingItem[]>();

    // Initialize all sections
    for (const section of DEFAULT_STORE_SECTIONS) {
      map.set(section.id, []);
    }

    // Group items
    for (const item of currentList.items) {
      const sectionId = item.storeSection || 'other';
      const items = map.get(sectionId) || [];
      items.push(item);
      map.set(sectionId, items);
    }

    // Remove empty sections
    for (const [key, items] of map) {
      if (items.length === 0) {
        map.delete(key);
      }
    }

    return map;
  }, [currentList]);

  // Get section info
  const getSectionInfo = useCallback((sectionId: string): StoreSectionInfo => {
    return (
      DEFAULT_STORE_SECTIONS.find((s) => s.id === sectionId) || {
        id: sectionId,
        name: sectionId,
        order: 999,
        isCustom: true,
      }
    );
  }, []);

  // Progress stats
  const progress = useMemo(() => {
    if (!currentList) return { total: 0, checked: 0, percentage: 0 };

    const total = currentList.items.length;
    const checked = currentList.items.filter((i) => i.isChecked).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

    return { total, checked, percentage };
  }, [currentList]);

  // Generate list from meal plan with optional AI deduplication
  const generateFromMealPlan = useCallback(
    async (
      name: string,
      startDate: Date,
      endDate: Date,
      options?: {
        useAI?: boolean;
        signal?: AbortSignal;
        onProgress?: (phase: 'gathering' | 'analyzing') => void;
      }
    ): Promise<ShoppingListGenerationResult> => {
      try {
        const result = await shoppingRepository.generateFromMealPlan(name, startDate, endDate, options);
        if (!result.cancelled) {
          setLists((prev) => [result.list, ...prev]);
        }
        return result;
      } catch (error) {
        console.error('Failed to generate shopping list:', error);
        throw error;
      }
    },
    []
  );

  // Confirm an AI-suggested ingredient match
  const confirmIngredientMatch = useCallback(
    async (match: PendingIngredientMatch) => {
      try {
        await ingredientDeduplicationService.confirmMatch(match);
      } catch (error) {
        console.error('Failed to confirm ingredient match:', error);
        throw error;
      }
    },
    []
  );

  // Reject an AI-suggested ingredient match
  const rejectIngredientMatch = useCallback(
    async (matchId: string) => {
      try {
        await ingredientDeduplicationService.rejectMatch(matchId);
      } catch (error) {
        console.error('Failed to reject ingredient match:', error);
        throw error;
      }
    },
    []
  );

  // Confirm all AI-suggested ingredient matches
  const confirmAllIngredientMatches = useCallback(
    async (matches: PendingIngredientMatch[]) => {
      try {
        await ingredientDeduplicationService.confirmAllMatches(matches);
      } catch (error) {
        console.error('Failed to confirm all ingredient matches:', error);
        throw error;
      }
    },
    []
  );

  // Confirm refined ingredient groups (for manual splitting/regrouping)
  const confirmRefinedIngredientGroups = useCallback(
    async (groups: RefinedIngredientGroup[]) => {
      try {
        await ingredientDeduplicationService.confirmRefinedGroups(groups);
      } catch (error) {
        console.error('Failed to confirm refined ingredient groups:', error);
        throw error;
      }
    },
    []
  );

  // Create empty list
  const createList = useCallback(async (name: string) => {
    try {
      const now = new Date();
      const newList = await shoppingRepository.createList(name, now, now);
      setLists((prev) => [newList, ...prev]);
      return newList;
    } catch (error) {
      console.error('Failed to create shopping list:', error);
      throw error;
    }
  }, []);

  // Delete list
  const deleteList = useCallback(
    async (id: string) => {
      try {
        await shoppingRepository.deleteList(id);
        setLists((prev) => prev.filter((l) => l.id !== id));
        if (currentList?.id === id) {
          setCurrentList(null);
        }
      } catch (error) {
        console.error('Failed to delete shopping list:', error);
        throw error;
      }
    },
    [currentList]
  );

  // Duplicate list
  const duplicateList = useCallback(async (id: string, newName: string) => {
    try {
      const newList = await shoppingRepository.duplicateList(id, newName);
      setLists((prev) => [newList, ...prev]);
      return newList;
    } catch (error) {
      console.error('Failed to duplicate shopping list:', error);
      throw error;
    }
  }, []);

  // Toggle item checked
  const toggleItem = useCallback(
    async (itemId: string) => {
      if (!currentList) return;

      try {
        await shoppingRepository.toggleItemChecked(currentList.id, itemId);
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
            ),
          };
        });
      } catch (error) {
        console.error('Failed to toggle item:', error);
      }
    },
    [currentList]
  );

  // Add item
  const addItem = useCallback(
    async (item: Omit<ShoppingItem, 'id'>) => {
      if (!currentList) return;

      try {
        const newItem = await shoppingRepository.addItemToList(currentList.id, item);
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: [...prev.items, newItem],
          };
        });
        return newItem;
      } catch (error) {
        console.error('Failed to add item:', error);
        throw error;
      }
    },
    [currentList]
  );

  // Update item
  const updateItem = useCallback(
    async (itemId: string, updates: Partial<ShoppingItem>) => {
      if (!currentList) return;

      try {
        await shoppingRepository.updateItemInList(currentList.id, itemId, updates);
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === itemId ? { ...item, ...updates } : item
            ),
          };
        });
      } catch (error) {
        console.error('Failed to update item:', error);
      }
    },
    [currentList]
  );

  // Remove item
  const removeItem = useCallback(
    async (itemId: string) => {
      if (!currentList) return;

      try {
        await shoppingRepository.removeItemFromList(currentList.id, itemId);
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.filter((item) => item.id !== itemId),
          };
        });
      } catch (error) {
        console.error('Failed to remove item:', error);
      }
    },
    [currentList]
  );

  // Uncheck all items
  const uncheckAll = useCallback(async () => {
    if (!currentList) return;

    try {
      await shoppingRepository.uncheckAllItems(currentList.id);
      setCurrentList((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => ({ ...item, isChecked: false })),
        };
      });
    } catch (error) {
      console.error('Failed to uncheck all items:', error);
    }
  }, [currentList]);

  // Clear checked items
  const clearChecked = useCallback(async () => {
    if (!currentList) return;

    try {
      await shoppingRepository.clearCheckedItems(currentList.id);
      setCurrentList((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((item) => !item.isChecked),
        };
      });
    } catch (error) {
      console.error('Failed to clear checked items:', error);
    }
  }, [currentList]);

  // Group multiple items into one
  const groupItems = useCallback(
    async (
      itemIds: string[],
      canonicalName: string,
      targetSection: string,
      saveMapping: boolean = true
    ) => {
      if (!currentList) return;

      try {
        // Get items to be grouped for mapping
        const itemsToGroup = currentList.items.filter((item) =>
          itemIds.includes(item.id)
        );

        // Call repository method
        const newItem = await shoppingRepository.groupItemsInList(
          currentList.id,
          itemIds,
          canonicalName,
          targetSection
        );

        // Update local state
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: [...prev.items.filter((item) => !itemIds.includes(item.id)), newItem],
          };
        });

        // Optionally save mapping for future lists
        if (saveMapping && itemsToGroup.length >= 2) {
          const ingredientNames = itemsToGroup.map((item) => item.name);
          const uniqueNames = [...new Set(ingredientNames.map((n) => n.toLowerCase()))];

          // Only save mapping if there are different names
          if (uniqueNames.length >= 2) {
            const group: RefinedIngredientGroup = {
              id: newItem.id,
              ingredientNames,
              canonicalName,
              affectedRecipes: itemsToGroup.flatMap((item) =>
                (item.sourceRecipeDetails || []).map((s) => ({
                  recipeId: s.recipeId,
                  recipeName: s.recipeName,
                  ingredientName: s.originalIngredientName,
                }))
              ),
            };
            await confirmRefinedIngredientGroups([group]);
          }
        }

        return newItem;
      } catch (error) {
        console.error('Failed to group items:', error);
        throw error;
      }
    },
    [currentList, confirmRefinedIngredientGroups]
  );

  // Ungroup item back into separate items
  const ungroupItem = useCallback(
    async (itemId: string) => {
      if (!currentList) return;

      try {
        const newItems = await shoppingRepository.ungroupItemInList(
          currentList.id,
          itemId
        );

        // Update local state
        setCurrentList((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: [...prev.items.filter((item) => item.id !== itemId), ...newItems],
          };
        });

        return newItems;
      } catch (error) {
        console.error('Failed to ungroup item:', error);
        throw error;
      }
    },
    [currentList]
  );

  // Partially ungroup item - remove selected sources, keep rest grouped
  const partialUngroupItem = useCallback(
    async (itemId: string, sourceIndicesToRemove: number[]) => {
      if (!currentList) return;

      try {
        const result = await shoppingRepository.partialUngroupItemInList(
          currentList.id,
          itemId,
          sourceIndicesToRemove
        );

        // Update local state
        setCurrentList((prev) => {
          if (!prev) return prev;

          // Remove original item
          let updatedItems = prev.items.filter((item) => item.id !== itemId);

          // Add back the updated group item if it still exists
          if (result.updatedGroupItem) {
            updatedItems.push(result.updatedGroupItem);
          }

          // Add new separate items
          updatedItems.push(...result.removedItems);

          return {
            ...prev,
            items: updatedItems,
          };
        });

        return result;
      } catch (error) {
        console.error('Failed to partially ungroup item:', error);
        throw error;
      }
    },
    [currentList]
  );

  return {
    // State
    lists,
    currentList,
    isLoading,
    itemsBySection,
    progress,

    // Helpers
    getSectionInfo,

    // List operations
    loadList,
    generateFromMealPlan,
    createList,
    deleteList,
    duplicateList,

    // Item operations
    toggleItem,
    addItem,
    updateItem,
    removeItem,
    uncheckAll,
    clearChecked,

    // Grouping operations
    groupItems,
    ungroupItem,
    partialUngroupItem,

    // Ingredient matching operations
    confirmIngredientMatch,
    rejectIngredientMatch,
    confirmAllIngredientMatches,
    confirmRefinedIngredientGroups,

    // Refresh
    refresh: loadLists,
  };
}
