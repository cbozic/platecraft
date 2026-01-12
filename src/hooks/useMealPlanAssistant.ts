import { useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { startOfWeek, endOfWeek, parseISO } from 'date-fns';

const STORAGE_KEY = 'platecraft-meal-plan-assistant-state';
import type {
  AssistantStep,
  MealPlanConfig,
  GeneratedMealPlan,
  IngredientOnHand,
  WeekdayConfig,
  MealSlotTagConfig,
  MealSchedulePreset,
} from '@/types/mealPlanAssistant';
import type { MealSlot, Tag, PlannedMeal } from '@/types';
import { generateMealPlan, findAlternativeRecipes } from '@/services/mealPlanAssistantService';
import { mealPlanRepository } from '@/db';

interface UseMealPlanAssistantProps {
  mealSlots: MealSlot[];
  tags: Tag[];
  defaultServings?: number;
  onComplete?: () => void;
  restoreFromStorage?: boolean;
}

interface StoredState {
  currentStep: AssistantStep;
  config: MealPlanConfig & { startDate: string; endDate: string };
  generatedPlan: GeneratedMealPlan | null;
  swapModalMealId: string | null;
}

export interface UseMealPlanAssistantReturn {
  // State
  currentStep: AssistantStep;
  config: MealPlanConfig;
  generatedPlan: GeneratedMealPlan | null;
  isGenerating: boolean;
  isApplying: boolean;
  error: string | null;
  swapModalMealId: string | null;
  setSwapModalMealId: (mealId: string | null) => void;

  // Step navigation
  setStep: (step: AssistantStep) => void;
  canGoNext: boolean;
  canGoBack: boolean;
  goNext: () => void;
  goBack: () => void;

  // Ingredient actions
  addIngredient: (ingredient: Omit<IngredientOnHand, 'id' | 'originalQuantity'>) => void;
  updateIngredient: (id: string, updates: Partial<IngredientOnHand>) => void;
  removeIngredient: (id: string) => void;

  // Meal schedule actions
  toggleMealSlot: (dayOfWeek: number, slotId: string, enabled: boolean) => void;
  updateMealSlotTags: (dayOfWeek: number, slotId: string, tagConfig: MealSlotTagConfig | undefined) => void;
  applyMealSchedulePreset: (preset: MealSchedulePreset) => void;
  clearMealSchedule: () => void;

  // Date/settings actions
  setDateRange: (startDate: Date, endDate: Date) => void;
  setServings: (servings: number) => void;
  setFavoritesWeight: (weight: number) => void;
  setOverwriteMode: (overwriteMode: boolean) => void;
  existingMealsInRange: PlannedMeal[];

  // Generation
  generatePlan: () => Promise<void>;

  // Preview actions
  swapMeal: (mealId: string, newRecipeId: string, newRecipeTitle: string) => void;
  rejectMeal: (mealId: string) => void;
  lockMeal: (mealId: string) => void;
  unlockMeal: (mealId: string) => void;
  getAlternativeRecipes: (mealId: string) => Promise<{ id: string; title: string }[]>;

  // Apply
  applyPlan: () => Promise<void>;

  // Reset
  reset: () => void;

  // Storage
  saveToStorage: () => void;
}

const STEP_ORDER: AssistantStep[] = ['ingredients', 'mealSchedule', 'preview'];

function loadStoredState(): StoredState | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load stored meal plan state:', e);
  }
  return null;
}

function clearStoredState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear stored meal plan state:', e);
  }
}

export function hasStoredMealPlanState(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) !== null;
}

function getInitialConfig(defaultServings: number, mealSlots: MealSlot[]): MealPlanConfig {
  const today = new Date();

  // Initialize weekday configs with no meals selected by default
  const weekdayConfigs: WeekdayConfig[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    slots: mealSlots.map((slot) => ({
      slotId: slot.id,
      isEnabled: false,
      tagConfig: undefined,
    })),
  }));

  return {
    ingredientsOnHand: [],
    weekdayConfigs,
    startDate: startOfWeek(today, { weekStartsOn: 0 }),
    endDate: endOfWeek(today, { weekStartsOn: 0 }),
    defaultServings,
    favoritesWeight: 50, // Default to balanced (50% favorites preference)
    overwriteMode: false, // Default to filling gaps only
  };
}

