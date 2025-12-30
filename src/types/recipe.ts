import type { MeasurementUnit } from './units';
import type { StoreSection } from './shopping';

export interface Ingredient {
  id: string;
  name: string;
  quantity: number | null; // null for "to taste" items
  unit: MeasurementUnit | null;
  preparationNotes?: string; // e.g., "diced", "room temperature"
  isOptional: boolean;
  storeSection?: StoreSection;
}

export interface NutritionInfo {
  calories: number;
  protein: number; // grams
  carbohydrates: number; // grams
  fat: number; // grams
  fiber: number; // grams
  sodium: number; // milligrams
  customNutrients?: Record<string, { value: number; unit: string }>;
}

export interface RecipeImage {
  id: string;
  data: Blob | string; // Blob for stored images, string for URLs
  isUrl: boolean;
  caption?: string;
  isPrimary: boolean;
}

export interface Recipe {
  id: string;
  title: string;
  description?: string;
  ingredients: Ingredient[];
  instructions: string; // Preserves formatting (newlines, spacing)
  notes?: string; // Preserves formatting
  tags: string[]; // Tag IDs
  images: RecipeImage[];
  servings: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  sourceUrl?: string;
  sourceReference?: string; // For cookbook citations
  nutrition?: NutritionInfo;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeFormData {
  title: string;
  description: string;
  ingredients: Omit<Ingredient, 'id'>[];
  instructions: string;
  notes: string;
  tags: string[];
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  sourceUrl: string;
  sourceReference: string;
  nutrition: NutritionInfo | null;
}
