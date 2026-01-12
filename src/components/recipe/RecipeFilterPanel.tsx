import { useState, useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronUp, Heart } from 'lucide-react';
import { Button } from '@/components/ui';
import { tagRepository } from '@/db';
import type { Tag } from '@/types';
import styles from './RecipeFilterPanel.module.css';

export interface RecipeFilters {
  tags: string[];
  favoritesOnly: boolean;
  maxPrepTime: number | null;
  maxCookTime: number | null;
  minServings: number | null;
  maxServings: number | null;
}

export const DEFAULT_FILTERS: RecipeFilters = {
  tags: [],
  favoritesOnly: false,
  maxPrepTime: null,
  maxCookTime: null,
  minServings: null,
  maxServings: null,
};

interface RecipeFilterPanelProps {
  filters: RecipeFilters;
  onChange: (filters: RecipeFilters) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PREP_TIME_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 15, label: 'Under 15 min' },
  { value: 30, label: 'Under 30 min' },
  { value: 45, label: 'Under 45 min' },
  { value: 60, label: 'Under 1 hour' },
];

const COOK_TIME_OPTIONS = [
  { value: null, label: 'Any' },
  { value: 15, label: 'Under 15 min' },
  { value: 30, label: 'Under 30 min' },
  { value: 45, label: 'Under 45 min' },
  { value: 60, label: 'Under 1 hour' },
  { value: 90, label: 'Under 1.5 hours' },
  { value: 120, label: 'Under 2 hours' },
];

export function RecipeFilterPanel({ filters, onChange, isOpen, onClose }: RecipeFilterPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);

  const VISIBLE_TAG_COUNT = 8;

  useEffect(() => {
    const loadTags = async () => {
      const tags = await tagRepository.getAll();
      setAvailableTags(tags);
    };
    loadTags();
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Delay adding listener to avoid immediate close
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTagToggle = (tagName: string) => {
    const tagNameLower = tagName.toLowerCase();
    const isSelected = filters.tags.some((t) => t.toLowerCase() === tagNameLower);
    const newTags = isSelected
      ? filters.tags.filter((t) => t.toLowerCase() !== tagNameLower)
      : [...filters.tags, tagName];
    onChange({ ...filters, tags: newTags });
  };

  const handleFavoritesToggle = () => {
    onChange({ ...filters, favoritesOnly: !filters.favoritesOnly });
  };

  const handlePrepTimeChange = (value: number | null) => {
    onChange({ ...filters, maxPrepTime: value });
  };

  const handleCookTimeChange = (value: number | null) => {
    onChange({ ...filters, maxCookTime: value });
  };

  const handleMinServingsChange = (value: string) => {
    const num = value ? parseInt(value, 10) : null;
    onChange({ ...filters, minServings: num });
  };

  const handleMaxServingsChange = (value: string) => {
    const num = value ? parseInt(value, 10) : null;
    onChange({ ...filters, maxServings: num });
  };

  const handleClearAll = () => {
    onChange(DEFAULT_FILTERS);
  };

  // Sort tags: selected first, then alphabetically
  const filterTagsLower = filters.tags.map((t) => t.toLowerCase());
  const sortedTags = [...availableTags].sort((a, b) => {
    const aSelected = filterTagsLower.includes(a.name.toLowerCase());
    const bSelected = filterTagsLower.includes(b.name.toLowerCase());
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return a.name.localeCompare(b.name);
  });

  const visibleTags = showAllTags ? sortedTags : sortedTags.slice(0, VISIBLE_TAG_COUNT);
  const hasMoreTags = sortedTags.length > VISIBLE_TAG_COUNT;

  const hasActiveFilters =
    filters.tags.length > 0 ||
    filters.favoritesOnly ||
    filters.maxPrepTime !== null ||
    filters.maxCookTime !== null ||
    filters.minServings !== null ||
    filters.maxServings !== null;

  return (
    <div ref={panelRef} className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Filters</h3>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close filters">
          <X size={18} />
        </button>
      </div>

      <div className={styles.content}>
        {/* Tags Section */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Tags</h4>
          <div className={styles.tagGrid}>
            {visibleTags.map((tag) => (
              <label key={tag.name} className={styles.tagCheckbox}>
                <input
                  type="checkbox"
                  checked={filterTagsLower.includes(tag.name.toLowerCase())}
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
                  <ChevronUp size={16} />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown size={16} />
                  Show all {sortedTags.length} tags
                </>
              )}
            </button>
          )}
        </div>

        {/* Favorites Section */}
        <div className={styles.section}>
          <label className={styles.favoriteCheckbox}>
            <input
              type="checkbox"
              checked={filters.favoritesOnly}
              onChange={handleFavoritesToggle}
            />
            <Heart size={16} className={filters.favoritesOnly ? styles.heartFilled : ''} />
            <span>Favorites only</span>
          </label>
        </div>

        {/* Time Filters */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Time</h4>
          <div className={styles.timeFilters}>
            <div className={styles.selectGroup}>
              <label className={styles.selectLabel}>Prep Time</label>
              <select
                value={filters.maxPrepTime ?? ''}
                onChange={(e) => handlePrepTimeChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                className={styles.select}
              >
                {PREP_TIME_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.selectGroup}>
              <label className={styles.selectLabel}>Cook Time</label>
              <select
                value={filters.maxCookTime ?? ''}
                onChange={(e) => handleCookTimeChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                className={styles.select}
              >
                {COOK_TIME_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Servings Filter */}
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Servings</h4>
          <div className={styles.servingsFilter}>
            <input
              type="number"
              min={1}
              placeholder="Min"
              value={filters.minServings ?? ''}
              onChange={(e) => handleMinServingsChange(e.target.value)}
              className={styles.servingsInput}
            />
            <span className={styles.servingsTo}>to</span>
            <input
              type="number"
              min={1}
              placeholder="Max"
              value={filters.maxServings ?? ''}
              onChange={(e) => handleMaxServingsChange(e.target.value)}
              className={styles.servingsInput}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearAll}
          disabled={!hasActiveFilters}
        >
          Clear All
        </Button>
      </div>
    </div>
  );
}

/**
 * Get the count of active filters
 */
export function getActiveFilterCount(filters: RecipeFilters): number {
  let count = 0;
  if (filters.tags.length > 0) count += filters.tags.length;
  if (filters.favoritesOnly) count += 1;
  if (filters.maxPrepTime !== null) count += 1;
  if (filters.maxCookTime !== null) count += 1;
  if (filters.minServings !== null || filters.maxServings !== null) count += 1;
  return count;
}
