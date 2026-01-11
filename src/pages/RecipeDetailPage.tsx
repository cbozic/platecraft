import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Heart, Clock, Users, Book, Link as LinkIcon, Apple } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { ImageGallery, ServingsScaler, ShareButton } from '@/components/recipe';
import { recipeRepository, tagRepository } from '@/db';
import { scaleQuantity, formatQuantity, getScaleLabel } from '@/utils/recipeScaling';
import type { Recipe, Tag } from '@/types';
import styles from './RecipeDetailPage.module.css';

interface LocationState {
  from?: 'calendar' | 'recipes' | 'mealPlanAssistant';
  view?: 'month' | 'week';
  date?: string;
  searchQuery?: string;
  searchParams?: string;
}

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scaledServings, setScaledServings] = useState<number | null>(null);

  useEffect(() => {
    const loadRecipe = async () => {
      if (!id) return;
      try {
        const recipeData = await recipeRepository.getById(id);
        if (recipeData) {
          setRecipe(recipeData);
          setScaledServings(recipeData.servings);
          if (recipeData.tags.length > 0) {
            const tagData = await tagRepository.getByIds(recipeData.tags);
            setTags(tagData);
          }
        }
      } catch (error) {
        console.error('Failed to load recipe:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadRecipe();
  }, [id]);

  const handleDelete = async () => {
    if (!recipe) return;
    if (window.confirm('Are you sure you want to delete this recipe?')) {
      await recipeRepository.delete(recipe.id);
      navigate('/');
    }
  };

  const handleToggleFavorite = async () => {
    if (!recipe) return;
    await recipeRepository.toggleFavorite(recipe.id);
    setRecipe({ ...recipe, isFavorite: !recipe.isFavorite });
  };

  // Calculate scale factor
  const scaleFactor = useMemo(() => {
    if (!recipe || scaledServings === null) return 1;
    return scaledServings / recipe.servings;
  }, [recipe, scaledServings]);

  const isScaled = Math.abs(scaleFactor - 1) > 0.01;
  const scaleLabel = getScaleLabel(scaleFactor);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading recipe...</p>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className={styles.notFound}>
        <p>Recipe not found</p>
        <Link to="/">
          <Button>Back to Recipes</Button>
        </Link>
      </div>
    );
  }

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  // Determine back link based on where user came from
  const getBackInfo = () => {
    if (state?.from === 'calendar') {
      return { link: '/calendar', text: 'Back to Calendar' };
    }
    if (state?.from === 'mealPlanAssistant') {
      return { link: '/calendar', text: 'Back to Meal Planner' };
    }
    return { link: '/', text: 'Back to Recipes' };
  };
  const { link: backLink, text: backText } = getBackInfo();

  const handleBackClick = (e: React.MouseEvent) => {
    if (state?.from === 'mealPlanAssistant') {
      e.preventDefault();
      navigate('/calendar', {
        state: {
          openMealPlanAssistant: true,
        },
      });
    } else if (state?.from === 'calendar' && state.date) {
      e.preventDefault();
      navigate('/calendar', {
        state: {
          view: state.view,
          date: state.date,
        },
      });
    } else if (state?.from === 'recipes') {
      e.preventDefault();
      const searchParams = state.searchParams || '';
      navigate(`/${searchParams ? `?${searchParams}` : ''}`, {
        state: {
          searchQuery: state.searchQuery,
          searchParams: state.searchParams,
        },
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to={backLink} className={styles.backLink} onClick={handleBackClick}>
          <ArrowLeft size={20} />
          <span>{backText}</span>
        </Link>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={handleToggleFavorite}
            className={recipe.isFavorite ? styles.favorited : ''}
          >
            <Heart size={20} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
          </Button>
          <Link to={`/recipes/${recipe.id}/edit`} state={{ from: state?.from }}>
            <Button variant="outline" leftIcon={<Edit size={18} />}>
              Edit
            </Button>
          </Link>
          <ShareButton recipe={recipe} />
          <Button variant="danger" leftIcon={<Trash2 size={18} />} onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.main}>
          <h1 className={styles.title}>{recipe.title}</h1>

          {recipe.description && (
            <p className={styles.description}>{recipe.description}</p>
          )}

          <div className={styles.meta}>
            {recipe.prepTimeMinutes && (
              <div className={styles.metaItem}>
                <Clock size={16} />
                <span>Prep: {recipe.prepTimeMinutes} min</span>
              </div>
            )}
            {recipe.cookTimeMinutes && (
              <div className={styles.metaItem}>
                <Clock size={16} />
                <span>Cook: {recipe.cookTimeMinutes} min</span>
              </div>
            )}
            {totalTime > 0 && (
              <div className={styles.metaItem}>
                <Clock size={16} />
                <span>Total: {totalTime} min</span>
              </div>
            )}
            <div className={styles.metaItem}>
              <Users size={16} />
              <ServingsScaler
                originalServings={recipe.servings}
                currentServings={scaledServings ?? recipe.servings}
                onChange={setScaledServings}
              />
            </div>
          </div>

          {tags.length > 0 && (
            <div className={styles.tags}>
              {[...tags].sort((a, b) => a.name.localeCompare(b.name)).map((tag) => (
                <span key={tag.id} className={styles.tag}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {recipe.images && recipe.images.length > 0 && (
            <Card>
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Images</h2>
                <ImageGallery images={recipe.images} />
              </div>
            </Card>
          )}

          <Card>
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  Ingredients
                  {scaleLabel && (
                    <span className={styles.scaleIndicator}>({scaleLabel})</span>
                  )}
                </h2>
              </div>
              <ul className={styles.ingredientList}>
                {recipe.ingredients.map((ingredient) => {
                  const scaledQty = scaleQuantity(ingredient.quantity, scaleFactor);
                  const displayQty = formatQuantity(scaledQty, ingredient.unit);

                  return (
                    <li key={ingredient.id} className={styles.ingredient}>
                      <span className={`${styles.ingredientQuantity} ${isScaled ? styles.scaled : ''}`}>
                        {displayQty} {ingredient.unit}
                      </span>
                      <span className={styles.ingredientName}>
                        {ingredient.name}
                        {ingredient.preparationNotes && (
                          <span className={styles.prepNotes}>
                            , {ingredient.preparationNotes}
                          </span>
                        )}
                        {ingredient.isOptional && (
                          <span className={styles.optional}>(optional)</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>

          <Card>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Instructions</h2>
              <div className={styles.instructions}>{recipe.instructions}</div>
            </div>
          </Card>

          {recipe.notes && (
            <Card>
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Notes</h2>
                <div className={styles.notes}>{recipe.notes}</div>
              </div>
            </Card>
          )}

          {(recipe.sourceUrl || recipe.referenceCookbook || recipe.referenceOther) && (
            <Card>
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Source</h2>
                <div className={styles.sourceInfo}>
                  {recipe.referenceCookbook && (
                    <div className={styles.sourceItem}>
                      <Book size={16} />
                      <span>
                        {recipe.referenceCookbook}
                        {recipe.referencePageNumber && `, p. ${recipe.referencePageNumber}`}
                      </span>
                    </div>
                  )}
                  {recipe.referenceOther && (
                    <div className={styles.sourceItem}>
                      <span>{recipe.referenceOther}</span>
                    </div>
                  )}
                  {recipe.sourceUrl && (
                    <div className={styles.sourceItem}>
                      <LinkIcon size={16} />
                      <a
                        href={recipe.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.sourceLink}
                      >
                        {recipe.sourceUrl}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Nutrition Facts</h2>
              {recipe.nutrition ? (
                <div className={styles.nutritionFacts}>
                  <h3 className={styles.nutritionHeader}>Nutrition Facts</h3>
                  <p className={styles.nutritionServing}>
                    Per serving ({scaledServings ?? recipe.servings} servings per recipe)
                  </p>
                  <div className={styles.nutritionCalories}>
                    <span className={styles.nutritionCaloriesLabel}>Calories</span>
                    <span className={styles.nutritionCaloriesValue}>
                      {Math.round(recipe.nutrition.calories)}
                    </span>
                  </div>
                  <div className={styles.nutritionRow}>
                    <span className={`${styles.nutritionLabel} ${styles.bold}`}>Total Fat</span>
                    <span className={styles.nutritionValue}>
                      {Math.round(recipe.nutrition.fat * 10) / 10}g
                    </span>
                  </div>
                  <div className={styles.nutritionRow}>
                    <span className={`${styles.nutritionLabel} ${styles.bold}`}>Sodium</span>
                    <span className={styles.nutritionValue}>
                      {Math.round(recipe.nutrition.sodium)}mg
                    </span>
                  </div>
                  <div className={styles.nutritionRow}>
                    <span className={`${styles.nutritionLabel} ${styles.bold}`}>Total Carbohydrate</span>
                    <span className={styles.nutritionValue}>
                      {Math.round(recipe.nutrition.carbohydrates * 10) / 10}g
                    </span>
                  </div>
                  <div className={styles.nutritionRow}>
                    <span className={styles.nutritionLabel}>Dietary Fiber</span>
                    <span className={styles.nutritionValue}>
                      {Math.round(recipe.nutrition.fiber * 10) / 10}g
                    </span>
                  </div>
                  <div className={styles.nutritionRow}>
                    <span className={`${styles.nutritionLabel} ${styles.bold}`}>Protein</span>
                    <span className={styles.nutritionValue}>
                      {Math.round(recipe.nutrition.protein * 10) / 10}g
                    </span>
                  </div>
                  <p className={styles.nutritionDv}>
                    * Percent Daily Values are based on a 2,000 calorie diet.
                  </p>
                </div>
              ) : (
                <div className={styles.noNutrition}>
                  <Apple size={48} className={styles.noNutritionIcon} />
                  <p>No nutrition information available</p>
                  <Link to={`/recipes/${recipe.id}/edit`} state={{ from: state?.from }}>
                    <Button variant="outline" size="sm">
                      Add Nutrition Info
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
