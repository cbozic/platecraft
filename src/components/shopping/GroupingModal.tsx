import { useState, useMemo } from 'react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import type { ShoppingItem, StoreSection } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types/shopping';
import styles from './GroupingModal.module.css';

interface GroupingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: ShoppingItem[];
  onConfirm: (canonicalName: string, targetSection: string, saveMapping: boolean) => void;
}

export function GroupingModal({
  isOpen,
  onClose,
  selectedItems,
  onConfirm,
}: GroupingModalProps) {
  // Default canonical name to first item's name
  const [canonicalName, setCanonicalName] = useState('');
  const [targetSection, setTargetSection] = useState<StoreSection | string>('');
  const [saveMapping, setSaveMapping] = useState(true);

  // Determine if items are from different sections
  const uniqueSections = useMemo(() => {
    const sections = new Set(selectedItems.map((item) => item.storeSection));
    return Array.from(sections);
  }, [selectedItems]);

  const showSectionPicker = uniqueSections.length > 1;

  // Reset form when modal opens
  const handleOpen = () => {
    if (selectedItems.length > 0) {
      setCanonicalName(selectedItems[0].name);
      setTargetSection(selectedItems[0].storeSection);
    }
  };

  // Handle modal close
  const handleClose = () => {
    setCanonicalName('');
    setTargetSection('');
    setSaveMapping(true);
    onClose();
  };

  const handleConfirm = () => {
    if (!canonicalName.trim()) return;
    onConfirm(
      canonicalName.trim(),
      targetSection || selectedItems[0]?.storeSection || 'other',
      saveMapping
    );
    handleClose();
  };

  // Set defaults when modal opens
  if (isOpen && !canonicalName && selectedItems.length > 0) {
    handleOpen();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Group Items"
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.section}>
          <h3 className={styles.sectionLabel}>Items to group</h3>
          <div className={styles.itemChips}>
            {selectedItems.map((item) => (
              <span key={item.id} className={styles.chip}>
                {item.name}
                {item.quantity && (
                  <span className={styles.chipQuantity}>
                    ({item.quantity} {item.unit || ''})
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        <Input
          label="Display name for grouped item"
          value={canonicalName}
          onChange={(e) => setCanonicalName(e.target.value)}
          placeholder="e.g., Chicken Breast"
          required
          autoFocus
        />

        {showSectionPicker && (
          <div className={styles.field}>
            <label className={styles.label}>
              Store Section
              <span className={styles.labelNote}>
                (items are from different sections)
              </span>
            </label>
            <select
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value as StoreSection)}
              className={styles.select}
            >
              {DEFAULT_STORE_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {uniqueSections.includes(s.id) ? ' (has items)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={saveMapping}
            onChange={(e) => setSaveMapping(e.target.checked)}
            className={styles.checkbox}
          />
          <span>Remember this grouping for future lists</span>
        </label>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!canonicalName.trim()}>
          Group Items
        </Button>
      </ModalFooter>
    </Modal>
  );
}
