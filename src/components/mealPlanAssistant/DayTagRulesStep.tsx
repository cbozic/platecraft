import { Calendar, X, SkipForward } from 'lucide-react';
import type { Tag } from '@/types';
import type { DayTagRule } from '@/types/mealPlanAssistant';
import { Button } from '@/components/ui';
import { getDayNames } from '@/utils/calendar';
import styles from './DayTagRulesStep.module.css';

interface DayTagRulesStepProps {
  rules: DayTagRule[];
  skippedDays: number[];
  availableTags: Tag[];
  weekStartsOn?: 0 | 1;
  onUpdateRule: (dayOfWeek: number, tagIds: string[], priority: 'required' | 'preferred') => void;
  onClear: () => void;
  onToggleSkipDay: (dayOfWeek: number) => void;
}

export function DayTagRulesStep({
  rules,
  skippedDays,
  availableTags,
  weekStartsOn = 0,
  onUpdateRule,
  onClear,
  onToggleSkipDay,
}: DayTagRulesStepProps) {
  // Get day names and indices in the correct order based on week start
  const dayNames = getDayNames(weekStartsOn, 'long');
  const dayIndices = weekStartsOn === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  const getRuleForDay = (dayOfWeek: number): DayTagRule | undefined => {
    return rules.find((r) => r.dayOfWeek === dayOfWeek);
  };

  const handleTagToggle = (dayOfWeek: number, tagId: string) => {
    const existingRule = getRuleForDay(dayOfWeek);
    const currentTagIds = existingRule?.tagIds || [];
    const priority = existingRule?.priority || 'preferred';

    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];

    onUpdateRule(dayOfWeek, newTagIds, priority);
  };

  const handlePriorityChange = (dayOfWeek: number, priority: 'required' | 'preferred') => {
    const existingRule = getRuleForDay(dayOfWeek);
    if (existingRule) {
      onUpdateRule(dayOfWeek, existingRule.tagIds, priority);
    }
  };

  const hasAnyRules = rules.length > 0 && rules.some((r) => r.tagIds.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Calendar size={20} />
        <div>
          <h3 className={styles.title}>Day-of-week preferences</h3>
          <p className={styles.description}>
            Set tag preferences for specific days. For example, "Quick Prep" for busy weekdays.
          </p>
        </div>
      </div>

      <div className={styles.presets}>
        <span className={styles.presetsLabel}>Quick presets:</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Find "Quick Prep" tag specifically (not "Quick Breakfast" or similar)
            const quickTag = availableTags.find(
              (t) =>
                t.name.toLowerCase() === 'quick prep' ||
                t.name.toLowerCase() === 'quick' ||
                t.name.toLowerCase() === 'fast'
            );
            if (quickTag) {
              // Apply to Tuesday only (day 2), merging with existing tags
              const existingRule = getRuleForDay(2);
              const existingTagIds = existingRule?.tagIds || [];
              const mergedTagIds = existingTagIds.includes(quickTag.id)
                ? existingTagIds
                : [...existingTagIds, quickTag.id];
              onUpdateRule(2, mergedTagIds, existingRule?.priority || 'preferred');
            }
          }}
        >
          Quick Tuesdays
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Find both "Slow Cooker" and "Instant Pot" tags
            const slowCookerTag = availableTags.find(
              (t) =>
                t.name.toLowerCase().includes('slow cooker') ||
                t.name.toLowerCase().includes('crockpot')
            );
            const instantPotTag = availableTags.find(
              (t) => t.name.toLowerCase().includes('instant pot')
            );

            // Collect all matching tags
            const tagsToAdd: string[] = [];
            if (slowCookerTag) tagsToAdd.push(slowCookerTag.id);
            if (instantPotTag) tagsToAdd.push(instantPotTag.id);

            if (tagsToAdd.length > 0) {
              // Apply to Sunday and Thursday, merging with existing tags
              [0, 4].forEach((day) => {
                const existingRule = getRuleForDay(day);
                const existingTagIds = existingRule?.tagIds || [];
                const mergedTagIds = [...existingTagIds];
                for (const tagId of tagsToAdd) {
                  if (!mergedTagIds.includes(tagId)) {
                    mergedTagIds.push(tagId);
                  }
                }
                onUpdateRule(day, mergedTagIds, existingRule?.priority || 'preferred');
              });
            }
          }}
        >
          Slow cook Sun/Thu
        </Button>
      </div>

      {hasAnyRules && (
        <div className={styles.clearButtonWrapper}>
          <Button variant="ghost" size="sm" onClick={onClear} leftIcon={<X size={14} />}>
            Clear all rules
          </Button>
        </div>
      )}

      <div className={styles.dayList}>
        {dayNames.map((dayName, index) => {
          const dayIndex = dayIndices[index]; // Map display index to actual day of week (0-6)
          const rule = getRuleForDay(dayIndex);
          const selectedTagIds = rule?.tagIds || [];
          const isSkipped = skippedDays.includes(dayIndex);

          return (
            <div key={dayIndex} className={`${styles.dayRow} ${isSkipped ? styles.skipped : ''}`}>
              <div className={styles.dayHeader}>
                <label className={styles.skipLabel}>
                  <input
                    type="checkbox"
                    checked={isSkipped}
                    onChange={() => onToggleSkipDay(dayIndex)}
                    className={styles.skipCheckbox}
                  />
                  <SkipForward size={14} className={styles.skipIcon} />
                </label>
                <span className={styles.dayName}>{dayName}</span>
                {selectedTagIds.length > 0 && !isSkipped && (
                  <select
                    value={rule?.priority || 'preferred'}
                    onChange={(e) =>
                      handlePriorityChange(dayIndex, e.target.value as 'required' | 'preferred')
                    }
                    className={styles.prioritySelect}
                  >
                    <option value="preferred">Preferred</option>
                    <option value="required">Required</option>
                  </select>
                )}
                {isSkipped && <span className={styles.skippedLabel}>Skipped</span>}
              </div>
              {!isSkipped && (
                <div className={styles.tagList}>
                  {availableTags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        className={`${styles.tagChip} ${isSelected ? styles.selected : ''}`}
                        onClick={() => handleTagToggle(dayIndex, tag.id)}
                        style={
                          isSelected
                            ? { backgroundColor: tag.color, borderColor: tag.color }
                            : { borderColor: tag.color, color: tag.color }
                        }
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                  {availableTags.length === 0 && (
                    <span className={styles.noTags}>No tags available</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!hasAnyRules && (
        <div className={styles.emptyNote}>
          <p>No rules set. Recipes will be selected based on ingredients or randomly.</p>
        </div>
      )}
    </div>
  );
}
