import type { NutritionInfo } from '@/types/recipe';
import { settingsRepository } from '@/db/repositories/settingsRepository';

const USDA_API_BASE = 'https://api.nal.usda.gov/fdc/v1';

// USDA nutrient IDs for the nutrients we track
const NUTRIENT_IDS = {
  calories: 1008, // Energy (kcal)
  protein: 1003, // Protein
  carbohydrates: 1005, // Carbohydrate, by difference
  fat: 1004, // Total lipid (fat)
  fiber: 1079, // Fiber, total dietary
  sodium: 1093, // Sodium, Na
} as const;

export interface FoodSearchResult {
  fdcId: number;
  description: string;
  brandName?: string;
  brandOwner?: string;
  dataType: string;
  servingSize?: number;
  servingSizeUnit?: string;
  score?: number;
}

export interface FoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface FoodDetail {
  fdcId: number;
  description: string;
  brandName?: string;
  brandOwner?: string;
  dataType: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients: FoodNutrient[];
}

export interface NutritionSearchOptions {
  pageSize?: number;
  pageNumber?: number;
  dataType?: ('Foundation' | 'SR Legacy' | 'Branded' | 'Survey (FNDDS)')[];
}

export interface NutritionServiceError {
  type: 'no_api_key' | 'invalid_api_key' | 'rate_limit' | 'not_found' | 'network' | 'unknown';
  message: string;
}

