import { format, eachDayOfInterval } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import type {
  MealPlanConfig,
  GeneratedMealPlan,
  ProposedMeal,
  IngredientOnHand,
  IngredientUsage,
  WeekdayConfig,
  MealSlotTagConfig,
  RecipeMatchScore,
  SlotToFill,
  PlanCoverage,
} from '@/types/mealPlanAssistant';
import type { Recipe, Ingredient, MealSlot, PlannedMeal } from '@/types';
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
 * Check if all words from searchWords appear in targetWords
 * "pork ribs" matches "thick-cut boneless pork loin ribs" (contains both pork and ribs)
 * Returns a score based on how many search words matched and their coverage
 */
function containsAllWords(searchWords: string[], targetWords: string[]): { matches: boolean; score: number } {
  if (searchWords.length === 0 || targetWords.length === 0) {
    return { matches: false, score: 0 };
  }

  // Check if every search word appears in target words
  const matchedWords = searchWords.filter(searchWord =>
    targetWords.some(targetWord =>
      targetWord === searchWord || targetWord.startsWith(searchWord) || searchWord.startsWith(targetWord)
    )
  );

  const allMatch = matchedWords.length === searchWords.length;

  if (!allMatch) {
    return { matches: false, score: 0 };
  }

  // Score based on:
  // 1. How specific the match is (more search words = higher score)
  // 2. How much of the target is covered (fewer extra words in target = higher score)
  const specificity = searchWords.length / targetWords.length;
  // Base score of 0.7 adjusted by specificity (0.6 to 0.75 range)
  const score = 0.6 + (specificity * 0.15);

  return { matches: true, score };
}

/**
 * Match a recipe ingredient against ingredients on hand
 */
