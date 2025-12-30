import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Search, Clock, Users } from 'lucide-react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { recipeRepository } from '@/db';
import type { Recipe, MealSlot } from '@/types';
import styles from './RecipePicker.module.css';

interface RecipePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (recipeId: string, servings: number) => void;
  date: Date;
  slotId: string;
  mealSlots: MealSlot[];
}

export function RecipePicker({
  isOpen,
  onClose,
  onSelect,
  date,
  slotId,
  mealSlots,
}: RecipePickerProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [isLoading, setIsLoading] = useState(true);

  const slot = mealSlots.find((s) => s.id === slotId);

  useEffect(() => {
    if (isOpen) {
      loadRecipes();
      setSearchQuery('');
      setSelectedRecipe(null);
      setServings(4);
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
      onSelect(selectedRecipe.id, servings);
      onClose();
    }
  };

  const handleRecipeClick = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setServings(recipe.servings);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add ${slot?.name || 'Meal'} - ${format(date, 'EEEE, MMMM d')}`}
      size="lg"
    >
      <div className={styles.content}>
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

        {selectedRecipe && (
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
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSelect} disabled={!selectedRecipe}>
          Add to Calendar
        </Button>
      </ModalFooter>
    </Modal>
  );
}
