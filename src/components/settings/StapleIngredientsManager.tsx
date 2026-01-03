import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { settingsRepository } from '@/db';
import styles from './StapleIngredientsManager.module.css';

export function StapleIngredientsManager() {
  const [staples, setStaples] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newStaple, setNewStaple] = useState('');
  const [newExclusion, setNewExclusion] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [allStaples, allExclusions] = await Promise.all([
        settingsRepository.getStapleIngredients(),
        settingsRepository.getStapleExclusions(),
      ]);
      // Sort alphabetically for easy scanning
      allStaples.sort((a, b) => a.localeCompare(b));
      allExclusions.sort((a, b) => a.localeCompare(b));
      setStaples(allStaples);
      setExclusions(allExclusions);
    } catch (error) {
      console.error('Failed to load staple settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStaple = async () => {
    if (!newStaple.trim()) return;

    // Check for duplicates
    const normalized = newStaple.trim().toLowerCase();
    const exists = staples.some((s) => s.toLowerCase() === normalized);
    if (exists) {
      alert('This staple ingredient already exists');
      return;
    }

    try {
      await settingsRepository.addStapleIngredient(newStaple.trim());
      setNewStaple('');
      await loadData();
    } catch (error) {
      console.error('Failed to add staple ingredient:', error);
    }
  };

  const handleDeleteStaple = async (name: string) => {
    if (window.confirm(`Remove "${name}" from staple ingredients?`)) {
      try {
        await settingsRepository.removeStapleIngredient(name);
        await loadData();
      } catch (error) {
        console.error('Failed to remove staple ingredient:', error);
      }
    }
  };

  const handleAddExclusion = async () => {
    if (!newExclusion.trim()) return;

    // Check for duplicates
    const normalized = newExclusion.trim().toLowerCase();
    const exists = exclusions.some((s) => s.toLowerCase() === normalized);
    if (exists) {
      alert('This exclusion pattern already exists');
      return;
    }

    try {
      await settingsRepository.addStapleExclusion(newExclusion.trim());
      setNewExclusion('');
      await loadData();
    } catch (error) {
      console.error('Failed to add exclusion:', error);
    }
  };

  const handleDeleteExclusion = async (name: string) => {
    if (window.confirm(`Remove "${name}" from exclusion patterns?`)) {
      try {
        await settingsRepository.removeStapleExclusion(name);
        await loadData();
      } catch (error) {
        console.error('Failed to remove exclusion:', error);
      }
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading staple ingredients...</div>;
  }

  return (
    <div className={styles.container}>
      <p className={styles.description}>
        Staple ingredients will be automatically checked off when you create a new shopping list.
        Use exclusion patterns to prevent false matches (e.g., add "tortilla" to exclude "flour tortillas" from matching "flour").
      </p>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Staple Ingredients</h3>

        <div className={styles.addForm}>
          <Input
            value={newStaple}
            onChange={(e) => setNewStaple(e.target.value)}
            placeholder="e.g., salt, pepper, olive oil"
            onKeyDown={(e) => e.key === 'Enter' && handleAddStaple()}
          />
          <Button onClick={handleAddStaple} disabled={!newStaple.trim()}>
            <Plus size={18} />
            Add
          </Button>
        </div>

        {staples.length === 0 ? (
          <p className={styles.emptyText}>
            No staple ingredients yet. Add common items you always have on hand.
          </p>
        ) : (
          <div className={styles.stapleList}>
            <div className={styles.listHeader}>
              <span className={styles.count}>{staples.length} staple{staples.length !== 1 ? 's' : ''}</span>
            </div>
            {staples.map((staple) => (
              <div key={staple} className={styles.stapleRow}>
                <span className={styles.stapleName}>{staple}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteStaple(staple)}
                  aria-label="Remove staple ingredient"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Exclusion Patterns</h3>
        <p className={styles.sectionDescription}>
          Prevent items from being auto-checked even if they contain a staple ingredient.
        </p>

        <div className={styles.addForm}>
          <Input
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            placeholder="e.g., tortilla, bread"
            onKeyDown={(e) => e.key === 'Enter' && handleAddExclusion()}
          />
          <Button onClick={handleAddExclusion} disabled={!newExclusion.trim()}>
            <Plus size={18} />
            Add
          </Button>
        </div>

        {exclusions.length === 0 ? (
          <p className={styles.emptyText}>
            No exclusion patterns. Add patterns to prevent false matches.
          </p>
        ) : (
          <div className={styles.stapleList}>
            <div className={styles.listHeader}>
              <span className={styles.count}>{exclusions.length} exclusion{exclusions.length !== 1 ? 's' : ''}</span>
            </div>
            {exclusions.map((exclusion) => (
              <div key={exclusion} className={styles.stapleRow}>
                <span className={styles.stapleName}>{exclusion}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteExclusion(exclusion)}
                  aria-label="Remove exclusion pattern"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
