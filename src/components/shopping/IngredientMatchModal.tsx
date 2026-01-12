import { useState } from 'react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import type { PendingIngredientMatch } from '@/types';
import { Check, X, ChevronRight } from 'lucide-react';
import styles from './IngredientMatchModal.module.css';

interface IngredientMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingMatches: PendingIngredientMatch[];
  onConfirm: (match: PendingIngredientMatch) => void;
  onReject: (matchId: string) => void;
  onConfirmAll: () => void;
  onSkipAll: () => void;
}

export function IngredientMatchModal({
  isOpen,
  onClose,
  pendingMatches,
  onConfirm,
  onReject,
  onConfirmAll,
  onSkipAll,
}: IngredientMatchModalProps) {
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  const remainingMatches = pendingMatches.filter((m) => !processedIds.has(m.id));

  const handleConfirm = (match: PendingIngredientMatch) => {
    onConfirm(match);
    setProcessedIds((prev) => new Set([...prev, match.id]));
  };

  const handleReject = (matchId: string) => {
    onReject(matchId);
    setProcessedIds((prev) => new Set([...prev, matchId]));
  };

  const handleConfirmAll = () => {
    onConfirmAll();
    onClose();
  };

  const handleSkipAll = () => {
    onSkipAll();
    onClose();
  };

  const handleClose = () => {
    setProcessedIds(new Set());
    onClose();
  };

  // Auto-close when all matches are processed
  if (remainingMatches.length === 0 && processedIds.size > 0) {
    handleClose();
    return null;
  }

  if (remainingMatches.length === 0) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Similar Ingredients Found"
      size="lg"
    >
      <div className={styles.container}>
        <p className={styles.description}>
          We found some ingredients that might be the same thing written differently.
          Would you like to merge them on future shopping lists?
        </p>

        <div className={styles.matchList}>
          {remainingMatches.map((match) => (
            <div key={match.id} className={styles.matchCard}>
              <div className={styles.matchHeader}>
                <div className={styles.mergePreview}>
                  {match.ingredientNames.map((name, idx) => (
                    <span key={name}>
                      <span className={styles.ingredientName}>{name}</span>
                      {idx < match.ingredientNames.length - 1 && (
                        <ChevronRight size={14} className={styles.mergeArrow} />
                      )}
                    </span>
                  ))}
                  <span className={styles.resultArrow}>→</span>
                  <span className={styles.canonicalName}>{match.suggestedCanonicalName}</span>
                </div>
                <span className={styles.confidence}>
                  {Math.round(match.confidence * 100)}% confident
                </span>
              </div>

              <div className={styles.affectedRecipes}>
                <span className={styles.recipesLabel}>Used in:</span>
                {match.affectedRecipes.slice(0, 3).map((recipe, idx) => (
                  <span key={`${recipe.recipeId}-${idx}`} className={styles.recipePill}>
                    {recipe.recipeName}
                  </span>
                ))}
                {match.affectedRecipes.length > 3 && (
                  <span className={styles.moreRecipes}>
                    +{match.affectedRecipes.length - 3} more
                  </span>
                )}
              </div>

              <div className={styles.matchActions}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReject(match.id)}
                >
                  <X size={14} />
                  Keep Separate
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleConfirm(match)}
                >
                  <Check size={14} />
                  Merge
                </Button>
              </div>
            </div>
          ))}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={handleSkipAll}>
            Skip All
          </Button>
          <Button variant="primary" onClick={handleConfirmAll}>
            Merge All ({remainingMatches.length})
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
