import { useState } from 'react';
import { Plus, Trash2, ShoppingBasket, Check, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { IngredientOnHand } from '@/types/mealPlanAssistant';
import type { MeasurementUnit } from '@/types/units';
import { UNIT_INFO } from '@/types/units';
import styles from './IngredientInputStep.module.css';

interface IngredientInputStepProps {
  ingredients: IngredientOnHand[];
  onAdd: (ingredient: Omit<IngredientOnHand, 'id' | 'originalQuantity'>) => void;
  onUpdate: (id: string, updates: Partial<IngredientOnHand>) => void;
  onRemove: (id: string) => void;
}

export function IngredientInputStep({
  ingredients,
  onAdd,
  onUpdate,
  onRemove,
}: IngredientInputStepProps) {
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState<MeasurementUnit | ''>('');
  const [newName, setNewName] = useState('');

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState<MeasurementUnit | ''>('');
  const [editName, setEditName] = useState('');

  const handleAdd = () => {
    if (!newName.trim()) return;

    onAdd({
      name: newName.trim(),
      quantity: newQuantity ? parseFloat(newQuantity) : 1,
      unit: newUnit || null,
    });

    setNewQuantity('');
    setNewUnit('');
    setNewName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const startEditing = (ingredient: IngredientOnHand) => {
    setEditingId(ingredient.id);
    setEditQuantity(ingredient.quantity.toString());
    setEditUnit(ingredient.unit || '');
    setEditName(ingredient.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditQuantity('');
    setEditUnit('');
    setEditName('');
  };

  const saveEditing = () => {
    if (!editingId || !editName.trim()) return;

    onUpdate(editingId, {
      name: editName.trim(),
      quantity: editQuantity ? parseFloat(editQuantity) : 1,
      unit: editUnit || null,
    });

    cancelEditing();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditing();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const formatUnit = (unit: MeasurementUnit | null): string => {
    if (!unit) return '';
    return UNIT_INFO[unit]?.abbreviation || unit;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ShoppingBasket size={20} />
        <div>
          <h3 className={styles.title}>What ingredients do you have?</h3>
          <p className={styles.description}>
            List ingredients you'd like to use. We'll find recipes that use them.
          </p>
        </div>
      </div>

      {/* Ingredient list */}
      {ingredients.length > 0 && (
        <div className={styles.list}>
          {ingredients.map((ingredient) => (
            <div key={ingredient.id} className={styles.ingredientRow}>
              {editingId === ingredient.id ? (
                // Editing mode
                <>
                  <div className={styles.editForm}>
                    <Input
                      type="number"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className={styles.editQuantityInput}
                      min="0"
                      step="0.25"
                      autoFocus
                    />
                    <select
                      value={editUnit}
                      onChange={(e) => setEditUnit(e.target.value as MeasurementUnit | '')}
                      className={styles.editUnitSelect}
                    >
                      <option value="">Unit</option>
                      {Object.entries(UNIT_INFO).map(([key, info]) => (
                        <option key={key} value={key}>
                          {info.abbreviation || info.name}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      className={styles.editNameInput}
                    />
                  </div>
                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={saveEditing}
                      aria-label="Save changes"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={cancelEditing}
                      aria-label="Cancel editing"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </>
              ) : (
                // Display mode
                <>
                  <button
                    type="button"
                    className={styles.ingredientInfo}
                    onClick={() => startEditing(ingredient)}
                    aria-label={`Edit ${ingredient.name}`}
                  >
                    <span className={styles.quantity}>
                      {ingredient.quantity} {formatUnit(ingredient.unit)}
                    </span>
                    <span className={styles.name}>{ingredient.name}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => onRemove(ingredient.id)}
                    aria-label={`Remove ${ingredient.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new ingredient */}
      <div className={styles.addForm}>
        <div className={styles.inputGroup}>
          <Input
            type="number"
            placeholder="Qty"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.quantityInput}
            min="0"
            step="0.25"
          />
          <select
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value as MeasurementUnit | '')}
            className={styles.unitSelect}
          >
            <option value="">Unit</option>
            {Object.entries(UNIT_INFO).map(([key, info]) => (
              <option key={key} value={key}>
                {info.abbreviation || info.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Ingredient name (e.g., chicken breast)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.nameInput}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          disabled={!newName.trim()}
          leftIcon={<Plus size={16} />}
        >
          Add
        </Button>
      </div>

      {ingredients.length === 0 && (
        <div className={styles.emptyNote}>
          <p>
            No ingredients added yet. You can skip this step if you just want to plan by tags.
          </p>
        </div>
      )}
    </div>
  );
}
