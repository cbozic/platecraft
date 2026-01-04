import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { Recipe } from '@/types';
import type { Tag } from '@/types/tags';
import styles from './BulkTagModal.module.css';

interface BulkTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'remove';
  selectedRecipes: Recipe[];
  allTags: Tag[];
  onConfirm: (tagIds: string[]) => void;
}

export function BulkTagModal({
  isOpen,
  onClose,
  mode,
  selectedRecipes,
  allTags,
  onConfirm,
}: BulkTagModalProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);

  const VISIBLE_TAG_COUNT = 12;

  // For remove mode, only show tags that exist on at least one selected recipe
  const availableTags = useMemo(() => {
    if (mode === 'add') {
      return allTags;
    }
    const tagIdsOnSelectedRecipes = new Set<string>();
    selectedRecipes.forEach((recipe) => {
      recipe.tags.forEach((tagId) => tagIdsOnSelectedRecipes.add(tagId));
    });
    return allTags.filter((tag) => tagIdsOnSelectedRecipes.has(tag.id));
  }, [mode, allTags, selectedRecipes]);

  // Sort alphabetically
  const sortedTags = [...availableTags].sort((a, b) => a.name.localeCompare(b.name));
  const visibleTags = showAllTags ? sortedTags : sortedTags.slice(0, VISIBLE_TAG_COUNT);
  const hasMoreTags = sortedTags.length > VISIBLE_TAG_COUNT;

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedTagIds);
    setSelectedTagIds([]);
    onClose();
  };

  const handleClose = () => {
    setSelectedTagIds([]);
    onClose();
  };

  const title = mode === 'add' ? 'Add Tags' : 'Remove Tags';
  const confirmText =
    mode === 'add'
      ? `Add ${selectedTagIds.length > 0 ? selectedTagIds.length : ''} tag${selectedTagIds.length !== 1 ? 's' : ''} to ${selectedRecipes.length} recipe${selectedRecipes.length !== 1 ? 's' : ''}`
      : `Remove ${selectedTagIds.length > 0 ? selectedTagIds.length : ''} tag${selectedTagIds.length !== 1 ? 's' : ''} from ${selectedRecipes.length} recipe${selectedRecipes.length !== 1 ? 's' : ''}`;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="md">
      <div className={styles.content}>
        {availableTags.length === 0 ? (
          <p className={styles.emptyMessage}>
            {mode === 'add'
              ? 'No tags available. Create tags in Settings.'
              : 'No tags to remove from selected recipes.'}
          </p>
        ) : (
          <>
            <p className={styles.description}>
              {mode === 'add'
                ? 'Select tags to add to the selected recipes:'
                : 'Select tags to remove from the selected recipes:'}
            </p>

            <div className={styles.tagGrid}>
              {visibleTags.map((tag) => (
                <label key={tag.id} className={styles.tagCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedTagIds.includes(tag.id)}
                    onChange={() => handleTagToggle(tag.id)}
                  />
                  <span
                    className={styles.tagLabel}
                    style={tag.color ? { '--tag-color': tag.color } as React.CSSProperties : undefined}
                  >
                    {tag.name}
                  </span>
                </label>
              ))}
            </div>

            {hasMoreTags && (
              <button
                className={styles.showMoreButton}
                onClick={() => setShowAllTags(!showAllTags)}
              >
                {showAllTags ? (
                  <>
                    <ChevronUp size={14} />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} />
                    Show all {sortedTags.length} tags
                  </>
                )}
              </button>
            )}
          </>
        )}
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant={mode === 'add' ? 'primary' : 'danger'}
          onClick={handleConfirm}
          disabled={selectedTagIds.length === 0}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
