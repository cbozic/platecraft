import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { mealPlanRepository, recipeRepository, settingsRepository } from '@/db';
import type { PlannedMeal, MealSlot, Recipe, CalendarView } from '@/types';

interface UseCalendarOptions {
  initialView?: CalendarView;
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const { initialView = 'month' } = options;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>(initialView);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0);
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings and initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const settings = await settingsRepository.get();
        setWeekStartsOn(settings.calendarStartDay);
        setMealSlots(settings.mealSlots);

        const allRecipes = await recipeRepository.getAll();
        setRecipes(allRecipes);
      } catch (error) {
        console.error('Failed to load calendar data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Load meals when date or view changes
  useEffect(() => {
    const loadMeals = async () => {
      setIsLoading(true);
      try {
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

        const mealsData = await mealPlanRepository.getMealsForDateRange(start, end);
        setMeals(mealsData);
      } catch (error) {
        console.error('Failed to load meals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMeals();
  }, [currentDate, view, weekStartsOn]);

  // Group meals by date
  const mealsByDate = useMemo(() => {
    const map = new Map<string, PlannedMeal[]>();
    for (const meal of meals) {
      const existing = map.get(meal.date) || [];
      existing.push(meal);
      map.set(meal.date, existing);
    }
    return map;
  }, [meals]);

  // Create a map of recipes by ID for quick lookup
  const recipesById = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const recipe of recipes) {
      map.set(recipe.id, { id: recipe.id, title: recipe.title });
    }
    return map;
  }, [recipes]);

  // Navigation functions
  const goToPrevious = useCallback(() => {
    if (view === 'month') {
      setCurrentDate((prev) => subMonths(prev, 1));
    } else {
      setCurrentDate((prev) => subWeeks(prev, 1));
    }
  }, [view]);

  const goToNext = useCallback(() => {
    if (view === 'month') {
      setCurrentDate((prev) => addMonths(prev, 1));
    } else {
      setCurrentDate((prev) => addWeeks(prev, 1));
    }
  }, [view]);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  // Meal management functions
  const addMeal = useCallback(
    async (date: Date, slotId: string, recipeId: string, servings: number) => {
      try {
        const newMeal = await mealPlanRepository.addMeal(date, slotId, recipeId, servings);
        setMeals((prev) => [...prev, newMeal]);
        return newMeal;
      } catch (error) {
        console.error('Failed to add meal:', error);
        throw error;
      }
    },
    []
  );

  const removeMeal = useCallback(async (mealId: string) => {
    try {
      await mealPlanRepository.removeMeal(mealId);
      setMeals((prev) => prev.filter((m) => m.id !== mealId));
    } catch (error) {
      console.error('Failed to remove meal:', error);
      throw error;
    }
  }, []);

  const updateMeal = useCallback(
    async (mealId: string, updates: Partial<Omit<PlannedMeal, 'id'>>) => {
      try {
        await mealPlanRepository.updateMeal(mealId, updates);
        setMeals((prev) =>
          prev.map((m) => (m.id === mealId ? { ...m, ...updates } : m))
        );
      } catch (error) {
        console.error('Failed to update meal:', error);
        throw error;
      }
    },
    []
  );

  const moveMeal = useCallback(
    async (mealId: string, toDate: string, toSlotId: string) => {
      try {
        const updatedMeal = await mealPlanRepository.moveMeal(mealId, toDate, toSlotId);
        if (updatedMeal) {
          setMeals((prev) =>
            prev.map((m) => (m.id === mealId ? updatedMeal : m))
          );
        }
      } catch (error) {
        console.error('Failed to move meal:', error);
        throw error;
      }
    },
    []
  );

  // Refresh meals data
  const refreshMeals = useCallback(async () => {
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

    const mealsData = await mealPlanRepository.getMealsForDateRange(start, end);
    setMeals(mealsData);
  }, [currentDate, view, weekStartsOn]);

  return {
    // State
    currentDate,
    view,
    weekStartsOn,
    mealSlots,
    meals,
    mealsByDate,
    recipes,
    recipesById,
    isLoading,

    // Navigation
    setView,
    goToPrevious,
    goToNext,
    goToToday,
    goToDate,

    // Meal management
    addMeal,
    removeMeal,
    updateMeal,
    moveMeal,
    refreshMeals,
  };
}
