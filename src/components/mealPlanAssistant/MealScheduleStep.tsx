import { useState, useMemo, useEffect } from 'react';
import {
  format,
  addDays,
  addMonths,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  differenceInDays,
  eachDayOfInterval,
} from 'date-fns';
import { CalendarDays, Utensils, Users, Heart, Shuffle, ChevronDown, ChevronUp, Settings, X } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { getDayNames } from '@/utils/calendar';
import type { MealSlot, Tag } from '@/types';
import type { WeekdayConfig, MealSlotTagConfig, MealSchedulePreset } from '@/types/mealPlanAssistant';
import styles from './MealScheduleStep.module.css';

interface MealScheduleStepProps {
  startDate: Date;
  endDate: Date;
  weekdayConfigs: WeekdayConfig[];
  mealSlots: MealSlot[];
  availableTags: Tag[];
  weekStartsOn?: 0 | 1;
  defaultServings: number;
  favoritesWeight: number;
  onDateRangeChange: (startDate: Date, endDate: Date) => void;
  onToggleMealSlot: (dayOfWeek: number, slotId: string, enabled: boolean) => void;
  onUpdateMealSlotTags: (dayOfWeek: number, slotId: string, tagConfig: MealSlotTagConfig | undefined) => void;
  onApplyPreset: (preset: MealSchedulePreset) => void;
  onClearSchedule: () => void;
  onServingsChange: (servings: number) => void;
  onFavoritesWeightChange: (weight: number) => void;
}

type QuickRange = 'this-week' | 'next-week' | 'next-7-days' | 'next-14-days' | 'current-month' | 'next-month' | 'custom';

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: 'this-week', label: 'This Week' },
  { id: 'next-week', label: 'Next Week' },
  { id: 'next-7-days', label: 'Next 7 Days' },
  { id: 'next-14-days', label: 'Next 2 Weeks' },
  { id: 'current-month', label: 'Current Month' },
  { id: 'next-month', label: 'Next Month' },
  { id: 'custom', label: 'Custom' },
];

const MEAL_SCHEDULE_PRESETS: { id: MealSchedulePreset; label: string; description: string }[] = [
  { id: 'dinner-only', label: 'Dinners Only', description: 'Dinner every day' },
  { id: 'lunch-dinner', label: 'Lunch & Dinner', description: 'Lunch and dinner daily' },
  { id: 'weekday-dinners', label: 'Weekday Dinners', description: 'Dinner Mon-Fri only' },
  { id: 'weekend-lunches', label: 'Weekend Lunches', description: 'Lunch on Sat & Sun only' },
];

