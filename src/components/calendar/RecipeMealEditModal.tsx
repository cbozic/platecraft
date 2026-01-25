import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Plus, Trash2, ExternalLink, Minus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import type { PlannedMeal, MealSlot, MealExtraItem } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types';
import styles from './RecipeMealEditModal.module.css';

const emptyExtra: Omit<MealExtraItem, 'id'> = {
  name: '',
  storeSection: 'other',
};

interface RecipeMealEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: { servings?: number; notes?: string; extraItems?: MealExtraItem[] }) => void;
  onViewRecipe: () => void;
  meal: PlannedMeal | null;
  mealSlots: MealSlot[];
  recipeName: string;
}

export function RecipeMealEditModal({
  isOpen,
  onClose,
  onSave,
  onViewRecipe,
  meal,
  mealSlots,
  recipeName,
}: RecipeMealEditModalProps) {
  const [servings, setServings] = useState(4);
  const [notes, setNotes] = useState('');
  const [extraItems, setExtraItems] = useState<(MealExtraItem | Omit<MealExtraItem, 'id'>)[]>([
    { ...emptyExtra },
  ]);

  const slot = meal ? mealSlots.find((s) => s.id === meal.slotId) : null;

  useEffect(() => {
    if (isOpen && meal) {
      setServings(meal.servings || 4);
      setNotes(meal.notes || '');
      setExtraItems(
        meal.extraItems && meal.extraItems.length > 0
          ? meal.extraItems
          : [{ ...emptyExtra }]
      );
    }
  }, [isOpen, meal]);

  const handleSave = () => {
    const trimmedNotes = notes.trim() || undefined;
    const finalExtras = extraItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        id: 'id' in item ? item.id : uuidv4(),
        name: item.name.trim(),
      }));

    onSave({
      servings,
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

  const handleServingsChange = (delta: number) => {
    setServings((prev) => Math.max(1, prev + delta));
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
        <div className={styles.recipeHeader}>
          <span className={styles.recipeName}>{recipeName}</span>
          <button
            type="button"
            className={styles.viewRecipeLink}
            onClick={onViewRecipe}
          >
            View Full Recipe <ExternalLink size={14} />
          </button>
        </div>

        <div className={styles.servingsSection}>
          <label className={styles.label}>Servings for this meal</label>
          <div className={styles.servingsControls}>
            <Input
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
              className={styles.servingsInput}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleServingsChange(-1)}
              disabled={servings <= 1}
            >
              <Minus size={16} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleServingsChange(1)}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Notes (optional)</label>
          <textarea
            className={styles.notesInput}
            placeholder="e.g., marinate overnight, use leftover chicken..."
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
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}
