import { format, eachDayOfInterval } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type {
  MealPlanConfig,
  GeneratedMealPlan,
  ProposedMeal,
  IngredientOnHand,
  IngredientUsage,
  DayTagRule,
  RecipeMatchScore,
  SlotToFill,
  PlanCoverage,
} from '@/types/mealPlanAssistant';
import type { Recipe, Ingredient, MealSlot } from '@/types';
import { UNIT_INFO } from '@/types/units';
import type { MeasurementUnit } from '@/types/units';
import { recipeRepository } from '@/db';

/**
 * Normalize ingredient name for matching
 */
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate string similarity (0-1) using Levenshtein distance
 */
function stringSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLength;
}

/**
 * Convert quantity to base unit (ml for volume, g for weight)
 * Returns null if conversion not possible (count units)
 */
function convertToBaseUnit(quantity: number, unit: MeasurementUnit | null): number | null {
  if (!unit) return null;
  const info = UNIT_INFO[unit];
  if (!info || info.type === 'count') return null;
  if (!info.baseUnitFactor) return null;
  return quantity * info.baseUnitFactor;
}

/**
 * Check if units are compatible (same type: volume, weight, or count)
 */
function areUnitsCompatible(
  unit1: MeasurementUnit | null,
  unit2: MeasurementUnit | null
): boolean {
  if (unit1 === unit2) return true;
  if (!unit1 || !unit2) return true; // Null units are compatible with anything
  const info1 = UNIT_INFO[unit1];
  const info2 = UNIT_INFO[unit2];
  return info1.type === info2.type;
}

/**
 * Check if one word list is a prefix of another
 * "chicken" matches "chicken breast" (chicken is prefix of chicken breast)
 * "butter" does NOT match "peanut butter" (butter is not prefix of peanut butter)
 */
function isWordPrefix(shorter: string[], longer: string[]): boolean {
  if (shorter.length > longer.length) return false;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) return false;
  }
  return true;
}

/**
 * Match a recipe ingredient against ingredients on hand
 */
function matchIngredient(
  recipeIngredient: Ingredient,
  ingredientsOnHand: IngredientOnHand[]
): { match: IngredientOnHand | null; matchType: 'exact' | 'partial' | 'fuzzy'; score: number } {
  const normalizedName = normalizeIngredientName(recipeIngredient.name);
  const recipeWords = normalizedName.split(' ').filter(Boolean);

  // 1. Exact match
  const exactMatch = ingredientsOnHand.find(
    (i) => normalizeIngredientName(i.name) === normalizedName && i.quantity > 0
  );
  if (exactMatch) {
    return { match: exactMatch, matchType: 'exact', score: 1.0 };
  }

  // 2. Partial match using word-prefix logic
  // "chicken" matches "chicken breast" but "butter" does NOT match "peanut butter"
  const partialMatch = ingredientsOnHand.find((i) => {
    if (i.quantity <= 0) return false;
    const onHandName = normalizeIngredientName(i.name);
    const onHandWords = onHandName.split(' ').filter(Boolean);

    // Check if one is a word-prefix of the other
    // This allows "chicken" to match "chicken breast" (same base ingredient)
    // But prevents "butter" from matching "peanut butter" (different ingredients)
    return isWordPrefix(recipeWords, onHandWords) || isWordPrefix(onHandWords, recipeWords);
  });
  if (partialMatch) {
    return { match: partialMatch, matchType: 'partial', score: 0.8 };
  }

  // 3. Fuzzy match using Levenshtein distance
  let bestFuzzyMatch: IngredientOnHand | null = null;
  let bestFuzzyScore = 0;

  for (const onHand of ingredientsOnHand) {
    if (onHand.quantity <= 0) continue;
    const similarity = stringSimilarity(normalizedName, normalizeIngredientName(onHand.name));
    if (similarity > 0.6 && similarity > bestFuzzyScore) {
      bestFuzzyMatch = onHand;
      bestFuzzyScore = similarity;
    }
  }

  if (bestFuzzyMatch) {
    return { match: bestFuzzyMatch, matchType: 'fuzzy', score: bestFuzzyScore * 0.6 };
  }

  return { match: null, matchType: 'exact', score: 0 };
}

/**
 * Check if there's enough of an ingredient on hand
 */
