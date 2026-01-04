import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, Heart, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ShareButton } from './ShareButton';
import { TagEditPopup } from './TagEditPopup';
import type { Recipe } from '@/types';
import type { Tag } from '@/types/tags';
import styles from './RecipeTableView.module.css';

export type SortColumn = 'title' | 'prepTime' | 'cookTime' | 'servings' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  column: SortColumn;
  direction: SortDirection;
}

interface RecipeTableViewProps {
  recipes: Recipe[];
  tags: Tag[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  onToggleFavorite: (recipeId: string) => void;
  onDelete: (recipeId: string) => void;
  onTagsChange: (recipeId: string, tagIds: string[]) => void;
}

function formatTime(minutes?: number): string {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function RecipeTableView({
  recipes,
  tags,
  selectedIds,
  onSelectionChange,
  sortConfig,
  onSortChange,
  onToggleFavorite,
  onDelete,
  onTagsChange,
}: RecipeTableViewProps) {
  const [tagPopupRecipeId, setTagPopupRecipeId] = useState<string | null>(null);
  const tagCellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());

  const isAllSelected = recipes.length > 0 && recipes.every((r) => selectedIds.has(r.id));
  const isIndeterminate = selectedIds.size > 0 && !isAllSelected;

  const handleSelectAll = () => {
    if (isAllSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(recipes.map((r) => r.id)));
    }
  };

  const handleToggleRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  const handleHeaderClick = (column: SortColumn) => {
    onSortChange({
      column,
      direction: sortConfig.column === column && sortConfig.direction === 'asc' ? 'desc' : 'asc',
    });
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return null;
    return sortConfig.direction === 'asc' ? (
      <ChevronUp size={14} className={styles.sortIcon} />
    ) : (
      <ChevronDown size={14} className={styles.sortIcon} />
    );
  };

  const getRecipeTags = (recipe: Recipe): Tag[] => {
    return recipe.tags
      .map((tagId) => tags.find((t) => t.id === tagId))
      .filter((t): t is Tag => t !== undefined);
  };

  const handleTagCellClick = (recipeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTagPopupRecipeId(tagPopupRecipeId === recipeId ? null : recipeId);
  };

  const handleTagsUpdate = (recipeId: string, tagIds: string[]) => {
    onTagsChange(recipeId, tagIds);
    setTagPopupRecipeId(null);
  };

  if (recipes.length === 0) {
    return null;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.checkboxCell}>
              <input
                type="checkbox"
                checked={isAllSelected}
                ref={(el) => {
                  if (el) el.indeterminate = isIndeterminate;
                }}
                onChange={handleSelectAll}
                aria-label="Select all recipes"
              />
            </th>
            <th
              className={`${styles.headerCell} ${styles.sortable}`}
              onClick={() => handleHeaderClick('title')}
            >
              Title {renderSortIcon('title')}
            </th>
            <th
              className={`${styles.headerCell} ${styles.sortable}`}
              onClick={() => handleHeaderClick('prepTime')}
            >
              Prep {renderSortIcon('prepTime')}
            </th>
            <th
              className={`${styles.headerCell} ${styles.sortable}`}
              onClick={() => handleHeaderClick('cookTime')}
            >
              Cook {renderSortIcon('cookTime')}
            </th>
            <th
              className={`${styles.headerCell} ${styles.sortable}`}
              onClick={() => handleHeaderClick('servings')}
            >
              Servings {renderSortIcon('servings')}
            </th>
            <th
              className={`${styles.headerCell} ${styles.sortable}`}
              onClick={() => handleHeaderClick('createdAt')}
            >
              Added {renderSortIcon('createdAt')}
            </th>
            <th className={styles.headerCell}>Tags</th>
            <th className={styles.headerCell}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {recipes.map((recipe) => {
            const recipeTags = getRecipeTags(recipe);
            const visibleTags = recipeTags.slice(0, 2);
            const remainingCount = recipeTags.length - visibleTags.length;

            return (
              <tr
                key={recipe.id}
                className={`${styles.row} ${selectedIds.has(recipe.id) ? styles.selected : ''}`}
              >
                <td className={styles.checkboxCell}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipe.id)}
                    onChange={() => handleToggleRow(recipe.id)}
                    aria-label={`Select ${recipe.title}`}
                  />
                </td>
                <td className={styles.titleCell}>
                  <Link to={`/recipes/${recipe.id}`} className={styles.titleLink}>
                    {recipe.title}
                  </Link>
                </td>
                <td className={styles.cell}>{formatTime(recipe.prepTimeMinutes)}</td>
                <td className={styles.cell}>{formatTime(recipe.cookTimeMinutes)}</td>
                <td className={styles.cell}>{recipe.servings}</td>
                <td className={styles.cell}>{formatDate(recipe.createdAt)}</td>
                <td
                  className={`${styles.cell} ${styles.tagsCell}`}
                  ref={(el) => {
                    if (el) tagCellRefs.current.set(recipe.id, el);
                  }}
                  onClick={(e) => handleTagCellClick(recipe.id, e)}
                >
                  <div className={styles.tagsWrapper}>
                    {visibleTags.length > 0 ? (
                      <>
                        {visibleTags.map((tag) => (
                          <span
                            key={tag.id}
                            className={styles.tagPill}
                            style={tag.color ? { backgroundColor: tag.color } : undefined}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {remainingCount > 0 && (
                          <span className={styles.tagMore}>+{remainingCount}</span>
                        )}
                      </>
                    ) : (
                      <span className={styles.noTags}>-</span>
                    )}
                  </div>
                  {tagPopupRecipeId === recipe.id && (
                    <TagEditPopup
                      selectedTagIds={recipe.tags}
                      allTags={tags}
                      onClose={() => setTagPopupRecipeId(null)}
                      onChange={(tagIds) => handleTagsUpdate(recipe.id, tagIds)}
                      anchorEl={tagCellRefs.current.get(recipe.id) ?? null}
                    />
                  )}
                </td>
                <td className={styles.actionsCell}>
                  <div className={styles.actions}>
                    <Link to={`/recipes/${recipe.id}/edit`}>
                      <Button variant="ghost" size="sm" aria-label="Edit recipe">
                        <Pencil size={16} />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleFavorite(recipe.id)}
                      aria-label={recipe.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Heart
                        size={16}
                        fill={recipe.isFavorite ? 'var(--color-error)' : 'none'}
                        color={recipe.isFavorite ? 'var(--color-error)' : 'currentColor'}
                      />
                    </Button>
                    <ShareButton recipe={recipe} variant="icon" size="sm" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(recipe.id)}
                      aria-label="Delete recipe"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
