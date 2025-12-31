import { Calendar, X } from 'lucide-react';
import type { Tag } from '@/types';
import type { DayTagRule } from '@/types/mealPlanAssistant';
import { Button } from '@/components/ui';
import styles from './DayTagRulesStep.module.css';

interface DayTagRulesStepProps {
  rules: DayTagRule[];
  availableTags: Tag[];
  onUpdateRule: (dayOfWeek: number, tagIds: string[], priority: 'required' | 'preferred') => void;
  onClear: () => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DayTagRulesStep({
  rules,
  availableTags,
  onUpdateRule,
  onClear,
}: DayTagRulesStepProps) {
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

      {hasAnyRules && (
        <div className={styles.clearButtonWrapper}>
          <Button variant="ghost" size="sm" onClick={onClear} leftIcon={<X size={14} />}>
            Clear all rules
          </Button>
        </div>
      )}

      <div className={styles.dayList}>
        {DAY_NAMES.map((dayName, dayIndex) => {
          const rule = getRuleForDay(dayIndex);
          const selectedTagIds = rule?.tagIds || [];

          return (
            <div key={dayIndex} className={styles.dayRow}>
              <div className={styles.dayHeader}>
                <span className={styles.dayName}>{dayName}</span>
                {selectedTagIds.length > 0 && (
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
              </div>
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
            </div>
          );
        })}
      </div>

      <div className={styles.presets}>
        <span className={styles.presetsLabel}>Quick presets:</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Find "Quick" or "Quick Prep" tag
            const quickTag = availableTags.find(
              (t) =>
                t.name.toLowerCase().includes('quick') || t.name.toLowerCase().includes('fast')
            );
            if (quickTag) {
              // Apply to weekdays (Mon-Fri)
              [1, 2, 3, 4, 5].forEach((day) => {
                onUpdateRule(day, [quickTag.id], 'preferred');
              });
            }
          }}
        >
          Quick weekdays
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Find "Slow Cooker" or "Instant Pot" tag
            const slowTag = availableTags.find(
              (t) =>
                t.name.toLowerCase().includes('slow') ||
                t.name.toLowerCase().includes('instant pot') ||
                t.name.toLowerCase().includes('crockpot')
            );
            if (slowTag) {
              // Apply to Sunday and Thursday
              [0, 4].forEach((day) => {
                onUpdateRule(day, [slowTag.id], 'preferred');
              });
            }
          }}
        >
          Slow cook Sun/Thu
        </Button>
      </div>

      {!hasAnyRules && (
        <div className={styles.emptyNote}>
          <p>No rules set. Recipes will be selected based on ingredients or randomly.</p>
        </div>
      )}
    </div>
  );
}
