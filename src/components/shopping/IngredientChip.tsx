import styles from './IngredientChip.module.css';

interface IngredientChipProps {
  name: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
}

export function IngredientChip({ name, isSelected, onChange }: IngredientChipProps) {
  return (
    <label className={styles.chip}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.label}>{name}</span>
    </label>
  );
}
