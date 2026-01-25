import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import type { PlannedMeal, MealSlot, MealExtraItem } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types';
import styles from './FreeTextMealEditModal.module.css';

const emptyExtra: Omit<MealExtraItem, 'id'> = {
  name: '',
  storeSection: 'other',
};

interface FreeTextMealEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: { freeText?: string; notes?: string; extraItems?: MealExtraItem[] }) => void;
  meal: PlannedMeal | null;
  mealSlots: MealSlot[];
}

export function FreeTextMealEditModal({
  isOpen,
  onClose,
  onSave,
  meal,
  mealSlots,
}: FreeTextMealEditModalProps) {
  const [freeText, setFreeText] = useState('');
  const [notes, setNotes] = useState('');
  const [extraItems, setExtraItems] = useState<(MealExtraItem | Omit<MealExtraItem, 'id'>)[]>([
    { ...emptyExtra },
  ]);

  const slot = meal ? mealSlots.find((s) => s.id === meal.slotId) : null;

  useEffect(() => {
    if (isOpen && meal) {
      setFreeText(meal.freeText || '');
      setNotes(meal.notes || '');
      setExtraItems(
        meal.extraItems && meal.extraItems.length > 0
          ? meal.extraItems
          : [{ ...emptyExtra }]
      );
    }
  }, [isOpen, meal]);

  const handleSave = () => {
    if (!freeText.trim()) return;

    const trimmedNotes = notes.trim() || undefined;
    const finalExtras = extraItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        id: 'id' in item ? item.id : uuidv4(),
        name: item.name.trim(),
      }));

    onSave({
      freeText: freeText.trim(),
      notes: trimmedNotes,
      extraItems: finalExtras.length > 0 ? finalExtras : undefined,
    });
  };

  const handleAddExtra = () => {
    setExtraItems([...extraItems, { ...emptyExtra }]);
  };

  const handleRemoveExtra = (index: number) => {
    setExtraItems(extraItems.filter((_, i) => i !== index));
  };

  const handleExtraChange = (
    index: number,
    field: keyof MealExtraItem,
    value: string
  ) => {
    const updated = [...extraItems];
    updated[index] = { ...updated[index], [field]: value };
    setExtraItems(updated);
  };

  const mealDate = meal ? (() => {
    const [year, month, day] = meal.date.split('-').map(Number);
    return new Date(year, month - 1, day);
  })() : new Date();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit ${slot?.name || 'Meal'} - ${format(mealDate, 'EEEE, MMMM d')}`}
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <label className={styles.label}>Meal Name</label>
          <Input
            type="text"
            placeholder="e.g., Sandwiches, Salad, Leftovers..."
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            fullWidth
            autoFocus
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Notes (optional)</label>
          <textarea
            className={styles.notesInput}
            placeholder="e.g., use leftover chicken, pack for lunch..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className={styles.extrasSection}>
          <label className={styles.label}>Side dishes / Extras</label>
          <p className={styles.hint}>
            These items will be added to your shopping list
          </p>

          {extraItems.map((item, index) => (
            <div key={index} className={styles.extraRow}>
              <input
                type="text"
                className={styles.extraNameInput}
                placeholder="Item name (e.g., chips)"
                value={item.name}
                onChange={(e) => handleExtraChange(index, 'name', e.target.value)}
              />
              <select
                className={styles.extraSectionSelect}
                value={item.storeSection || 'other'}
                onChange={(e) => handleExtraChange(index, 'storeSection', e.target.value)}
              >
                {DEFAULT_STORE_SECTIONS.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveExtra(index)}
                disabled={extraItems.length === 1}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={handleAddExtra}
          >
            Add Extra
          </Button>
        </div>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!freeText.trim()}>
          Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}
