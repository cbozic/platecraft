import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, Clock, Users, Plus, Trash2, Pencil } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { recipeRepository } from '@/db';
import type { Recipe, MealSlot, MealExtraItem } from '@/types';
import { DEFAULT_STORE_SECTIONS } from '@/types';
import styles from './RecipePicker.module.css';

const emptyExtra: Omit<MealExtraItem, 'id'> = {
  name: '',
  storeSection: 'other',
};

interface RecipePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    recipeId: string,
    servings: number,
    notes?: string,
    extraItems?: MealExtraItem[]
  ) => void;
  onAddFreeText?: (
    freeText: string,
    notes?: string,
    extraItems?: MealExtraItem[]
  ) => void;
  date: Date;
  slotId: string;
  mealSlots: MealSlot[];
}

export function RecipePicker({
  isOpen,
  onClose,
  onSelect,
  onAddFreeText,
  date,
  slotId,
  mealSlots,
}: RecipePickerProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [notes, setNotes] = useState('');
  const [extraItems, setExtraItems] = useState<(MealExtraItem | Omit<MealExtraItem, 'id'>)[]>([
    { ...emptyExtra },
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQuickEntry, setIsQuickEntry] = useState(false);
  const [freeTextMealName, setFreeTextMealName] = useState('');

  const slot = mealSlots.find((s) => s.id === slotId);

  useEffect(() => {
    if (isOpen) {
      loadRecipes();
      setSearchQuery('');
      setSelectedRecipe(null);
      setServings(4);
      setNotes('');
      setExtraItems([{ ...emptyExtra }]);
      setIsQuickEntry(false);
      setFreeTextMealName('');
    }
  }, [isOpen]);

  const loadRecipes = async () => {
    setIsLoading(true);
    try {
      const data = await recipeRepository.getAll();
      setRecipes(data);
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRecipes = useMemo(() => {
    if (!searchQuery.trim()) return recipes;
    const query = searchQuery.toLowerCase();
    return recipes.filter(
      (recipe) =>
        recipe.title.toLowerCase().includes(query) ||
        recipe.description?.toLowerCase().includes(query)
    );
  }, [recipes, searchQuery]);

  const handleSelect = () => {
    if (selectedRecipe) {
      const trimmedNotes = notes.trim() || undefined;
      // Filter out empty extras and add IDs
      const finalExtras = extraItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          ...item,
          id: 'id' in item ? item.id : uuidv4(),
          name: item.name.trim(),
        }));
      onSelect(
        selectedRecipe.id,
        servings,
        trimmedNotes,
        finalExtras.length > 0 ? finalExtras : undefined
      );
      onClose();
    }
  };

  const handleFreeTextSubmit = () => {
    if (freeTextMealName.trim() && onAddFreeText) {
      const trimmedNotes = notes.trim() || undefined;
      const finalExtras = extraItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          ...item,
          id: 'id' in item ? item.id : uuidv4(),
          name: item.name.trim(),
        }));
      onAddFreeText(
        freeTextMealName.trim(),
        trimmedNotes,
        finalExtras.length > 0 ? finalExtras : undefined
      );
      onClose();
    }
  };

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setServings(recipe.servings);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add ${slot?.name || 'Meal'} - ${format(date, 'EEEE, MMMM d')}`}
      size="lg"
    >
      <div className={styles.content}>
        {onAddFreeText && (
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeButton} ${!isQuickEntry ? styles.active : ''}`}
              onClick={() => setIsQuickEntry(false)}
            >
              <Search size={16} />
              Select Recipe
            </button>
            <button
              type="button"
              className={`${styles.modeButton} ${isQuickEntry ? styles.active : ''}`}
              onClick={() => setIsQuickEntry(true)}
            >
              <Pencil size={16} />
              Quick Entry
            </button>
          </div>
        )}

        {isQuickEntry ? (
          <div className={styles.quickEntryContent}>
            <div className={styles.quickEntryField}>
              <label className={styles.sectionLabel}>Meal Name</label>
              <Input
                type="text"
                placeholder="e.g., Sandwiches, Salad, Leftovers..."
                value={freeTextMealName}
                onChange={(e) => setFreeTextMealName(e.target.value)}
                fullWidth
                autoFocus
              />
              <p className={styles.sectionHint}>
                Enter a name for your meal without selecting a recipe
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.search}>
              <Input
                type="search"
                placeholder="Search recipes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search size={18} />}
                fullWidth
              />
            </div>

            {isLoading ? (
              <div className={styles.loading}>Loading recipes...</div>
            ) : filteredRecipes.length === 0 ? (
              <div className={styles.empty}>
                {recipes.length === 0
                  ? 'No recipes yet. Add some recipes first!'
                  : 'No recipes match your search.'}
              </div>
            ) : (
              <div className={styles.recipeList}>
                {filteredRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className={`${styles.recipeCard} ${selectedRecipe?.id === recipe.id ? styles.selected : ''}`}
                    onClick={() => handleRecipeClick(recipe)}
                  >
                    <div className={styles.recipeInfo}>
                      <h3 className={styles.recipeTitle}>{recipe.title}</h3>
                      {recipe.description && (
                        <p className={styles.recipeDescription}>{recipe.description}</p>
                      )}
                      <div className={styles.recipeMeta}>
                        {recipe.prepTimeMinutes && (
                          <span className={styles.metaItem}>
                            <Clock size={14} />
                            {recipe.prepTimeMinutes + (recipe.cookTimeMinutes || 0)} min
                          </span>
                        )}
                        <span className={styles.metaItem}>
                          <Users size={14} />
                          {recipe.servings} servings
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {(selectedRecipe || isQuickEntry) && (
          <div className={styles.mealOptions}>
            {selectedRecipe && !isQuickEntry && (
              <div className={styles.servingsSection}>
                <label className={styles.servingsLabel}>
                  Servings for this meal:
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={servings}
                    onChange={(e) => setServings(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className={styles.servingsInput}
                  />
                </label>
              </div>
            )}

            <div className={styles.notesSection}>
              <label className={styles.sectionLabel}>
                Notes (optional)
              </label>
              <textarea
                className={styles.notesInput}
                placeholder="e.g., marinate overnight, double the sauce..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className={styles.extrasSection}>
              <label className={styles.sectionLabel}>
                Side dishes / Extras
              </label>
              <p className={styles.sectionHint}>
                These items will be added to your shopping list
              </p>

              {extraItems.map((item, index) => (
                <div key={index} className={styles.extraRow}>
                  <input
                    type="text"
                    className={styles.extraNameInput}
                    placeholder="Item name (e.g., green beans)"
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
        )}
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {isQuickEntry ? (
          <Button
            onClick={handleFreeTextSubmit}
            disabled={!freeTextMealName.trim()}
          >
            Add to Calendar
          </Button>
        ) : (
          <Button onClick={handleSelect} disabled={!selectedRecipe}>
            Add to Calendar
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
