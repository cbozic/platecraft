import { db } from '../database';
import type { UserSettings, MealSlot, StoreSectionInfo, AiParsingMode } from '@/types';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { v4 as uuidv4 } from 'uuid';

const SETTINGS_ID = 'user-settings';

export const settingsRepository = {
  async get(): Promise<UserSettings> {
    const settings = await db.settings.get(SETTINGS_ID);
    if (!settings) {
      // Return default settings if not found
      return DEFAULT_SETTINGS;
    }
    // Remove the id field before returning
    const { id, ...userSettings } = settings;
    return userSettings as UserSettings;
  },

  async update(updates: Partial<UserSettings>): Promise<void> {
    await db.settings.update(SETTINGS_ID, updates);
  },

  // Theme
  async setTheme(theme: UserSettings['theme']): Promise<void> {
    await this.update({ theme });
  },

  // Unit system
  async setDefaultUnitSystem(system: UserSettings['defaultUnitSystem']): Promise<void> {
    await this.update({ defaultUnitSystem: system });
  },

  // Default servings
  async setDefaultServings(servings: number): Promise<void> {
    await this.update({ defaultServings: servings });
  },

  // Calendar start day
  async setCalendarStartDay(day: UserSettings['calendarStartDay']): Promise<void> {
    await this.update({ calendarStartDay: day });
  },

  // Meal slots
  async getMealSlots(): Promise<MealSlot[]> {
    const settings = await this.get();
    return settings.mealSlots;
  },

  async addMealSlot(name: string): Promise<MealSlot> {
    const settings = await this.get();
    const maxOrder = Math.max(...settings.mealSlots.map((s) => s.order), -1);

    const newSlot: MealSlot = {
      id: uuidv4(),
      name,
      order: maxOrder + 1,
      isDefault: false,
    };

    await this.update({
      mealSlots: [...settings.mealSlots, newSlot],
    });

    return newSlot;
  },

  async updateMealSlot(id: string, name: string): Promise<void> {
    const settings = await this.get();
    const updatedSlots = settings.mealSlots.map((slot) =>
      slot.id === id ? { ...slot, name } : slot
    );
    await this.update({ mealSlots: updatedSlots });
  },

  async removeMealSlot(id: string): Promise<void> {
    const settings = await this.get();
    const slot = settings.mealSlots.find((s) => s.id === id);
    if (slot?.isDefault) {
      throw new Error('Cannot remove default meal slot');
    }
    const updatedSlots = settings.mealSlots.filter((s) => s.id !== id);
    await this.update({ mealSlots: updatedSlots });
  },

  async reorderMealSlots(orderedIds: string[]): Promise<void> {
    const settings = await this.get();
    const updatedSlots = orderedIds.map((id, index) => {
      const slot = settings.mealSlots.find((s) => s.id === id);
      if (!slot) throw new Error(`Meal slot not found: ${id}`);
      return { ...slot, order: index };
    });
    await this.update({ mealSlots: updatedSlots });
  },

  // Store sections
  async getStoreSections(): Promise<StoreSectionInfo[]> {
    const settings = await this.get();
    return settings.storeSections;
  },

  async addStoreSection(name: string): Promise<StoreSectionInfo> {
    const settings = await this.get();
    const maxOrder = Math.max(...settings.storeSections.map((s) => s.order), -1);

    const newSection: StoreSectionInfo = {
      id: uuidv4(),
      name,
      order: maxOrder + 1,
      isCustom: true,
    };

    await this.update({
      storeSections: [...settings.storeSections, newSection],
    });

    return newSection;
  },

  async updateStoreSection(id: string, name: string): Promise<void> {
    const settings = await this.get();
    const updatedSections = settings.storeSections.map((section) =>
      section.id === id ? { ...section, name } : section
    );
    await this.update({ storeSections: updatedSections });
  },

  async removeStoreSection(id: string): Promise<void> {
    const settings = await this.get();
    const section = settings.storeSections.find((s) => s.id === id);
    if (!section?.isCustom) {
      throw new Error('Cannot remove default store section');
    }
    const updatedSections = settings.storeSections.filter((s) => s.id !== id);
    await this.update({ storeSections: updatedSections });
  },

  async reorderStoreSections(orderedIds: string[]): Promise<void> {
    const settings = await this.get();
    const updatedSections = orderedIds.map((id, index) => {
      const section = settings.storeSections.find((s) => s.id === id);
      if (!section) throw new Error(`Store section not found: ${id}`);
      return { ...section, order: index };
    });
    await this.update({ storeSections: updatedSections });
  },

  // Daily calorie goal
  async setDailyCalorieGoal(goal: number | undefined): Promise<void> {
    await this.update({ dailyCalorieGoal: goal });
  },

  // Anthropic API key
  async setAnthropicApiKey(apiKey: string | undefined): Promise<void> {
    await this.update({ anthropicApiKey: apiKey });
  },

  async getAnthropicApiKey(): Promise<string | undefined> {
    const settings = await this.get();
    return settings.anthropicApiKey;
  },

  async hasAnthropicApiKey(): Promise<boolean> {
    const apiKey = await this.getAnthropicApiKey();
    return !!apiKey && apiKey.length > 0;
  },

  // Preferred import mode
  async setPreferredImportMode(mode: AiParsingMode): Promise<void> {
    await this.update({ preferredImportMode: mode });
  },

  async getPreferredImportMode(): Promise<AiParsingMode> {
    const settings = await this.get();
    return settings.preferredImportMode || 'manual';
  },

  // Reset to defaults
  async reset(): Promise<void> {
    await db.settings.put({ ...DEFAULT_SETTINGS, id: SETTINGS_ID });
  },
};
