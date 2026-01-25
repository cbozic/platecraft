import { useState, useMemo } from 'react';
import { Check, Trash2, Edit2, X, Save, ChevronDown, RefreshCw, Link as LinkIcon, Unlink } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import type { ShoppingItem } from '@/types';
import { UNIT_INFO } from '@/types/units';
import styles from './ShoppingItemRow.module.css';

interface ShoppingItemRowProps {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ShoppingItem>) => void;
  onDelete: (id: string) => void;
  onNavigateToRecipe?: (recipeId: string, plannedServings?: number) => void;
  // Selection mode props
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  onUngroup?: (id: string) => void;
}

export function ShoppingItemRow({
  item,
  onToggle,
  onUpdate,
  onDelete,
  onNavigateToRecipe,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onUngroup,
}: ShoppingItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQuantity, setEditQuantity] = useState(item.quantity?.toString() || '');
  const [editNotes, setEditNotes] = useState(item.notes || '');

  // Unit toggle state - use stored preference or default to 0 (primary unit)
  const [currentUnitIndex, setCurrentUnitIndex] = useState(item.selectedUnitIndex || 0);

  // Check if item has recipe sources (expandable for any item with at least 1 recipe)
  const hasRecipeSources = item.sourceRecipeDetails && item.sourceRecipeDetails.length > 0;
  const hasMultipleRecipes = item.sourceRecipeDetails && item.sourceRecipeDetails.length > 1;

  // Check if item is grouped (has multiple different original ingredient names)
  const isGrouped = useMemo(() => {
    if (!item.sourceRecipeDetails || item.sourceRecipeDetails.length < 2) {
      return false;
    }
    const originalNames = new Set(
      item.sourceRecipeDetails.map((s) => s.originalIngredientName.toLowerCase())
    );
    return originalNames.size > 1;
  }, [item.sourceRecipeDetails]);

  // Check if item can be ungrouped - allow ungrouping any item with multiple sources
  const canUngroup = hasMultipleRecipes && onUngroup;

  // Check if item has alternate units for toggling
  const hasAlternateUnits = item.alternateUnits && item.alternateUnits.length > 0;

  // Get current display values based on selected unit
  const getCurrentDisplay = () => {
    if (!hasAlternateUnits || currentUnitIndex === 0) {
      return { quantity: item.quantity, unit: item.unit };
    }
    const alternate = item.alternateUnits![currentUnitIndex - 1];
    return { quantity: alternate.quantity, unit: alternate.unit };
  };

  const currentDisplay = getCurrentDisplay();

  // Handle unit toggle click
  const handleUnitToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasAlternateUnits) return;

    const totalUnits = item.alternateUnits!.length + 1; // +1 for primary unit
    const nextIndex = (currentUnitIndex + 1) % totalUnits;
    setCurrentUnitIndex(nextIndex);
    onUpdate(item.id, { selectedUnitIndex: nextIndex });
  };

  const formatQuantity = (quantity: number | null = currentDisplay.quantity, unit = currentDisplay.unit) => {
    if (quantity === null) return '';

    const unitInfo = unit ? UNIT_INFO[unit] : null;
    const unitStr = unitInfo?.abbreviation || unit || '';

    // Format quantity nicely (avoid showing 1.0000000001)
    const formattedQty = Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(2).replace(/\.?0+$/, '');

    return unitStr ? `${formattedQty} ${unitStr}` : formattedQty;
  };

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't expand if clicking on checkbox, actions, or if editing
    if (isEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest(`.${styles.checkbox}`) || target.closest(`.${styles.actions}`)) return;

    // In selection mode, toggle selection on row click
    if (isSelectionMode) {
      onSelect?.(item.id, !isSelected);
      return;
    }

    if (hasRecipeSources) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleCheckboxClick = () => {
    if (isSelectionMode) {
      onSelect?.(item.id, !isSelected);
    } else {
      onToggle(item.id);
    }
  };

  const handleSave = () => {
    onUpdate(item.id, {
      name: editName.trim(),
      quantity: editQuantity ? parseFloat(editQuantity) : null,
      notes: editNotes.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(item.name);
    setEditQuantity(item.quantity?.toString() || '');
    setEditNotes(item.notes || '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={styles.row}>
        <div className={styles.editForm}>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Item name"
            className={styles.editName}
          />
          <Input
            type="number"
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            placeholder="Qty"
            className={styles.editQuantity}
          />
          <Input
            value={editNotes}
            onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Notes"
            className={styles.editNotes}
          />
          <div className={styles.editActions}>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X size={16} />
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              <Save size={16} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.rowContainer}>
      <div
        className={`${styles.row} ${item.isChecked && !isSelectionMode ? styles.checked : ''} ${hasRecipeSources && !isSelectionMode ? styles.expandable : ''} ${isSelectionMode ? styles.selectable : ''} ${isSelected ? styles.selected : ''}`}
        onClick={handleRowClick}
      >
        <button
          type="button"
          className={`${styles.checkbox} ${isSelectionMode ? styles.selectionCheckbox : ''}`}
          onClick={handleCheckboxClick}
          aria-label={
            isSelectionMode
              ? isSelected
                ? 'Deselect item'
                : 'Select item'
              : item.isChecked
                ? 'Uncheck item'
                : 'Check item'
          }
        >
          {isSelectionMode ? (
            isSelected && <Check size={14} />
          ) : (
            item.isChecked && <Check size={14} />
          )}
        </button>

        <div className={styles.content}>
          <span className={styles.name}>{item.name}</span>
          {isGrouped && !isSelectionMode && (
            <span className={styles.groupedIcon} title="Grouped ingredients">
              <LinkIcon size={12} />
            </span>
          )}
          {formatQuantity() && (
            <span className={styles.quantityGroup}>
              <span className={styles.quantity}>{formatQuantity()}</span>
              {item.isEstimated && (
                <span
                  className={styles.estimatedBadge}
                  title={item.estimationNote || 'Quantity includes estimation'}
                >
                  ~
                </span>
              )}
              {hasAlternateUnits && (
                <button
                  type="button"
                  className={styles.unitToggle}
                  onClick={handleUnitToggle}
                  title="Click to change unit"
                >
                  <RefreshCw size={12} />
                </button>
              )}
            </span>
          )}
          {item.notes && <span className={styles.notes}>{item.notes}</span>}
          {item.isManual && <span className={styles.badge}>Manual</span>}
          {hasMultipleRecipes && (
            <span className={styles.recipeCount}>
              ({item.sourceRecipeDetails!.length} recipes)
            </span>
          )}
        </div>

        <div className={styles.actions}>
          {hasRecipeSources && (
            <ChevronDown
              size={16}
              className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}
            />
          )}
          {canUngroup && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onUngroup?.(item.id);
              }}
              aria-label="Ungroup item"
              title="Ungroup items"
              className="no-print"
            >
              <Unlink size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            aria-label="Edit item"
            className="no-print"
          >
            <Edit2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(item.id)}
            aria-label="Delete item"
            className="no-print"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* Recipe breakdown panel */}
      {isExpanded && hasRecipeSources && !isSelectionMode && (
        <div className={styles.recipeBreakdown}>
          {item.sourceRecipeDetails!.map((source, index) => (
            <button
              key={`${source.recipeId}-${index}`}
              type="button"
              className={styles.recipeRow}
              onClick={() => source.recipeId && onNavigateToRecipe?.(source.recipeId, source.plannedServings)}
              disabled={!source.recipeId}
            >
              <span className={styles.recipeRowOriginalName}>
                {source.originalIngredientName || source.recipeName}
              </span>
              <div className={styles.recipeRowDetails}>
                <span className={styles.recipeRowQuantity}>
                  {formatQuantity(source.quantity, source.unit)}
                </span>
                <span className={styles.recipeRowRecipeName}>
                  {source.recipeName}
                </span>
              </div>
            </button>
          ))}
          {canUngroup && (
            <button
              type="button"
              className={styles.ungroupButton}
              onClick={(e) => {
                e.stopPropagation();
                onUngroup?.(item.id);
              }}
            >
              <Unlink size={14} />
              Ungroup Items
            </button>
          )}
        </div>
      )}
    </div>
  );
}
