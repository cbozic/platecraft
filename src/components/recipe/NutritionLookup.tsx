import { useState } from 'react';
import { Search, Loader2, AlertCircle, Check } from 'lucide-react';
import { Button, Modal, ModalFooter } from '@/components/ui';
import { nutritionService, type FoodSearchResult, type FoodDetail } from '@/services';
import type { NutritionInfo } from '@/types';
import styles from './NutritionLookup.module.css';

interface NutritionLookupProps {
  onSelect: (nutrition: NutritionInfo) => void;
  ingredientName?: string;
}

export function NutritionLookup({ onSelect, ingredientName }: NutritionLookupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(ingredientName || '');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodDetail | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servingSize, setServingSize] = useState<number>(100);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setError(null);
    setSelectedFood(null);

    const result = await nutritionService.searchFoods(searchQuery);

    if (nutritionService.isError(result)) {
      setError(result.message);
      setSearchResults([]);
    } else {
      setSearchResults(result.foods);
      if (result.foods.length === 0) {
        setError('No foods found. Try a different search term.');
      }
    }

    setIsSearching(false);
  };

  const handleSelectFood = async (food: FoodSearchResult) => {
    setIsLoadingDetail(true);
    setError(null);

    const detail = await nutritionService.getFoodDetail(food.fdcId);

    if (nutritionService.isError(detail)) {
      setError(detail.message);
    } else {
      setSelectedFood(detail);
      // Set serving size from food data if available
      if (detail.servingSize) {
        setServingSize(detail.servingSize);
      }
    }

    setIsLoadingDetail(false);
  };

  const handleConfirm = () => {
    if (!selectedFood) return;

    const nutrition = nutritionService.convertToNutritionInfo(selectedFood, servingSize);
    onSelect(nutrition);
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery(ingredientName || '');
    setSearchResults([]);
    setSelectedFood(null);
    setError(null);
    setServingSize(100);
  };

  const handleOpen = () => {
    setSearchQuery(ingredientName || '');
    setIsOpen(true);
  };

  const previewNutrition = selectedFood
    ? nutritionService.convertToNutritionInfo(selectedFood, servingSize)
    : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        leftIcon={<Search size={16} />}
        onClick={handleOpen}
      >
        Look Up Nutrition
      </Button>

      <Modal isOpen={isOpen} onClose={handleClose} title="Nutrition Lookup" size="lg">
        <div className={styles.container}>
          <div className={styles.searchSection}>
            <div className={styles.searchRow}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search for a food (e.g., chicken breast, rice)"
                className={styles.searchInput}
              />
              <Button
                type="button"
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? <Loader2 size={18} className={styles.spinner} /> : 'Search'}
              </Button>
            </div>
            <p className={styles.searchHint}>
              Data from USDA FoodData Central. Values are per 100g unless specified.
            </p>
          </div>

          {error && (
            <div className={styles.error}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {searchResults.length > 0 && !selectedFood && (
            <div className={styles.results}>
              <h4>Select a food:</h4>
              <ul className={styles.resultList}>
                {searchResults.slice(0, 10).map((food) => (
                  <li key={food.fdcId}>
                    <button
                      type="button"
                      className={styles.resultItem}
                      onClick={() => handleSelectFood(food)}
                      disabled={isLoadingDetail}
                    >
                      <span className={styles.foodName}>{food.description}</span>
                      {food.brandName && (
                        <span className={styles.brandName}>{food.brandName}</span>
                      )}
                      <span className={styles.dataType}>{food.dataType}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoadingDetail && (
            <div className={styles.loading}>
              <Loader2 size={24} className={styles.spinner} />
              <span>Loading nutrition data...</span>
            </div>
          )}

          {selectedFood && previewNutrition && (
            <div className={styles.preview}>
              <div className={styles.previewHeader}>
                <h4>{selectedFood.description}</h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFood(null)}
                >
                  Change
                </Button>
              </div>

              <div className={styles.servingInput}>
                <label htmlFor="servingSize">Serving size (grams):</label>
                <input
                  type="number"
                  id="servingSize"
                  min="1"
                  value={servingSize}
                  onChange={(e) => setServingSize(parseInt(e.target.value, 10) || 100)}
                  className={styles.servingInputField}
                />
              </div>

              <div className={styles.nutritionPreview}>
                <div className={styles.nutritionRow}>
                  <span>Calories</span>
                  <span>{previewNutrition.calories} kcal</span>
                </div>
                <div className={styles.nutritionRow}>
                  <span>Protein</span>
                  <span>{previewNutrition.protein}g</span>
                </div>
                <div className={styles.nutritionRow}>
                  <span>Carbohydrates</span>
                  <span>{previewNutrition.carbohydrates}g</span>
                </div>
                <div className={styles.nutritionRow}>
                  <span>Fat</span>
                  <span>{previewNutrition.fat}g</span>
                </div>
                <div className={styles.nutritionRow}>
                  <span>Fiber</span>
                  <span>{previewNutrition.fiber}g</span>
                </div>
                <div className={styles.nutritionRow}>
                  <span>Sodium</span>
                  <span>{previewNutrition.sodium}mg</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedFood}
            leftIcon={<Check size={18} />}
          >
            Use These Values
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
