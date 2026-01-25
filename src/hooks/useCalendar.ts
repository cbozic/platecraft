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
import { db, mealPlanRepository, recipeRepository, settingsRepository } from '@/db';
import { icalService, cryptoService } from '@/services';
import type { PlannedMeal, MealSlot, Recipe, CalendarView, MealExtraItem, ExternalEvent, ExternalCalendar } from '@/types';

interface UseCalendarOptions {
  initialView?: CalendarView;
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const { initialView = 'month' } = options;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>(initialView);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0);
  const [defaultServings, setDefaultServings] = useState<number>(4);
  const [mealSlots, setMealSlots] = useState<MealSlot[]>([]);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [externalEvents, setExternalEvents] = useState<ExternalEvent[]>([]);
  const [calendarColorsById, setCalendarColorsById] = useState<Map<string, string>>(new Map());

  // Load settings and initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const settings = await settingsRepository.get();
        setWeekStartsOn(settings.calendarStartDay);
        setDefaultServings(settings.defaultServings);
        setMealSlots(settings.mealSlots);

        const allRecipes = await recipeRepository.getAll();
        setRecipes(allRecipes);
      } catch (error) {
        console.error('Failed to load calendar data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Load meals and external events when date or view changes
  useEffect(() => {
    const loadMealsAndEvents = async () => {
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

        // Load meals
        const mealsData = await mealPlanRepository.getMealsForDateRange(start, end);
        setMeals(mealsData);

        // Load external events from iCal calendars
        try {
          const icalCalendarsRaw = await db.externalCalendars
            .where('provider')
            .equals('ical')
            .filter((c: ExternalCalendar) => c.isVisible)
            .toArray();

          // Decrypt icalUrl for each calendar if encrypted
          const icalCalendars = await Promise.all(
            icalCalendarsRaw.map(async (calendar) => {
              if (calendar.icalUrl) {
                try {
                  const parsed = JSON.parse(calendar.icalUrl);
                  if (cryptoService.isEncryptedField(parsed)) {
                    const decryptedUrl = await cryptoService.decryptField(parsed);
                    return { ...calendar, icalUrl: decryptedUrl };
                  }
                } catch {
                  // Not JSON/encrypted, use as-is (legacy plaintext)
                }
              }
              return calendar;
            })
          );

          if (icalCalendars.length > 0) {
            // Build color map from calendars
            const colorMap = new Map<string, string>();
            for (const calendar of icalCalendars) {
              colorMap.set(calendar.id, calendar.color);
            }
            setCalendarColorsById(colorMap);

            // Load cached events from database for the date range
            const allEvents: ExternalEvent[] = [];

            for (const calendar of icalCalendars) {
              const cachedEvents = await db.externalEvents
                .where('calendarId')
                .equals(calendar.id)
                .filter((event: ExternalEvent) => {
                  const eventStart = new Date(event.startTime);
                  return eventStart >= start && eventStart <= end;
                })
                .toArray();

              allEvents.push(...cachedEvents);
            }

            setExternalEvents(allEvents);

            // Optionally refresh from iCal URLs in the background (if stale)
            const staleThreshold = 5 * 60 * 1000; // 5 minutes
            const now = Date.now();

            for (const calendar of icalCalendars) {
              if (
                calendar.icalUrl &&
                (!calendar.lastSynced || now - new Date(calendar.lastSynced).getTime() > staleThreshold)
              ) {
                // Refresh in background (don't await) - URL is already decrypted
                icalService
                  .fetchIcalUrl(calendar.icalUrl, calendar.id)
                  .then(async (freshEvents) => {
                    // Update cache (using bulkPut to handle any race conditions with duplicates)
                    await db.externalEvents.where('calendarId').equals(calendar.id).delete();
                    if (freshEvents.length > 0) {
                      await db.externalEvents.bulkPut(freshEvents);
                    }
                    await db.externalCalendars.update(calendar.id, { lastSynced: new Date() });

                    // Update state with new events in range
                    const eventsInRange = freshEvents.filter((e) => {
                      const eventStart = new Date(e.startTime);
                      return eventStart >= start && eventStart <= end;
                    });

                    setExternalEvents((prev) => {
                      // Remove old events from this calendar and add new ones
                      const otherCalendarEvents = prev.filter((e) => e.calendarId !== calendar.id);
                      return [...otherCalendarEvents, ...eventsInRange];
                    });
                  })
                  .catch((err) => {
                    console.warn(`Failed to refresh calendar "${calendar.name}":`, err);
                  });
              }
            }
          } else {
            setExternalEvents([]);
          }
        } catch (eventError) {
          // Don't fail if external events can't be loaded
          console.error('Failed to load external calendar events:', eventError);
          setExternalEvents([]);
        }
      } catch (error) {
        console.error('Failed to load meals:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMealsAndEvents();
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

  // Group external events by date
  const externalEventsByDate = useMemo(() => {
    const map = new Map<string, ExternalEvent[]>();
    for (const event of externalEvents) {
      const dateStr = event.startTime.toISOString().split('T')[0];
      const existing = map.get(dateStr) || [];
      existing.push(event);
      map.set(dateStr, existing);
    }
    return map;
  }, [externalEvents]);

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
    async (
      date: Date,
      slotId: string,
      recipeId: string,
      servings: number,
      notes?: string,
      extraItems?: MealExtraItem[]
    ) => {
      try {
        const newMeal = await mealPlanRepository.addMeal(
          date,
          slotId,
          recipeId,
          servings,
          notes,
          extraItems
        );
        setMeals((prev) => [...prev, newMeal]);
        return newMeal;
      } catch (error) {
        console.error('Failed to add meal:', error);
        throw error;
      }
    },
    []
  );

  const addFreeTextMeal = useCallback(
    async (
      date: Date,
      slotId: string,
      freeText: string,
      notes?: string,
      extraItems?: MealExtraItem[]
    ) => {
      try {
        const newMeal = await mealPlanRepository.addFreeTextMeal(
          date,
          slotId,
          freeText,
          notes,
          extraItems
        );
        setMeals((prev) => [...prev, newMeal]);
        return newMeal;
      } catch (error) {
        console.error('Failed to add free-text meal:', error);
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
    defaultServings,
    mealSlots,
    meals,
    mealsByDate,
    recipes,
    recipesById,
    isLoading,
    externalEvents,
    externalEventsByDate,
    calendarColorsById,

    // Navigation
    setView,
    goToPrevious,
    goToNext,
    goToToday,
    goToDate,

    // Meal management
    addMeal,
    addFreeTextMeal,
    removeMeal,
    updateMeal,
    moveMeal,
    refreshMeals,
  };
}