export const nutritionService = {
  /**
   * Search for foods by name/description
   */
  async searchFoods(
    query: string,
    options: NutritionSearchOptions = {}
  ): Promise<{ foods: FoodSearchResult[]; totalHits: number } | NutritionServiceError> {
    const apiKey = await settingsRepository.getUsdaApiKey();
    if (!apiKey) {
      return {
        type: 'no_api_key',
        message: 'USDA API key not configured. Please add your API key in Settings.',
      };
    }

    try {
      const response = await fetch(`${USDA_API_BASE}/foods/search?api_key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          pageSize: options.pageSize || 25,
          pageNumber: options.pageNumber || 1,
          dataType: options.dataType || ['Foundation', 'SR Legacy'],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          type: 'invalid_api_key',
          message: 'Invalid USDA API key. Please check your API key in Settings.',
        };
      }

      if (response.status === 429) {
        return {
          type: 'rate_limit',
          message: 'API rate limit exceeded. Please try again later.',
        };
      }

      if (!response.ok) {
        return {
          type: 'unknown',
          message: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = await response.json();

      const foods: FoodSearchResult[] = (data.foods || []).map((food: Record<string, unknown>) => ({
        fdcId: food.fdcId as number,
        description: food.description as string,
        brandName: food.brandName as string | undefined,
        brandOwner: food.brandOwner as string | undefined,
        dataType: food.dataType as string,
        servingSize: food.servingSize as number | undefined,
        servingSizeUnit: food.servingSizeUnit as string | undefined,
        score: food.score as number | undefined,
      }));

      return {
        foods,
        totalHits: data.totalHits || 0,
      };
    } catch (error) {
      console.error('Nutrition search error:', error);
      return {
        type: 'network',
        message: 'Network error. Please check your connection and try again.',
      };
    }
  },

  /**
   * Get detailed nutrition information for a specific food
   */
  async getFoodDetail(fdcId: number): Promise<FoodDetail | NutritionServiceError> {
    const apiKey = await settingsRepository.getUsdaApiKey();
    if (!apiKey) {
      return {
        type: 'no_api_key',
        message: 'USDA API key not configured. Please add your API key in Settings.',
      };
    }

    try {
      // Don't filter nutrients in the URL - get all and filter client-side
      const response = await fetch(
        `${USDA_API_BASE}/food/${fdcId}?api_key=${apiKey}`
      );

      if (response.status === 401 || response.status === 403) {
        return {
          type: 'invalid_api_key',
          message: 'Invalid USDA API key. Please check your API key in Settings.',
        };
      }

      if (response.status === 404) {
        return {
          type: 'not_found',
          message: 'Food not found in USDA database.',
        };
      }

      if (response.status === 429) {
        return {
          type: 'rate_limit',
          message: 'API rate limit exceeded. Please try again later.',
        };
      }

      if (!response.ok) {
        return {
          type: 'unknown',
          message: `API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = await response.json();

      // USDA API returns nutrients in different formats depending on the data type
      // - Foundation/SR Legacy: { nutrient: { id, name, ... }, amount }
      // - Branded: { nutrientId, nutrientName, value }
      // - Survey: { nutrient: { id, name, ... }, amount }
      interface UsdaNutrientNested {
        nutrient?: { id?: number; name?: string; number?: string; unitName?: string };
        amount?: number;
      }

      interface UsdaNutrientFlat {
        nutrientId?: number;
        nutrientName?: string;
        nutrientNumber?: string;
        unitName?: string;
        value?: number;
      }

      type UsdaNutrient = UsdaNutrientNested & UsdaNutrientFlat;

      const foodNutrients: FoodNutrient[] = (data.foodNutrients || []).map(
        (nutrient: UsdaNutrient) => {
          // Handle nested format (Foundation, SR Legacy, Survey)
          if (nutrient.nutrient) {
            return {
              nutrientId: nutrient.nutrient.id ?? 0,
              nutrientName: nutrient.nutrient.name ?? '',
              nutrientNumber: nutrient.nutrient.number ?? '',
              unitName: nutrient.nutrient.unitName ?? '',
              value: nutrient.amount ?? 0,
            };
          }
          // Handle flat format (Branded)
          return {
            nutrientId: nutrient.nutrientId ?? 0,
            nutrientName: nutrient.nutrientName ?? '',
            nutrientNumber: nutrient.nutrientNumber ?? '',
            unitName: nutrient.unitName ?? '',
            value: nutrient.value ?? 0,
          };
        }
      );

      return {
        fdcId: data.fdcId,
        description: data.description,
        brandName: data.brandName,
        brandOwner: data.brandOwner,
        dataType: data.dataType,
        servingSize: data.servingSize,
        servingSizeUnit: data.servingSizeUnit,
        foodNutrients,
      };
    } catch (error) {
      console.error('Nutrition detail error:', error);
      return {
        type: 'network',
        message: 'Network error. Please check your connection and try again.',
      };
    }
  },

  /**
   * Convert USDA food detail to our NutritionInfo format
   * Values are per 100g from USDA, we convert to per serving if serving size provided
   */
  convertToNutritionInfo(
    foodDetail: FoodDetail,
    servingGrams?: number
  ): NutritionInfo {
    const getNutrientValue = (nutrientId: number): number => {
      const nutrient = foodDetail.foodNutrients.find((n) => n.nutrientId === nutrientId);
      return nutrient?.value || 0;
    };

    // USDA data is per 100g, scale to serving size if provided
    const scaleFactor = servingGrams ? servingGrams / 100 : 1;

    return {
      calories: Math.round(getNutrientValue(NUTRIENT_IDS.calories) * scaleFactor),
      protein: Math.round(getNutrientValue(NUTRIENT_IDS.protein) * scaleFactor * 10) / 10,
      carbohydrates: Math.round(getNutrientValue(NUTRIENT_IDS.carbohydrates) * scaleFactor * 10) / 10,
      fat: Math.round(getNutrientValue(NUTRIENT_IDS.fat) * scaleFactor * 10) / 10,
      fiber: Math.round(getNutrientValue(NUTRIENT_IDS.fiber) * scaleFactor * 10) / 10,
      sodium: Math.round(getNutrientValue(NUTRIENT_IDS.sodium) * scaleFactor),
    };
  },

  /**
   * Check if a result is an error
   */
  isError(result: unknown): result is NutritionServiceError {
    return (
      typeof result === 'object' &&
      result !== null &&
      'type' in result &&
      'message' in result
    );
  },

  /**
   * Calculate total nutrition for a recipe from ingredient nutrition
   * Each ingredient's nutrition should already be scaled to its quantity
   */
  calculateRecipeNutrition(ingredientNutrition: NutritionInfo[]): NutritionInfo {
    const total: NutritionInfo = {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
    };

    for (const nutrition of ingredientNutrition) {
      total.calories += nutrition.calories;
      total.protein += nutrition.protein;
      total.carbohydrates += nutrition.carbohydrates;
      total.fat += nutrition.fat;
      total.fiber += nutrition.fiber;
      total.sodium += nutrition.sodium;
    }

    // Round values
    total.calories = Math.round(total.calories);
    total.protein = Math.round(total.protein * 10) / 10;
    total.carbohydrates = Math.round(total.carbohydrates * 10) / 10;
    total.fat = Math.round(total.fat * 10) / 10;
    total.fiber = Math.round(total.fiber * 10) / 10;
    total.sodium = Math.round(total.sodium);

    return total;
  },

  /**
   * Calculate per-serving nutrition from total recipe nutrition
   */
  calculatePerServing(totalNutrition: NutritionInfo, servings: number): NutritionInfo {
    if (servings <= 0) return totalNutrition;

    return {
      calories: Math.round(totalNutrition.calories / servings),
      protein: Math.round((totalNutrition.protein / servings) * 10) / 10,
      carbohydrates: Math.round((totalNutrition.carbohydrates / servings) * 10) / 10,
      fat: Math.round((totalNutrition.fat / servings) * 10) / 10,
      fiber: Math.round((totalNutrition.fiber / servings) * 10) / 10,
      sodium: Math.round(totalNutrition.sodium / servings),
    };
  },
};