/**
 * Migrate old config format to new weekdayConfigs format
 */
function migrateOldConfig(oldConfig: MealPlanConfig, mealSlots: MealSlot[]): MealPlanConfig {
  // If already has weekdayConfigs, return as-is
  if (oldConfig.weekdayConfigs && oldConfig.weekdayConfigs.length > 0) {
    return oldConfig;
  }

  // Migrate from old format
  const skippedDays = oldConfig.skippedDays || [];
  const selectedSlots = oldConfig.selectedSlots || [];
  const dayTagRules = oldConfig.dayTagRules || [];

  const weekdayConfigs: WeekdayConfig[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    const isSkipped = skippedDays.includes(dayOfWeek);
    const dayRule = dayTagRules.find((r) => r.dayOfWeek === dayOfWeek);

    return {
      dayOfWeek,
      slots: mealSlots.map((slot) => {
        const isEnabled = !isSkipped && selectedSlots.includes(slot.id);
        // Apply old day-level tags to all enabled slots on that day
        // Handle both old tagIds field and new tags field
        const tagNames = (dayRule as { tags?: string[]; tagIds?: string[] })?.tags ||
                        (dayRule as { tagIds?: string[] })?.tagIds || [];
        const tagConfig =
          tagNames.length > 0 && isEnabled
            ? { tags: tagNames, priority: dayRule!.priority }
            : undefined;

        return {
          slotId: slot.id,
          isEnabled,
          tagConfig,
        };
      }),
    };
  });

  return {
    ingredientsOnHand: oldConfig.ingredientsOnHand,
    weekdayConfigs,
    startDate: oldConfig.startDate,
    endDate: oldConfig.endDate,
    defaultServings: oldConfig.defaultServings,
    favoritesWeight: oldConfig.favoritesWeight,
    overwriteMode: oldConfig.overwriteMode ?? false,
  };
}

