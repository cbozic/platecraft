import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui';
import { CalendarGrid, WeekView, RecipePicker } from '@/components/calendar';
import { useCalendar } from '@/hooks';
import type { PlannedMeal } from '@/types';
import styles from './CalendarPage.module.css';

export function CalendarPage() {
  const {
    currentDate,
    view,
    weekStartsOn,
    mealSlots,
    mealsByDate,
    recipesById,
    isLoading,
    setView,
    goToPrevious,
    goToNext,
    goToToday,
    goToDate,
    addMeal,
    removeMeal,
    moveMeal,
  } = useCalendar();

  // Recipe picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [pickerSlotId, setPickerSlotId] = useState<string>('');

  const handleDayClick = useCallback((date: Date) => {
    // Switch to week view centered on this date
    goToDate(date);
    setView('week');
  }, [goToDate, setView]);

  const handleMealClick = useCallback((meal: PlannedMeal) => {
    // For now, just log - could open a meal detail modal
    console.log('Meal clicked:', meal);
  }, []);

  const handleAddMeal = useCallback((date: Date, slotId: string) => {
    setPickerDate(date);
    setPickerSlotId(slotId);
    setPickerOpen(true);
  }, []);

  const handleRemoveMeal = useCallback(
    async (mealId: string) => {
      if (window.confirm('Remove this meal from your plan?')) {
        await removeMeal(mealId);
      }
    },
    [removeMeal]
  );

  const handleMoveMeal = useCallback(
    async (mealId: string, toDate: string, toSlotId: string) => {
      await moveMeal(mealId, toDate, toSlotId);
    },
    [moveMeal]
  );

  const handleRecipeSelect = useCallback(
    async (recipeId: string, servings: number) => {
      await addMeal(pickerDate, pickerSlotId, recipeId, servings);
    },
    [addMeal, pickerDate, pickerSlotId]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const getTitle = () => {
    if (view === 'month') {
      return format(currentDate, 'MMMM yyyy');
    }
    return `Week of ${format(currentDate, 'MMM d, yyyy')}`;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Meal Calendar</h1>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <Button
              variant={view === 'month' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView('month')}
            >
              Month
            </Button>
            <Button
              variant={view === 'week' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setView('week')}
            >
              Week
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
            className="no-print"
          >
            Print
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <Button variant="ghost" onClick={goToPrevious} aria-label="Previous">
            <ChevronLeft size={20} />
          </Button>
          <h2 className={styles.currentPeriod}>{getTitle()}</h2>
          <Button variant="ghost" onClick={goToNext} aria-label="Next">
            <ChevronRight size={20} />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={goToToday}>
          Today
        </Button>
      </div>

      <div className={styles.calendarContainer}>
        {isLoading ? (
          <div className={styles.loading}>Loading calendar...</div>
        ) : view === 'month' ? (
          <CalendarGrid
            currentDate={currentDate}
            weekStartsOn={weekStartsOn}
            mealsByDate={mealsByDate}
            mealSlots={mealSlots}
            recipesById={recipesById}
            onDayClick={handleDayClick}
            onMealClick={handleMealClick}
            onAddMeal={handleAddMeal}
            onRemoveMeal={handleRemoveMeal}
            onMoveMeal={handleMoveMeal}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            weekStartsOn={weekStartsOn}
            mealsByDate={mealsByDate}
            mealSlots={mealSlots}
            recipesById={recipesById}
            onDayClick={handleDayClick}
            onMealClick={handleMealClick}
            onAddMeal={handleAddMeal}
            onRemoveMeal={handleRemoveMeal}
            onMoveMeal={handleMoveMeal}
          />
        )}
      </div>

      <RecipePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleRecipeSelect}
        date={pickerDate}
        slotId={pickerSlotId}
        mealSlots={mealSlots}
      />
    </div>
  );
}