export function MealScheduleStep({
  startDate,
  endDate,
  weekdayConfigs,
  mealSlots,
  availableTags,
  weekStartsOn = 0,
  defaultServings,
  favoritesWeight,
  onDateRangeChange,
  onToggleMealSlot,
  onUpdateMealSlotTags,
  onApplyPreset,
  onClearSchedule,
  onServingsChange,
  onFavoritesWeightChange,
}: MealScheduleStepProps) {
  const [customStart, setCustomStart] = useState(format(startDate, 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endDate, 'yyyy-MM-dd'));
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [servingsInput, setServingsInput] = useState(defaultServings.toString());
  const [expandedSlots, setExpandedSlots] = useState<Set<string>>(new Set());

  // Sync local servings input with prop changes
  useEffect(() => {
    setServingsInput(defaultServings.toString());
  }, [defaultServings]);

  // Get day names and indices in the correct order based on week start
  const dayNames = getDayNames(weekStartsOn, 'short');
  const dayIndices = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  // Determine which quick range is currently selected
  const currentQuickRange = useMemo((): QuickRange => {
    if (isCustomMode) {
      return 'custom';
    }

    const today = new Date();
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 });
    const nextWeekStart = startOfWeek(addDays(today, 7), { weekStartsOn: 0 });
    const nextWeekEnd = endOfWeek(addDays(today, 7), { weekStartsOn: 0 });
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const nextMonthStart = startOfMonth(addMonths(today, 1));
    const nextMonthEnd = endOfMonth(addMonths(today, 1));

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    if (startStr === format(thisWeekStart, 'yyyy-MM-dd') && endStr === format(thisWeekEnd, 'yyyy-MM-dd')) {
      return 'this-week';
    }
    if (startStr === format(nextWeekStart, 'yyyy-MM-dd') && endStr === format(nextWeekEnd, 'yyyy-MM-dd')) {
      return 'next-week';
    }
    if (startStr === format(today, 'yyyy-MM-dd') && endStr === format(addDays(today, 6), 'yyyy-MM-dd')) {
      return 'next-7-days';
    }
    if (startStr === format(today, 'yyyy-MM-dd') && endStr === format(addDays(today, 13), 'yyyy-MM-dd')) {
      return 'next-14-days';
    }
    if (startStr === format(currentMonthStart, 'yyyy-MM-dd') && endStr === format(currentMonthEnd, 'yyyy-MM-dd')) {
      return 'current-month';
    }
    if (startStr === format(nextMonthStart, 'yyyy-MM-dd') && endStr === format(nextMonthEnd, 'yyyy-MM-dd')) {
      return 'next-month';
    }
    return 'custom';
  }, [startDate, endDate, isCustomMode]);

  const handleQuickRangeSelect = (range: QuickRange) => {
    const today = new Date();

    if (range !== 'custom') {
      setIsCustomMode(false);
    }

    switch (range) {
      case 'this-week': {
        const start = startOfWeek(today, { weekStartsOn: 0 });
        const end = endOfWeek(today, { weekStartsOn: 0 });
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-week': {
        const start = startOfWeek(addDays(today, 7), { weekStartsOn: 0 });
        const end = endOfWeek(addDays(today, 7), { weekStartsOn: 0 });
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-7-days': {
        const start = today;
        const end = addDays(today, 6);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-14-days': {
        const start = today;
        const end = addDays(today, 13);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'current-month': {
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-month': {
        const start = startOfMonth(addMonths(today, 1));
        const end = endOfMonth(addMonths(today, 1));
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'custom':
        setIsCustomMode(true);
        break;
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStart(value);
      onDateRangeChange(new Date(value), endDate);
    } else {
      setCustomEnd(value);
      onDateRangeChange(startDate, new Date(value));
    }
  };

  const toggleSlotExpansion = (dayOfWeek: number, slotId: string) => {
    const key = `${dayOfWeek}-${slotId}`;
    setExpandedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleTagToggle = (dayOfWeek: number, slotId: string, tagId: string) => {
    const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
    const slotConfig = dayConfig?.slots.find((s) => s.slotId === slotId);
    const currentTags = slotConfig?.tagConfig?.tagIds || [];
    const currentPriority = slotConfig?.tagConfig?.priority || 'preferred';

    const newTagIds = currentTags.includes(tagId)
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId];

    if (newTagIds.length === 0) {
      onUpdateMealSlotTags(dayOfWeek, slotId, undefined);
    } else {
      onUpdateMealSlotTags(dayOfWeek, slotId, { tagIds: newTagIds, priority: currentPriority });
    }
  };

  const handlePriorityChange = (dayOfWeek: number, slotId: string, priority: 'required' | 'preferred') => {
    const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
    const slotConfig = dayConfig?.slots.find((s) => s.slotId === slotId);
    const currentTags = slotConfig?.tagConfig?.tagIds || [];

    if (currentTags.length > 0) {
      onUpdateMealSlotTags(dayOfWeek, slotId, { tagIds: currentTags, priority });
    }
  };

  // Helper to find tag by name patterns with optional exclusions
  const findTagByName = (patterns: string[], excludePatterns: string[] = []): Tag | undefined => {
    return availableTags.find((t) => {
      const nameLower = t.name.toLowerCase();
      const hasMatch = patterns.some((pattern) => nameLower.includes(pattern.toLowerCase()));
      const hasExclusion = excludePatterns.some((pattern) => nameLower.includes(pattern.toLowerCase()));
      return hasMatch && !hasExclusion;
    });
  };

  // Apply a tag preset to specific days - supports multiple tag patterns
  const applyTagPreset = (
    tagPatternsList: string[][],
    days: number[],
    slotId: string = 'dinner',
    excludePatterns: string[] = []
  ) => {
    // Find all matching tags
    const tags = tagPatternsList
      .map((patterns) => findTagByName(patterns, excludePatterns))
      .filter((tag): tag is Tag => tag !== undefined);

    if (tags.length === 0) return;

    days.forEach((dayOfWeek) => {
      const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
      const slotConfig = dayConfig?.slots.find((s) => s.slotId === slotId);

      if (slotConfig?.isEnabled) {
        const existingTags = slotConfig.tagConfig?.tagIds || [];
        const newTagIds = tags
          .map((tag) => tag.id)
          .filter((tagId) => !existingTags.includes(tagId));

        if (newTagIds.length > 0) {
          onUpdateMealSlotTags(dayOfWeek, slotId, {
            tagIds: [...existingTags, ...newTagIds],
            priority: slotConfig.tagConfig?.priority || 'preferred',
          });
        }
      }
    });
  };

  // Calculate total meals
  const totalDays = differenceInDays(endDate, startDate) + 1;
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const totalMeals = days.reduce((count, day) => {
    const dayOfWeek = day.getDay();
    const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayOfWeek);
    if (!dayConfig) return count;
    return count + dayConfig.slots.filter((s) => s.isEnabled).length;
  }, 0);

  const hasAnyMealsSelected = weekdayConfigs.some((dc) => dc.slots.some((s) => s.isEnabled));

  return (
    <div className={styles.container}>
      {/* Date Range Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <CalendarDays size={20} />
          <div>
            <h3 className={styles.title}>Date Range</h3>
            <p className={styles.description}>Select the period to fill with meals.</p>
          </div>
        </div>

        <div className={styles.rangeGrid}>
          {QUICK_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              className={`${styles.rangeButton} ${currentQuickRange === range.id ? styles.selected : ''}`}
              onClick={() => handleQuickRangeSelect(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>

        {currentQuickRange === 'custom' && (
          <div className={styles.customDates}>
            <Input
              type="date"
              label="Start Date"
              value={customStart}
              onChange={(e) => handleCustomDateChange('start', e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              value={customEnd}
              onChange={(e) => handleCustomDateChange('end', e.target.value)}
            />
          </div>
        )}

        <div className={styles.datePreview}>
          {format(startDate, 'MMM d, yyyy')} — {format(endDate, 'MMM d, yyyy')}
          <span className={styles.dayCount}>({totalDays} days)</span>
        </div>
      </div>

      {/* Meal Schedule Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Utensils size={20} />
          <div>
            <h3 className={styles.title}>Meal Schedule</h3>
            <p className={styles.description}>
              Choose which meals to plan for each day. Expand meals to add tag preferences.
            </p>
          </div>
        </div>

        {/* Meal Presets */}
        <div className={styles.presets}>
          <span className={styles.presetsLabel}>Meals:</span>
          {MEAL_SCHEDULE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="ghost"
              size="sm"
              onClick={() => onApplyPreset(preset.id)}
              title={preset.description}
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSchedule}
            title="Clear all meal and tag selections"
          >
            <X size={14} />
            Clear
          </Button>
        </div>

        {/* Tag Presets */}
        <div className={styles.presets}>
          <span className={styles.presetsLabel}>Tags:</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              applyTagPreset(
                [
                  ['meal prep', 'meal-prep'],
                  ['quick prep', 'quick', 'fast', '30 minute', '30-minute'],
                ],
                [2],
                'dinner',
                ['breakfast']
              )
            }
            title="Add Meal Prep Friendly & Quick Prep tags to Tuesday dinners"
          >
            Quick Tuesdays
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              applyTagPreset(
                [
                  ['slow cooker', 'crockpot', 'crock pot'],
                  ['instant pot', 'instantpot'],
                ],
                [2, 4],
                'dinner',
                ['breakfast']
              )
            }
            title="Add Slow Cooker & Instant Pot tags to Tuesday & Thursday dinners"
          >
            Slow Cook Tue/Thu
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => applyTagPreset([['make ahead', 'meal prep', 'freezer']], [0])}
            title="Add Make Ahead tag to Sunday dinners"
          >
            Make Ahead Sundays
          </Button>
        </div>

        {/* Day Cards Grid */}
        <div className={styles.dayCardsGrid}>
          {dayNames.map((dayName, index) => {
            const dayIndex = dayIndices[index];
            const dayConfig = weekdayConfigs.find((dc) => dc.dayOfWeek === dayIndex);

            return (
              <div key={dayIndex} className={styles.dayCard}>
                <div className={styles.dayCardHeader}>
                  <h4 className={styles.dayCardName}>{dayName}</h4>
                </div>
                <div className={styles.dayCardBody}>
                  {mealSlots.map((slot) => {
                    const slotConfig = dayConfig?.slots.find((s) => s.slotId === slot.id);
                    const isEnabled = slotConfig?.isEnabled ?? false;
                    const hasTagConfig = slotConfig?.tagConfig && slotConfig.tagConfig.tagIds.length > 0;
                    const isExpanded = expandedSlots.has(`${dayIndex}-${slot.id}`);

                    return (
                      <div key={slot.id} className={styles.mealSlotRow}>
                        <div className={styles.mealSlotHeader}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => onToggleMealSlot(dayIndex, slot.id, e.target.checked)}
                            className={styles.mealCheckbox}
                          />
                          <span className={`${styles.mealSlotName} ${!isEnabled ? styles.disabled : ''}`}>
                            {slot.name}
                          </span>
                          {isEnabled && (
                            <button
                              type="button"
                              className={`${styles.expandButton} ${hasTagConfig ? styles.hasConfig : ''}`}
                              onClick={() => toggleSlotExpansion(dayIndex, slot.id)}
                              title="Configure tags"
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>

                        {isEnabled && isExpanded && (
                          <div className={styles.tagConfigPanel}>
                            <div className={styles.tagList}>
                              {availableTags.map((tag) => {
                                const isSelected = slotConfig?.tagConfig?.tagIds.includes(tag.id) ?? false;
                                return (
                                  <button
                                    key={tag.id}
                                    type="button"
                                    className={`${styles.tagChip} ${isSelected ? styles.selected : ''}`}
                                    onClick={() => handleTagToggle(dayIndex, slot.id, tag.id)}
                                  >
                                    {tag.name}
                                  </button>
                                );
                              })}
                              {availableTags.length === 0 && (
                                <span className={styles.noTags}>No tags</span>
                              )}
                            </div>
                            {hasTagConfig && (
                              <div className={styles.priorityRow}>
                                <span className={styles.priorityLabel}>Priority:</span>
                                <select
                                  value={slotConfig?.tagConfig?.priority || 'preferred'}
                                  onChange={(e) =>
                                    handlePriorityChange(dayIndex, slot.id, e.target.value as 'required' | 'preferred')
                                  }
                                  className={styles.prioritySelect}
                                >
                                  <option value="preferred">Preferred</option>
                                  <option value="required">Required</option>
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!hasAnyMealsSelected && (
          <div className={styles.warning}>Please select at least one meal to plan.</div>
        )}
      </div>

      {/* Settings Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Settings size={20} />
          <div>
            <h3 className={styles.title}>Settings</h3>
            <p className={styles.description}>Configure servings and recipe selection preferences.</p>
          </div>
        </div>

        <div className={styles.settingsGrid}>
          {/* Servings */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <Users size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Default Servings
            </div>
            <div className={styles.servingsInput}>
              <Input
                type="number"
                value={servingsInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setServingsInput(value);
                  const numValue = parseInt(value);
                  if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
                    onServingsChange(numValue);
                  }
                }}
                onBlur={() => {
                  const numValue = parseInt(servingsInput);
                  if (isNaN(numValue) || numValue < 1) {
                    setServingsInput('1');
                    onServingsChange(1);
                  } else if (numValue > 20) {
                    setServingsInput('20');
                    onServingsChange(20);
                  }
                }}
                min={1}
                max={20}
                className={styles.servingsField}
              />
              <span className={styles.servingsLabel}>per meal</span>
            </div>
          </div>

          {/* Favorites Weight */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <Heart size={16} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Recipe Selection
            </div>
            <div className={styles.sliderContainer}>
              <div className={styles.sliderLabels}>
                <span className={styles.sliderLabelLeft}>
                  <Shuffle size={14} />
                  Random
                </span>
                <span className={styles.sliderLabelRight}>
                  <Heart size={14} />
                  Favorites
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={favoritesWeight}
                onChange={(e) => onFavoritesWeightChange(parseInt(e.target.value))}
                className={styles.slider}
              />
              <div className={styles.sliderValue}>
                {favoritesWeight === 0
                  ? 'All random'
                  : favoritesWeight === 100
                    ? 'Favorites only'
                    : favoritesWeight < 50
                      ? `${100 - favoritesWeight}% random, ${favoritesWeight}% favorites`
                      : `${favoritesWeight}% favorites, ${100 - favoritesWeight}% random`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {hasAnyMealsSelected && (
        <div className={styles.summary}>
          Planning <strong>{totalMeals}</strong> meals over {totalDays} days
        </div>
      )}
    </div>
  );
}
