import { useState, useEffect, useCallback, useMemo } from 'react';
import { shoppingRepository } from '@/db';
import type { ShoppingList, ShoppingItem, StoreSectionInfo } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types/shopping';

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

  // Generate list from meal plan
  const generateFromMealPlan = useCallback(
    async (name: string, startDate: Date, endDate: Date) => {
      try {
        const newList = await shoppingRepository.generateFromMealPlan(name, startDate, endDate);
        setLists((prev) => [newList, ...prev]);
        return newList;
      } catch (error) {
        console.error('Failed to generate shopping list:', error);
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

    // Refresh
    refresh: loadLists,
  };
}
