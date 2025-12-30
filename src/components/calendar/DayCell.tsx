import { Plus, X } from 'lucide-react';
import type { CalendarDay } from '@/utils/calendar';
import type { PlannedMeal, MealSlot } from '@/types';
import styles from './DayCell.module.css';

interface DayCellProps {
  day: CalendarDay;
  meals: PlannedMeal[];
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
  onClick: () => void;
  onMealClick: (meal: PlannedMeal) => void;
  onAddMeal: (slotId: string) => void;
  onRemoveMeal: (mealId: string) => void;
  compact?: boolean;
}

export function DayCell({
  day,
  meals,
  mealSlots,
  recipesById,
  onClick,
  onMealClick,
  onAddMeal,
  onRemoveMeal,
  compact = false,
}: DayCellProps) {
  const sortedMealSlots = [...mealSlots].sort((a, b) => a.order - b.order);

  const getMealForSlot = (slotId: string) => {
    return meals.find((m) => m.slotId === slotId);
  };

  const cellClasses = [
    styles.cell,
    !day.isCurrentMonth ? styles.otherMonth : '',
    day.isToday ? styles.today : '',
    day.isWeekend ? styles.weekend : '',
    compact ? styles.compact : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cellClasses} onClick={onClick}>
      <div className={styles.header}>
        <span className={styles.dayNumber}>{day.dayOfMonth}</span>
      </div>

      <div className={styles.meals}>
        {sortedMealSlots.map((slot) => {
          const meal = getMealForSlot(slot.id);
          const recipe = meal ? recipesById.get(meal.recipeId) : null;

          if (compact) {
            // In compact mode (month view), just show dots or mini cards
            if (meal && recipe) {
              return (
                <div
                  key={slot.id}
                  className={styles.mealDot}
                  title={`${slot.name}: ${recipe.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMealClick(meal);
                  }}
                />
              );
            }
            return null;
          }

          // Full view (week view)
          return (
            <div key={slot.id} className={styles.mealSlot}>
              <span className={styles.slotName}>{slot.name}</span>
              {meal && recipe ? (
                <div
                  className={styles.mealCard}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMealClick(meal);
                  }}
                >
                  <span className={styles.mealTitle}>{recipe.title}</span>
                  <button
                    className={styles.removeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveMeal(meal.id);
                    }}
                    aria-label="Remove meal"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  className={styles.addButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddMeal(slot.id);
                  }}
                  aria-label={`Add ${slot.name}`}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {compact && meals.length > 0 && (
        <div className={styles.mealCount}>{meals.length} meal{meals.length > 1 ? 's' : ''}</div>
      )}
    </div>
  );
}
