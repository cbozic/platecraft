import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Printer, MoreVertical, Trash2, RotateCcw, Copy, Link as LinkIcon, Search, X, Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { ShoppingItemRow } from './ShoppingItemRow';
import { AddItemModal } from './AddItemModal';
import { SelectionActionBar } from './SelectionActionBar';
import { GroupingModal } from './GroupingModal';
import { UngroupingModal } from './UngroupingModal';
import { ExportModal } from './ExportModal';
import type { ShoppingList, ShoppingItem, StoreSectionInfo } from '@/types';
import styles from './ShoppingListDetail.module.css';

type SearchScope = {
  ingredients: boolean;
  recipes: boolean;
  notes: boolean;
};

const SEARCH_SCOPE_KEY = 'platecraft_shopping_search_scope';
const DEFAULT_SCOPE: SearchScope = { ingredients: true, recipes: false, notes: true };

interface ShoppingListDetailProps {
  list: ShoppingList;
  itemsBySection: Map<string, ShoppingItem[]>;
  progress: { total: number; checked: number; percentage: number };
  getSectionInfo: (sectionId: string) => StoreSectionInfo;
  onBack: () => void;
  onToggleItem: (itemId: string) => void;
  onUpdateItem: (itemId: string, updates: Partial<ShoppingItem>) => void;
  onRemoveItem: (itemId: string) => void;
  onAddItem: (item: Omit<ShoppingItem, 'id'>) => void;
  onUncheckAll: () => void;
  onClearChecked: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNavigateToRecipe?: (recipeId: string, plannedServings?: number) => void;
  onGroupItems?: (
    itemIds: string[],
    canonicalName: string,
    targetSection: string,
    saveMapping: boolean
  ) => void;
  onUngroupItem?: (itemId: string) => void;
  onPartialUngroupItem?: (itemId: string, sourceIndices: number[]) => void;
}

