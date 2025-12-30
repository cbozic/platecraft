import { useState } from 'react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import type { ShoppingItem, StoreSection } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types/shopping';
import { UNIT_INFO, type MeasurementUnit } from '@/types/units';
import styles from './AddItemModal.module.css';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: Omit<ShoppingItem, 'id'>) => void;
}

const COMMON_UNITS: MeasurementUnit[] = ['each', 'lb', 'oz', 'cup', 'tbsp', 'tsp', 'can', 'package', 'bunch'];

export function AddItemModal({ isOpen, onClose, onAdd }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<MeasurementUnit | ''>('');
  const [section, setSection] = useState<StoreSection | string>('other');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  const resetForm = () => {
    setName('');
    setQuantity('');
    setUnit('');
    setSection('other');
    setNotes('');
    setIsRecurring(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    onAdd({
      name: name.trim(),
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit || null,
      storeSection: section,
      isChecked: false,
      notes: notes.trim() || undefined,
      sourceRecipeIds: [],
      isManual: true,
      isRecurring,
    });

    resetForm();
    onClose();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Item"
      size="md"
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Item Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Milk, Bread, Eggs"
          required
          autoFocus
        />

        <div className={styles.row}>
          <Input
            type="number"
            label="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Amount"
            min="0"
            step="any"
          />

          <div className={styles.field}>
            <label className={styles.label}>Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as MeasurementUnit | '')}
              className={styles.select}
            >
              <option value="">None</option>
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_INFO[u].name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Store Section</label>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as StoreSection)}
            className={styles.select}
          >
            {DEFAULT_STORE_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g., Brand preference, size"
        />

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className={styles.checkbox}
          />
          <span>Add to every shopping list (recurring item)</span>
        </label>

        <ModalFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Add Item
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
