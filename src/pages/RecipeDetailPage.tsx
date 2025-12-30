import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Heart, Clock, Users } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { recipeRepository, tagRepository } from '@/db';
import type { Recipe, Tag } from '@/types';
import styles from './RecipeDetailPage.module.css';

export function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRecipe = async () => {
      if (!id) return;
      try {
        const recipeData = await recipeRepository.getById(id);
        if (recipeData) {
          setRecipe(recipeData);
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={20} />
          <span>Back to Recipes</span>
        </Link>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            onClick={handleToggleFavorite}
            className={recipe.isFavorite ? styles.favorited : ''}
          >
            <Heart size={20} fill={recipe.isFavorite ? 'currentColor' : 'none'} />
          </Button>
          <Link to={`/recipes/${recipe.id}/edit`}>
            <Button variant="outline" leftIcon={<Edit size={18} />}>
              Edit
            </Button>
          </Link>
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
              <span>{recipe.servings} servings</span>
            </div>
          </div>

          {tags.length > 0 && (
            <div className={styles.tags}>
              {tags.map((tag) => (
                <span key={tag.id} className={styles.tag}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          <Card>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Ingredients</h2>
              <ul className={styles.ingredientList}>
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id} className={styles.ingredient}>
                    <span className={styles.ingredientQuantity}>
                      {ingredient.quantity} {ingredient.unit}
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
                ))}
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
        </div>
      </div>
    </div>
  );
}
