import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Plus, Calendar, Printer, Trash2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { DateRangePicker, ShoppingListDetail } from '@/components/shopping';
import { useShoppingList } from '@/hooks';
import type { ShoppingList } from '@/types';
import styles from './ShoppingPage.module.css';

export function ShoppingPage() {
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
  } = useShoppingList();

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);

  const handleGenerate = useCallback(
    async (name: string, startDate: Date, endDate: Date) => {
      try {
        const newList = await generateFromMealPlan(name, startDate, endDate);
        setSelectedListId(newList.id);
        await loadList(newList.id);
      } catch (error) {
        console.error('Failed to generate list:', error);
      }
    },
    [generateFromMealPlan, loadList]
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
    </div>
  );
}
