import { useState } from 'react';
import { Plus, Trash2, ShoppingBasket } from 'lucide-react';
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

// Common unit options for the dropdown
const UNIT_OPTIONS: { value: MeasurementUnit | ''; label: string }[] = [
  { value: '', label: 'No unit' },
  { value: 'lb', label: 'lb (pound)' },
  { value: 'oz', label: 'oz (ounce)' },
  { value: 'kg', label: 'kg (kilogram)' },
  { value: 'g', label: 'g (gram)' },
  { value: 'cup', label: 'cup' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'tsp', label: 'tsp' },
  { value: 'l', label: 'L (liter)' },
  { value: 'ml', label: 'ml' },
  { value: 'each', label: 'each' },
  { value: 'can', label: 'can' },
  { value: 'package', label: 'package' },
  { value: 'bunch', label: 'bunch' },
];

export function IngredientInputStep({
  ingredients,
  onAdd,
  onUpdate: _onUpdate,
  onRemove,
}: IngredientInputStepProps) {
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState<MeasurementUnit | ''>('');
  const [newName, setNewName] = useState('');

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
              <div className={styles.ingredientInfo}>
                <span className={styles.quantity}>
                  {ingredient.quantity} {formatUnit(ingredient.unit)}
                </span>
                <span className={styles.name}>{ingredient.name}</span>
              </div>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(ingredient.id)}
                aria-label={`Remove ${ingredient.name}`}
              >
                <Trash2 size={16} />
              </button>
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
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
