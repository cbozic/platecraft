import { format } from 'date-fns';
import type { PlannedMeal, Recipe } from '@/types';
import { PrintableRecipe } from './PrintableRecipe';
import styles from './PrintRecipesView.module.css';

export interface DayMeals {
  date: string;
  dateFormatted: string;
  meals: Array<{
    meal: PlannedMeal;
    recipe: Recipe;
    slotName: string;
    slotOrder?: number; // Used for sorting
  }>;
}

interface PrintRecipesViewProps {
  mealsByDay: DayMeals[];
  startDate: Date;
  endDate: Date;
}

export function PrintRecipesView({
  mealsByDay,
  startDate,
  endDate,
}: PrintRecipesViewProps) {
  const dateRangeText = `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Meal Plan Recipes</h1>
        <p className={styles.dateRange}>{dateRangeText}</p>
      </div>

      {mealsByDay.map((day, dayIndex) => (
        <div
          key={day.date}
          className={`${styles.daySection} ${dayIndex > 0 ? styles.pageBreak : ''}`}
        >
          <h2 className={styles.dayHeader}>{day.dateFormatted}</h2>

          {day.meals.map(({ meal, recipe, slotName }) => (
            <PrintableRecipe
              key={meal.id}
              recipe={recipe}
              plannedServings={meal.servings}
              mealNotes={meal.notes}
              slotName={slotName}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
