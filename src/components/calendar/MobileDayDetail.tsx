import { format } from 'date-fns';
import { Plus, X, StickyNote, Pencil } from 'lucide-react';
import type { PlannedMeal, MealSlot, ExternalEvent } from '@/types';
import { ExternalEventCard } from './ExternalEventCard';
import styles from './MobileDayDetail.module.css';

const isFreeTextMeal = (meal: PlannedMeal): boolean => {
  return !meal.recipeId && !!meal.freeText;
};

const getMealTitle = (meal: PlannedMeal, recipesById: Map<string, { id: string; title: string }>): string => {
  if (meal.freeText) return meal.freeText;
  const recipe = meal.recipeId ? recipesById.get(meal.recipeId) : null;
  return recipe?.title || 'Unknown Recipe';
};

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
          const mealTitle = meal ? getMealTitle(meal, recipesById) : null;
          const isFreeText = meal ? isFreeTextMeal(meal) : false;

          return (
            <div key={slot.id} className={styles.slot}>
              <span className={styles.slotName}>{slot.name}</span>
              {meal && mealTitle ? (
                <div
                  className={`${styles.mealCard} ${isFreeText ? styles.freeTextMealCard : ''}`}
                  onClick={() => onMealClick(meal)}
                >
                  {isFreeText && <Pencil size={14} className={styles.freeTextIndicator} />}
                  <span className={styles.mealTitle}>{mealTitle}</span>
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