function matchIngredient(
  recipeIngredient: Ingredient,
  ingredientsOnHand: IngredientOnHand[]
): { match: IngredientOnHand | null; matchType: 'exact' | 'partial' | 'contains' | 'fuzzy'; score: number } {
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

  // 3. Contains match - all words from on-hand ingredient appear in recipe ingredient
  // "pork ribs" matches "thick-cut boneless pork loin ribs (8 pieces)"
  let bestContainsMatch: IngredientOnHand | null = null;
  let bestContainsScore = 0;

  for (const onHand of ingredientsOnHand) {
    if (onHand.quantity <= 0) continue;
    const onHandName = normalizeIngredientName(onHand.name);
    const onHandWords = onHandName.split(' ').filter(Boolean);

    // Check if all on-hand words appear in recipe ingredient
    const result = containsAllWords(onHandWords, recipeWords);
    if (result.matches && result.score > bestContainsScore) {
      bestContainsMatch = onHand;
      bestContainsScore = result.score;
    }

    // Also check the reverse: all recipe words appear in on-hand ingredient
    // This handles cases where user enters more specific ingredient
    const reverseResult = containsAllWords(recipeWords, onHandWords);
    if (reverseResult.matches && reverseResult.score > bestContainsScore) {
      bestContainsMatch = onHand;
      bestContainsScore = reverseResult.score;
    }
  }

  if (bestContainsMatch) {
    return { match: bestContainsMatch, matchType: 'contains', score: bestContainsScore };
  }

  // 4. Fuzzy match using Levenshtein distance
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
 * Generate list of slots to fill based on weekdayConfigs
 */
function generateSlotList(
  startDate: Date,
  endDate: Date,
  weekdayConfigs: WeekdayConfig[],
  mealSlots: MealSlot[]
): SlotToFill[] {
  const slots: SlotToFill[] = [];
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  for (const day of days) {
    const dayOfWeek = day.getDay();
    const dateStr = format(day, 'yyyy-MM-dd');

    // Find config for this day of week
    const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
    if (!dayConfig) continue;

    // Add enabled slots for this day
    for (const slotConfig of dayConfig.slots) {
      if (!slotConfig.isEnabled) continue;

      const slot = mealSlots.find((s) => s.id === slotConfig.slotId);
      if (slot) {
        slots.push({
          date: dateStr,
          slotId: slotConfig.slotId,
          slotName: slot.name,
          dayOfWeek,
        });
      }
    }
  }

  return slots;
}

/**
 * Get tag config for a specific slot on a specific day
 */
function getSlotTagConfig(
  weekdayConfigs: WeekdayConfig[],
  dayOfWeek: number,
  slotId: string
): MealSlotTagConfig | undefined {
  const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
  if (!dayConfig) return undefined;

  const slotConfig = dayConfig.slots.find((s) => s.slotId === slotId);
  return slotConfig?.tagConfig;
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
 * Count how many of the configured tag names a recipe matches
 * Recipe.tags are now directly tag names (not IDs)
 */
function countMatchingTagNames(
  recipe: Recipe,
  configTagNames: Set<string>
): number {
  // Recipe.tags are already names - just compare directly (case-insensitive)
  const recipeTagNamesLower = recipe.tags.map((name) => name.toLowerCase());
  return recipeTagNamesLower.filter((name) => configTagNames.has(name)).length;
}

/**
 * Find recipe matching slot's tag config, preferring recipes that match more tags
 * tagConfig.tags are tag names (not IDs), recipe.tags are also names
 */
function findTagMatchingRecipe(
  recipes: Recipe[],
  tagConfig: MealSlotTagConfig | undefined,
  usedRecipes: Set<string>,
  favoritesWeight: number = 50
): Recipe | null {
  if (!tagConfig || tagConfig.tags.length === 0) {
    return null;
  }

  // Build set of config tag names (lowercase for case-insensitive matching)
  const configTagNames = new Set(
    tagConfig.tags.map((name) => name.toLowerCase())
  );

  // Score recipes by how many tags they match (by name)
  const scoredRecipes = recipes
    .filter((r) => !usedRecipes.has(r.id))
    .map((recipe) => ({
      recipe,
      tagMatchCount: countMatchingTagNames(recipe, configTagNames),
    }))
    .filter((r) => r.tagMatchCount > 0); // Must match at least one tag

  if (scoredRecipes.length === 0) {
    return null;
  }

  // Group by tag match count (descending) and pick from the best group
  const maxTagMatches = Math.max(...scoredRecipes.map((r) => r.tagMatchCount));
  const bestMatches = scoredRecipes
    .filter((r) => r.tagMatchCount === maxTagMatches)
    .map((r) => r.recipe);

  return pickRecipeWithFavoritesWeight(bestMatches, favoritesWeight);
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
 * tagConfig.tags are tag names, recipe.tags are also names
 */
function findRecipeForReuse(
  recipes: Recipe[],
  usageTracker: RecipeUsageTracker,
  tagConfig: MealSlotTagConfig | undefined,
  favoritesWeight: number = 50
): Recipe | null {
  if (recipes.length === 0) return null;

  // Build name set from config (lowercase for case-insensitive matching)
  const configTagNames = new Set(
    (tagConfig?.tags || []).map((name) => name.toLowerCase())
  );

  // Calculate the favorites bonus based on weight (0-10 scale based on 0-100 weight)
  const favoritesBonus = (favoritesWeight / 100) * 10;

  // Score each recipe by how long ago it was used and how many tags it matches (by name)
  const scoredRecipes = recipes.map((recipe) => {
    const lastUsed = usageTracker.lastUsedAtSlot.get(recipe.id);
    // If never used, give maximum distance
    const distance = lastUsed === undefined
      ? usageTracker.currentSlotIndex + recipes.length
      : usageTracker.currentSlotIndex - lastUsed;

    // Bonus for each matching tag (more tags = higher score)
    const tagMatchCount = configTagNames.size > 0
      ? countMatchingTagNames(recipe, configTagNames)
      : 0;

    // Bonus for favorites (scaled by favoritesWeight)
    const isFavorite = recipe.isFavorite;

    return {
      recipe,
      distance,
      tagMatchCount,
      isFavorite,
      // Combined score: distance is primary, with bonus per tag matched and favorites bonus
      score: distance * 10 + (tagMatchCount * 5) + (isFavorite ? favoritesBonus : 0),
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
 * Note: tagNamesById parameter is kept for API compatibility but no longer needed
 * since recipe.tags and tagConfig.tags are both names now
 * @param excludeRecipeIds - Recipe IDs to avoid using (e.g., from locked meals). These will
 *                           only be used as a last resort if no other recipes are available.
 * @param existingMeals - Existing planned meals in the date range. Used to filter out
 *                        occupied slots when not in overwrite mode.
 */
export async function generateMealPlan(
  config: MealPlanConfig,
  mealSlots: MealSlot[],
  _tagNamesById?: Map<string, string>,
  excludeRecipeIds?: Set<string>,
  existingMeals?: PlannedMeal[]
): Promise<GeneratedMealPlan> {
  const warnings: string[] = [];
  const proposedMeals: ProposedMeal[] = [];
  // Pre-populate with excluded recipes to avoid duplicates with locked meals
  const usedRecipes = new Set<string>(excludeRecipeIds);

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

  // Generate slots to fill based on weekdayConfigs
  const allSlots = generateSlotList(config.startDate, config.endDate, config.weekdayConfigs, mealSlots);

  // In fill-gaps mode (not overwrite), filter out slots that already have meals
  let slotsToFill = [...allSlots];
  let skippedExistingCount = 0;
  if (!config.overwriteMode && existingMeals && existingMeals.length > 0) {
    const occupiedSlotKeys = new Set(
      existingMeals.map((meal) => `${meal.date}:${meal.slotId}`)
    );
    const originalCount = slotsToFill.length;
    slotsToFill = allSlots.filter(
      (slot) => !occupiedSlotKeys.has(`${slot.date}:${slot.slotId}`)
    );
    skippedExistingCount = originalCount - slotsToFill.length;
  }

  // PHASE 1: Find recipes that use ingredients on hand
  if (config.ingredientsOnHand.length > 0) {
    const recipeScores = scoreRecipesByIngredients(allRecipes, ingredientPool, config.defaultServings);

    // Randomly select slots for ingredient-matching recipes
    const shuffledSlots = shuffleArray(slotsToFill);
    const ingredientSlots = shuffledSlots.slice(0, Math.min(recipeScores.length, shuffledSlots.length));

    for (const slot of ingredientSlots) {
      if (allIngredientsDepleted(ingredientPool)) break;

      const tagConfig = getSlotTagConfig(config.weekdayConfigs, slot.dayOfWeek, slot.slotId);

      // Build tag name set for this slot (lowercase for case-insensitive matching)
      const configTagNamesLower = tagConfig
        ? new Set(tagConfig.tags.map((name) => name.toLowerCase()))
        : new Set<string>();

      // Find all valid recipes that:
      // a) Use available ingredients
      // b) Haven't been used yet
      // c) Match slot's tag config if possible (count how many tags match by name)
      const validCandidates: { score: RecipeMatchScore; recipe: Recipe; tagMatchCount: number }[] = [];

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

        // Count tag matches by name (recipe.tags are now names)
        const tagMatchCount = configTagNamesLower.size > 0
          ? countMatchingTagNames(recipe, configTagNamesLower)
          : 0;

        validCandidates.push({ score, recipe, tagMatchCount });
      }

      // Select from candidates: prefer recipes matching more tags, then use favorites weight
      let bestMatch: RecipeMatchScore | null = null;
      let selectedRecipe: Recipe | null = null;

      if (validCandidates.length > 0) {
        // First priority: recipes with the most tag matches
        const maxTagMatches = Math.max(...validCandidates.map((c) => c.tagMatchCount));
        if (maxTagMatches > 0) {
          // Pick from candidates with the highest tag match count
          const bestTagMatches = validCandidates.filter((c) => c.tagMatchCount === maxTagMatches);
          const recipes = bestTagMatches.map((c) => c.recipe);
          selectedRecipe = pickRecipeWithFavoritesWeight(recipes, config.favoritesWeight);
          bestMatch = bestTagMatches.find((c) => c.recipe.id === selectedRecipe?.id)?.score || null;
        } else {
          // No tag matches, pick from all valid candidates using favorites weight
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
    const tagConfig = getSlotTagConfig(config.weekdayConfigs, slot.dayOfWeek, slot.slotId);

    if (tagConfig && tagConfig.tags.length > 0) {
      const recipe = findTagMatchingRecipe(allRecipes, tagConfig, usedRecipes, config.favoritesWeight);

      if (recipe) {
        usedRecipes.add(recipe.id);

        // Remove slot from remaining
        const slotIndex = slotsToFill.findIndex(
          (s) => s.date === slot.date && s.slotId === slot.slotId
        );
        if (slotIndex >= 0) {
          slotsToFill.splice(slotIndex, 1);
        }

        // Find matched tags by name comparison (recipe.tags are names)
        const configTagNamesLower = new Set(tagConfig.tags.map((name) => name.toLowerCase()));
        const matchedTagNames = recipe.tags.filter((tagName) =>
          configTagNamesLower.has(tagName.toLowerCase())
        );

        proposedMeals.push({
          id: uuidv4(),
          date: slot.date,
          slotId: slot.slotId,
          slotName: slot.slotName,
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          servings: config.defaultServings,
          matchType: 'tag',
          matchedTags: matchedTagNames,
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
    const tagConfig = getSlotTagConfig(config.weekdayConfigs, slot.dayOfWeek, slot.slotId);
    let recipe: Recipe | null = null;
    let isTagMatch = false;

    // Build tag name set for this slot's config (lowercase for case-insensitive)
    const configTagNamesLower = tagConfig
      ? new Set(tagConfig.tags.map((name) => name.toLowerCase()))
      : new Set<string>();

    // First try to find an unused recipe that matches tags (if tags configured)
    if (tagConfig && tagConfig.tags.length > 0) {
      recipe = findTagMatchingRecipe(allRecipes, tagConfig, usedRecipes, config.favoritesWeight);
      if (recipe) {
        isTagMatch = true;
      } else {
        // Warn that no recipes matched the configured tags
        const configuredTagNames = tagConfig.tags.join(', ');
        warnings.push(`No recipes found matching tags [${configuredTagNames}] for ${slot.slotName} on ${slot.date}`);
      }
    }

    // If no tag match found, try any unused recipe
    if (!recipe) {
      recipe = findFallbackRecipe(allRecipes, usedRecipes, config.favoritesWeight);
    }

    // If no unused recipes, find a recipe to reuse with maximum spacing
    if (!recipe && allRecipes.length > 0) {
      recipe = findRecipeForReuse(allRecipes, usageTracker, tagConfig, config.favoritesWeight);
      // Check if reused recipe matches tags (recipe.tags are names)
      if (recipe && configTagNamesLower.size > 0) {
        const recipeTagNamesLower = recipe.tags.map((name) => name.toLowerCase());
        isTagMatch = recipeTagNamesLower.some((name) => configTagNamesLower.has(name));
      }
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

      // Determine matched tags for display (recipe.tags are names)
      const matchedTagNames = isTagMatch && tagConfig
        ? recipe.tags.filter((tagName) => configTagNamesLower.has(tagName.toLowerCase()))
        : [];

      proposedMeals.push({
        id: uuidv4(),
        date: slot.date,
        slotId: slot.slotId,
        slotName: slot.slotName,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        servings: config.defaultServings,
        matchType: isTagMatch ? 'tag' : 'fallback',
        matchedTags: isTagMatch ? matchedTagNames : undefined,
        isRejected: false,
        isLocked: false,
      });
    }
  }

  // Generate warnings and informational messages
  if (skippedExistingCount > 0) {
    warnings.push(`Kept ${skippedExistingCount} existing meal${skippedExistingCount !== 1 ? 's' : ''} in your calendar.`);
  }
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
 * tagConfig.tags and recipe.tags are both names
 * Returns recipes prioritized by tag matches, with non-matching recipes shuffled for variety
 */
export async function findAlternativeRecipes(
  currentRecipeId: string,
  dayOfWeek: number,
  slotId: string,
  weekdayConfigs: WeekdayConfig[],
  usedRecipeIds: string[],
  limit: number = 15
): Promise<Recipe[]> {
  const allRecipes = await recipeRepository.getAll();
  const usedSet = new Set(usedRecipeIds);

  // Filter out used recipes and current recipe to avoid duplicates
  const candidates = allRecipes.filter((r) => r.id !== currentRecipeId && !usedSet.has(r.id));

  // Get tag config for this specific day and slot
  const tagConfig = getSlotTagConfig(weekdayConfigs, dayOfWeek, slotId);

  if (tagConfig && tagConfig.tags.length > 0) {
    // Build set of config tag names (lowercase for case-insensitive)
    const configTagNamesLower = new Set(
      tagConfig.tags.map((name) => name.toLowerCase())
    );

    // Score each candidate by number of matching tags
    const scored = candidates.map((r) => ({
      recipe: r,
      tagMatchCount: countMatchingTagNames(r, configTagNamesLower),
    }));

    // Separate tag-matching recipes from non-matching
    const tagMatching = scored.filter((s) => s.tagMatchCount > 0);
    const nonMatching = scored.filter((s) => s.tagMatchCount === 0);

    // Sort tag-matching by match count descending
    tagMatching.sort((a, b) => b.tagMatchCount - a.tagMatchCount);

    // Shuffle non-matching for variety
    const shuffledNonMatching = shuffleArray(nonMatching);

    // Combine: tag-matching first, then shuffled non-matching
    const result = [
      ...tagMatching.map((s) => s.recipe),
      ...shuffledNonMatching.map((s) => s.recipe),
    ];

    return result.slice(0, limit);
  }

  // No tag config - return shuffled candidates for variety
  return shuffleArray(candidates).slice(0, limit);
}