function hasEnoughIngredient(
  onHand: IngredientOnHand,
  required: Ingredient,
  servings: number,
  recipeServings: number
): boolean {
  if (onHand.quantity <= 0) return false;
  if (required.quantity === null) return true; // "to taste" items

  const scaleFactor = servings / recipeServings;
  const scaledRequired = required.quantity * scaleFactor;

  // If same unit, direct comparison
  if (onHand.unit === required.unit) {
    return onHand.quantity >= scaledRequired;
  }

  // If compatible units, convert to base
  if (areUnitsCompatible(onHand.unit, required.unit)) {
    const onHandBase = convertToBaseUnit(onHand.quantity, onHand.unit);
    const requiredBase = convertToBaseUnit(scaledRequired, required.unit);

    if (onHandBase !== null && requiredBase !== null) {
      return onHandBase >= requiredBase;
    }
  }

  // Incompatible units - assume enough if we have the ingredient
  return true;
}

/**
 * Score all recipes by how well they match available ingredients
 */
function scoreRecipesByIngredients(
  recipes: Recipe[],
  ingredientsOnHand: IngredientOnHand[],
  servings: number
): RecipeMatchScore[] {
  const scores: RecipeMatchScore[] = [];

  for (const recipe of recipes) {
    const matchedIngredients: RecipeMatchScore['matchedIngredients'] = [];
    const requiredQuantities: RecipeMatchScore['requiredQuantities'] = [];
    let totalScore = 0;
    let matchCount = 0;

    for (const ingredient of recipe.ingredients) {
      if (ingredient.isOptional) continue; // Skip optional ingredients

      const { match, matchType, score } = matchIngredient(ingredient, ingredientsOnHand);

      if (match && score > 0) {
        // Check if we have enough
        if (hasEnoughIngredient(match, ingredient, servings, recipe.servings)) {
          matchedIngredients.push({
            ingredientName: ingredient.name,
            matchType,
            score,
          });
          totalScore += score;
          matchCount++;

          // Track required quantity for deduction later
          if (ingredient.quantity !== null) {
            const scaleFactor = servings / recipe.servings;
            requiredQuantities.push({
              ingredientId: match.id,
              quantity: ingredient.quantity * scaleFactor,
              unit: ingredient.unit,
            });
          }
        }
      }
    }

    if (matchCount > 0) {
      scores.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        ingredientScore: totalScore / Math.max(recipe.ingredients.filter((i) => !i.isOptional).length, 1),
        matchedIngredients,
        requiredQuantities,
      });
    }
  }

  // Sort by score descending
  return scores.sort((a, b) => b.ingredientScore - a.ingredientScore);
}

/**
 * Deduct ingredients from the pool after selecting a recipe
 */
function deductIngredients(
  pool: IngredientOnHand[],
  requiredQuantities: RecipeMatchScore['requiredQuantities']
): void {
  for (const req of requiredQuantities) {
    const ingredient = pool.find((i) => i.id === req.ingredientId);
    if (ingredient && ingredient.quantity > 0) {
      // Convert if needed
      if (ingredient.unit === req.unit || !areUnitsCompatible(ingredient.unit, req.unit)) {
        ingredient.quantity = Math.max(0, ingredient.quantity - req.quantity);
      } else {
        // Convert both to base unit and deduct
        const poolBase = convertToBaseUnit(ingredient.quantity, ingredient.unit);
        const reqBase = convertToBaseUnit(req.quantity, req.unit);
        if (poolBase !== null && reqBase !== null) {
          const remainingBase = Math.max(0, poolBase - reqBase);
          // Convert back - rough approximation
          const factor = UNIT_INFO[ingredient.unit!]?.baseUnitFactor || 1;
          ingredient.quantity = remainingBase / factor;
        }
      }
    }
  }
}

/**
 * Check if all ingredients are depleted
 */
function allIngredientsDepleted(pool: IngredientOnHand[]): boolean {
  return pool.every((i) => i.quantity <= 0);
}

/**
 * Generate list of slots to fill
 */
