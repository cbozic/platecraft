import { useState, useEffect } from 'react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import type { ShoppingItem } from '@/types';
import styles from './UngroupingModal.module.css';

interface UngroupingModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupedItem: ShoppingItem | null;
  onConfirm: (sourceIndices: number[]) => void;
}

export function UngroupingModal({
  isOpen,
  onClose,
  groupedItem,
  onConfirm,
}: UngroupingModalProps) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndices(new Set());
    }
  }, [isOpen]);

  // Handle modal close
  const handleClose = () => {
    setSelectedIndices(new Set());
    onClose();
  };

  const handleConfirm = () => {
    if (selectedIndices.size === 0) return;
    onConfirm(Array.from(selectedIndices));
    handleClose();
  };

  const toggleSelection = (index: number) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedIndices(newSelection);
  };

  const toggleSelectAll = () => {
    if (!groupedItem?.sourceRecipeDetails) return;

    if (selectedIndices.size === groupedItem.sourceRecipeDetails.length) {
      // All selected, deselect all
      setSelectedIndices(new Set());
    } else {
      // Not all selected, select all
      const allIndices = new Set(
        groupedItem.sourceRecipeDetails.map((_, idx) => idx)
      );
      setSelectedIndices(allIndices);
    }
  };

  if (!groupedItem) return null;

  const sourceRecipeDetails = groupedItem.sourceRecipeDetails || [];
  const allSelected = selectedIndices.size === sourceRecipeDetails.length && sourceRecipeDetails.length > 0;
  const someSelected = selectedIndices.size > 0 && selectedIndices.size < sourceRecipeDetails.length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ungroup Items"
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.section}>
          <div className={styles.header}>
            <h3 className={styles.sectionLabel}>
              Select items to remove from
              <br />
              <span className={styles.groupName}>"{groupedItem.name}"</span>
            </h3>
            <label className={styles.selectAllLabel}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) {
                    input.indeterminate = someSelected;
                  }
                }}
                onChange={toggleSelectAll}
                className={styles.checkbox}
              />
              <span>Select all</span>
            </label>
          </div>

          <div className={styles.ingredientList}>
            {sourceRecipeDetails.map((detail, index) => (
              <label key={index} className={styles.ingredientItem}>
                <input
                  type="checkbox"
                  checked={selectedIndices.has(index)}
                  onChange={() => toggleSelection(index)}
                  className={styles.checkbox}
                />
                <div className={styles.ingredientInfo}>
                  <span className={styles.ingredientName}>
                    {detail.originalIngredientName}
                  </span>
                  <div className={styles.ingredientDetails}>
                    <span className={styles.ingredientQuantity}>
                      {detail.quantity && detail.unit
                        ? `${detail.quantity} ${detail.unit}`
                        : detail.quantity
                        ? detail.quantity
                        : '—'}
                    </span>
                    <span className={styles.recipeName}>
                      {detail.recipeName}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {sourceRecipeDetails.length === 0 && (
            <p className={styles.emptyMessage}>
              No recipe details available for this item.
            </p>
          )}
        </div>

        {selectedIndices.size > 0 && (
          <div className={styles.selectionSummary}>
            {selectedIndices.size === sourceRecipeDetails.length ? (
              <p>All items will be ungrouped. The group will be removed.</p>
            ) : (
              <p>
                {selectedIndices.size} item{selectedIndices.size !== 1 ? 's' : ''} will be
                removed. {sourceRecipeDetails.length - selectedIndices.size} item
                {sourceRecipeDetails.length - selectedIndices.size !== 1 ? 's' : ''} will
                remain grouped.
              </p>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={selectedIndices.size === 0}>
          Remove Selected ({selectedIndices.size})
        </Button>
      </ModalFooter>
    </Modal>
  );
}
