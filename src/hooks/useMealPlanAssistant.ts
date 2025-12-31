import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { startOfWeek, endOfWeek } from 'date-fns';
import type {
  AssistantStep,
  MealPlanConfig,
  GeneratedMealPlan,
  IngredientOnHand,
} from '@/types/mealPlanAssistant';
import type { MealSlot, Tag, PlannedMeal } from '@/types';
import { generateMealPlan, findAlternativeRecipes } from '@/services/mealPlanAssistantService';
import { mealPlanRepository } from '@/db';

interface UseMealPlanAssistantProps {
  mealSlots: MealSlot[];
  tags: Tag[];
  defaultServings?: number;
  onComplete?: () => void;
}

export interface UseMealPlanAssistantReturn {
  // State
  currentStep: AssistantStep;
  config: MealPlanConfig;
  generatedPlan: GeneratedMealPlan | null;
  isGenerating: boolean;
  isApplying: boolean;
  error: string | null;

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

  // Day rules actions
  updateDayRule: (dayOfWeek: number, tagIds: string[], priority: 'required' | 'preferred') => void;
  clearDayRules: () => void;

  // Date/slot actions
  setDateRange: (startDate: Date, endDate: Date) => void;
  toggleSlot: (slotId: string) => void;
  setServings: (servings: number) => void;

  // Generation
  generatePlan: () => Promise<void>;

  // Preview actions
  swapMeal: (mealId: string, newRecipeId: string, newRecipeTitle: string) => void;
  rejectMeal: (mealId: string) => void;
  lockMeal: (mealId: string) => void;
  getAlternativeRecipes: (mealId: string) => Promise<{ id: string; title: string }[]>;

  // Apply
  applyPlan: () => Promise<void>;

  // Reset
  reset: () => void;
}

const STEP_ORDER: AssistantStep[] = ['ingredients', 'dayRules', 'dateRange', 'preview'];

function getInitialConfig(defaultServings: number, mealSlots: MealSlot[]): MealPlanConfig {
  const today = new Date();
  return {
    ingredientsOnHand: [],
    dayTagRules: [],
    startDate: startOfWeek(today, { weekStartsOn: 0 }),
    endDate: endOfWeek(today, { weekStartsOn: 0 }),
    selectedSlots: mealSlots.filter((s) => s.id === 'dinner' || s.id === 'lunch').map((s) => s.id),
    defaultServings,
  };
}

export function useMealPlanAssistant({
  mealSlots,
  tags,
  defaultServings = 4,
  onComplete,
}: UseMealPlanAssistantProps): UseMealPlanAssistantReturn {
  const [currentStep, setCurrentStep] = useState<AssistantStep>('ingredients');
  const [config, setConfig] = useState<MealPlanConfig>(() => getInitialConfig(defaultServings, mealSlots));
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedMealPlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tag name lookup
  const tagNamesById = useMemo(() => {
    return new Map(tags.map((t) => [t.id, t.name]));
  }, [tags]);

  // Step navigation
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case 'ingredients':
        return true; // Can proceed without ingredients (will use tags/fallback)
      case 'dayRules':
        return true; // Can proceed without rules
      case 'dateRange':
        return config.selectedSlots.length > 0;
      case 'preview':
        return generatedPlan !== null && generatedPlan.proposedMeals.some((m) => !m.isRejected);
      default:
        return false;
    }
  }, [currentStep, config.selectedSlots.length, generatedPlan]);

  const goNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setCurrentStep(STEP_ORDER[nextIndex]);
    }
  }, [currentStepIndex]);

  const goBack = useCallback(() => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEP_ORDER[prevIndex]);
    }
  }, [currentStepIndex]);

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

  // Day rules actions
  const updateDayRule = useCallback(
    (dayOfWeek: number, tagIds: string[], priority: 'required' | 'preferred') => {
      setConfig((prev) => {
        const existingRuleIndex = prev.dayTagRules.findIndex((r) => r.dayOfWeek === dayOfWeek);
        const newRules = [...prev.dayTagRules];

        if (tagIds.length === 0) {
          // Remove rule if no tags
          if (existingRuleIndex >= 0) {
            newRules.splice(existingRuleIndex, 1);
          }
        } else if (existingRuleIndex >= 0) {
          // Update existing rule
          newRules[existingRuleIndex] = { dayOfWeek, tagIds, priority };
        } else {
          // Add new rule
          newRules.push({ dayOfWeek, tagIds, priority });
        }

        return { ...prev, dayTagRules: newRules };
      });
    },
    []
  );

  const clearDayRules = useCallback(() => {
    setConfig((prev) => ({ ...prev, dayTagRules: [] }));
  }, []);

  // Date/slot actions
  const setDateRange = useCallback((startDate: Date, endDate: Date) => {
    setConfig((prev) => ({ ...prev, startDate, endDate }));
  }, []);

  const toggleSlot = useCallback((slotId: string) => {
    setConfig((prev) => {
      const isSelected = prev.selectedSlots.includes(slotId);
      return {
        ...prev,
        selectedSlots: isSelected
          ? prev.selectedSlots.filter((id) => id !== slotId)
          : [...prev.selectedSlots, slotId],
      };
    });
  }, []);

  const setServings = useCallback((servings: number) => {
    setConfig((prev) => ({ ...prev, defaultServings: servings }));
  }, []);

  // Generation
  const generatePlan = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const plan = await generateMealPlan(config, mealSlots, tagNamesById);
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
  }, [config, mealSlots, tagNamesById]);

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

  const getAlternativeRecipes = useCallback(
    async (mealId: string) => {
      if (!generatedPlan) return [];

      const meal = generatedPlan.proposedMeals.find((m) => m.id === mealId);
      if (!meal) return [];

      const dayOfWeek = new Date(meal.date).getDay();
      const usedRecipeIds = generatedPlan.proposedMeals
        .filter((m) => !m.isRejected && m.id !== mealId)
        .map((m) => m.recipeId);

      const alternatives = await findAlternativeRecipes(
        meal.recipeId,
        dayOfWeek,
        config.dayTagRules,
        usedRecipeIds
      );

      return alternatives.map((r) => ({ id: r.id, title: r.title }));
    },
    [generatedPlan, config.dayTagRules]
  );

  // Apply
  const applyPlan = useCallback(async () => {
    if (!generatedPlan) return;

    setIsApplying(true);
    setError(null);

    try {
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
  }, [generatedPlan, onComplete]);

  // Reset
  const reset = useCallback(() => {
    setCurrentStep('ingredients');
    setConfig(getInitialConfig(defaultServings, mealSlots));
    setGeneratedPlan(null);
    setError(null);
  }, [defaultServings, mealSlots]);

  return {
    currentStep,
    config,
    generatedPlan,
    isGenerating,
    isApplying,
    error,
    setStep: setCurrentStep,
    canGoNext,
    canGoBack,
    goNext,
    goBack,
    addIngredient,
    updateIngredient,
    removeIngredient,
    updateDayRule,
    clearDayRules,
    setDateRange,
    toggleSlot,
    setServings,
    generatePlan,
    swapMeal,
    rejectMeal,
    lockMeal,
    getAlternativeRecipes,
    applyPlan,
    reset,
  };
}
