import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, Plus, Printer, MoreVertical, Trash2, RotateCcw, Copy } from 'lucide-react';
import { Button } from '@/components/ui';
import { ShoppingItemRow } from './ShoppingItemRow';
import { AddItemModal } from './AddItemModal';
import type { ShoppingList, ShoppingItem, StoreSectionInfo } from '@/types';
import styles from './ShoppingListDetail.module.css';

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
}: ShoppingListDetailProps) {
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChecked, setShowChecked] = useState(true);

  const handlePrint = () => {
    window.print();
  };

  // Sort sections by order
  const sortedSections = Array.from(itemsBySection.entries())
    .map(([sectionId, items]) => ({
      section: getSectionInfo(sectionId),
      items,
    }))
    .sort((a, b) => a.section.order - b.section.order);

  // Separate checked and unchecked items, sorted alphabetically
  const getDisplayItems = (items: ShoppingItem[]) => {
    const sortAlphabetically = (a: ShoppingItem, b: ShoppingItem) =>
      a.name.localeCompare(b.name);
    const unchecked = items.filter((i) => !i.isChecked).sort(sortAlphabetically);
    const checked = items.filter((i) => i.isChecked).sort(sortAlphabetically);
    return showChecked ? [...unchecked, ...checked] : unchecked;
  };

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

      <div className={styles.toolbar}>
        <Button
          leftIcon={<Plus size={18} />}
          onClick={() => setAddItemOpen(true)}
          className="no-print"
        >
          Add Item
        </Button>
        <label className={`${styles.checkboxLabel} no-print`}>
          <input
            type="checkbox"
            checked={showChecked}
            onChange={(e) => setShowChecked(e.target.checked)}
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

      <AddItemModal
        isOpen={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onAdd={onAddItem}
      />
    </div>
  );
}
