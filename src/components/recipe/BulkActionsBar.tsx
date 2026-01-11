import { X, Tag, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './BulkActionsBar.module.css';

interface BulkActionsBarProps {
  selectedCount: number;
  onAddTags: () => void;
  onRemoveTags: () => void;
  onReprocess: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onAddTags,
  onRemoveTags,
  onReprocess,
  onDelete,
  onClearSelection,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        {selectedCount} selected
      </span>

      <div className={styles.actions}>
        <Button variant="outline" size="sm" leftIcon={<Tag size={16} />} onClick={onAddTags}>
          Add Tags
        </Button>
        <Button variant="outline" size="sm" leftIcon={<Tag size={16} />} onClick={onRemoveTags}>
          Remove Tags
        </Button>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw size={16} />} onClick={onReprocess}>
          Reprocess
        </Button>
        <Button variant="danger" size="sm" leftIcon={<Trash2 size={16} />} onClick={onDelete}>
          Delete
        </Button>
      </div>

      <button className={styles.closeButton} onClick={onClearSelection} aria-label="Clear selection">
        <X size={18} />
      </button>
    </div>
  );
}
