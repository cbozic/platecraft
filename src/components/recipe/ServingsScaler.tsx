import { Minus, Plus, RotateCcw } from 'lucide-react';
import styles from './ServingsScaler.module.css';

interface ServingsScalerProps {
  originalServings: number;
  currentServings: number;
  onChange: (servings: number) => void;
}

export function ServingsScaler({
  originalServings,
  currentServings,
  onChange,
}: ServingsScalerProps) {
  const isScaled = currentServings !== originalServings;

  const handleDecrement = () => {
    if (currentServings > 1) {
      onChange(currentServings - 1);
    }
  };

  const handleIncrement = () => {
    if (currentServings < 100) {
      onChange(currentServings + 1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 1 && value <= 100) {
      onChange(value);
    }
  };

  const handleReset = () => {
    onChange(originalServings);
  };

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.button}
          onClick={handleDecrement}
          disabled={currentServings <= 1}
          aria-label="Decrease servings"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={1}
          max={100}
          value={currentServings}
          onChange={handleInputChange}
          className={styles.input}
          aria-label="Number of servings"
        />
        <button
          type="button"
          className={styles.button}
          onClick={handleIncrement}
          disabled={currentServings >= 100}
          aria-label="Increase servings"
        >
          <Plus size={14} />
        </button>
      </div>
      <span className={styles.label}>servings</span>
      {isScaled && (
        <button
          type="button"
          className={styles.resetButton}
          onClick={handleReset}
          aria-label="Reset to original servings"
          title={`Reset to ${originalServings} servings`}
        >
          <RotateCcw size={14} />
          <span className={styles.originalText}>(was {originalServings})</span>
        </button>
      )}
    </div>
  );
}
