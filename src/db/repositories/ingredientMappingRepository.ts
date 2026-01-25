import { db } from '../database';
import type { IngredientMapping } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { settingsRepository } from './settingsRepository';

export const ingredientMappingRepository = {
  async getAll(): Promise<IngredientMapping[]> {
    return db.ingredientMappings.toArray();
  },

  async getById(id: string): Promise<IngredientMapping | undefined> {
    return db.ingredientMappings.get(id);
  },

  async getByCanonicalName(name: string): Promise<IngredientMapping | undefined> {
    const lowerName = name.toLowerCase();
    const all = await this.getAll();
    return all.find((m) => m.canonicalName.toLowerCase() === lowerName);
  },

  async findByVariant(variantName: string): Promise<IngredientMapping | undefined> {
    const lowerName = variantName.toLowerCase();
    const all = await this.getAll();
    return all.find(
      (m) =>
        m.canonicalName.toLowerCase() === lowerName ||
        m.variants.some((v) => v.toLowerCase() === lowerName)
    );
  },

  async create(
    canonicalName: string,
    variants: string[],
    isUserConfirmed: boolean = true
  ): Promise<IngredientMapping> {
    const now = new Date();
    const mapping: IngredientMapping = {
      id: uuidv4(),
      canonicalName,
      variants: variants.map((v) => v.toLowerCase()),
      createdAt: now,
      updatedAt: now,
      isUserConfirmed,
    };
    await db.ingredientMappings.add(mapping);
    await settingsRepository.touchLastModified();
    return mapping;
  },

  async addVariant(mappingId: string, variant: string): Promise<void> {
    const mapping = await this.getById(mappingId);
    if (!mapping) {
      throw new Error(`Ingredient mapping ${mappingId} not found`);
    }

    const lowerVariant = variant.toLowerCase();
    if (!mapping.variants.includes(lowerVariant)) {
      const updatedVariants = [...mapping.variants, lowerVariant];
      await db.ingredientMappings.update(mappingId, {
        variants: updatedVariants,
        updatedAt: new Date(),
      });
      await settingsRepository.touchLastModified();
    }
  },

  async removeVariant(mappingId: string, variant: string): Promise<void> {
    const mapping = await this.getById(mappingId);
    if (!mapping) {
      throw new Error(`Ingredient mapping ${mappingId} not found`);
    }

    const lowerVariant = variant.toLowerCase();
    const updatedVariants = mapping.variants.filter((v) => v !== lowerVariant);
    await db.ingredientMappings.update(mappingId, {
      variants: updatedVariants,
      updatedAt: new Date(),
    });
    await settingsRepository.touchLastModified();
  },

  async update(
    id: string,
    updates: Partial<Pick<IngredientMapping, 'canonicalName' | 'variants' | 'isUserConfirmed'>>
  ): Promise<void> {
    const mapping = await this.getById(id);
    if (!mapping) {
      throw new Error(`Ingredient mapping ${id} not found`);
    }

    await db.ingredientMappings.update(id, {
      ...updates,
      variants: updates.variants?.map((v) => v.toLowerCase()),
      updatedAt: new Date(),
    });
    await settingsRepository.touchLastModified();
  },

  async delete(id: string): Promise<void> {
    await db.ingredientMappings.delete(id);
    await settingsRepository.touchLastModified();
  },

  async clearAll(): Promise<void> {
    await db.ingredientMappings.clear();
  },

  async bulkCreate(
    mappings: Array<{ canonicalName: string; variants: string[]; isUserConfirmed?: boolean }>
  ): Promise<IngredientMapping[]> {
    const now = new Date();
    const toAdd: IngredientMapping[] = mappings.map((m) => ({
      id: uuidv4(),
      canonicalName: m.canonicalName,
      variants: m.variants.map((v) => v.toLowerCase()),
      createdAt: now,
      updatedAt: now,
      isUserConfirmed: m.isUserConfirmed ?? true,
    }));
    await db.ingredientMappings.bulkAdd(toAdd);
    return toAdd;
  },

  async findCanonicalName(ingredientName: string): Promise<string | null> {
    const mapping = await this.findByVariant(ingredientName);
    return mapping?.canonicalName ?? null;
  },

  async getMappingsMap(): Promise<Map<string, string>> {
    const all = await this.getAll();
    const map = new Map<string, string>();
    for (const mapping of all) {
      // Map canonical name to itself
      map.set(mapping.canonicalName.toLowerCase(), mapping.canonicalName);
      // Map all variants to canonical name
      for (const variant of mapping.variants) {
        map.set(variant.toLowerCase(), mapping.canonicalName);
      }
    }
    return map;
  },
};
