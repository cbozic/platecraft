import { useMemo } from 'react';
import { format } from 'date-fns';
import { getWeekDays, getDayNames } from '@/utils/calendar';
import { DayCell } from './DayCell';
import type { PlannedMeal, MealSlot, ExternalEvent } from '@/types';
import styles from './WeekView.module.css';

interface WeekViewProps {
  currentDate: Date;
  weekStartsOn: 0 | 1;
  mealsByDate: Map<string, PlannedMeal[]>;
  mealSlots: MealSlot[];
  recipesById: Map<string, { id: string; title: string }>;
  externalEventsByDate?: Map<string, ExternalEvent[]>;
  calendarColorsById?: Map<string, string>;
  onDayClick: (date: Date) => void;
  onMealClick: (meal: PlannedMeal) => void;
  onAddMeal: (date: Date, slotId: string) => void;
  onRemoveMeal: (mealId: string) => void;
  onMoveMeal?: (mealId: string, toDate: string, toSlotId: string) => void;
}

export function WeekView({
  currentDate,
  weekStartsOn,
  mealsByDate,
  mealSlots,
  recipesById,
  externalEventsByDate,
  calendarColorsById,
  onDayClick,
  onMealClick,
  onAddMeal,
  onRemoveMeal,
  onMoveMeal,
}: WeekViewProps) {
  const days = useMemo(
    () => getWeekDays(currentDate, weekStartsOn),
    [currentDate, weekStartsOn]
  );

  const dayNames = useMemo(
    () => getDayNames(weekStartsOn, 'short'),
    [weekStartsOn]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        {days.map((day, index) => (
          <div
            key={day.dateString}
            className={`${styles.headerCell} ${day.isToday ? styles.today : ''}`}
          >
            <span className={styles.dayName}>{dayNames[index]}</span>
            <span className={styles.dayDate}>{format(day.date, 'MMM d')}</span>
          </div>
        ))}
      </div>
      <div className={styles.body}>
        {days.map((day) => (
          <DayCell
            key={day.dateString}
            day={day}
            meals={mealsByDate.get(day.dateString) || []}
            mealSlots={mealSlots}
            recipesById={recipesById}
            externalEvents={externalEventsByDate?.get(day.dateString) || []}
            calendarColorsById={calendarColorsById}
            onClick={() => onDayClick(day.date)}
            onMealClick={onMealClick}
            onAddMeal={(slotId) => onAddMeal(day.date, slotId)}
            onRemoveMeal={onRemoveMeal}
            onMoveMeal={onMoveMeal}
            compact={false}
          />
        ))}
      </div>
    </div>
  );
}
