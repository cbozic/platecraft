import { db } from '../database';
import type { Tag } from '@/types';
import { createTag } from '@/types/tags';

export const tagRepository = {
  async getAll(): Promise<Tag[]> {
    return db.tags.toArray();
  },

  async getByName(name: string): Promise<Tag | undefined> {
    // Use the unique index on name for efficient lookup
    // Case-insensitive lookup via filtering
    const allTags = await db.tags.toArray();
    return allTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
  },

  async getByNames(names: string[]): Promise<Tag[]> {
    // Case-insensitive batch lookup
    const lowerNames = names.map((n) => n.toLowerCase());
    const allTags = await db.tags.toArray();
    return allTags.filter((tag) => lowerNames.includes(tag.name.toLowerCase()));
  },

  async exists(name: string): Promise<boolean> {
    const tag = await this.getByName(name);
    return tag !== undefined;
  },

  async create(name: string, color?: string): Promise<Tag> {
    // Check for case-insensitive duplicate
    const existing = await this.getByName(name);
    if (existing) {
      throw new Error(`Tag "${name}" already exists`);
    }

    const tag = createTag(name, color);
    await db.tags.add(tag);
    return tag;
  },

  async update(
    currentName: string,
    updates: { name?: string; color?: string }
  ): Promise<void> {
    const tag = await this.getByName(currentName);
    if (!tag) {
      throw new Error(`Tag "${currentName}" not found`);
    }

    const newName = updates.name ?? tag.name;
    const newColor = updates.color !== undefined ? updates.color : tag.color;

    // If renaming, check for duplicates and cascade to recipes
    if (updates.name && updates.name.toLowerCase() !== tag.name.toLowerCase()) {
      const duplicate = await this.getByName(updates.name);
      if (duplicate) {
        throw new Error(`Tag "${updates.name}" already exists`);
      }

      // Cascade name change to all recipes
      const recipesWithTag = await db.recipes
        .filter((recipe) =>
          recipe.tags.some((t) => t.toLowerCase() === tag.name.toLowerCase())
        )
        .toArray();

      for (const recipe of recipesWithTag) {
        const updatedTags = recipe.tags.map((t) =>
          t.toLowerCase() === tag.name.toLowerCase() ? newName : t
        );
        await db.recipes.update(recipe.id, { tags: updatedTags });
      }
    }

    // Update the tag (using id as primary key)
    await db.tags.update(tag.id, { name: newName, color: newColor });
  },

  async delete(name: string): Promise<void> {
    const tag = await this.getByName(name);
    if (!tag) {
      return; // Already deleted or doesn't exist
    }

    // Remove this tag from all recipes
    const recipesWithTag = await db.recipes
      .filter((recipe) =>
        recipe.tags.some((t) => t.toLowerCase() === tag.name.toLowerCase())
      )
      .toArray();

    for (const recipe of recipesWithTag) {
      await db.recipes.update(recipe.id, {
        tags: recipe.tags.filter(
          (t) => t.toLowerCase() !== tag.name.toLowerCase()
        ),
      });
    }

    // Delete using id as primary key
    await db.tags.delete(tag.id);
  },

  async ensureExists(name: string, color?: string): Promise<Tag> {
    const existing = await this.getByName(name);
    if (existing) {
      return existing;
    }
    return this.create(name, color);
  },

  async bulkCreate(tags: Array<{ name: string; color?: string }>): Promise<void> {
    // Filter out duplicates (case-insensitive) before bulk adding
    const existingTags = await this.getAll();
    const existingLower = new Set(existingTags.map((t) => t.name.toLowerCase()));

    const newTags = tags
      .filter((tag) => !existingLower.has(tag.name.toLowerCase()))
      .map((tag) => createTag(tag.name, tag.color));

    if (newTags.length > 0) {
      await db.tags.bulkAdd(newTags);
    }
  },

  async bulkEnsureExist(tagNames: string[]): Promise<Tag[]> {
    // Ensure all tag names exist, creating them if needed
    const existingTags = await this.getAll();
    const existingMap = new Map(
      existingTags.map((t) => [t.name.toLowerCase(), t])
    );

    const result: Tag[] = [];
    const toCreate: Tag[] = [];

    for (const name of tagNames) {
      const existing = existingMap.get(name.toLowerCase());
      if (existing) {
        result.push(existing);
      } else {
        const newTag = createTag(name);
        toCreate.push(newTag);
        result.push(newTag);
        existingMap.set(name.toLowerCase(), newTag);
      }
    }

    if (toCreate.length > 0) {
      await db.tags.bulkAdd(toCreate);
    }

    return result;
  },
};
