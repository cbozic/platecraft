import { db } from '../database';
import type { PlannedMeal, DayNote, RecurringMeal, MealExtraItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { settingsRepository } from './settingsRepository';

export const mealPlanRepository = {
  // Planned Meals
  async getMealsForDate(date: Date): Promise<PlannedMeal[]> {
    const dateStr = format(date, 'yyyy-MM-dd');
    return db.plannedMeals.where('date').equals(dateStr).toArray();
  },

  async getMealsForDateRange(start: Date, end: Date): Promise<PlannedMeal[]> {
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    return db.plannedMeals
      .where('date')
      .between(startStr, endStr, true, true)
      .toArray();
  },

  async getMealsForWeek(date: Date, weekStartsOn: 0 | 1 = 0): Promise<PlannedMeal[]> {
    const start = startOfWeek(date, { weekStartsOn });
    const end = endOfWeek(date, { weekStartsOn });
    return this.getMealsForDateRange(start, end);
  },

  async getMealsForMonth(date: Date): Promise<PlannedMeal[]> {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return this.getMealsForDateRange(start, end);
  },

  async addMeal(
    date: Date,
    slotId: string,
    recipeId: string,
    servings: number,
    notes?: string,
    extraItems?: MealExtraItem[]
  ): Promise<PlannedMeal> {
    const meal: PlannedMeal = {
      id: uuidv4(),
      date: format(date, 'yyyy-MM-dd'),
      slotId,
      recipeId,
      servings,
      notes,
      extraItems,
    };
    await db.plannedMeals.add(meal);
    await settingsRepository.touchLastModified();
    return meal;
  },

  async updateMeal(id: string, updates: Partial<Omit<PlannedMeal, 'id'>>): Promise<void> {
    await db.plannedMeals.update(id, updates);
    await settingsRepository.touchLastModified();
  },

  async removeMeal(id: string): Promise<void> {
    await db.plannedMeals.delete(id);
    await settingsRepository.touchLastModified();
  },

  async moveMeal(id: string, toDate: string, toSlotId: string): Promise<PlannedMeal | undefined> {
    const meal = await db.plannedMeals.get(id);
    if (!meal) return undefined;

    const updatedMeal = {
      ...meal,
      date: toDate,
      slotId: toSlotId,
    };
    await db.plannedMeals.put(updatedMeal);
    await settingsRepository.touchLastModified();
    return updatedMeal;
  },

  async copyMealsToDate(sourceDate: Date, targetDate: Date): Promise<void> {
    const sourceMeals = await this.getMealsForDate(sourceDate);
    const targetDateStr = format(targetDate, 'yyyy-MM-dd');

    const newMeals: PlannedMeal[] = sourceMeals.map((meal) => ({
      ...meal,
      id: uuidv4(),
      date: targetDateStr,
    }));

    await db.plannedMeals.bulkAdd(newMeals);
    if (newMeals.length > 0) {
      await settingsRepository.touchLastModified();
    }
  },

  // Day Notes
  async getNoteForDate(date: Date): Promise<DayNote | undefined> {
    const dateStr = format(date, 'yyyy-MM-dd');
    return db.dayNotes.where('date').equals(dateStr).first();
  },

  async getNotesForDateRange(start: Date, end: Date): Promise<DayNote[]> {
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    return db.dayNotes
      .where('date')
      .between(startStr, endStr, true, true)
      .toArray();
  },

  async setNoteForDate(date: Date, content: string): Promise<DayNote> {
    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = await this.getNoteForDate(date);

    if (existing) {
      await db.dayNotes.update(existing.id, { content });
      await settingsRepository.touchLastModified();
      return { ...existing, content };
    } else {
      const note: DayNote = {
        id: uuidv4(),
        date: dateStr,
        content,
      };
      await db.dayNotes.add(note);
      await settingsRepository.touchLastModified();
      return note;
    }
  },

  async removeNoteForDate(date: Date): Promise<void> {
    const dateStr = format(date, 'yyyy-MM-dd');
    await db.dayNotes.where('date').equals(dateStr).delete();
    await settingsRepository.touchLastModified();
  },

  // Recurring Meals
  async getRecurringMeals(): Promise<RecurringMeal[]> {
    return db.recurringMeals.toArray();
  },

  async getActiveRecurringMeals(): Promise<RecurringMeal[]> {
    return db.recurringMeals.filter((meal) => meal.isActive).toArray();
  },

  async getRecurringMealsForDay(dayOfWeek: number): Promise<RecurringMeal[]> {
    return db.recurringMeals
      .where('dayOfWeek')
      .equals(dayOfWeek)
      .filter((meal) => meal.isActive)
      .toArray();
  },

  async addRecurringMeal(
    recipeId: string,
    dayOfWeek: number,
    slotId: string,
    servings: number
  ): Promise<RecurringMeal> {
    const meal: RecurringMeal = {
      id: uuidv4(),
      recipeId,
      dayOfWeek,
      slotId,
      servings,
      isActive: true,
    };
    await db.recurringMeals.add(meal);
    await settingsRepository.touchLastModified();
    return meal;
  },

  async updateRecurringMeal(
    id: string,
    updates: Partial<Omit<RecurringMeal, 'id'>>
  ): Promise<void> {
    await db.recurringMeals.update(id, updates);
    await settingsRepository.touchLastModified();
  },

  async removeRecurringMeal(id: string): Promise<void> {
    await db.recurringMeals.delete(id);
    await settingsRepository.touchLastModified();
  },

  async toggleRecurringMeal(id: string): Promise<void> {
    const meal = await db.recurringMeals.get(id);
    if (meal) {
      await db.recurringMeals.update(id, { isActive: !meal.isActive });
      await settingsRepository.touchLastModified();
    }
  },

  // Apply recurring meals to a date range
  async applyRecurringMealsToRange(start: Date, end: Date): Promise<number> {
    const activeMeals = await this.getActiveRecurringMeals();
    let addedCount = 0;

    let current = start;
    while (current <= end) {
      const dayOfWeek = current.getDay();
      const mealsForDay = activeMeals.filter((m) => m.dayOfWeek === dayOfWeek);

      for (const recurringMeal of mealsForDay) {
        // Check if meal already exists for this date and slot
        const dateStr = format(current, 'yyyy-MM-dd');
        const existing = await db.plannedMeals
          .where('[date+slotId]')
          .equals([dateStr, recurringMeal.slotId])
          .first();

        if (!existing) {
          await this.addMeal(
            current,
            recurringMeal.slotId,
            recurringMeal.recipeId,
            recurringMeal.servings
          );
          addedCount++;
        }
      }

      current = addDays(current, 1);
    }

    return addedCount;
  },

  // Bulk operations
  async bulkAddMeals(meals: PlannedMeal[]): Promise<void> {
    await db.plannedMeals.bulkAdd(meals);
  },

  async bulkAddNotes(notes: DayNote[]): Promise<void> {
    await db.dayNotes.bulkAdd(notes);
  },

  async bulkAddRecurringMeals(meals: RecurringMeal[]): Promise<void> {
    await db.recurringMeals.bulkAdd(meals);
  },

  async clearAll(): Promise<void> {
    await db.plannedMeals.clear();
    await db.dayNotes.clear();
    await db.recurringMeals.clear();
  },
};
