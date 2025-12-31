import { useMemo } from 'react';
import { getMonthCalendarWeeks, getDayNames } from '@/utils/calendar';
import { DayCell } from './DayCell';
import type { PlannedMeal, MealSlot, ExternalEvent } from '@/types';
import styles from './CalendarGrid.module.css';

interface CalendarGridProps {
  currentDate: Date;
  weekStartsOn: 0 | 1;
  mealsByDate: Map<string, PlannedMeal[]>;
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
  externalEventsByDate?: Map<string, ExternalEvent[]>;
  onDayClick: (date: Date) => void;
  onMealClick: (meal: PlannedMeal) => void;
  onAddMeal: (date: Date, slotId: string) => void;
  onRemoveMeal: (mealId: string) => void;
  onMoveMeal?: (mealId: string, toDate: string, toSlotId: string) => void;
}

export function CalendarGrid({
  currentDate,
  weekStartsOn,
  mealsByDate,
  mealSlots,
  recipesById,
  externalEventsByDate,
  onDayClick,
  onMealClick,
  onAddMeal,
  onRemoveMeal,
  onMoveMeal,
}: CalendarGridProps) {
  const weeks = useMemo(
    () => getMonthCalendarWeeks(currentDate, weekStartsOn),
    [currentDate, weekStartsOn]
  );

  const dayNames = useMemo(
    () => getDayNames(weekStartsOn, 'short'),
    [weekStartsOn]
  );

  return (
    <div className={styles.grid}>
      <div className={styles.header}>
        {dayNames.map((name, index) => (
          <div key={index} className={styles.headerCell}>
            {name}
          </div>
        ))}
      </div>
      <div className={styles.body}>
        {weeks.map((week) => (
          <div key={week.weekNumber} className={styles.week}>
            {week.days.map((day) => (
              <DayCell
                key={day.dateString}
                day={day}
                meals={mealsByDate.get(day.dateString) || []}
                mealSlots={mealSlots}
                recipesById={recipesById}
                externalEvents={externalEventsByDate?.get(day.dateString) || []}
                onClick={() => onDayClick(day.date)}
                onMealClick={onMealClick}
                onAddMeal={(slotId) => onAddMeal(day.date, slotId)}
                onRemoveMeal={onRemoveMeal}
                onMoveMeal={onMoveMeal}
                compact
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
