import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  CheckCircle,
  RefreshCw,
  Lock,
  X,
  ShoppingBasket,
  AlertTriangle,
  ArrowRightLeft,
} from 'lucide-react';
import { Button } from '@/components/ui';
import type { GeneratedMealPlan, DayTagRule } from '@/types/mealPlanAssistant';
import { RecipeSwapModal } from './RecipeSwapModal';
import styles from './PlanPreviewStep.module.css';

interface PlanPreviewStepProps {
  plan: GeneratedMealPlan;
  dayTagRules: DayTagRule[];
  onSwap: (mealId: string, newRecipeId: string, newRecipeTitle: string) => void;
  onReject: (mealId: string) => void;
  onLock: (mealId: string) => void;
  onRegenerate: () => void;
  getAlternatives: (mealId: string) => Promise<{ id: string; title: string }[]>;
}

const MATCH_TYPE_COLORS = {
  ingredient: 'var(--color-success, #22c55e)',
  tag: 'var(--color-info, #3b82f6)',
  fallback: 'var(--color-text-muted)',
};

const MATCH_TYPE_LABELS = {
  ingredient: 'Ingredient match',
  tag: 'Tag match',
  fallback: 'Random',
};

export function PlanPreviewStep({
  plan,
  dayTagRules: _dayTagRules,
  onSwap,
  onReject,
  onLock,
  onRegenerate,
  getAlternatives,
}: PlanPreviewStepProps) {
  const [swapModalMealId, setSwapModalMealId] = useState<string | null>(null);

  // Group meals by date
  const mealsByDate = useMemo(() => {
    const grouped = new Map<string, typeof plan.proposedMeals>();

    plan.proposedMeals.forEach((meal) => {
      const existing = grouped.get(meal.date) || [];
      existing.push(meal);
      grouped.set(meal.date, existing);
    });

    // Sort dates
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, meals]) => ({
        date,
        meals: meals.sort((a, b) => a.slotName.localeCompare(b.slotName)),
      }));
  }, [plan.proposedMeals]);

  const activeMeals = plan.proposedMeals.filter((m) => !m.isRejected);
  const rejectedCount = plan.proposedMeals.filter((m) => m.isRejected).length;

  const mealToSwap = plan.proposedMeals.find((m) => m.id === swapModalMealId);

  return (
    <div className={styles.container}>
      {/* Summary stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{activeMeals.length}</span>
          <span className={styles.statLabel}>Meals planned</span>
        </div>
        <div className={styles.stat}>
          <span
            className={styles.statValue}
            style={{ color: 'var(--color-success)' }}
          >
            {plan.coverage.ingredientMatches}
          </span>
          <span className={styles.statLabel}>Ingredient matches</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue} style={{ color: 'var(--color-info)' }}>
            {plan.coverage.tagMatches}
          </span>
          <span className={styles.statLabel}>Tag matches</span>
        </div>
        {rejectedCount > 0 && (
          <div className={styles.stat}>
            <span className={styles.statValue} style={{ color: 'var(--color-error)' }}>
              {rejectedCount}
            </span>
            <span className={styles.statLabel}>Rejected</span>
          </div>
        )}
      </div>

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <div className={styles.warnings}>
          {plan.warnings.map((warning, idx) => (
            <div key={idx} className={styles.warning}>
              <AlertTriangle size={14} />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Ingredient usage */}
      {plan.ingredientUsage.length > 0 && (
        <div className={styles.ingredientUsage}>
          <div className={styles.usageHeader}>
            <ShoppingBasket size={16} />
            <span>Ingredient usage</span>
          </div>
          <div className={styles.usageList}>
            {plan.ingredientUsage.map((usage) => (
              <div key={usage.ingredientId} className={styles.usageItem}>
                <span className={styles.usageName}>{usage.ingredientName}</span>
                <span className={styles.usageAmount}>
                  {usage.usedQuantity.toFixed(1)} / {usage.originalQuantity} {usage.unit || ''}
                </span>
                <div className={styles.usageBar}>
                  <div
                    className={styles.usageBarFill}
                    style={{
                      width: `${Math.min(100, (usage.usedQuantity / usage.originalQuantity) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meal list by date */}
      <div className={styles.mealList}>
        {mealsByDate.map(({ date, meals }) => (
          <div key={date} className={styles.dayGroup}>
            <div className={styles.dayHeader}>
              {format(parseISO(date), 'EEEE, MMM d')}
            </div>
            <div className={styles.dayMeals}>
              {meals.map((meal) => (
                <div
                  key={meal.id}
                  className={`${styles.mealCard} ${meal.isRejected ? styles.rejected : ''} ${meal.isLocked ? styles.locked : ''}`}
                >
                  <div className={styles.mealInfo}>
                    <div className={styles.mealHeader}>
                      <span className={styles.slotName}>{meal.slotName}</span>
                      <span
                        className={styles.matchBadge}
                        style={{ backgroundColor: MATCH_TYPE_COLORS[meal.matchType] }}
                      >
                        {MATCH_TYPE_LABELS[meal.matchType]}
                      </span>
                    </div>
                    <div className={styles.recipeTitle}>{meal.recipeTitle}</div>
                    {meal.matchedIngredients && meal.matchedIngredients.length > 0 && (
                      <div className={styles.matchDetails}>
                        Uses: {meal.matchedIngredients.join(', ')}
                      </div>
                    )}
                    {meal.matchedTags && meal.matchedTags.length > 0 && (
                      <div className={styles.matchDetails}>Tags: {meal.matchedTags.join(', ')}</div>
                    )}
                  </div>
                  <div className={styles.mealActions}>
                    {meal.isLocked ? (
                      <div className={styles.lockedBadge}>
                        <Lock size={14} />
                        Locked
                      </div>
                    ) : meal.isRejected ? (
                      <div className={styles.rejectedBadge}>
                        <X size={14} />
                        Removed
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => setSwapModalMealId(meal.id)}
                          title="Swap recipe"
                        >
                          <ArrowRightLeft size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => onLock(meal.id)}
                          title="Lock this choice"
                        >
                          <Lock size={16} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionButton} ${styles.rejectButton}`}
                          onClick={() => onReject(meal.id)}
                          title="Remove meal"
                        >
                          <X size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Regenerate button */}
      <div className={styles.footer}>
        <Button variant="outline" onClick={onRegenerate} leftIcon={<RefreshCw size={16} />}>
          Regenerate Plan
        </Button>
        <div className={styles.footerNote}>
          <CheckCircle size={14} />
          Locked meals will be kept when regenerating
        </div>
      </div>

      {/* Swap modal */}
      {mealToSwap && (
        <RecipeSwapModal
          isOpen={!!swapModalMealId}
          onClose={() => setSwapModalMealId(null)}
          currentRecipe={{ id: mealToSwap.recipeId, title: mealToSwap.recipeTitle }}
          mealId={mealToSwap.id}
          onSwap={(recipeId, recipeTitle) => {
            onSwap(mealToSwap.id, recipeId, recipeTitle);
            setSwapModalMealId(null);
          }}
          getAlternatives={getAlternatives}
        />
      )}
    </div>
  );
}