function generateSlotList(
  startDate: Date,
  endDate: Date,
  selectedSlots: string[],
  mealSlots: MealSlot[],
  skippedDays: number[] = []
): SlotToFill[] {
  const slots: SlotToFill[] = [];
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  for (const day of days) {
    const dayOfWeek = day.getDay();

    // Skip days that are marked as skipped
    if (skippedDays.includes(dayOfWeek)) {
      continue;
    }

    const dateStr = format(day, 'yyyy-MM-dd');

    for (const slotId of selectedSlots) {
      const slot = mealSlots.find((s) => s.id === slotId);
      if (slot) {
        slots.push({
          date: dateStr,
          slotId,
          slotName: slot.name,
          dayOfWeek,
        });
      }
    }
  }

  return slots;
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick a recipe from candidates using favorites weight
 */
function pickRecipeWithFavoritesWeight(
  candidates: Recipe[],
  favoritesWeight: number
): Recipe | null {
  if (candidates.length === 0) return null;

  const favorites = candidates.filter((r) => r.isFavorite);
  const nonFavorites = candidates.filter((r) => !r.isFavorite);

  // If no favorites or weight is 0, pick randomly
  if (favorites.length === 0 || favoritesWeight === 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // If weight is 100 or no non-favorites, always pick favorites
  if (favoritesWeight === 100 || nonFavorites.length === 0) {
    return favorites[Math.floor(Math.random() * favorites.length)];
  }

  // Use weight to determine probability
  const pickFavorite = Math.random() * 100 < favoritesWeight;

  if (pickFavorite) {
    return favorites[Math.floor(Math.random() * favorites.length)];
  } else {
    return nonFavorites[Math.floor(Math.random() * nonFavorites.length)];
  }
}

/**
 * Find recipe matching day's tag rules
 */
function findTagMatchingRecipe(
  recipes: Recipe[],
  dayRules: DayTagRule[],
  usedRecipes: Set<string>,
  favoritesWeight: number = 50
): Recipe | null {
  // First try required rules
  const requiredRules = dayRules.filter((r) => r.priority === 'required');
  if (requiredRules.length > 0) {
    const requiredTagIds = requiredRules.flatMap((r) => r.tagIds);
    const matching = recipes.filter(
      (r) =>
        !usedRecipes.has(r.id) &&
        requiredTagIds.some((tagId) => r.tags.includes(tagId))
    );
    if (matching.length > 0) {
      return pickRecipeWithFavoritesWeight(matching, favoritesWeight);
    }
  }

  // Then try preferred rules
  const preferredRules = dayRules.filter((r) => r.priority === 'preferred');
  if (preferredRules.length > 0) {
    const preferredTagIds = preferredRules.flatMap((r) => r.tagIds);
    const matching = recipes.filter(
      (r) =>
        !usedRecipes.has(r.id) &&
        preferredTagIds.some((tagId) => r.tags.includes(tagId))
    );
    if (matching.length > 0) {
      return pickRecipeWithFavoritesWeight(matching, favoritesWeight);
    }
  }

  return null;
}

/**
 * Find any unused recipe as fallback, weighted by favorites preference
 */
function findFallbackRecipe(
  recipes: Recipe[],
  usedRecipes: Set<string>,
  favoritesWeight: number = 50
): Recipe | null {
  const unused = recipes.filter((r) => !usedRecipes.has(r.id));
  if (unused.length === 0) return null;

  const favorites = unused.filter((r) => r.isFavorite);
  const nonFavorites = unused.filter((r) => !r.isFavorite);

  // If no favorites or weight is 0, just pick randomly from all
  if (favorites.length === 0 || favoritesWeight === 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }

  // If weight is 100 or no non-favorites, always pick favorites
  if (favoritesWeight === 100 || nonFavorites.length === 0) {
    return favorites[Math.floor(Math.random() * favorites.length)];
  }

  // Use the weight to determine probability of picking a favorite
  // Weight of 50 = equal chance, 100 = always favorites, 0 = never favorites
  const pickFavorite = Math.random() * 100 < favoritesWeight;

  if (pickFavorite) {
    return favorites[Math.floor(Math.random() * favorites.length)];
  } else {
    return nonFavorites[Math.floor(Math.random() * nonFavorites.length)];
  }
}

/**
 * Track when each recipe was last used (by slot index) for reuse spacing
 */
interface RecipeUsageTracker {
  lastUsedAtSlot: Map<string, number>;
  currentSlotIndex: number;
}

/**
 * Find a recipe for reuse, maximizing time since last use
 */
function findRecipeForReuse(
  recipes: Recipe[],
  usageTracker: RecipeUsageTracker,
  dayRules: DayTagRule[],
  dayOfWeek: number,
  favoritesWeight: number = 50
): Recipe | null {
  if (recipes.length === 0) return null;

  // Get rules for this day
  const rulesForDay = dayRules.filter((r) => r.dayOfWeek === dayOfWeek);
  const preferredTagIds = rulesForDay.flatMap((r) => r.tagIds);

  // Calculate the favorites bonus based on weight (0-10 scale based on 0-100 weight)
  const favoritesBonus = (favoritesWeight / 100) * 10;

  // Score each recipe by how long ago it was used and if it matches day rules
  const scoredRecipes = recipes.map((recipe) => {
    const lastUsed = usageTracker.lastUsedAtSlot.get(recipe.id);
    // If never used, give maximum distance
    const distance = lastUsed === undefined
      ? usageTracker.currentSlotIndex + recipes.length
      : usageTracker.currentSlotIndex - lastUsed;

    // Bonus for matching day rules
    const matchesDayRules = preferredTagIds.length > 0 &&
      preferredTagIds.some((tagId) => recipe.tags.includes(tagId));

    // Bonus for favorites (scaled by favoritesWeight)
    const isFavorite = recipe.isFavorite;

    return {
      recipe,
      distance,
      matchesDayRules,
      isFavorite,
      // Combined score: distance is primary, with weighted bonuses
      score: distance * 10 + (matchesDayRules ? 5 : 0) + (isFavorite ? favoritesBonus : 0),
    };
  });

  // Sort by score descending (highest = longest time since last use + bonuses)
  scoredRecipes.sort((a, b) => b.score - a.score);

  // Add some randomness among top candidates to avoid always picking the same recipe
  const topCandidates = scoredRecipes.slice(0, Math.min(3, scoredRecipes.length));
  return topCandidates[Math.floor(Math.random() * topCandidates.length)].recipe;
}

/**
 * Main meal plan generation function
 */
export async function generateMealPlan(
  config: MealPlanConfig,
  mealSlots: MealSlot[],
  tagNamesById: Map<string, string>
): Promise<GeneratedMealPlan> {
  const warnings: string[] = [];
  const proposedMeals: ProposedMeal[] = [];
  const usedRecipes = new Set<string>();

  // Clone ingredient pool for tracking
  const ingredientPool: IngredientOnHand[] = config.ingredientsOnHand.map((i) => ({
    ...i,
    originalQuantity: i.quantity,
  }));

  // Get all recipes
  const allRecipes = await recipeRepository.getAll();
  if (allRecipes.length === 0) {
    warnings.push('No recipes found in your collection.');
    return {
      proposedMeals: [],
      ingredientUsage: [],
      warnings,
      coverage: {
        totalSlots: 0,
        filledSlots: 0,
        ingredientMatches: 0,
        tagMatches: 0,
        fallbacks: 0,
        rejected: 0,
      },
    };
  }

  // Generate slots to fill (filtering out skipped days)
  const allSlots = generateSlotList(config.startDate, config.endDate, config.selectedSlots, mealSlots, config.skippedDays);
  const slotsToFill = [...allSlots];

  // PHASE 1: Find recipes that use ingredients on hand
  if (config.ingredientsOnHand.length > 0) {
    const recipeScores = scoreRecipesByIngredients(allRecipes, ingredientPool, config.defaultServings);

    // Randomly select slots for ingredient-matching recipes
    const shuffledSlots = shuffleArray(slotsToFill);
    const ingredientSlots = shuffledSlots.slice(0, Math.min(recipeScores.length, shuffledSlots.length));

    for (const slot of ingredientSlots) {
      if (allIngredientsDepleted(ingredientPool)) break;

      const dayRules = config.dayTagRules.filter((r) => r.dayOfWeek === slot.dayOfWeek);

      // Find all valid recipes that:
      // a) Use available ingredients
      // b) Haven't been used yet
      // c) Match day's tag rules if possible
      const validCandidates: { score: RecipeMatchScore; recipe: Recipe; matchesDayTags: boolean }[] = [];

      for (const score of recipeScores) {
        if (usedRecipes.has(score.recipeId)) continue;

        // Check if we still have enough ingredients
        const hasIngredients = score.requiredQuantities.every((req) => {
          const onHand = ingredientPool.find((i) => i.id === req.ingredientId);
          return onHand && onHand.quantity > 0;
        });

        if (!hasIngredients) continue;

        const recipe = allRecipes.find((r) => r.id === score.recipeId);
        if (!recipe) continue;

        const matchesDayTags = dayRules.length > 0 && dayRules.some((rule) =>
          rule.tagIds.some((tagId) => recipe.tags.includes(tagId))
        );

        validCandidates.push({ score, recipe, matchesDayTags });
      }

      // Select from candidates: prefer day-tag matches, then use favorites weight
      let bestMatch: RecipeMatchScore | null = null;
      let selectedRecipe: Recipe | null = null;

      if (validCandidates.length > 0) {
        // First priority: recipes matching day's tag rules
        const dayTagMatches = validCandidates.filter((c) => c.matchesDayTags);
        if (dayTagMatches.length > 0) {
          const recipes = dayTagMatches.map((c) => c.recipe);
          selectedRecipe = pickRecipeWithFavoritesWeight(recipes, config.favoritesWeight);
          bestMatch = dayTagMatches.find((c) => c.recipe.id === selectedRecipe?.id)?.score || null;
        } else {
          // No day-tag matches, pick from all valid candidates using favorites weight
          const recipes = validCandidates.map((c) => c.recipe);
          selectedRecipe = pickRecipeWithFavoritesWeight(recipes, config.favoritesWeight);
          bestMatch = validCandidates.find((c) => c.recipe.id === selectedRecipe?.id)?.score || null;
        }
      }

      if (bestMatch && selectedRecipe) {
        const recipe = selectedRecipe;

        // Deduct ingredients
        deductIngredients(ingredientPool, bestMatch.requiredQuantities);
        usedRecipes.add(bestMatch.recipeId);

        // Remove slot from remaining
        const slotIndex = slotsToFill.findIndex(
          (s) => s.date === slot.date && s.slotId === slot.slotId
        );
        if (slotIndex >= 0) {
          slotsToFill.splice(slotIndex, 1);
        }

        proposedMeals.push({
          id: uuidv4(),
          date: slot.date,
          slotId: slot.slotId,
          slotName: slot.slotName,
          recipeId: bestMatch.recipeId,
          recipeTitle: recipe.title,
          servings: config.defaultServings,
          matchType: 'ingredient',
          matchedIngredients: bestMatch.matchedIngredients.map((m) => m.ingredientName),
          isRejected: false,
          isLocked: false,
        });
      }
    }
  }

  // PHASE 2: Fill remaining slots with tag-matching recipes
  for (const slot of [...slotsToFill]) {
    const dayRules = config.dayTagRules.filter((r) => r.dayOfWeek === slot.dayOfWeek);

    if (dayRules.length > 0) {
      const recipe = findTagMatchingRecipe(allRecipes, dayRules, usedRecipes, config.favoritesWeight);

      if (recipe) {
        usedRecipes.add(recipe.id);

        // Remove slot from remaining
        const slotIndex = slotsToFill.findIndex(
          (s) => s.date === slot.date && s.slotId === slot.slotId
        );
        if (slotIndex >= 0) {
          slotsToFill.splice(slotIndex, 1);
        }

        const matchedTagIds = dayRules.flatMap((r) => r.tagIds).filter((tagId) => recipe.tags.includes(tagId));

        proposedMeals.push({
          id: uuidv4(),
          date: slot.date,
          slotId: slot.slotId,
          slotName: slot.slotName,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          servings: config.defaultServings,
          matchType: 'tag',
          matchedTags: matchedTagIds.map((id) => tagNamesById.get(id) || id),
          isRejected: false,
          isLocked: false,
        });
      }
    }
  }

  // PHASE 3: Fill remaining slots with any available recipe (or reuse if needed)
  // Initialize usage tracker for recipe reuse spacing
  const usageTracker: RecipeUsageTracker = {
    lastUsedAtSlot: new Map(),
    currentSlotIndex: proposedMeals.length,
  };

  // Record already used recipes in the tracker
  proposedMeals.forEach((meal, index) => {
    usageTracker.lastUsedAtSlot.set(meal.recipeId, index);
  });

  for (const slot of [...slotsToFill]) {
    // First try to find an unused recipe (using favorites weight)
    let recipe = findFallbackRecipe(allRecipes, usedRecipes, config.favoritesWeight);

    // If no unused recipes, find a recipe to reuse with maximum spacing
    if (!recipe && allRecipes.length > 0) {
      recipe = findRecipeForReuse(allRecipes, usageTracker, config.dayTagRules, slot.dayOfWeek, config.favoritesWeight);
    }

    if (recipe) {
      usedRecipes.add(recipe.id);
      usageTracker.lastUsedAtSlot.set(recipe.id, usageTracker.currentSlotIndex);
      usageTracker.currentSlotIndex++;

      // Remove slot from remaining
      const slotIndex = slotsToFill.findIndex(
        (s) => s.date === slot.date && s.slotId === slot.slotId
      );
      if (slotIndex >= 0) {
        slotsToFill.splice(slotIndex, 1);
      }

      proposedMeals.push({
        id: uuidv4(),
        date: slot.date,
        slotId: slot.slotId,
        slotName: slot.slotName,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        servings: config.defaultServings,
        matchType: 'fallback',
        isRejected: false,
        isLocked: false,
      });
    }
  }

  // Generate warnings - now only if we have no recipes at all
  if (slotsToFill.length > 0) {
    warnings.push(`Could not fill ${slotsToFill.length} slots. Please add more recipes to your collection.`);
  } else if (allSlots.length > allRecipes.length) {
    warnings.push(`Some recipes are used multiple times because there are more slots (${allSlots.length}) than available recipes (${allRecipes.length}).`);
  }

  // Calculate ingredient usage
  const ingredientUsage: IngredientUsage[] = config.ingredientsOnHand.map((original) => {
    const poolItem = ingredientPool.find((p) => p.id === original.id);
    const remaining = poolItem?.quantity ?? 0;
    return {
      ingredientId: original.id,
      ingredientName: original.name,
      originalQuantity: original.quantity,
      usedQuantity: original.quantity - remaining,
      remainingQuantity: remaining,
      unit: original.unit,
    };
  });

  // Calculate coverage
  const coverage: PlanCoverage = {
    totalSlots: allSlots.length,
    filledSlots: proposedMeals.length,
    ingredientMatches: proposedMeals.filter((m) => m.matchType === 'ingredient').length,
    tagMatches: proposedMeals.filter((m) => m.matchType === 'tag').length,
    fallbacks: proposedMeals.filter((m) => m.matchType === 'fallback').length,
    rejected: 0,
  };

  // Sort by date and slot order
  proposedMeals.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    const slotA = mealSlots.find((s) => s.id === a.slotId);
    const slotB = mealSlots.find((s) => s.id === b.slotId);
    return (slotA?.order ?? 999) - (slotB?.order ?? 999);
  });

  return {
    proposedMeals,
    ingredientUsage,
    warnings,
    coverage,
  };
}

/**
 * Find alternative recipes for swapping
 */
export async function findAlternativeRecipes(
  currentRecipeId: string,
  dayOfWeek: number,
  dayRules: DayTagRule[],
  usedRecipeIds: string[],
  limit: number = 10
): Promise<Recipe[]> {
  const allRecipes = await recipeRepository.getAll();
  const usedSet = new Set(usedRecipeIds);

  // Filter out used recipes and current recipe
  let candidates = allRecipes.filter((r) => r.id !== currentRecipeId && !usedSet.has(r.id));

  // Prioritize recipes matching day's tag rules
  const rulesForDay = dayRules.filter((r) => r.dayOfWeek === dayOfWeek);
  if (rulesForDay.length > 0) {
    const tagIds = rulesForDay.flatMap((r) => r.tagIds);
    const matching = candidates.filter((r) => tagIds.some((tagId) => r.tags.includes(tagId)));
    const nonMatching = candidates.filter((r) => !tagIds.some((tagId) => r.tags.includes(tagId)));

    // Put matching recipes first
    candidates = [...matching, ...nonMatching];
  }

  return candidates.slice(0, limit);
}
