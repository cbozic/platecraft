import type { Recipe, Ingredient } from '@/types';
import { scaleQuantity, formatQuantity } from '@/utils/recipeScaling';
import styles from './PrintableRecipe.module.css';

interface PrintableRecipeProps {
  recipe: Recipe;
  plannedServings: number;
  mealNotes?: string;
  slotName: string;
}

export function PrintableRecipe({
  recipe,
  plannedServings,
  mealNotes,
  slotName,
}: PrintableRecipeProps) {
  const scaleFactor = plannedServings / recipe.servings;

  const formatIngredient = (ingredient: Ingredient): string => {
    const scaledQty = scaleQuantity(ingredient.quantity, scaleFactor);
    const qtyStr = formatQuantity(scaledQty, ingredient.unit);
    const unitStr = ingredient.unit || '';
    const prepNotes = ingredient.preparationNotes ? `, ${ingredient.preparationNotes}` : '';
    const optional = ingredient.isOptional ? ' (optional)' : '';

    if (qtyStr && unitStr) {
      return `${qtyStr} ${unitStr} ${ingredient.name}${prepNotes}${optional}`;
    } else if (qtyStr) {
      return `${qtyStr} ${ingredient.name}${prepNotes}${optional}`;
    } else {
      return `${ingredient.name}${prepNotes}${optional}`;
    }
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const totalTime =
    (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <div className={styles.recipe}>
      <div className={styles.header}>
        <span className={styles.slotLabel}>{slotName}</span>
        <h3 className={styles.title}>{recipe.title}</h3>
        <div className={styles.meta}>
          <span className={styles.servings}>
            Servings: {plannedServings}
            {plannedServings !== recipe.servings && (
              <span className={styles.scaled}> (scaled from {recipe.servings})</span>
            )}
          </span>
          {totalTime > 0 && (
            <span className={styles.time}>
              {recipe.prepTimeMinutes && `Prep: ${formatTime(recipe.prepTimeMinutes)}`}
              {recipe.prepTimeMinutes && recipe.cookTimeMinutes && ' | '}
              {recipe.cookTimeMinutes && `Cook: ${formatTime(recipe.cookTimeMinutes)}`}
            </span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.ingredientsSection}>
          <h4 className={styles.sectionTitle}>Ingredients</h4>
          <ul className={styles.ingredientsList}>
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id} className={styles.ingredient}>
                {formatIngredient(ingredient)}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.instructionsSection}>
          <h4 className={styles.sectionTitle}>Instructions</h4>
          <div className={styles.instructions}>{recipe.instructions}</div>
        </div>

        {(recipe.notes || mealNotes) && (
          <div className={styles.notesSection}>
            <h4 className={styles.sectionTitle}>Notes</h4>
            {recipe.notes && (
              <div className={styles.notes}>{recipe.notes}</div>
            )}
            {mealNotes && (
              <div className={styles.mealNotes}>
                <strong>Meal notes:</strong> {mealNotes}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
