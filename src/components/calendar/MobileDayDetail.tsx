import { format } from 'date-fns';
import { Plus, X, StickyNote } from 'lucide-react';
import type { PlannedMeal, MealSlot, ExternalEvent } from '@/types';
import { ExternalEventCard } from './ExternalEventCard';
import styles from './MobileDayDetail.module.css';

interface MobileDayDetailProps {
  date: Date;
  meals: PlannedMeal[];
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
  externalEvents?: ExternalEvent[];
  calendarColorsById?: Map<string, string>;
  onAddMeal: (date: Date, slotId: string) => void;
  onRemoveMeal: (mealId: string) => void;
  onMealClick: (meal: PlannedMeal) => void;
}

export function MobileDayDetail({
  date,
  meals,
  mealSlots,
  recipesById,
  externalEvents = [],
  calendarColorsById,
  onAddMeal,
  onRemoveMeal,
  onMealClick,
}: MobileDayDetailProps) {
  const sortedMealSlots = [...mealSlots].sort((a, b) => a.order - b.order);

  const getMealForSlot = (slotId: string) => {
    return meals.find((m) => m.slotId === slotId);
  };

  const hasNotesOrExtras = (meal: PlannedMeal): boolean => {
    return !!(meal.notes || (meal.extraItems && meal.extraItems.length > 0));
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.dateTitle}>{format(date, 'EEEE, MMMM d')}</h3>
      </div>

      <div className={styles.slots}>
        {sortedMealSlots.map((slot) => {
          const meal = getMealForSlot(slot.id);
          const recipe = meal ? recipesById.get(meal.recipeId) : null;

          return (
            <div key={slot.id} className={styles.slot}>
              <span className={styles.slotName}>{slot.name}</span>
              {meal && recipe ? (
                <div
                  className={styles.mealCard}
                  onClick={() => onMealClick(meal)}
                >
                  <span className={styles.mealTitle}>{recipe.title}</span>
                  <div className={styles.mealActions}>
                    {hasNotesOrExtras(meal) && (
                      <StickyNote size={14} className={styles.notesIndicator} />
                    )}
                    <button
                      className={styles.removeButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveMeal(meal.id);
                      }}
                      aria-label="Remove meal"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles.addButton}
                  onClick={() => onAddMeal(date, slot.id)}
                >
                  <Plus size={16} />
                  <span>Add {slot.name.toLowerCase()}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {externalEvents.length > 0 && (
        <div className={styles.externalEvents}>
          <h4 className={styles.eventsTitle}>Calendar Events</h4>
          {externalEvents.map((event) => (
            <ExternalEventCard
              key={event.id}
              event={event}
              compact={false}
              color={calendarColorsById?.get(event.calendarId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
