import { LayoutGrid, List } from 'lucide-react';
import styles from './ViewToggle.module.css';

interface ViewToggleProps {
  view: 'grid' | 'table';
  onChange: (view: 'grid' | 'table') => void;
}

export function ViewToggle({ view, onChange }: ViewToggleProps) {
  return (
    <div className={styles.toggle}>
      <button
        type="button"
        className={`${styles.button} ${view === 'grid' ? styles.active : ''}`}
        onClick={() => onChange('grid')}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
      >
        <LayoutGrid size={18} />
      </button>
      <button
        type="button"
        className={`${styles.button} ${view === 'table' ? styles.active : ''}`}
        onClick={() => onChange('table')}
        aria-label="Table view"
        aria-pressed={view === 'table'}
      >
        <List size={18} />
      </button>
    </div>
  );
}
