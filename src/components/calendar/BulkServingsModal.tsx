import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar, Minus, Plus } from 'lucide-react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import { mealPlanRepository } from '@/db';
import type { PlannedMeal, MealSlot } from '@/types';
import styles from './BulkServingsModal.module.css';

interface BulkServingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
}

type QuickRange = 'today' | 'this-week' | 'next-week' | 'next-7-days' | 'this-month' | 'next-month' | 'custom';

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'this-week', label: 'This Week' },
  { id: 'next-week', label: 'Next Week' },
  { id: 'next-7-days', label: 'Next 7 Days' },
  { id: 'this-month', label: 'This Month' },
  { id: 'next-month', label: 'Next Month' },
  { id: 'custom', label: 'Custom Range' },
];

export function BulkServingsModal({
  isOpen,
  onClose,
  onComplete,
  mealSlots,
  recipesById,
}: BulkServingsModalProps) {
  const [selectedRange, setSelectedRange] = useState<QuickRange>('this-week');
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [servings, setServings] = useState(4);
  const [mealsInRange, setMealsInRange] = useState<PlannedMeal[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [allRecipesSelected, setAllRecipesSelected] = useState(true);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [allSlotsSelected, setAllSlotsSelected] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();

    switch (selectedRange) {
      case 'today':
        return { startDate: today, endDate: today };
      case 'this-week':
        return {
          startDate: startOfWeek(today, { weekStartsOn: 0 }),
          endDate: endOfWeek(today, { weekStartsOn: 0 }),
        };
      case 'next-week':
        const nextWeek = addDays(today, 7);
        return {
          startDate: startOfWeek(nextWeek, { weekStartsOn: 0 }),
          endDate: endOfWeek(nextWeek, { weekStartsOn: 0 }),
        };
      case 'next-7-days':
        return { startDate: today, endDate: addDays(today, 6) };
      case 'this-month':
        return {
          startDate: startOfMonth(today),
          endDate: endOfMonth(today),
        };
      case 'next-month':
        const nextMonth = addMonths(today, 1);
        return {
          startDate: startOfMonth(nextMonth),
          endDate: endOfMonth(nextMonth),
        };
      case 'custom':
        return {
          startDate: new Date(customStart),
          endDate: new Date(customEnd),
        };
      default:
        return { startDate: today, endDate: today };
    }
  }, [selectedRange, customStart, customEnd]);

  // Fetch meals when date range changes
  useEffect(() => {
    if (!isOpen) return;

    const fetchMeals = async () => {
      const meals = await mealPlanRepository.getMealsForDateRange(startDate, endDate);
      setMealsInRange(meals);
      // Reset filters when range changes
      setAllRecipesSelected(true);
      setSelectedRecipeIds(new Set());
      setAllSlotsSelected(true);
      setSelectedSlotIds(new Set());
    };

    fetchMeals();
  }, [isOpen, startDate, endDate]);

  // Get unique recipes in the current range
  const recipesInRange = useMemo(() => {
    const recipeMap = new Map<string, { id: string; title: string; count: number }>();
    for (const meal of mealsInRange) {
      const recipe = recipesById.get(meal.recipeId);
      if (recipe) {
        const existing = recipeMap.get(meal.recipeId);
        if (existing) {
          existing.count++;
        } else {
          recipeMap.set(meal.recipeId, { ...recipe, count: 1 });
        }
      }
    }
    return Array.from(recipeMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [mealsInRange, recipesById]);

  // Filter meals based on selections
  const filteredMeals = useMemo(() => {
    return mealsInRange.filter((meal) => {
      const matchesRecipe = allRecipesSelected || selectedRecipeIds.has(meal.recipeId);
      const matchesSlot = allSlotsSelected || selectedSlotIds.has(meal.slotId);
      return matchesRecipe && matchesSlot;
    });
  }, [mealsInRange, allRecipesSelected, selectedRecipeIds, allSlotsSelected, selectedSlotIds]);

  const handleRecipeToggle = useCallback((recipeId: string) => {
    setSelectedRecipeIds((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      return next;
    });
    setAllRecipesSelected(false);
  }, []);

  const handleAllRecipesToggle = useCallback(() => {
    setAllRecipesSelected(true);
    setSelectedRecipeIds(new Set());
  }, []);

  const handleSlotToggle = useCallback((slotId: string) => {
    setSelectedSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) {
        next.delete(slotId);
      } else {
        next.add(slotId);
      }
      return next;
    });
    setAllSlotsSelected(false);
  }, []);

  const handleAllSlotsToggle = useCallback(() => {
    setAllSlotsSelected(true);
    setSelectedSlotIds(new Set());
  }, []);

  const handleServingsChange = useCallback((delta: number) => {
    setServings((prev) => Math.max(1, prev + delta));
  }, []);

  const handleUpdate = useCallback(async () => {
    if (filteredMeals.length === 0) return;

    setIsUpdating(true);
    try {
      const mealIds = filteredMeals.map((m) => m.id);
      await mealPlanRepository.bulkUpdateMeals(mealIds, { servings });
      onComplete();
      onClose();
    } catch (error) {
      console.error('Failed to update servings:', error);
      alert('Failed to update servings. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  }, [filteredMeals, servings, onComplete, onClose]);

  const handleClose = useCallback(() => {
    setSelectedRange('this-week');
    setServings(4);
    setAllRecipesSelected(true);
    setSelectedRecipeIds(new Set());
    setAllSlotsSelected(true);
    setSelectedSlotIds(new Set());
    onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Adjust Servings"
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.section}>
          <label className={styles.label}>Date Range</label>
          <div className={styles.rangeGrid}>
            {QUICK_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                className={`${styles.rangeButton} ${selectedRange === range.id ? styles.selected : ''}`}
                onClick={() => setSelectedRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {selectedRange === 'custom' && (
          <div className={styles.customDates}>
            <Input
              type="date"
              label="Start Date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}

        <div className={styles.preview}>
          <Calendar size={16} />
          <span>
            {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
          </span>
        </div>

        {recipesInRange.length > 0 && (
          <div className={styles.section}>
            <label className={styles.label}>Filter by Recipe (optional)</label>
            <div className={styles.filterList}>
              <label className={styles.filterItem}>
                <input
                  type="checkbox"
                  checked={allRecipesSelected}
                  onChange={handleAllRecipesToggle}
                />
                <span>All recipes</span>
              </label>
              {recipesInRange.map((recipe) => (
                <label key={recipe.id} className={styles.filterItem}>
                  <input
                    type="checkbox"
                    checked={!allRecipesSelected && selectedRecipeIds.has(recipe.id)}
                    onChange={() => handleRecipeToggle(recipe.id)}
                    disabled={allRecipesSelected}
                  />
                  <span className={allRecipesSelected ? styles.disabled : ''}>
                    {recipe.title} ({recipe.count} {recipe.count === 1 ? 'meal' : 'meals'})
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <label className={styles.label}>Filter by Meal Slot (optional)</label>
          <div className={styles.slotFilters}>
            <label className={styles.slotItem}>
              <input
                type="checkbox"
                checked={allSlotsSelected}
                onChange={handleAllSlotsToggle}
              />
              <span>All</span>
            </label>
            {mealSlots.map((slot) => (
              <label key={slot.id} className={styles.slotItem}>
                <input
                  type="checkbox"
                  checked={!allSlotsSelected && selectedSlotIds.has(slot.id)}
                  onChange={() => handleSlotToggle(slot.id)}
                  disabled={allSlotsSelected}
                />
                <span className={allSlotsSelected ? styles.disabled : ''}>{slot.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>New Serving Size</label>
          <div className={styles.servingsInput}>
            <button
              type="button"
              className={styles.servingsButton}
              onClick={() => handleServingsChange(-1)}
              disabled={servings <= 1}
            >
              <Minus size={16} />
            </button>
            <input
              type="number"
              className={styles.servingsValue}
              value={servings}
              onChange={(e) => setServings(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
            <button
              type="button"
              className={styles.servingsButton}
              onClick={() => handleServingsChange(1)}
            >
              <Plus size={16} />
            </button>
            <span className={styles.servingsLabel}>servings</span>
          </div>
        </div>

        <div className={styles.summary}>
          {filteredMeals.length === 0 ? (
            <span className={styles.noMeals}>No meals match the selected filters</span>
          ) : (
            <span>
              {filteredMeals.length} {filteredMeals.length === 1 ? 'meal' : 'meals'} will be updated
            </span>
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={filteredMeals.length === 0 || isUpdating}
          >
            {isUpdating ? 'Updating...' : 'Update Servings'}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
