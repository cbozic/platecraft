import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Star,
  Package,
  Filter,
  Copy,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { recipeRepository } from '@/db';
import { recipeImportService } from '@/services';
import { executeBulkImport, getSiteDisplayName, getProteinDisplayName } from '@/services/bulkImportOrchestrator';
import type {
  BulkImportConfig,
  RecipeSite,
  ProteinCategory,
  BulkImportQueueItem,
  BulkImportProgress,
} from '@/types/bulkImport';
import type { Recipe } from '@/types/recipe';
import styles from './BulkImportTab.module.css';

type Step = 'configure' | 'searching' | 'importing' | 'preview' | 'saving' | 'complete' | 'error';

// Epicurious uses DuckDuckGo search instead of direct scraping
const ALL_SITES: RecipeSite[] = ['allrecipes', 'foodnetwork', 'epicurious'];
const ALL_PROTEINS: ProteinCategory[] = ['beef', 'chicken', 'pork', 'vegetarian'];

export function BulkImportTab() {
  const navigate = useNavigate();
  const abortControllerRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>('configure');
  const [config, setConfig] = useState<BulkImportConfig>({
    sites: [...ALL_SITES],
    proteins: [...ALL_PROTEINS],
    recipesPerCategory: 10,
    lowFat: true,
  });
  const [progress, setProgress] = useState<BulkImportProgress>({
    totalItems: 0,
    completed: 0,
    failed: 0,
    stage: 'searching',
  });
  const [queueItems, setQueueItems] = useState<BulkImportQueueItem[]>([]);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [filterSite, setFilterSite] = useState<RecipeSite | 'all'>('all');
  const [filterProtein, setFilterProtein] = useState<ProteinCategory | 'all'>('all');

  // Calculate estimated recipe count
  const estimatedCount = config.sites.length * config.proteins.length * config.recipesPerCategory;

  const handleStartImport = async () => {
    if (config.sites.length === 0 || config.proteins.length === 0) {
      setError('Please select at least one site and one protein category');
      return;
    }

    setError(null);
    setStep('searching');
    setProgress({ totalItems: 0, completed: 0, failed: 0, stage: 'searching' });
    setQueueItems([]);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const items = await executeBulkImport(
        {
          config,
          onProgress: (prog) => {
            setProgress(prog);
            if (prog.stage === 'importing' && step === 'searching') {
              setStep('importing');
            }
          },
          onItemComplete: (item) => {
            setQueueItems((prev) => {
              const index = prev.findIndex((i) => i.id === item.id);
              if (index >= 0) {
                const newItems = [...prev];
                newItems[index] = item;
                return newItems;
              }
              return [...prev, item];
            });
          },
          concurrency: 2,
          delayMs: 500,
        },
        abortControllerRef.current.signal
      );

      if (abortControllerRef.current.signal.aborted) {
        setError('Import cancelled');
        setStep('error');
        return;
      }

      // Automatically select all successful non-duplicate recipes
      const successfulIds = new Set(
        items
          .filter((item) => item.status === 'success' && !item.duplicateInfo?.isDuplicate)
          .map((item) => item.id)
      );
      setSelectedRecipeIds(successfulIds);
      setQueueItems(items);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import recipes');
      setStep('error');
    }
  };

  const handleCancelImport = () => {
    abortControllerRef.current?.abort();
    setStep('configure');
    setProgress({ totalItems: 0, completed: 0, failed: 0, stage: 'searching' });
    setQueueItems([]);
  };

  const handleToggleRecipe = (id: string) => {
    setSelectedRecipeIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const successfulIds = queueItems
      .filter((item) => item.status === 'success')
      .map((item) => item.id);
    setSelectedRecipeIds(new Set(successfulIds));
  };

  const handleDeselectAll = () => {
    setSelectedRecipeIds(new Set());
  };

  const handleSaveSelected = async () => {
    const selectedItems = queueItems.filter((item) => selectedRecipeIds.has(item.id));

    if (selectedItems.length === 0) {
      setError('Please select at least one recipe to import');
      return;
    }

    setStep('saving');
    setError(null);

    try {
      // Convert to Recipe objects with all required fields
      const now = new Date();
      const recipes: Recipe[] = selectedItems.map((item) => {
        const formData = recipeImportService.convertToRecipeFormData(item.recipe!);
        // Combine existing tags, bulk-import tag, and detected tags (deduped)
        const allTags = new Set([...formData.tags, 'bulk-import', ...(item.detectedTags || [])]);
        return {
          ...formData,
          id: uuidv4(), // Generate unique ID for each recipe
          createdAt: now,
          updatedAt: now,
          // Add IDs to ingredients
          ingredients: formData.ingredients.map((ing) => ({
            ...ing,
            id: uuidv4(),
          })),
          tags: Array.from(allTags), // Include detected tags
          nutrition: item.nutrition || formData.nutrition || undefined,
          images: formData.images || [],
          isFavorite: false,
          // Convert null to undefined for optional fields
          prepTimeMinutes: formData.prepTimeMinutes ?? undefined,
          cookTimeMinutes: formData.cookTimeMinutes ?? undefined,
          referencePageNumber: formData.referencePageNumber ?? undefined,
        };
      });

      // Bulk create recipes
      await recipeRepository.bulkCreate(recipes);

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recipes');
      setStep('error');
    }
  };

  const handleStartOver = () => {
    setStep('configure');
    setQueueItems([]);
    setSelectedRecipeIds(new Set());
    setProgress({ totalItems: 0, completed: 0, failed: 0, stage: 'searching' });
    setError(null);
  };

  const handleViewRecipes = () => {
    navigate('/?tags=bulk-import');
  };

  // Filter queue items for preview
  const filteredItems = queueItems.filter((item) => {
    if (item.status !== 'success') return false;
    if (filterSite !== 'all' && item.searchResult.site !== filterSite) return false;
    if (filterProtein !== 'all' && item.searchResult.proteinCategory !== filterProtein) return false;
    return true;
  });

  const selectedCount = filteredItems.filter((item) => selectedRecipeIds.has(item.id)).length;

  // Step 1: Configuration
  if (step === 'configure') {
    return (
      <div className={styles.container}>
        <div className={styles.configSection}>
          <h3>Configure Bulk Import</h3>
          <p className={styles.instruction}>
            Select which recipe sites and protein categories to import. The app will fetch recipes
            from curated category pages on each site.
          </p>

          <div className={styles.configGroup}>
            <label className={styles.configLabel}>Recipe Sites</label>
            <div className={styles.checkboxGrid}>
              {ALL_SITES.map((site) => (
                <label key={site} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={config.sites.includes(site)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setConfig((prev) => ({ ...prev, sites: [...prev.sites, site] }));
                      } else {
                        setConfig((prev) => ({
                          ...prev,
                          sites: prev.sites.filter((s) => s !== site),
                        }));
                      }
                    }}
                  />
                  <span>{getSiteDisplayName(site)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.configGroup}>
            <label className={styles.configLabel}>Protein Categories</label>
            <div className={styles.checkboxGrid}>
              {ALL_PROTEINS.map((protein) => (
                <label key={protein} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={config.proteins.includes(protein)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setConfig((prev) => ({ ...prev, proteins: [...prev.proteins, protein] }));
                      } else {
                        setConfig((prev) => ({
                          ...prev,
                          proteins: prev.proteins.filter((p) => p !== protein),
                        }));
                      }
                    }}
                  />
                  <span>{getProteinDisplayName(protein)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.configGroup}>
            <label className={styles.configLabel}>Options</label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={config.lowFat}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, lowFat: e.target.checked }))
                }
              />
              <span>Low Fat recipes only</span>
            </label>
          </div>

          <div className={styles.configGroup}>
            <label className={styles.configLabel} htmlFor="recipesPerCategory">
              Recipes per Category
            </label>
            <input
              id="recipesPerCategory"
              type="number"
              min="1"
              max="50"
              value={config.recipesPerCategory}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  recipesPerCategory: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)),
                }))
              }
              className={styles.numberInput}
            />
            <p className={styles.hint}>
              Will import approximately <strong>{estimatedCount}</strong> recipes ({config.sites.length} sites × {config.proteins.length} proteins × {config.recipesPerCategory} recipes)
            </p>
          </div>

          {error && (
            <div className={styles.errorBanner}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className={styles.actions}>
            <Button
              onClick={handleStartImport}
              disabled={config.sites.length === 0 || config.proteins.length === 0}
              rightIcon={<ChevronRight size={18} />}
            >
              Start Import
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Searching
  if (step === 'searching') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Fetching Recipes</h3>
          <p>
            {progress.currentItem
              ? `Fetching ${getSiteDisplayName(progress.currentItem.site)} ${progress.currentItem.proteinCategory} recipes...`
              : 'Preparing to fetch recipes...'}
          </p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(progress.completed / progress.totalItems) * 100 || 0}%` }}
            />
          </div>
          <p className={styles.progressText}>
            {progress.completed} of {progress.totalItems} categories complete
          </p>
          <Button variant="outline" onClick={handleCancelImport}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Step 3: Importing
  if (step === 'importing') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Importing Recipes</h3>
          <p>
            {progress.currentItem
              ? progress.currentItem.title
              : 'Processing recipes...'}
          </p>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${(progress.completed / progress.totalItems) * 100 || 0}%` }}
            />
          </div>
          <p className={styles.progressText}>
            {progress.completed} of {progress.totalItems} recipes processed
          </p>
          <p className={styles.statsText}>
            <CheckCircle size={16} className={styles.successIcon} />
            {progress.completed - progress.failed} successful
            {progress.failed > 0 && (
              <>
                {' • '}
                <AlertCircle size={16} className={styles.errorIcon} />
                {progress.failed} failed
              </>
            )}
          </p>
          <Button variant="outline" onClick={handleCancelImport}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Step 4: Preview
  if (step === 'preview') {
    return (
      <div className={styles.container}>
        <div className={styles.previewSection}>
          <div className={styles.previewHeader}>
            <h3>Preview Recipes</h3>
            <p className={styles.instruction}>
              Review the imported recipes below. Select which ones you want to save to your collection.
            </p>
          </div>

          <div className={styles.previewControls}>
            <div className={styles.filterGroup}>
              <Filter size={16} />
              <select
                value={filterSite}
                onChange={(e) => setFilterSite(e.target.value as RecipeSite | 'all')}
                className={styles.filterSelect}
              >
                <option value="all">All Sites</option>
                {ALL_SITES.map((site) => (
                  <option key={site} value={site}>
                    {getSiteDisplayName(site)}
                  </option>
                ))}
              </select>
              <select
                value={filterProtein}
                onChange={(e) => setFilterProtein(e.target.value as ProteinCategory | 'all')}
                className={styles.filterSelect}
              >
                <option value="all">All Proteins</option>
                {ALL_PROTEINS.map((protein) => (
                  <option key={protein} value={protein}>
                    {getProteinDisplayName(protein)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.selectionControls}>
              <span className={styles.selectionCount}>
                {selectedCount} of {filteredItems.length} selected
              </span>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                Deselect All
              </Button>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <Package size={48} />
              <p>No recipes found with current filters</p>
            </div>
          ) : (
            <div className={styles.recipeGrid}>
              {filteredItems.map((item) => {
                const isDuplicate = item.duplicateInfo?.isDuplicate;
                const cardClasses = [
                  styles.recipeCard,
                  selectedRecipeIds.has(item.id) ? styles.recipeCardSelected : '',
                  isDuplicate ? styles.recipeCardDuplicate : '',
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={item.id}
                    className={cardClasses}
                    onClick={() => handleToggleRecipe(item.id)}
                  >
                    {/* Duplicate warning banner */}
                    {isDuplicate && (
                      <div className={styles.duplicateWarning}>
                        <Copy size={14} />
                        <span>
                          {item.duplicateInfo?.matchType === 'url'
                            ? 'Already imported from this URL'
                            : item.duplicateInfo?.matchType === 'both'
                            ? 'Duplicate (same URL and title)'
                            : 'Recipe with same title exists'}
                        </span>
                      </div>
                    )}

                    <div className={styles.recipeCardHeader}>
                      <input
                        type="checkbox"
                        checked={selectedRecipeIds.has(item.id)}
                        onChange={() => handleToggleRecipe(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.recipeCheckbox}
                      />
                      {item.searchResult.rating && (
                        <div className={styles.rating}>
                          <Star size={14} fill="currentColor" />
                          <span>{item.searchResult.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>

                    {item.searchResult.thumbnailUrl && (
                      <div className={styles.recipeThumbnail}>
                        <img src={item.searchResult.thumbnailUrl} alt={item.recipe?.title || ''} />
                      </div>
                    )}

                    <div className={styles.recipeCardBody}>
                      <h4 className={styles.recipeTitle}>{item.recipe?.title || item.searchResult.title}</h4>

                      <div className={styles.recipeBadges}>
                        <span className={styles.badge}>{getSiteDisplayName(item.searchResult.site)}</span>
                        <span className={styles.badge}>{getProteinDisplayName(item.searchResult.proteinCategory)}</span>
                        {item.nutrition && <span className={styles.badgeNutrition}>Nutrition</span>}
                        {isDuplicate && <span className={styles.badgeDuplicate}>Duplicate</span>}
                      </div>

                      {/* Detected tags */}
                      {item.detectedTags && item.detectedTags.length > 0 && (
                        <div className={styles.recipeTags}>
                          <Tag size={12} />
                          {[...item.detectedTags].sort((a, b) => a.localeCompare(b)).slice(0, 4).map((tag) => (
                            <span key={tag} className={styles.badgeTag}>{tag}</span>
                          ))}
                          {item.detectedTags.length > 4 && (
                            <span className={styles.badgeTag}>+{item.detectedTags.length - 4}</span>
                          )}
                        </div>
                      )}

                      {item.recipe && (
                        <div className={styles.recipeMeta}>
                          {item.recipe.servings && <span>{item.recipe.servings} servings</span>}
                          {item.recipe.prepTimeMinutes && <span>{item.recipe.prepTimeMinutes}m prep</span>}
                          {item.recipe.cookTimeMinutes && <span>{item.recipe.cookTimeMinutes}m cook</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {progress.failed > 0 && (
            <div className={styles.failedSection}>
              <h4>
                <AlertCircle size={18} />
                {progress.failed} recipes failed to import
              </h4>
              <p className={styles.hint}>
                These recipes may not have structured data or could not be accessed. Try importing them individually using the URL import tab.
              </p>
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
            <Button
              onClick={handleSaveSelected}
              disabled={selectedRecipeIds.size === 0}
              rightIcon={<ChevronRight size={18} />}
            >
              Save {selectedRecipeIds.size} Recipe{selectedRecipeIds.size !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 5: Saving
  if (step === 'saving') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Saving Recipes</h3>
          <p>Adding {selectedRecipeIds.size} recipes to your collection...</p>
        </div>
      </div>
    );
  }

  // Step 6: Complete
  if (step === 'complete') {
    return (
      <div className={styles.container}>
        <div className={styles.successSection}>
          <CheckCircle size={64} className={styles.successIconLarge} />
          <h3>Import Complete!</h3>
          <p>Successfully imported {selectedRecipeIds.size} recipes to your collection.</p>
          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Import More
            </Button>
            <Button onClick={handleViewRecipes}>View Recipes</Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 7: Error
  if (step === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.errorSection}>
          <AlertCircle size={64} className={styles.errorIconLarge} />
          <h3>Something went wrong</h3>
          <p className={styles.errorMessage}>{error}</p>
          <div className={styles.actions}>
            <Button onClick={handleStartOver}>Start Over</Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
