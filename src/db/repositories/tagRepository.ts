import { db } from '../database';
import type { Tag } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const tagRepository = {
  async getAll(): Promise<Tag[]> {
    return db.tags.toArray();
  },

  async getSystemTags(): Promise<Tag[]> {
    return db.tags.filter((tag) => tag.isSystem === true).toArray();
  },

  async getCustomTags(): Promise<Tag[]> {
    return db.tags.filter((tag) => !tag.isSystem).toArray();
  },

  async getVisibleTags(): Promise<Tag[]> {
    return db.tags.filter((tag) => !tag.isHidden).toArray();
  },

  async getById(id: string): Promise<Tag | undefined> {
    return db.tags.get(id);
  },

  async getByIds(ids: string[]): Promise<Tag[]> {
    return db.tags.where('id').anyOf(ids).toArray();
  },

  async create(name: string, color?: string): Promise<Tag> {
    const tag: Tag = {
      id: uuidv4(),
      name,
      color,
      isSystem: false,
      isHidden: false,
    };
    await db.tags.add(tag);
    return tag;
  },

  async update(id: string, updates: Partial<Pick<Tag, 'name' | 'color' | 'isHidden'>>): Promise<void> {
    const tag = await this.getById(id);
    if (tag) {
      await db.tags.update(id, updates);
    }
  },

  async delete(id: string): Promise<void> {
    const tag = await this.getById(id);
    if (tag && !tag.isSystem) {
      await db.tags.delete(id);
      // Remove this tag from all recipes
      const recipesWithTag = await db.recipes
        .filter((recipe) => recipe.tags.includes(id))
        .toArray();
      for (const recipe of recipesWithTag) {
        await db.recipes.update(recipe.id, {
          tags: recipe.tags.filter((t) => t !== id),
        });
      }
    }
  },

  async toggleHidden(id: string): Promise<void> {
    const tag = await this.getById(id);
    if (tag) {
      await db.tags.update(id, { isHidden: !tag.isHidden });
    }
  },

  async bulkCreate(tags: Tag[]): Promise<void> {
    await db.tags.bulkAdd(tags);
  },
};