export function ShoppingListDetail({
  list,
  itemsBySection,
  progress,
  getSectionInfo,
  onBack,
  onToggleItem,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
  onUncheckAll,
  onClearChecked,
  onDuplicate,
  onDelete,
  onNavigateToRecipe,
  onGroupItems,
  onPartialUngroupItem,
}: ShoppingListDetailProps) {
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChecked, setShowChecked] = useState(true);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Selection mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showGroupingModal, setShowGroupingModal] = useState(false);

  // Ungrouping modal state
  const [showUngroupingModal, setShowUngroupingModal] = useState(false);
  const [itemToUngroup, setItemToUngroup] = useState<ShoppingItem | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Search scope state - load from localStorage on init
  const [searchScope, setSearchScope] = useState<SearchScope>(() => {
    try {
      const saved = localStorage.getItem(SEARCH_SCOPE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_SCOPE, ...parsed };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SCOPE;
  });

  // Persist search scope to localStorage
  useEffect(() => {
    localStorage.setItem(SEARCH_SCOPE_KEY, JSON.stringify(searchScope));
  }, [searchScope]);

  // Keyboard shortcut for search (Cmd/Ctrl + F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  // Selection mode handlers
  const handleToggleSelectionMode = useCallback(() => {
    if (isSelectionMode) {
      // Exit selection mode
      setIsSelectionMode(false);
      setSelectedItemIds(new Set());
    } else {
      // Enter selection mode
      setIsSelectionMode(true);
    }
  }, [isSelectionMode]);

  const handleSelectItem = useCallback((itemId: string, selected: boolean) => {
    setSelectedItemIds((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(itemId);
      } else {
        newSet.delete(itemId);
      }
      return newSet;
    });
  }, []);

  const handleCancelSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedItemIds(new Set());
  }, []);

  const handleGroupSelectedClick = useCallback(() => {
    if (selectedItemIds.size < 2) return;
    setShowGroupingModal(true);
  }, [selectedItemIds.size]);

  const handleConfirmGrouping = useCallback(
    (canonicalName: string, targetSection: string, saveMapping: boolean) => {
      if (!onGroupItems) return;
      const itemIds = Array.from(selectedItemIds);
      onGroupItems(itemIds, canonicalName, targetSection, saveMapping);
      setShowGroupingModal(false);
      setIsSelectionMode(false);
      setSelectedItemIds(new Set());
    },
    [onGroupItems, selectedItemIds]
  );

  // Ungrouping handlers
  const handleOpenUngroupModal = useCallback((itemId: string) => {
    const item = list.items.find((i) => i.id === itemId);
    if (item) {
      setItemToUngroup(item);
      setShowUngroupingModal(true);
    }
  }, [list.items]);

  const handleConfirmUngroup = useCallback(
    (sourceIndices: number[]) => {
      if (!onPartialUngroupItem || !itemToUngroup) return;
      onPartialUngroupItem(itemToUngroup.id, sourceIndices);
      setShowUngroupingModal(false);
      setItemToUngroup(null);
    },
    [onPartialUngroupItem, itemToUngroup]
  );

  const handleCloseUngroupModal = useCallback(() => {
    setShowUngroupingModal(false);
    setItemToUngroup(null);
  }, []);

  // Get selected items for the modal
  const selectedItems = useMemo(() => {
    return list.items.filter((item) => selectedItemIds.has(item.id));
  }, [list.items, selectedItemIds]);

  // Search filter function - respects search scope settings
  const matchesSearch = useCallback(
    (item: ShoppingItem): boolean => {
      if (!searchQuery.trim()) return true;

      const query = searchQuery.toLowerCase().trim();

      // Check ingredients scope (item name + original ingredient names)
      if (searchScope.ingredients) {
        if (item.name.toLowerCase().includes(query)) return true;
        if (item.sourceRecipeDetails) {
          for (const source of item.sourceRecipeDetails) {
            if (source.originalIngredientName.toLowerCase().includes(query)) {
              return true;
            }
          }
        }
      }

      // Check recipes scope (recipe names)
      if (searchScope.recipes && item.sourceRecipeDetails) {
        for (const source of item.sourceRecipeDetails) {
          if (source.recipeName.toLowerCase().includes(query)) {
            return true;
          }
        }
      }

      // Check notes scope
      if (searchScope.notes && item.notes?.toLowerCase().includes(query)) return true;

      return false;
    },
    [searchQuery, searchScope]
  );

  // Sort sections by order
  const sortedSections = Array.from(itemsBySection.entries())
    .map(([sectionId, items]) => ({
      section: getSectionInfo(sectionId),
      items,
    }))
    .sort((a, b) => a.section.order - b.section.order);

  // Separate checked and unchecked items, sorted alphabetically, filtered by search
  const getDisplayItems = (items: ShoppingItem[]) => {
    const sortAlphabetically = (a: ShoppingItem, b: ShoppingItem) =>
      a.name.localeCompare(b.name);

    // Apply search filter
    const filtered = items.filter(matchesSearch);

    const unchecked = filtered.filter((i) => !i.isChecked).sort(sortAlphabetically);
    const checked = filtered.filter((i) => i.isChecked).sort(sortAlphabetically);
    return showChecked ? [...unchecked, ...checked] : unchecked;
  };

  // Count total matching items for search feedback
  const searchResultCount = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return list.items.filter(matchesSearch).length;
  }, [list.items, matchesSearch, searchQuery]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Button variant="ghost" onClick={onBack} className="no-print">
          <ArrowLeft size={20} />
        </Button>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>{list.name}</h1>
          <p className={styles.meta}>
            {format(new Date(list.dateRangeStart), 'MMM d')} -{' '}
            {format(new Date(list.dateRangeEnd), 'MMM d, yyyy')}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={16} />}
            onClick={() => setExportModalOpen(true)}
            className="no-print"
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
            className="no-print"
          >
            Print
          </Button>
          <div className={styles.menuWrapper}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMenuOpen(!menuOpen)}
              className="no-print"
            >
              <MoreVertical size={20} />
            </Button>
            {menuOpen && (
              <div className={styles.menu}>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onUncheckAll();
                    setMenuOpen(false);
                  }}
                >
                  <RotateCcw size={16} />
                  Uncheck All
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onClearChecked();
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={16} />
                  Clear Checked
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    onDuplicate();
                    setMenuOpen(false);
                  }}
                >
                  <Copy size={16} />
                  Duplicate List
                </button>
                <div className={styles.menuDivider} />
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.danger}`}
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={16} />
                  Delete List
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles.progressBar}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {progress.checked} of {progress.total} items ({progress.percentage}%)
        </span>
      </div>

      <div className={`${styles.searchContainer} no-print`}>
        <div className={styles.searchRow}>
          <div className={`${styles.searchInput} ${isSearchFocused ? styles.searchFocused : ''}`}>
            <Search size={18} className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search items... (⌘F)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={styles.searchField}
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {searchResultCount !== null && (
            <span className={styles.searchResultCount}>
              {searchResultCount} {searchResultCount === 1 ? 'item' : 'items'} found
            </span>
          )}
        </div>
        {searchQuery && (
          <div className={styles.searchScopeContainer}>
            <span className={styles.searchScopeLabel}>Search in:</span>
            <div className={styles.searchScopeChips}>
              <button
                type="button"
                className={`${styles.searchScopeChip} ${searchScope.ingredients ? styles.searchScopeChipActive : ''}`}
                onClick={() => setSearchScope((prev) => ({ ...prev, ingredients: !prev.ingredients }))}
              >
                Ingredients
              </button>
              <button
                type="button"
                className={`${styles.searchScopeChip} ${searchScope.recipes ? styles.searchScopeChipActive : ''}`}
                onClick={() => setSearchScope((prev) => ({ ...prev, recipes: !prev.recipes }))}
              >
                Recipes
              </button>
              <button
                type="button"
                className={`${styles.searchScopeChip} ${searchScope.notes ? styles.searchScopeChipActive : ''}`}
                onClick={() => setSearchScope((prev) => ({ ...prev, notes: !prev.notes }))}
              >
                Notes
              </button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Button
            leftIcon={<Plus size={18} />}
            onClick={() => setAddItemOpen(true)}
            className="no-print"
            disabled={isSelectionMode}
          >
            Add Item
          </Button>
          {onGroupItems && (
            <Button
              variant={isSelectionMode ? 'primary' : 'outline'}
              leftIcon={<LinkIcon size={18} />}
              onClick={handleToggleSelectionMode}
              className="no-print"
            >
              {isSelectionMode ? 'Cancel' : 'Group Items'}
            </Button>
          )}
        </div>
        <label className={`${styles.checkboxLabel} no-print`}>
          <input
            type="checkbox"
            checked={showChecked}
            onChange={(e) => setShowChecked(e.target.checked)}
            disabled={isSelectionMode}
          />
          Show checked items
        </label>
      </div>

      <div className={styles.sections}>
        {sortedSections.map(({ section, items }) => {
          const displayItems = getDisplayItems(items);
          if (displayItems.length === 0) return null;

          return (
            <div key={section.id} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.name}</h2>
              <div className={styles.itemList}>
                {displayItems.map((item) => (
                  <ShoppingItemRow
                    key={item.id}
                    item={item}
                    onToggle={onToggleItem}
                    onUpdate={onUpdateItem}
                    onDelete={onRemoveItem}
                    onNavigateToRecipe={onNavigateToRecipe}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedItemIds.has(item.id)}
                    onSelect={handleSelectItem}
                    onUngroup={handleOpenUngroupModal}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {list.items.length === 0 && (
        <div className={styles.empty}>
          <p>No items in this list yet.</p>
          <Button leftIcon={<Plus size={18} />} onClick={() => setAddItemOpen(true)}>
            Add First Item
          </Button>
        </div>
      )}

      {list.items.length > 0 && searchResultCount === 0 && (
        <div className={styles.empty}>
          <Search size={48} className={styles.emptyIcon} />
          <p>No items match "{searchQuery}"</p>
          <Button variant="outline" onClick={() => setSearchQuery('')}>
            Clear Search
          </Button>
        </div>
      )}

      <AddItemModal
        isOpen={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={onAddItem}
      />

      {isSelectionMode && selectedItemIds.size > 0 && (
        <SelectionActionBar
          selectedCount={selectedItemIds.size}
          onCancel={handleCancelSelection}
          onGroupSelected={handleGroupSelectedClick}
        />
      )}

      <GroupingModal
        isOpen={showGroupingModal}
        onClose={() => setShowGroupingModal(false)}
        selectedItems={selectedItems}
        onConfirm={handleConfirmGrouping}
      />

      <UngroupingModal
        isOpen={showUngroupingModal}
        onClose={handleCloseUngroupModal}
        groupedItem={itemToUngroup}
        onConfirm={handleConfirmUngroup}
      />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        list={list}
      />
    </div>
  );
}