export function useMealPlanAssistant({
  mealSlots,
  tags: _tags,
  defaultServings = 4,
  onComplete,
  restoreFromStorage = false,
}: UseMealPlanAssistantProps): UseMealPlanAssistantReturn {
  const [currentStep, setCurrentStep] = useState<AssistantStep>('ingredients');
  const [config, setConfig] = useState<MealPlanConfig>(() => getInitialConfig(defaultServings, mealSlots));
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedMealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRestored, setHasRestored] = useState(false);
  const [swapModalMealId, setSwapModalMealId] = useState<string | null>(null);
  const [existingMealsInRange, setExistingMealsInRange] = useState<PlannedMeal[]>([]);

  // Restore state from storage when requested
  useEffect(() => {
    if (restoreFromStorage && !hasRestored) {
      const stored = loadStoredState();
      if (stored) {
        // Map old step names to new ones
        let step = stored.currentStep;
        if (step === ('dayRules' as AssistantStep) || step === ('dateRange' as AssistantStep)) {
          step = 'mealSchedule';
        }
        setCurrentStep(step);
        const restoredConfig = {
          ...stored.config,
          startDate: new Date(stored.config.startDate),
          endDate: new Date(stored.config.endDate),
        };
        // Migrate old config format if needed
        setConfig(migrateOldConfig(restoredConfig, mealSlots));
        setGeneratedPlan(stored.generatedPlan);
        // Restore swap modal state if it was open
        if (stored.swapModalMealId) {
          setSwapModalMealId(stored.swapModalMealId);
        }
        clearStoredState();
      }
      setHasRestored(true);
    }
  }, [restoreFromStorage, hasRestored, mealSlots]);

  // Fetch existing meals when date range changes (for fill-gaps vs overwrite logic)
  useEffect(() => {
    const fetchExistingMeals = async () => {
      try {
        const meals = await mealPlanRepository.getMealsForDateRange(
          config.startDate,
          config.endDate
        );
        setExistingMealsInRange(meals);
      } catch (err) {
        console.error('Failed to fetch existing meals:', err);
        setExistingMealsInRange([]);
      }
    };
    fetchExistingMeals();
  }, [config.startDate, config.endDate]);

  // Note: tagNamesById is no longer needed since tags are identified by name directly
  // Kept as empty map for API compatibility with generateMealPlan

  // Step navigation
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 'ingredients':
        return true; // Can proceed without ingredients (will use tags/fallback)
      case 'mealSchedule':
        // Must have at least one meal enabled somewhere
        return config.weekdayConfigs.some((dc) => dc.slots.some((s) => s.isEnabled));
      case 'preview':
        return generatedPlan !== null && generatedPlan.proposedMeals.some((m) => !m.isRejected);
      default:
        return false;
    }
  }, [currentStep, config.weekdayConfigs, generatedPlan]);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIndex]);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      // Clear the generated plan when going back from preview
      // This ensures the plan is recalculated when re-entering preview
      // since previous steps may have been modified
      if (currentStep === 'preview') {
        setGeneratedPlan(null);
      }
      setCurrentStep(STEP_ORDER[prevIndex]);
    }
  }, [currentStepIndex, currentStep]);

  // Ingredient actions
  const addIngredient = useCallback(
    (ingredient: Omit<IngredientOnHand, 'id' | 'originalQuantity'>) => {
      const newIngredient: IngredientOnHand = {
        ...ingredient,
        id: uuidv4(),
        originalQuantity: ingredient.quantity,
      };
      setConfig((prev) => ({
        ...prev,
        ingredientsOnHand: [...prev.ingredientsOnHand, newIngredient],
      }));
    },
    []
  );

  const updateIngredient = useCallback((id: string, updates: Partial<IngredientOnHand>) => {
    setConfig((prev) => ({
      ...prev,
      ingredientsOnHand: prev.ingredientsOnHand.map((ing) =>
        ing.id === id ? { ...ing, ...updates } : ing
      ),
    }));
  }, []);

  const removeIngredient = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      ingredientsOnHand: prev.ingredientsOnHand.filter((ing) => ing.id !== id),
    }));
  }, []);

  // Meal schedule actions
  const toggleMealSlot = useCallback((dayOfWeek: number, slotId: string, enabled: boolean) => {
    setConfig((prev) => ({
      ...prev,
      weekdayConfigs: prev.weekdayConfigs.map((dc) =>
        dc.dayOfWeek === dayOfWeek
          ? {
              ...dc,
              slots: dc.slots.map((slot) =>
                slot.slotId === slotId ? { ...slot, isEnabled: enabled } : slot
              ),
            }
          : dc
      ),
    }));
  }, []);

  const updateMealSlotTags = useCallback(
    (dayOfWeek: number, slotId: string, tagConfig: MealSlotTagConfig | undefined) => {
      setConfig((prev) => ({
        ...prev,
        weekdayConfigs: prev.weekdayConfigs.map((dc) =>
          dc.dayOfWeek === dayOfWeek
            ? {
                ...dc,
                slots: dc.slots.map((slot) =>
                  slot.slotId === slotId ? { ...slot, tagConfig } : slot
                ),
              }
            : dc
        ),
      }));
    },
    []
  );

  const applyMealSchedulePreset = useCallback((preset: MealSchedulePreset) => {
    setConfig((prev) => {
      const newConfigs = prev.weekdayConfigs.map((dc) => {
        const isWeekend = dc.dayOfWeek === 0 || dc.dayOfWeek === 6;

        switch (preset) {
          case 'weekday-dinners':
            return {
              ...dc,
              slots: dc.slots.map((slot) => ({
                ...slot,
                // Additive: enable dinner on weekdays, keep existing enabled slots
                isEnabled: slot.isEnabled || (slot.slotId === 'dinner' && !isWeekend),
              })),
            };
          case 'dinner-only':
            return {
              ...dc,
              slots: dc.slots.map((slot) => ({
                ...slot,
                // Additive: enable dinner, keep existing enabled slots
                isEnabled: slot.isEnabled || slot.slotId === 'dinner',
              })),
            };
          case 'lunch-dinner':
            return {
              ...dc,
              slots: dc.slots.map((slot) => ({
                ...slot,
                // Additive: enable lunch and dinner, keep existing enabled slots
                isEnabled: slot.isEnabled || slot.slotId === 'lunch' || slot.slotId === 'dinner',
              })),
            };
          case 'weekend-lunches':
            return {
              ...dc,
              slots: dc.slots.map((slot) => ({
                ...slot,
                // Additive: enable lunch on weekends, keep existing enabled slots
                isEnabled: slot.isEnabled || (slot.slotId === 'lunch' && isWeekend),
              })),
            };
          default:
            return dc;
        }
      });

      return { ...prev, weekdayConfigs: newConfigs };
    });
  }, []);

  const clearMealSchedule = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      weekdayConfigs: prev.weekdayConfigs.map((dc) => ({
        ...dc,
        slots: dc.slots.map((slot) => ({
          ...slot,
          isEnabled: false,
          tagConfig: undefined,
        })),
      })),
    }));
  }, []);

  // Date/settings actions
  const setDateRange = useCallback((startDate: Date, endDate: Date) => {
    setConfig((prev) => ({ ...prev, startDate, endDate }));
  }, []);

  const setServings = useCallback((servings: number) => {
    setConfig((prev) => ({ ...prev, defaultServings: servings }));
  }, []);

  const setFavoritesWeight = useCallback((weight: number) => {
    setConfig((prev) => ({ ...prev, favoritesWeight: Math.max(0, Math.min(100, weight)) }));
  }, []);

  const setOverwriteMode = useCallback((overwriteMode: boolean) => {
    setConfig((prev) => ({ ...prev, overwriteMode }));
  }, []);

  // Generation
  const generatePlan = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Preserve locked meals from the current plan
      const lockedMeals = generatedPlan?.proposedMeals.filter((m) => m.isLocked) ?? [];
      const lockedSlotKeys = new Set(lockedMeals.map((m) => `${m.date}:${m.slotId}`));
      // Exclude locked recipe IDs to avoid duplicates (will still be used as fallback if needed)
      const lockedRecipeIds = new Set(lockedMeals.map((m) => m.recipeId));

      const plan = await generateMealPlan(config, mealSlots, undefined, lockedRecipeIds, existingMealsInRange);

      // Merge locked meals back into the new plan
      if (lockedMeals.length > 0) {
        // Filter out newly generated meals that would replace locked ones
        const newMeals = plan.proposedMeals.filter(
          (m) => !lockedSlotKeys.has(`${m.date}:${m.slotId}`)
        );
        // Combine locked meals with the new meals
        plan.proposedMeals = [...lockedMeals, ...newMeals].sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          return dateCompare !== 0 ? dateCompare : a.slotName.localeCompare(b.slotName);
        });
      }

      setGeneratedPlan(plan);

      if (plan.warnings.length > 0) {
        console.warn('Meal plan warnings:', plan.warnings);
      }
    } catch (err) {
      console.error('Failed to generate meal plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate meal plan');
    } finally {
      setIsGenerating(false);
    }
  }, [config, mealSlots, generatedPlan, existingMealsInRange]);

  // Preview actions
  const swapMeal = useCallback(
    (mealId: string, newRecipeId: string, newRecipeTitle: string) => {
      setGeneratedPlan((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          proposedMeals: prev.proposedMeals.map((meal) =>
            meal.id === mealId
              ? {
                  ...meal,
                  recipeId: newRecipeId,
                  recipeTitle: newRecipeTitle,
                  matchType: 'fallback' as const,
                  matchedIngredients: undefined,
                  matchedTags: undefined,
                  isLocked: true,
                }
              : meal
          ),
        };
      });
    },
    []
  );

  const rejectMeal = useCallback((mealId: string) => {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      const updatedMeals = prev.proposedMeals.map((meal) =>
        meal.id === mealId ? { ...meal, isRejected: true } : meal
      );
      return {
        ...prev,
        proposedMeals: updatedMeals,
        coverage: {
          ...prev.coverage,
          rejected: updatedMeals.filter((m) => m.isRejected).length,
        },
      };
    });
  }, []);

  const lockMeal = useCallback((mealId: string) => {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposedMeals: prev.proposedMeals.map((meal) =>
          meal.id === mealId ? { ...meal, isLocked: true } : meal
        ),
      };
    });
  }, []);

  const unlockMeal = useCallback((mealId: string) => {
    setGeneratedPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposedMeals: prev.proposedMeals.map((meal) =>
          meal.id === mealId ? { ...meal, isLocked: false } : meal
        ),
      };
    });
  }, []);

  const getAlternativeRecipes = useCallback(
    async (mealId: string) => {
      if (!generatedPlan) return [];

      const meal = generatedPlan.proposedMeals.find((m) => m.id === mealId);
      if (!meal) return [];

      // Use parseISO to avoid timezone issues with YYYY-MM-DD strings
      const dayOfWeek = parseISO(meal.date).getDay();

      // Exclude recipes already used in the plan (except rejected ones and current meal)
      // This avoids duplicates. When a recipe is swapped out, it automatically becomes
      // available again since it's no longer in any meal.
      const usedRecipeIds = generatedPlan.proposedMeals
        .filter((m) => !m.isRejected && m.id !== mealId)
        .map((m) => m.recipeId);

      const alternatives = await findAlternativeRecipes(
        meal.recipeId,
        dayOfWeek,
        meal.slotId,
        config.weekdayConfigs,
        usedRecipeIds
      );

      return alternatives.map((r) => ({ id: r.id, title: r.title }));
    },
    [generatedPlan, config.weekdayConfigs]
  );

  // Apply
  const applyPlan = useCallback(async () => {
    if (!generatedPlan) return;

    setIsApplying(true);
    setError(null);

    try {
      // In overwrite mode, delete existing meals in the date range first
      if (config.overwriteMode && existingMealsInRange.length > 0) {
        for (const meal of existingMealsInRange) {
          await mealPlanRepository.removeMeal(meal.id);
        }
      }

      const mealsToAdd: PlannedMeal[] = generatedPlan.proposedMeals
        .filter((m) => !m.isRejected)
        .map((m) => ({
          id: uuidv4(),
          date: m.date,
          slotId: m.slotId,
          recipeId: m.recipeId,
          servings: m.servings,
        }));

      await mealPlanRepository.bulkAddMeals(mealsToAdd);

      if (onComplete) {
        onComplete();
      }
    } catch (err) {
      console.error('Failed to apply meal plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply meal plan');
    } finally {
      setIsApplying(false);
    }
  }, [generatedPlan, onComplete, config.overwriteMode, existingMealsInRange]);

  // Save to storage (for navigation preservation)
  const saveToStorage = useCallback(() => {
    try {
      const state: StoredState = {
        currentStep,
        config: {
          ...config,
          startDate: config.startDate.toISOString(),
          endDate: config.endDate.toISOString(),
        } as StoredState['config'],
        generatedPlan,
        swapModalMealId,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save meal plan state:', e);
    }
  }, [currentStep, config, generatedPlan, swapModalMealId]);

  // Reset
  const reset = useCallback(() => {
    setCurrentStep('ingredients');
    setConfig(getInitialConfig(defaultServings, mealSlots));
    setGeneratedPlan(null);
    setError(null);
    clearStoredState();
  }, [defaultServings, mealSlots]);

  return {
    currentStep,
    config,
    generatedPlan,
    isGenerating,
    isApplying,
    error,
    swapModalMealId,
    setSwapModalMealId,
    setStep: setCurrentStep,
    canGoNext,
    canGoBack,
    goNext,
    goBack,
    addIngredient,
    updateIngredient,
    removeIngredient,
    toggleMealSlot,
    updateMealSlotTags,
    applyMealSchedulePreset,
    clearMealSchedule,
    setDateRange,
    setServings,
    setFavoritesWeight,
    setOverwriteMode,
    existingMealsInRange,
    generatePlan,
    swapMeal,
    rejectMeal,
    lockMeal,
    unlockMeal,
    getAlternativeRecipes,
    applyPlan,
    reset,
    saveToStorage,
  };
}
