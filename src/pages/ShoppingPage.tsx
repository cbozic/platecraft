import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Calendar, Printer, Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import {
  DateRangePicker,
  ShoppingListDetail,
  IngredientMatchModal,
  GeneratingListModal,
} from '@/components/shopping';
import { useShoppingList } from '@/hooks';
import type { ShoppingList, PendingIngredientMatch, RefinedIngredientGroup } from '@/types';
import styles from './ShoppingPage.module.css';

interface LocationState {
  openListId?: string;
}

export function ShoppingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;

  const {
    lists,
    currentList,
    isLoading,
    itemsBySection,
    progress,
    getSectionInfo,
    loadList,
    generateFromMealPlan,
    createList,
    deleteList,
    duplicateList,
    toggleItem,
    addItem,
    updateItem,
    removeItem,
    uncheckAll,
    clearChecked,
    groupItems,
    ungroupItem,
    partialUngroupItem,
    confirmIngredientMatch,
    rejectIngredientMatch,
    confirmAllIngredientMatches,
    confirmRefinedIngredientGroups,
  } = useShoppingList();

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [pendingMatches, setPendingMatches] = useState<PendingIngredientMatch[]>([]);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzingIngredients, setIsAnalyzingIngredients] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle returning to a specific list (e.g., from recipe detail page)
  useEffect(() => {
    if (locationState?.openListId && !isLoading) {
      setSelectedListId(locationState.openListId);
      loadList(locationState.openListId);
      // Clear the state to prevent re-opening on refresh
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [locationState?.openListId, isLoading, loadList, navigate, location.pathname]);

  const handleGenerate = useCallback(
    async (name: string, startDate: Date, endDate: Date) => {
      // Create a new AbortController for this generation
      abortControllerRef.current = new AbortController();
      setIsGenerating(true);
      setIsAnalyzingIngredients(false);

      try {
        const result = await generateFromMealPlan(name, startDate, endDate, {
          signal: abortControllerRef.current.signal,
          onProgress: (phase) => {
            setIsAnalyzingIngredients(phase === 'analyzing');
          },
        });

        // Don't update UI if cancelled
        if (result.cancelled) {
          return;
        }

        setSelectedListId(result.list.id);
        await loadList(result.list.id);

        // Show ingredient match modal if AI found potential matches
        if (result.pendingMatches.length > 0) {
          setPendingMatches(result.pendingMatches);
          setShowMatchModal(true);
        }
      } catch (error) {
        console.error('Failed to generate list:', error);
      } finally {
        setIsGenerating(false);
        setIsAnalyzingIngredients(false);
        abortControllerRef.current = null;
      }
    },
    [generateFromMealPlan, loadList]
  );

  const handleCancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
    setIsAnalyzingIngredients(false);
  }, []);

  // Handler for navigating to a recipe from shopping list
  const handleNavigateToRecipe = useCallback(
    (recipeId: string) => {
      navigate(`/recipes/${recipeId}`, {
        state: { from: 'shopping', listId: selectedListId },
      });
    },
    [navigate, selectedListId]
  );

  // Handlers for ingredient match confirmation
  const handleConfirmMatch = useCallback(
    async (match: PendingIngredientMatch) => {
      await confirmIngredientMatch(match);
    },
    [confirmIngredientMatch]
  );

  const handleRejectMatch = useCallback(
    async (matchId: string) => {
      await rejectIngredientMatch(matchId);
    },
    [rejectIngredientMatch]
  );

  const handleConfirmAllMatches = useCallback(async () => {
    await confirmAllIngredientMatches(pendingMatches);
    setShowMatchModal(false);
    setPendingMatches([]);
  }, [confirmAllIngredientMatches, pendingMatches]);

  const handleSkipAllMatches = useCallback(() => {
    setShowMatchModal(false);
    setPendingMatches([]);
  }, []);

  const handleConfirmRefined = useCallback(
    async (groups: RefinedIngredientGroup[]) => {
      await confirmRefinedIngredientGroups(groups);
    },
    [confirmRefinedIngredientGroups]
  );

  // Handlers for grouping/ungrouping items
  const handleGroupItems = useCallback(
    async (
      itemIds: string[],
      canonicalName: string,
      targetSection: string,
      saveMapping: boolean
    ) => {
      try {
        await groupItems(itemIds, canonicalName, targetSection, saveMapping);
      } catch (error) {
        console.error('Failed to group items:', error);
      }
    },
    [groupItems]
  );

  const handleUngroupItem = useCallback(
    async (itemId: string) => {
      try {
        await ungroupItem(itemId);
      } catch (error) {
        console.error('Failed to ungroup item:', error);
      }
    },
    [ungroupItem]
  );

  const handlePartialUngroupItem = useCallback(
    async (itemId: string, sourceIndices: number[]) => {
      try {
        await partialUngroupItem(itemId, sourceIndices);
      } catch (error) {
        console.error('Failed to partially ungroup item:', error);
      }
    },
    [partialUngroupItem]
  );

  const handleCreateEmpty = useCallback(async () => {
    const name = `Shopping List - ${format(new Date(), 'MMM d, yyyy')}`;
    try {
      const newList = await createList(name);
      setSelectedListId(newList.id);
      await loadList(newList.id);
    } catch (error) {
      console.error('Failed to create list:', error);
    }
  }, [createList, loadList]);

  const handleViewList = useCallback(
    async (list: ShoppingList) => {
      setSelectedListId(list.id);
      await loadList(list.id);
    },
    [loadList]
  );

  const handleBack = useCallback(() => {
    setSelectedListId(null);
  }, []);

  const handleDeleteList = useCallback(async () => {
    if (!currentList) return;
    if (window.confirm(`Delete "${currentList.name}"? This cannot be undone.`)) {
      await deleteList(currentList.id);
      setSelectedListId(null);
    }
  }, [currentList, deleteList]);

  const handleDuplicateList = useCallback(async () => {
    if (!currentList) return;
    const newName = `${currentList.name} (Copy)`;
    try {
      const newList = await duplicateList(currentList.id, newName);
      setSelectedListId(newList.id);
      await loadList(newList.id);
    } catch (error) {
      console.error('Failed to duplicate list:', error);
    }
  }, [currentList, duplicateList, loadList]);

  const handlePrintList = useCallback((e: React.MouseEvent, list: ShoppingList) => {
    e.stopPropagation();
    // For now, just view the list - print is handled in detail view
    setSelectedListId(list.id);
    loadList(list.id).then(() => {
      setTimeout(() => window.print(), 100);
    });
  }, [loadList]);

  const handleDeleteFromGrid = useCallback(
    async (e: React.MouseEvent, list: ShoppingList) => {
      e.stopPropagation();
      if (window.confirm(`Delete "${list.name}"? This cannot be undone.`)) {
        await deleteList(list.id);
      }
    },
    [deleteList]
  );

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading shopping lists...</p>
      </div>
    );
  }

  // Show detail view if a list is selected
  if (selectedListId && currentList) {
    return (
      <div className={styles.page}>
        <ShoppingListDetail
          list={currentList}
          itemsBySection={itemsBySection}
          progress={progress}
          getSectionInfo={getSectionInfo}
          onBack={handleBack}
          onToggleItem={toggleItem}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onAddItem={addItem}
          onUncheckAll={uncheckAll}
          onClearChecked={clearChecked}
          onDuplicate={handleDuplicateList}
          onDelete={handleDeleteList}
          onNavigateToRecipe={handleNavigateToRecipe}
          onGroupItems={handleGroupItems}
          onUngroupItem={handleUngroupItem}
          onPartialUngroupItem={handlePartialUngroupItem}
        />

        <IngredientMatchModal
          isOpen={showMatchModal}
          onClose={() => setShowMatchModal(false)}
          pendingMatches={pendingMatches}
          onConfirm={handleConfirmMatch}
          onReject={handleRejectMatch}
          onConfirmAll={handleConfirmAllMatches}
          onSkipAll={handleSkipAllMatches}
          onConfirmRefined={handleConfirmRefined}
        />
      </div>
    );
  }

  // Show list of all shopping lists
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Shopping Lists</h1>
        <div className={styles.actions}>
          <Button
            variant="outline"
            leftIcon={<Calendar size={18} />}
            onClick={() => setDatePickerOpen(true)}
          >
            Generate from Plan
          </Button>
          <Button leftIcon={<Plus size={18} />} onClick={handleCreateEmpty}>
            New List
          </Button>
        </div>
      </div>

      {lists.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No shopping lists</p>
          <p className={styles.emptyText}>
            Generate a shopping list from your meal plan or create a new one manually.
          </p>
          <Button
            leftIcon={<Calendar size={18} />}
            onClick={() => setDatePickerOpen(true)}
          >
            Generate from Meal Plan
          </Button>
        </div>
      ) : (
        <div className={styles.listGrid}>
          {lists.map((list) => (
            <Card
              key={list.id}
              hoverable
              padding="md"
              onClick={() => handleViewList(list)}
            >
              <div className={styles.listCard}>
                <h3 className={styles.listName}>{list.name}</h3>
                <p className={styles.listMeta}>
                  {list.items.length} items |{' '}
                  {list.items.filter((i) => i.isChecked).length} checked
                </p>
                <p className={styles.listDate}>
                  {format(new Date(list.dateRangeStart), 'MMM d')} -{' '}
                  {format(new Date(list.dateRangeEnd), 'MMM d, yyyy')}
                </p>
                <div className={styles.listActions}>
                  <Button variant="ghost" size="sm">
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Printer size={16} />}
                    onClick={(e) => handlePrintList(e, list)}
                  >
                    Print
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 size={16} />}
                    onClick={(e) => handleDeleteFromGrid(e, list)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DateRangePicker
        isOpen={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        onGenerate={handleGenerate}
      />

      <GeneratingListModal
        isOpen={isGenerating}
        onCancel={handleCancelGeneration}
        isAnalyzingIngredients={isAnalyzingIngredients}
      />
    </div>
  );
}
