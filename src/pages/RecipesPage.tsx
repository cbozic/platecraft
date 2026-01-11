import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { Plus, Search, Filter, Upload, Heart } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import {
  RecipeFilterPanel,
  getActiveFilterCount,
  DEFAULT_FILTERS,
  ShareButton,
  ViewToggle,
  RecipeTableView,
  BulkActionsBar,
  BulkTagModal,
  ReprocessModal,
} from '@/components/recipe';
import type { RecipeFilters, SortConfig } from '@/components/recipe';
import { recipeRepository, tagRepository } from '@/db';
import type { Recipe } from '@/types';
import type { Tag } from '@/types/tags';
import styles from './RecipesPage.module.css';

// Parse filters from URL search params
function parseFiltersFromParams(params: URLSearchParams): RecipeFilters {
  const tags = params.get('tags');
  const fav = params.get('fav');
  const prepMax = params.get('prepMax');
  const cookMax = params.get('cookMax');
  const servMin = params.get('servMin');
  const servMax = params.get('servMax');

  return {
    tags: tags ? tags.split(',').filter(Boolean) : [],
    favoritesOnly: fav === '1',
    maxPrepTime: prepMax ? parseInt(prepMax, 10) : null,
    maxCookTime: cookMax ? parseInt(cookMax, 10) : null,
    minServings: servMin ? parseInt(servMin, 10) : null,
    maxServings: servMax ? parseInt(servMax, 10) : null,
  };
}

// Convert filters to URL search params
function filtersToParams(filters: RecipeFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.tags.length > 0) {
    params.set('tags', filters.tags.join(','));
  }
  if (filters.favoritesOnly) {
    params.set('fav', '1');
  }
  if (filters.maxPrepTime !== null) {
    params.set('prepMax', filters.maxPrepTime.toString());
  }
  if (filters.maxCookTime !== null) {
    params.set('cookMax', filters.maxCookTime.toString());
  }
  if (filters.minServings !== null) {
    params.set('servMin', filters.minServings.toString());
  }
  if (filters.maxServings !== null) {
    params.set('servMax', filters.maxServings.toString());
  }

  return params;
}

interface LocationState {
  searchQuery?: string;
  searchParams?: string;
}

