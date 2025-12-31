import { useState, useEffect, useMemo } from 'react';
import { Calculator, Search, Loader2, Check, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Modal, ModalFooter } from '@/components/ui';
import { nutritionService, type FoodSearchResult } from '@/services';
import { estimateIngredientWeight, formatWeight } from '@/utils/ingredientWeights';
import type { Ingredient, NutritionInfo } from '@/types';
import styles from './IngredientNutritionCalculator.module.css';

interface IngredientNutrition {
  ingredientId: string;
  ingredientName: string;
  estimatedGrams: number;
  nutrition: NutritionInfo | null;
  fdcId?: number;
  foodDescription?: string;
  isLoading: boolean;
  error?: string;
}

interface IngredientNutritionCalculatorProps {
  ingredients: Ingredient[];
  servings: number;
  onCalculate: (nutrition: NutritionInfo) => void;
}

export function IngredientNutritionCalculator({
  ingredients,
  servings,
  onCalculate,
}: IngredientNutritionCalculatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ingredientNutrition, setIngredientNutrition] = useState<IngredientNutrition[]>([]);
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize ingredient nutrition state when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialState: IngredientNutrition[] = ingredients
        .filter((ing) => ing.name.trim())
        .map((ing) => ({
          ingredientId: ing.id,
          ingredientName: ing.name,
          estimatedGrams: estimateIngredientWeight(ing.name, ing.quantity, ing.unit),
          nutrition: null,
          isLoading: false,
        }));
      setIngredientNutrition(initialState);
      setError(null);
    }
  }, [isOpen, ingredients]);

  // Calculate totals
  const totals = useMemo(() => {
    const total: NutritionInfo = {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
    };

    for (const item of ingredientNutrition) {
      if (item.nutrition) {
        total.calories += item.nutrition.calories;
        total.protein += item.nutrition.protein;
        total.carbohydrates += item.nutrition.carbohydrates;
        total.fat += item.nutrition.fat;
        total.fiber += item.nutrition.fiber;
        total.sodium += item.nutrition.sodium;
      }
    }

    return total;
  }, [ingredientNutrition]);

  const perServing = useMemo(() => {
    return nutritionService.calculatePerServing(totals, servings);
  }, [totals, servings]);

  const completedCount = ingredientNutrition.filter((i) => i.nutrition !== null).length;

  const handleOpenSearch = (ingredientId: string, ingredientName: string) => {
    setSearchingId(ingredientId);
    setSearchQuery(ingredientName);
    setSearchResults([]);
    setExpandedId(ingredientId);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !searchingId) return;

    setIsSearching(true);
    const result = await nutritionService.searchFoods(searchQuery);

    if (nutritionService.isError(result)) {
      setError(result.message);
      setSearchResults([]);
    } else {
      setSearchResults(result.foods.slice(0, 8));
      setError(null);
    }

    setIsSearching(false);
  };

  const handleSelectFood = async (food: FoodSearchResult) => {
    if (!searchingId) return;

    // Update loading state
    setIngredientNutrition((prev) =>
      prev.map((item) =>
        item.ingredientId === searchingId ? { ...item, isLoading: true, error: undefined } : item
      )
    );

    const detail = await nutritionService.getFoodDetail(food.fdcId);

    if (nutritionService.isError(detail)) {
      setIngredientNutrition((prev) =>
        prev.map((item) =>
          item.ingredientId === searchingId
            ? { ...item, isLoading: false, error: detail.message }
            : item
        )
      );
      return;
    }

    // Get the estimated grams for this ingredient
    const ingredientItem = ingredientNutrition.find((i) => i.ingredientId === searchingId);
    const grams = ingredientItem?.estimatedGrams || 100;

    // Convert USDA data (per 100g) to actual ingredient amount
    const nutrition = nutritionService.convertToNutritionInfo(detail, grams);

    setIngredientNutrition((prev) =>
      prev.map((item) =>
        item.ingredientId === searchingId
          ? {
              ...item,
              nutrition,
              fdcId: food.fdcId,
              foodDescription: food.description,
              isLoading: false,
              error: undefined,
            }
          : item
      )
    );

    // Close search
    setSearchingId(null);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleClearNutrition = (ingredientId: string) => {
    setIngredientNutrition((prev) =>
      prev.map((item) =>
        item.ingredientId === ingredientId
          ? { ...item, nutrition: null, fdcId: undefined, foodDescription: undefined }
          : item
      )
    );
  };

  const handleUpdateGrams = (ingredientId: string, grams: number) => {
    setIngredientNutrition((prev) =>
      prev.map((item) => {
        if (item.ingredientId !== ingredientId) return item;

        // If we have nutrition data, rescale it
        if (item.nutrition && item.fdcId) {
          const scaleFactor = grams / item.estimatedGrams;
          return {
            ...item,
            estimatedGrams: grams,
            nutrition: {
              calories: Math.round(item.nutrition.calories * scaleFactor),
              protein: Math.round(item.nutrition.protein * scaleFactor * 10) / 10,
              carbohydrates: Math.round(item.nutrition.carbohydrates * scaleFactor * 10) / 10,
              fat: Math.round(item.nutrition.fat * scaleFactor * 10) / 10,
              fiber: Math.round(item.nutrition.fiber * scaleFactor * 10) / 10,
              sodium: Math.round(item.nutrition.sodium * scaleFactor),
            },
          };
        }

        return { ...item, estimatedGrams: grams };
      })
    );
  };

  const handleConfirm = () => {
    onCalculate(perServing);
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchingId(null);
    setSearchResults([]);
    setSearchQuery('');
    setError(null);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        leftIcon={<Calculator size={16} />}
        onClick={() => setIsOpen(true)}
        disabled={ingredients.filter((i) => i.name.trim()).length === 0}
      >
        Calculate from Ingredients
      </Button>

      <Modal isOpen={isOpen} onClose={handleClose} title="Calculate Nutrition from Ingredients" size="lg">
        <div className={styles.container}>
          <p className={styles.description}>
            Look up nutrition data for each ingredient. Values are calculated based on estimated weights
            and summed to get the recipe total.
          </p>

          {error && (
            <div className={styles.error}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.ingredientList}>
            {ingredientNutrition.map((item) => (
              <div key={item.ingredientId} className={styles.ingredientItem}>
                <div
                  className={styles.ingredientHeader}
                  onClick={() => setExpandedId(expandedId === item.ingredientId ? null : item.ingredientId)}
                >
                  <div className={styles.ingredientInfo}>
                    <span className={styles.ingredientName}>{item.ingredientName}</span>
                    <span className={styles.ingredientWeight}>
                      ~{formatWeight(item.estimatedGrams)}
                    </span>
                  </div>
                  <div className={styles.ingredientStatus}>
                    {item.isLoading ? (
                      <Loader2 size={18} className={styles.spinner} />
                    ) : item.nutrition ? (
                      <span className={styles.statusDone}>
                        <Check size={16} />
                        {item.nutrition.calories} cal
                      </span>
                    ) : (
                      <span className={styles.statusPending}>Not set</span>
                    )}
                    {expandedId === item.ingredientId ? (
                      <ChevronUp size={18} />
                    ) : (
                      <ChevronDown size={18} />
                    )}
                  </div>
                </div>

                {expandedId === item.ingredientId && (
                  <div className={styles.ingredientExpanded}>
                    <div className={styles.weightAdjust}>
                      <label>Weight (grams):</label>
                      <input
                        type="number"
                        min="1"
                        value={item.estimatedGrams}
                        onChange={(e) =>
                          handleUpdateGrams(item.ingredientId, parseInt(e.target.value, 10) || 1)
                        }
                        className={styles.weightInput}
                      />
                    </div>

                    {item.foodDescription && (
                      <div className={styles.matchedFood}>
                        <span>Matched: {item.foodDescription}</span>
                        <button
                          type="button"
                          onClick={() => handleClearNutrition(item.ingredientId)}
                          className={styles.clearButton}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {item.error && (
                      <div className={styles.itemError}>{item.error}</div>
                    )}

                    {searchingId === item.ingredientId ? (
                      <div className={styles.searchSection}>
                        <div className={styles.searchRow}>
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search USDA database..."
                            className={styles.searchInput}
                            autoFocus
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleSearch}
                            disabled={isSearching}
                          >
                            {isSearching ? <Loader2 size={16} className={styles.spinner} /> : 'Search'}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSearchingId(null);
                              setSearchResults([]);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>

                        {searchResults.length > 0 && (
                          <ul className={styles.searchResults}>
                            {searchResults.map((food) => (
                              <li key={food.fdcId}>
                                <button
                                  type="button"
                                  className={styles.searchResultItem}
                                  onClick={() => handleSelectFood(food)}
                                >
                                  <span className={styles.foodName}>{food.description}</span>
                                  <span className={styles.dataType}>{food.dataType}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<Search size={14} />}
                        onClick={() => handleOpenSearch(item.ingredientId, item.ingredientName)}
                      >
                        {item.nutrition ? 'Change' : 'Look Up'}
                      </Button>
                    )}

                    {item.nutrition && (
                      <div className={styles.nutritionPreview}>
                        <div>Cal: {item.nutrition.calories}</div>
                        <div>P: {item.nutrition.protein}g</div>
                        <div>C: {item.nutrition.carbohydrates}g</div>
                        <div>F: {item.nutrition.fat}g</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.totalsSection}>
            <div className={styles.totalsHeader}>
              <h4>Recipe Totals</h4>
              <span className={styles.progress}>
                {completedCount} of {ingredientNutrition.length} ingredients
              </span>
            </div>

            <div className={styles.totalsGrid}>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Calories</span>
                <span className={styles.totalValue}>{totals.calories}</span>
              </div>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Protein</span>
                <span className={styles.totalValue}>{totals.protein}g</span>
              </div>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Carbs</span>
                <span className={styles.totalValue}>{totals.carbohydrates}g</span>
              </div>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Fat</span>
                <span className={styles.totalValue}>{totals.fat}g</span>
              </div>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Fiber</span>
                <span className={styles.totalValue}>{totals.fiber}g</span>
              </div>
              <div className={styles.totalItem}>
                <span className={styles.totalLabel}>Sodium</span>
                <span className={styles.totalValue}>{totals.sodium}mg</span>
              </div>
            </div>

            <div className={styles.perServing}>
              <h4>Per Serving ({servings} servings)</h4>
              <div className={styles.perServingValues}>
                <span>{perServing.calories} cal</span>
                <span>{perServing.protein}g protein</span>
                <span>{perServing.carbohydrates}g carbs</span>
                <span>{perServing.fat}g fat</span>
              </div>
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={completedCount === 0}
            leftIcon={<Check size={18} />}
          >
            Use Per-Serving Values
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
