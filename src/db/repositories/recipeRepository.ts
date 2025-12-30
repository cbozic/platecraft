import { db } from '../database';
import type { Recipe, RecipeFormData, Ingredient } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const recipeRepository = {
  async getAll(): Promise<Recipe[]> {
    return db.recipes.orderBy('updatedAt').reverse().toArray();
  },

  async getById(id: string): Promise<Recipe | undefined> {
    return db.recipes.get(id);
  },

  async getByIds(ids: string[]): Promise<Recipe[]> {
    return db.recipes.where('id').anyOf(ids).toArray();
  },

  async search(query: string): Promise<Recipe[]> {
    const lowerQuery = query.toLowerCase();
    return db.recipes
      .filter((recipe) => {
        return Boolean(
          recipe.title.toLowerCase().includes(lowerQuery) ||
          recipe.description?.toLowerCase().includes(lowerQuery) ||
          recipe.ingredients.some((ing) =>
            ing.name.toLowerCase().includes(lowerQuery)
          ) ||
          recipe.notes?.toLowerCase().includes(lowerQuery)
        );
      })
      .toArray();
  },

  async getByTags(tagIds: string[]): Promise<Recipe[]> {
    if (tagIds.length === 0) return this.getAll();
    return db.recipes
      .filter((recipe) => tagIds.some((tagId) => recipe.tags.includes(tagId)))
      .toArray();
  },

  async getFavorites(): Promise<Recipe[]> {
    return db.recipes.where('isFavorite').equals(1).toArray();
  },

  async create(formData: RecipeFormData): Promise<Recipe> {
    const now = new Date();
    const recipe: Recipe = {
      id: uuidv4(),
      title: formData.title,
      description: formData.description || undefined,
      ingredients: formData.ingredients.map((ing) => ({
        ...ing,
        id: uuidv4(),
      })),
      instructions: formData.instructions,
      notes: formData.notes || undefined,
      tags: formData.tags,
      images: formData.images || [],
      servings: formData.servings,
      prepTimeMinutes: formData.prepTimeMinutes ?? undefined,
      cookTimeMinutes: formData.cookTimeMinutes ?? undefined,
      sourceUrl: formData.sourceUrl || undefined,
      referenceCookbook: formData.referenceCookbook || undefined,
      referencePageNumber: formData.referencePageNumber ?? undefined,
      referenceOther: formData.referenceOther || undefined,
      nutrition: formData.nutrition ?? undefined,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    await db.recipes.add(recipe);
    return recipe;
  },

  async update(id: string, formData: Partial<RecipeFormData>): Promise<void> {
    const updates: Partial<Recipe> = {
      updatedAt: new Date(),
    };

    if (formData.title !== undefined) updates.title = formData.title;
    if (formData.description !== undefined)
      updates.description = formData.description || undefined;
    if (formData.ingredients !== undefined) {
      updates.ingredients = formData.ingredients.map((ing) => ({
        ...ing,
        id: (ing as Ingredient).id || uuidv4(),
      }));
    }
    if (formData.instructions !== undefined)
      updates.instructions = formData.instructions;
    if (formData.notes !== undefined)
      updates.notes = formData.notes || undefined;
    if (formData.tags !== undefined) updates.tags = formData.tags;
    if (formData.servings !== undefined) updates.servings = formData.servings;
    if (formData.prepTimeMinutes !== undefined)
      updates.prepTimeMinutes = formData.prepTimeMinutes ?? undefined;
    if (formData.cookTimeMinutes !== undefined)
      updates.cookTimeMinutes = formData.cookTimeMinutes ?? undefined;
    if (formData.sourceUrl !== undefined)
      updates.sourceUrl = formData.sourceUrl || undefined;
    if (formData.referenceCookbook !== undefined)
      updates.referenceCookbook = formData.referenceCookbook || undefined;
    if (formData.referencePageNumber !== undefined)
      updates.referencePageNumber = formData.referencePageNumber ?? undefined;
    if (formData.referenceOther !== undefined)
      updates.referenceOther = formData.referenceOther || undefined;
    if (formData.nutrition !== undefined)
      updates.nutrition = formData.nutrition ?? undefined;
    if (formData.images !== undefined)
      updates.images = formData.images;

    await db.recipes.update(id, updates);
  },

  async toggleFavorite(id: string): Promise<void> {
    const recipe = await this.getById(id);
    if (recipe) {
      await db.recipes.update(id, {
        isFavorite: !recipe.isFavorite,
        updatedAt: new Date(),
      });
    }
  },

  async delete(id: string): Promise<void> {
    await db.recipes.delete(id);
    // Also delete associated planned meals
    await db.plannedMeals.where('recipeId').equals(id).delete();
    // And recurring meals
    await db.recurringMeals.where('recipeId').equals(id).delete();
  },

  async bulkCreate(recipes: Recipe[]): Promise<void> {
    await db.recipes.bulkAdd(recipes);
  },

  async deleteAll(): Promise<void> {
    await db.recipes.clear();
  },
};
