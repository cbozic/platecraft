import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { Tag } from '@/types/tags';
import styles from './TagEditPopup.module.css';

interface TagEditPopupProps {
  selectedTagNames: string[];
  allTags: Tag[];
  onClose: () => void;
  onChange: (tagNames: string[]) => void;
  anchorEl: HTMLElement | null;
}

export function TagEditPopup({
  selectedTagNames,
  allTags,
  onClose,
  onChange,
  anchorEl,
}: TagEditPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const [localSelectedNames, setLocalSelectedNames] = useState<string[]>(selectedTagNames);

  const VISIBLE_TAG_COUNT = 8;

  // Update local state when selectedTagNames changes
  useEffect(() => {
    setLocalSelectedNames(selectedTagNames);
  }, [selectedTagNames]);

  // Position the popup relative to anchor element
  useEffect(() => {
    if (!popupRef.current || !anchorEl) return;

    const anchorRect = anchorEl.getBoundingClientRect();
    const popupRect = popupRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Position below anchor by default, flip if not enough space
    let top = anchorRect.bottom + 4;
    if (top + popupRect.height > viewportHeight - 20) {
      top = anchorRect.top - popupRect.height - 4;
    }

    // Align left edge with anchor, but keep within viewport
    let left = anchorRect.left;
    if (left + popupRect.width > viewportWidth - 20) {
      left = viewportWidth - popupRect.width - 20;
    }
    if (left < 20) {
      left = 20;
    }

    popupRef.current.style.top = `${top}px`;
    popupRef.current.style.left = `${left}px`;
  }, [anchorEl]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isTagSelected = (tagName: string) => {
    const tagNameLower = tagName.toLowerCase();
    return localSelectedNames.some((t) => t.toLowerCase() === tagNameLower);
  };

  const handleTagToggle = (tagName: string) => {
    const tagNameLower = tagName.toLowerCase();
    const newTags = isTagSelected(tagName)
      ? localSelectedNames.filter((t) => t.toLowerCase() !== tagNameLower)
      : [...localSelectedNames, tagName];
    setLocalSelectedNames(newTags);
    onChange(newTags);
  };

  // Sort tags: selected first, then alphabetically
  const sortedTags = [...allTags].sort((a, b) => {
    const aSelected = isTagSelected(a.name);
    const bSelected = isTagSelected(b.name);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.name.localeCompare(b.name);
  });

  const visibleTags = showAllTags ? sortedTags : sortedTags.slice(0, VISIBLE_TAG_COUNT);
  const hasMoreTags = sortedTags.length > VISIBLE_TAG_COUNT;

  return (
    <div ref={popupRef} className={styles.popup} onClick={(e) => e.stopPropagation()}>
      <div className={styles.header}>
        <h4 className={styles.title}>Edit Tags</h4>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className={styles.content}>
        <div className={styles.tagGrid}>
          {visibleTags.map((tag) => (
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
      </div>
    </div>
  );
}
