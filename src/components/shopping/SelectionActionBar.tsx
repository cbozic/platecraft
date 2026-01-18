import { X, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from './SelectionActionBar.module.css';

interface SelectionActionBarProps {
  selectedCount: number;
  onCancel: () => void;
  onGroupSelected: () => void;
}

export function SelectionActionBar({
  selectedCount,
  onCancel,
  onGroupSelected,
}: SelectionActionBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.content}>
        <span className={styles.count}>
          {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X size={16} />
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onGroupSelected}
            disabled={selectedCount < 2}
            leftIcon={<LinkIcon size={16} />}
          >
            Group Selected
          </Button>
        </div>
      </div>
    </div>
  );
}
