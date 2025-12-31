import { useState, useEffect } from 'react';
import { Loader2, Search, ArrowRight } from 'lucide-react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import styles from './RecipeSwapModal.module.css';

interface RecipeSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRecipe: { id: string; title: string };
  mealId: string;
  onSwap: (recipeId: string, recipeTitle: string) => void;
  getAlternatives: (mealId: string) => Promise<{ id: string; title: string }[]>;
}

export function RecipeSwapModal({
  isOpen,
  onClose,
  currentRecipe,
  mealId,
  onSwap,
  getAlternatives,
}: RecipeSwapModalProps) {
  const [alternatives, setAlternatives] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setSelectedRecipe(null);
      setSearchQuery('');
      getAlternatives(mealId)
        .then((alts) => {
          setAlternatives(alts);
        })
        .catch((err) => {
          console.error('Failed to load alternatives:', err);
          setAlternatives([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isOpen, mealId, getAlternatives]);

  const filteredAlternatives = alternatives.filter((alt) =>
    alt.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSwap = () => {
    if (selectedRecipe) {
      onSwap(selectedRecipe.id, selectedRecipe.title);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Swap Recipe" size="md">
      <div className={styles.content}>
        <div className={styles.currentRecipe}>
          <span className={styles.label}>Current:</span>
          <span className={styles.recipeName}>{currentRecipe.title}</span>
        </div>

        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <Input
            placeholder="Search alternatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.alternativesList}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 className={styles.spinner} size={24} />
              <span>Finding alternatives...</span>
            </div>
          ) : filteredAlternatives.length === 0 ? (
            <div className={styles.empty}>
              {searchQuery
                ? 'No matching recipes found'
                : 'No alternative recipes available'}
            </div>
          ) : (
            filteredAlternatives.map((alt) => (
              <button
                key={alt.id}
                type="button"
                className={`${styles.alternativeItem} ${selectedRecipe?.id === alt.id ? styles.selected : ''}`}
                onClick={() => setSelectedRecipe(alt)}
              >
                <span className={styles.altTitle}>{alt.title}</span>
                {selectedRecipe?.id === alt.id && (
                  <ArrowRight size={16} className={styles.selectedIcon} />
                )}
              </button>
            ))
          )}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSwap} disabled={!selectedRecipe}>
            Swap Recipe
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