export function RecipesPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Table view state
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'createdAt', direction: 'desc' });
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [bulkTagModalOpen, setBulkTagModalOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [reprocessModalOpen, setReprocessModalOpen] = useState(false);

  // Parse filters from URL
  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

  // Update URL when filters change
  const handleFiltersChange = useCallback((newFilters: RecipeFilters) => {
    const newParams = filtersToParams(newFilters);
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [recipesData, tagsData] = await Promise.all([
          recipeRepository.getAll(),
          tagRepository.getVisibleTags(),
        ]);
        setRecipes(recipesData);
        setAllTags(tagsData);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Restore search state when navigating back from recipe
  useEffect(() => {
    const state = location.state as LocationState | null;
    if (state?.searchQuery !== undefined) {
      setSearchQuery(state.searchQuery);
    }
    if (state?.searchParams) {
      setSearchParams(new URLSearchParams(state.searchParams), { replace: true });
    }
    // Clear the state after using it
    if (state) {
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setSearchParams]);

  // Apply search and filters
  const filteredRecipes = useMemo(() => {
    return recipes.filter((recipe) => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          recipe.title.toLowerCase().includes(query) ||
          recipe.description?.toLowerCase().includes(query) ||
          recipe.ingredients.some((ing) => ing.name.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Tag filter (OR logic - recipe must have at least one selected tag)
      if (filters.tags.length > 0) {
        if (!filters.tags.some((tagId) => recipe.tags.includes(tagId))) {
          return false;
        }
      }

      // Favorites filter
      if (filters.favoritesOnly && !recipe.isFavorite) {
        return false;
      }

      // Prep time filter
      if (filters.maxPrepTime !== null) {
        if ((recipe.prepTimeMinutes ?? 0) > filters.maxPrepTime) {
          return false;
        }
      }

      // Cook time filter
      if (filters.maxCookTime !== null) {
        if ((recipe.cookTimeMinutes ?? 0) > filters.maxCookTime) {
          return false;
        }
      }

      // Servings filter
      if (filters.minServings !== null && recipe.servings < filters.minServings) {
        return false;
      }
      if (filters.maxServings !== null && recipe.servings > filters.maxServings) {
        return false;
      }

      return true;
    });
  }, [recipes, searchQuery, filters]);

  const activeFilterCount = getActiveFilterCount(filters);

  // Sort recipes for table view
  const sortedRecipes = useMemo(() => {
    if (viewMode !== 'table') return filteredRecipes;

    return [...filteredRecipes].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      switch (sortConfig.column) {
        case 'title':
          return dir * a.title.localeCompare(b.title);
        case 'prepTime':
          return dir * ((a.prepTimeMinutes ?? 0) - (b.prepTimeMinutes ?? 0));
        case 'cookTime':
          return dir * ((a.cookTimeMinutes ?? 0) - (b.cookTimeMinutes ?? 0));
        case 'servings':
          return dir * (a.servings - b.servings);
        case 'createdAt':
          return dir * (a.createdAt.getTime() - b.createdAt.getTime());
        default:
          return 0;
      }
    });
  }, [filteredRecipes, sortConfig, viewMode]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedRecipeIds(new Set());
  }, [filters, searchQuery]);

  const handleToggleFavorite = async (recipeId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    await recipeRepository.toggleFavorite(recipeId);
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, isFavorite: !r.isFavorite } : r))
    );
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    if (!window.confirm('Are you sure you want to delete this recipe?')) return;
    await recipeRepository.delete(recipeId);
    setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    setSelectedRecipeIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(recipeId);
      return newSet;
    });
  };

  const handleSingleRecipeTagsChange = async (recipeId: string, tagIds: string[]) => {
    await recipeRepository.update(recipeId, { tags: tagIds });
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, tags: tagIds, updatedAt: new Date() } : r))
    );
  };

  const handleBulkDelete = async () => {
    if (selectedRecipeIds.size === 0) return;
    const count = selectedRecipeIds.size;
    if (!window.confirm(`Are you sure you want to delete ${count} recipe${count !== 1 ? 's' : ''}?`)) return;

    for (const id of selectedRecipeIds) {
      await recipeRepository.delete(id);
    }
    setRecipes((prev) => prev.filter((r) => !selectedRecipeIds.has(r.id)));
    setSelectedRecipeIds(new Set());
  };

  const handleBulkTagsChange = async (tagIds: string[]) => {
    if (tagIds.length === 0) return;

    const updates = [...selectedRecipeIds].map(async (recipeId) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;

      const newTags =
        bulkTagMode === 'add'
          ? [...new Set([...recipe.tags, ...tagIds])]
          : recipe.tags.filter((t) => !tagIds.includes(t));

      await recipeRepository.update(recipeId, { tags: newTags });
      return { recipeId, newTags };
    });

    const results = await Promise.all(updates);

    setRecipes((prev) =>
      prev.map((r) => {
        const update = results.find((u) => u?.recipeId === r.id);
        return update ? { ...r, tags: update.newTags, updatedAt: new Date() } : r;
      })
    );
    setSelectedRecipeIds(new Set());
  };

  const openBulkTagModal = (mode: 'add' | 'remove') => {
    setBulkTagMode(mode);
    setBulkTagModalOpen(true);
  };

  const handleReprocessComplete = async () => {
    // Refresh the recipe list to show updated data
    try {
      const recipesData = await recipeRepository.getAll();
      setRecipes(recipesData);
    } catch (error) {
      console.error('Failed to refresh recipes:', error);
    }
    setSelectedRecipeIds(new Set());
    setReprocessModalOpen(false);
  };

  const selectedRecipes = useMemo(() => {
    return recipes.filter((r) => selectedRecipeIds.has(r.id));
  }, [recipes, selectedRecipeIds]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading recipes...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Recipes</h1>
        <div className={styles.headerActions}>
          <Link to="/import">
            <Button variant="outline" leftIcon={<Upload size={18} />}>Import</Button>
          </Link>
          <Link to="/recipes/new">
            <Button leftIcon={<Plus size={18} />}>Add Recipe</Button>
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Input
            type="search"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
            fullWidth
          />
        </div>
        <div className={styles.toolbarActions}>
          <div className={styles.filterWrapper}>
            <Button
              variant={activeFilterCount > 0 ? 'primary' : 'outline'}
              leftIcon={<Filter size={18} />}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              Filter{activeFilterCount > 0 && ` (${activeFilterCount})`}
            </Button>
            <RecipeFilterPanel
              filters={filters}
              onChange={handleFiltersChange}
              isOpen={isFilterOpen}
              onClose={() => setIsFilterOpen(false)}
            />
          </div>
          <ViewToggle view={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {filteredRecipes.length === 0 ? (
        <div className={styles.empty}>
          {recipes.length === 0 ? (
            <>
              <p className={styles.emptyTitle}>No recipes yet</p>
              <p className={styles.emptyText}>
                Start building your recipe collection by adding your first recipe.
              </p>
              <Link to="/recipes/new">
                <Button leftIcon={<Plus size={18} />}>Add Your First Recipe</Button>
              </Link>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No matching recipes</p>
              <p className={styles.emptyText}>
                Try adjusting your search or filters to find what you&apos;re looking for.
              </p>
              <Button variant="outline" onClick={() => {
                setSearchQuery('');
                handleFiltersChange(DEFAULT_FILTERS);
              }}>
                Clear Search & Filters
              </Button>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className={styles.grid}>
          {filteredRecipes.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/recipes/${recipe.id}`}
              className={styles.cardLink}
              state={{
                from: 'recipes',
                searchQuery,
                searchParams: searchParams.toString(),
              }}
            >
              <Card hoverable padding="none">
                <div className={styles.cardImageWrapper}>
                  <div className={styles.cardImage}>
                    {recipe.images.find((img) => img.isPrimary)?.data ? (
                      <img
                        src={
                          typeof recipe.images.find((img) => img.isPrimary)?.data === 'string'
                            ? (recipe.images.find((img) => img.isPrimary)?.data as string)
                            : URL.createObjectURL(recipe.images.find((img) => img.isPrimary)?.data as Blob)
                        }
                        alt={recipe.title}
                      />
                    ) : (
                      <div className={styles.placeholderImage}>🍽️</div>
                    )}
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      className={`${styles.cardActionButton} ${recipe.isFavorite ? styles.favorited : ''}`}
                      onClick={(e) => handleToggleFavorite(recipe.id, e)}
                      aria-label={recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart size={16} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <div
                      className={styles.cardActionButton}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                    >
                      <ShareButton recipe={recipe} variant="icon" size="sm" />
                    </div>
                  </div>
                </div>
                <div className={styles.cardContent}>
                  <h3 className={styles.cardTitle}>{recipe.title}</h3>
                  {recipe.description && (
                    <p className={styles.cardDescription}>{recipe.description}</p>
                  )}
                  <div className={styles.cardMeta}>
                    {recipe.prepTimeMinutes && (
                      <span>Prep: {recipe.prepTimeMinutes}m</span>
                    )}
                    {recipe.cookTimeMinutes && (
                      <span>Cook: {recipe.cookTimeMinutes}m</span>
                    )}
                    <span>{recipe.servings} servings</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <RecipeTableView
          recipes={sortedRecipes}
          tags={allTags}
          selectedIds={selectedRecipeIds}
          onSelectionChange={setSelectedRecipeIds}
          sortConfig={sortConfig}
          onSortChange={setSortConfig}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDeleteRecipe}
          onTagsChange={handleSingleRecipeTagsChange}
        />
      )}

      <BulkActionsBar
        selectedCount={selectedRecipeIds.size}
        onAddTags={() => openBulkTagModal('add')}
        onRemoveTags={() => openBulkTagModal('remove')}
        onReprocess={() => setReprocessModalOpen(true)}
        onDelete={handleBulkDelete}
        onClearSelection={() => setSelectedRecipeIds(new Set())}
      />

      <BulkTagModal
        isOpen={bulkTagModalOpen}
        onClose={() => setBulkTagModalOpen(false)}
        mode={bulkTagMode}
        selectedRecipes={selectedRecipes}
        allTags={allTags}
        onConfirm={handleBulkTagsChange}
      />

      <ReprocessModal
        isOpen={reprocessModalOpen}
        onClose={() => setReprocessModalOpen(false)}
        selectedRecipes={selectedRecipes}
        onComplete={handleReprocessComplete}
      />
    </div>
  );
}
