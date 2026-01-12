import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import { useMealPlanAssistant } from '@/hooks';
import type { MealSlot, Tag } from '@/types';
import { IngredientInputStep } from './IngredientInputStep';
import { MealScheduleStep } from './MealScheduleStep';
import { PlanPreviewStep } from './PlanPreviewStep';
import styles from './MealPlanAssistantModal.module.css';

interface MealPlanAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  mealSlots: MealSlot[];
  tags: Tag[];
  weekStartsOn?: 0 | 1;
  defaultServings?: number;
  resumePlan?: boolean;
}

const STEP_LABELS = {
  ingredients: 'Ingredients',
  mealSchedule: 'Meal Schedule',
  preview: 'Preview',
};

const STEP_ORDER = ['ingredients', 'mealSchedule', 'preview'] as const;

export function MealPlanAssistantModal({
  isOpen,
  onClose,
  onComplete,
  mealSlots,
  tags,
  weekStartsOn = 0,
  defaultServings = 4,
  resumePlan = false,
}: MealPlanAssistantModalProps) {
  const assistant = useMealPlanAssistant({
    mealSlots,
    tags,
    defaultServings,
    onComplete: () => {
      onComplete();
      onClose();
    },
    restoreFromStorage: resumePlan,
  });

  // Reset when modal opens (unless resuming an existing plan)
  useEffect(() => {
    if (isOpen && !resumePlan) {
      assistant.reset();
    }
  }, [isOpen, resumePlan]);

  // Generate plan when entering preview step
  useEffect(() => {
    if (assistant.currentStep === 'preview' && !assistant.generatedPlan && !assistant.isGenerating) {
      assistant.generatePlan();
    }
  }, [assistant.currentStep, assistant.generatedPlan, assistant.isGenerating, assistant.generatePlan]);

  const handleClose = () => {
    assistant.reset();
    onClose();
  };

  const handleNext = () => {
    assistant.goNext();
  };

  const handleBack = () => {
    assistant.goBack();
  };

  const handleApply = async () => {
    await assistant.applyPlan();
  };

  const currentStepIndex = STEP_ORDER.indexOf(assistant.currentStep);
  const isLastStep = assistant.currentStep === 'preview';
  const isFirstStep = assistant.currentStep === 'ingredients';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Meal Planning Assistant"
      size="lg"
    >
      <div className={styles.container}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {STEP_ORDER.map((step, index) => (
            <div
              key={step}
              className={`${styles.step} ${index <= currentStepIndex ? styles.active : ''} ${
                index === currentStepIndex ? styles.current : ''
              }`}
            >
              <div className={styles.stepNumber}>{index + 1}</div>
              <div className={styles.stepLabel}>{STEP_LABELS[step]}</div>
            </div>
          ))}
        </div>

        {/* Error display */}
        {assistant.error && (
          <div className={styles.error}>
            {assistant.error}
          </div>
        )}

        {/* Step content */}
        <div className={styles.content}>
          {assistant.currentStep === 'ingredients' && (
            <IngredientInputStep
              ingredients={assistant.config.ingredientsOnHand}
              onAdd={assistant.addIngredient}
              onUpdate={assistant.updateIngredient}
              onRemove={assistant.removeIngredient}
            />
          )}

          {assistant.currentStep === 'mealSchedule' && (
            <MealScheduleStep
              startDate={assistant.config.startDate}
              endDate={assistant.config.endDate}
              weekdayConfigs={assistant.config.weekdayConfigs}
              mealSlots={mealSlots}
              availableTags={[...tags].sort((a, b) => a.name.localeCompare(b.name))}
              weekStartsOn={weekStartsOn}
              defaultServings={assistant.config.defaultServings}
              favoritesWeight={assistant.config.favoritesWeight}
              overwriteMode={assistant.config.overwriteMode}
              existingMealCount={assistant.existingMealsInRange.length}
              onDateRangeChange={assistant.setDateRange}
              onToggleMealSlot={assistant.toggleMealSlot}
              onUpdateMealSlotTags={assistant.updateMealSlotTags}
              onApplyPreset={assistant.applyMealSchedulePreset}
              onClearSchedule={assistant.clearMealSchedule}
              onServingsChange={assistant.setServings}
              onFavoritesWeightChange={assistant.setFavoritesWeight}
              onOverwriteModeChange={assistant.setOverwriteMode}
            />
          )}

          {assistant.currentStep === 'preview' && (
            <>
              {assistant.isGenerating ? (
                <div className={styles.loading}>
                  <Loader2 className={styles.spinner} size={32} />
                  <p>Generating meal plan...</p>
                </div>
              ) : assistant.generatedPlan ? (
                <PlanPreviewStep
                  plan={assistant.generatedPlan}
                  onSwap={assistant.swapMeal}
                  onReject={assistant.rejectMeal}
                  onLock={assistant.lockMeal}
                  onUnlock={assistant.unlockMeal}
                  onRegenerate={assistant.generatePlan}
                  getAlternatives={assistant.getAlternativeRecipes}
                  onSaveState={assistant.saveToStorage}
                  swapModalMealId={assistant.swapModalMealId}
                  setSwapModalMealId={assistant.setSwapModalMealId}
                />
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <ModalFooter>
          <div className={styles.footerLeft}>
            {!isFirstStep && (
              <Button variant="outline" onClick={handleBack} disabled={assistant.isApplying}>
                Back
              </Button>
            )}
          </div>
          <div className={styles.footerRight}>
            <Button variant="outline" onClick={handleClose} disabled={assistant.isApplying}>
              Cancel
            </Button>
            {isLastStep ? (
              <Button
                onClick={handleApply}
                disabled={!assistant.canGoNext || assistant.isApplying || assistant.isGenerating}
              >
                {assistant.isApplying ? (
                  <>
                    <Loader2 className={styles.spinner} size={16} />
                    Applying...
                  </>
                ) : (
                  'Apply to Calendar'
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!assistant.canGoNext}>
                Next
              </Button>
            )}
          </div>
        </ModalFooter>
      </div>
    </Modal>
  );
}
