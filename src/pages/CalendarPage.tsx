import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Printer, Download, BookOpen, Wand2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { Button } from '@/components/ui';
import {
  CalendarGrid,
  WeekView,
  RecipePicker,
  PrintRecipesDatePicker,
  PrintRecipesView,
} from '@/components/calendar';
import { MealPlanAssistantModal } from '@/components/mealPlanAssistant';
import type { DayMeals } from '@/components/calendar/PrintRecipesView';
import { useCalendar } from '@/hooks';
import { icalService } from '@/services';
import { mealPlanRepository, recipeRepository, settingsRepository, tagRepository } from '@/db';
import type { PlannedMeal, MealExtraItem, Recipe, MealSlot, Tag } from '@/types';
import styles from './CalendarPage.module.css';

export function CalendarPage() {
  const {
    currentDate,
    view,
    weekStartsOn,
    mealSlots,
    mealsByDate,
    recipesById,
    externalEventsByDate,
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

  // Print recipes state
  const [printRecipesOpen, setPrintRecipesOpen] = useState(false);
  const [printData, setPrintData] = useState<DayMeals[] | null>(null);
  const [printDateRange, setPrintDateRange] = useState<{ start: Date; end: Date } | null>(null);

  // Meal plan assistant state
  const [planAssistantOpen, setPlanAssistantOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);

  // Fetch tags for meal plan assistant
  useEffect(() => {
    tagRepository.getAll().then(setTags);
  }, []);

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
    async (recipeId: string, servings: number, notes?: string, extraItems?: MealExtraItem[]) => {
      await addMeal(pickerDate, pickerSlotId, recipeId, servings, notes, extraItems);
    },
    [addMeal, pickerDate, pickerSlotId]
  );

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handlePrintRecipes = useCallback(
    async (startDate: Date, endDate: Date) => {
      try {
        // Fetch meals for date range
        const meals = await mealPlanRepository.getMealsForDateRange(startDate, endDate);

        if (meals.length === 0) {
          alert('No meals planned for the selected date range.');
          return;
        }

        // Get unique recipe IDs and fetch full recipe data
        const recipeIds = [...new Set(meals.map((m) => m.recipeId))];
        const recipes = await recipeRepository.getByIds(recipeIds);
        const recipesMap = new Map(recipes.map((r) => [r.id, r]));

        // Create slots map
        const slotsMap = new Map(mealSlots.map((s) => [s.id, s]));

        // Group meals by date and sort
        const mealsByDay = new Map<string, DayMeals>();

        for (const meal of meals) {
          const recipe = recipesMap.get(meal.recipeId);
          if (!recipe) continue;

          const slot = slotsMap.get(meal.slotId);
          const slotName = slot?.name || 'Meal';
          const slotOrder = slot?.order ?? 999;

          if (!mealsByDay.has(meal.date)) {
            const [year, month, day] = meal.date.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            mealsByDay.set(meal.date, {
              date: meal.date,
              dateFormatted: format(dateObj, 'EEEE, MMMM d, yyyy'),
              meals: [],
            });
          }

          mealsByDay.get(meal.date)!.meals.push({
            meal,
            recipe,
            slotName,
            slotOrder,
          });
        }

        // Sort meals within each day by slot order
        for (const day of mealsByDay.values()) {
          day.meals.sort((a, b) => (a.slotOrder ?? 999) - (b.slotOrder ?? 999));
        }

        // Convert to array and sort by date
        const sortedDays = Array.from(mealsByDay.values()).sort((a, b) =>
          a.date.localeCompare(b.date)
        );

        setPrintData(sortedDays);
        setPrintDateRange({ start: startDate, end: endDate });

        // Trigger print after render
        setTimeout(() => window.print(), 100);
      } catch (error) {
        console.error('Failed to prepare recipes for print:', error);
        alert('Failed to prepare recipes for printing. Please try again.');
      }
    },
    [mealSlots]
  );

  const handleExport = useCallback(async () => {
    try {
      // Get date range based on current view
      let start: Date;
      let end: Date;

      if (view === 'month') {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        start = startOfWeek(monthStart, { weekStartsOn });
        end = endOfWeek(monthEnd, { weekStartsOn });
      } else {
        start = startOfWeek(currentDate, { weekStartsOn });
        end = endOfWeek(currentDate, { weekStartsOn });
      }

      // Fetch meals for the visible range
      const mealsToExport = await mealPlanRepository.getMealsForDateRange(start, end);

      if (mealsToExport.length === 0) {
        alert('No meals to export in the current view.');
        return;
      }

      // Get all recipes and meal slots for the export
      const allRecipes = await recipeRepository.getAll();
      const settings = await settingsRepository.get();

      const recipesMap = new Map<string, Recipe>();
      for (const recipe of allRecipes) {
        recipesMap.set(recipe.id, recipe);
      }

      const slotsMap = new Map<string, MealSlot>();
      for (const slot of settings.mealSlots) {
        slotsMap.set(slot.id, slot);
      }

      // Generate and download the .ics file
      icalService.exportMealsToIcs(mealsToExport, recipesMap, slotsMap);
    } catch (error) {
      console.error('Failed to export meals:', error);
      alert('Failed to export meals. Please try again.');
    }
  }, [currentDate, view, weekStartsOn]);

  // Listen for export event from settings page
  useEffect(() => {
    const handleExportEvent = () => handleExport();
    window.addEventListener('platecraft:export-meals', handleExportEvent);
    return () => window.removeEventListener('platecraft:export-meals', handleExportEvent);
  }, [handleExport]);

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
            leftIcon={<Wand2 size={16} />}
            onClick={() => setPlanAssistantOpen(true)}
            className="no-print"
          >
            Plan Meals
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={16} />}
            onClick={handleExport}
            className="no-print"
          >
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Printer size={16} />}
            onClick={handlePrint}
            className="no-print"
          >
            Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<BookOpen size={16} />}
            onClick={() => setPrintRecipesOpen(true)}
            className="no-print"
          >
            Print Recipes
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
            externalEventsByDate={externalEventsByDate}
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
            externalEventsByDate={externalEventsByDate}
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

      <PrintRecipesDatePicker
        isOpen={printRecipesOpen}
        onClose={() => setPrintRecipesOpen(false)}
        onPrint={handlePrintRecipes}
      />

      {printData && printDateRange && (
        <PrintRecipesView
          mealsByDay={printData}
          startDate={printDateRange.start}
          endDate={printDateRange.end}
        />
      )}

      <MealPlanAssistantModal
        isOpen={planAssistantOpen}
        onClose={() => setPlanAssistantOpen(false)}
        onComplete={() => {
          // Trigger a refresh of the calendar data
          window.location.reload();
        }}
        mealSlots={mealSlots}
        tags={tags}
      />
    </div>
  );
}
