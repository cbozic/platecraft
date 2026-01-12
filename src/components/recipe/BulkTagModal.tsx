import { useState, useMemo } from 'react';
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
  onConfirm: (tagNames: string[]) => void;
}

export function BulkTagModal({
  isOpen,
  onClose,
  mode,
  selectedRecipes,
  allTags,
  onConfirm,
}: BulkTagModalProps) {
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);

  // For remove mode, only show tags that exist on at least one selected recipe
  const availableTags = useMemo(() => {
    if (mode === 'add') {
      return allTags;
    }
    // Collect all tag names from selected recipes (case-insensitive unique)
    const tagNamesOnSelectedRecipes = new Set<string>();
    selectedRecipes.forEach((recipe) => {
      recipe.tags.forEach((tagName) => tagNamesOnSelectedRecipes.add(tagName.toLowerCase()));
    });
    return allTags.filter((tag) => tagNamesOnSelectedRecipes.has(tag.name.toLowerCase()));
  }, [mode, allTags, selectedRecipes]);

  // Sort alphabetically
  const sortedTags = [...availableTags].sort((a, b) => a.name.localeCompare(b.name));

  const isTagSelected = (tagName: string) => {
    const tagNameLower = tagName.toLowerCase();
    return selectedTagNames.some((t) => t.toLowerCase() === tagNameLower);
  };

  const handleTagToggle = (tagName: string) => {
    const tagNameLower = tagName.toLowerCase();
    setSelectedTagNames((prev) =>
      isTagSelected(tagName)
        ? prev.filter((t) => t.toLowerCase() !== tagNameLower)
        : [...prev, tagName]
    );
  };

  const handleConfirm = () => {
    onConfirm(selectedTagNames);
    setSelectedTagNames([]);
    onClose();
  };

  const handleClose = () => {
    setSelectedTagNames([]);
    onClose();
  };

  const title = mode === 'add' ? 'Add Tags' : 'Remove Tags';
  const confirmText =
    mode === 'add'
      ? `Add ${selectedTagNames.length > 0 ? selectedTagNames.length : ''} tag${selectedTagNames.length !== 1 ? 's' : ''} to ${selectedRecipes.length} recipe${selectedRecipes.length !== 1 ? 's' : ''}`
      : `Remove ${selectedTagNames.length > 0 ? selectedTagNames.length : ''} tag${selectedTagNames.length !== 1 ? 's' : ''} from ${selectedRecipes.length} recipe${selectedRecipes.length !== 1 ? 's' : ''}`;

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
              {sortedTags.map((tag) => (
                <label key={tag.name} className={styles.tagCheckbox}>
                  <input
                    type="checkbox"
                    checked={isTagSelected(tag.name)}
                    onChange={() => handleTagToggle(tag.name)}
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
          disabled={selectedTagNames.length === 0}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
