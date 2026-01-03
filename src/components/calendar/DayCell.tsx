import { useState } from 'react';
import { Plus, X, GripVertical, StickyNote } from 'lucide-react';
import { ExternalEventCard } from './ExternalEventCard';
import type { CalendarDay } from '@/utils/calendar';
import type { PlannedMeal, MealSlot, ExternalEvent } from '@/types';
import styles from './DayCell.module.css';

const hasNotesOrExtras = (meal: PlannedMeal): boolean => {
  return !!(meal.notes || (meal.extraItems && meal.extraItems.length > 0));
};

interface DayCellProps {
  day: CalendarDay;
  meals: PlannedMeal[];
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
  externalEvents?: ExternalEvent[];
  calendarColorsById?: Map<string, string>;
  onClick: () => void;
  onMealClick: (meal: PlannedMeal) => void;
  onAddMeal: (slotId: string) => void;
  onRemoveMeal: (mealId: string) => void;
  onMoveMeal?: (mealId: string, toDate: string, toSlotId: string) => void;
  compact?: boolean;
}

interface DragData {
  mealId: string;
  fromDate: string;
  fromSlotId: string;
}

export function DayCell({
  day,
  meals,
  mealSlots,
  recipesById,
  externalEvents = [],
  calendarColorsById,
  onClick,
  onMealClick,
  onAddMeal,
  onRemoveMeal,
  onMoveMeal,
  compact = false,
}: DayCellProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const sortedMealSlots = [...mealSlots].sort((a, b) => a.order - b.order);

  const getMealForSlot = (slotId: string) => {
    return meals.find((m) => m.slotId === slotId);
  };

  const handleDragStart = (e: React.DragEvent, meal: PlannedMeal) => {
    const dragData: DragData = {
      mealId: meal.id,
      fromDate: meal.date,
      fromSlotId: meal.slotId,
    };
    e.dataTransfer.setData('application/json', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'move';

    // Add a class to the dragged element
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add(styles.dragging);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove(styles.dragging);
    }
    setDragOverSlot(null);
  };

  const handleDragOver = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slotId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the slot entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = (e: React.DragEvent, slotId: string) => {
    e.preventDefault();
    setDragOverSlot(null);

    if (!onMoveMeal) return;

    try {
      const data = e.dataTransfer.getData('application/json');
      const dragData: DragData = JSON.parse(data);

      // Don't do anything if dropping on the same slot on the same day
      if (dragData.fromDate === day.dateString && dragData.fromSlotId === slotId) {
        return;
      }

      onMoveMeal(dragData.mealId, day.dateString, slotId);
    } catch (err) {
      console.error('Failed to parse drag data:', err);
    }
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
          const isDropTarget = dragOverSlot === slot.id;

          if (compact) {
            // In compact mode (month view), show meal labels with names
            if (meal && recipe) {
              const mealHasExtras = hasNotesOrExtras(meal);
              const titleParts = [`${slot.name}: ${recipe.title}`];
              if (meal.notes) titleParts.push(`Notes: ${meal.notes}`);
              if (meal.extraItems?.length) {
                titleParts.push(`Extras: ${meal.extraItems.map(e => e.name).join(', ')}`);
              }
              return (
                <div
                  key={slot.id}
                  className={styles.mealLabel}
                  title={titleParts.join('\n')}
                  draggable={!!onMoveMeal}
                  onDragStart={(e) => handleDragStart(e, meal)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMealClick(meal);
                  }}
                >
                  <span className={styles.mealDot} />
                  <span className={styles.mealName}>{recipe.title}</span>
                  {mealHasExtras && <StickyNote size={10} className={styles.notesIndicator} />}
                </div>
              );
            }
            return null;
          }

          // Full view (week view)
          const mealHasExtras = meal ? hasNotesOrExtras(meal) : false;
          return (
            <div
              key={slot.id}
              className={`${styles.mealSlot} ${isDropTarget ? styles.dropTarget : ''}`}
              onDragOver={(e) => handleDragOver(e, slot.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, slot.id)}
            >
              <span className={styles.slotName}>{slot.name}</span>
              {meal && recipe ? (
                <div
                  className={styles.mealCard}
                  draggable={!!onMoveMeal}
                  onDragStart={(e) => handleDragStart(e, meal)}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMealClick(meal);
                  }}
                >
                  {onMoveMeal && (
                    <span className={styles.dragHandle}>
                      <GripVertical size={12} />
                    </span>
                  )}
                  <span className={styles.mealTitle}>{recipe.title}</span>
                  {mealHasExtras && (
                    <span className={styles.notesIndicatorWeek} title={meal.notes || 'Has extras'}>
                      <StickyNote size={12} />
                    </span>
                  )}
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
                  className={`${styles.addButton} ${isDropTarget ? styles.dropTargetButton : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddMeal(slot.id);
                  }}
                  aria-label={`Add ${slot.name}`}
                >
                  {isDropTarget ? 'Drop here' : <Plus size={14} />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* External events from Google Calendar */}
      {externalEvents.length > 0 && (
        <div className={styles.externalEvents}>
          {externalEvents.map((event) => (
            <ExternalEventCard
              key={event.id}
              event={event}
              compact={compact}
              color={calendarColorsById?.get(event.calendarId)}
            />
          ))}
        </div>
      )}

      {compact && (meals.length > 0 || externalEvents.length > 0) && (
        <div className={styles.mealCount}>
          {meals.length > 0 && `${meals.length} meal${meals.length > 1 ? 's' : ''}`}
          {meals.length > 0 && externalEvents.length > 0 && ', '}
          {externalEvents.length > 0 && `${externalEvents.length} event${externalEvents.length > 1 ? 's' : ''}`}
        </div>
      )}
    </div>
  );
}
