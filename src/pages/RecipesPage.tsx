import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, Upload } from 'lucide-react';
import { Button, Input, Card } from '@/components/ui';
import { recipeRepository } from '@/db';
import type { Recipe } from '@/types';
import styles from './RecipesPage.module.css';

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const recipesData = await recipeRepository.getAll();
        setRecipes(recipesData);
      } catch (error) {
        console.error('Failed to load recipes:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const filteredRecipes = searchQuery
    ? recipes.filter(
        (recipe) =>
          recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          recipe.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recipes;

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading recipes...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Recipes</h1>
        <div className={styles.headerActions}>
          <Link to="/import">
            <Button variant="outline" leftIcon={<Upload size={18} />}>Import</Button>
          </Link>
          <Link to="/recipes/new">
            <Button leftIcon={<Plus size={18} />}>Add Recipe</Button>
          </Link>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Input
            type="search"
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
            fullWidth
          />
        </div>
        <Button variant="outline" leftIcon={<Filter size={18} />}>
          Filter
        </Button>
      </div>

      {filteredRecipes.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No recipes yet</p>
          <p className={styles.emptyText}>
            Start building your recipe collection by adding your first recipe.
          </p>
          <Link to="/recipes/new">
            <Button leftIcon={<Plus size={18} />}>Add Your First Recipe</Button>
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredRecipes.map((recipe) => (
            <Link key={recipe.id} to={`/recipes/${recipe.id}`} className={styles.cardLink}>
              <Card hoverable padding="none">
                <div className={styles.cardImage}>
                  {recipe.images.find((img) => img.isPrimary)?.data ? (
                    <img
                      src={
                        typeof recipe.images.find((img) => img.isPrimary)?.data === 'string'
                          ? (recipe.images.find((img) => img.isPrimary)?.data as string)
                          : URL.createObjectURL(recipe.images.find((img) => img.isPrimary)?.data as Blob)
                      }
                      alt={recipe.title}
                    />
                  ) : (
                    <div className={styles.placeholderImage}>🍽️</div>
                  )}
                </div>
                <div className={styles.cardContent}>
                  <h3 className={styles.cardTitle}>{recipe.title}</h3>
                  {recipe.description && (
                    <p className={styles.cardDescription}>{recipe.description}</p>
                  )}
                  <div className={styles.cardMeta}>
                    {recipe.prepTimeMinutes && (
                      <span>Prep: {recipe.prepTimeMinutes}m</span>
                    )}
                    {recipe.cookTimeMinutes && (
                      <span>Cook: {recipe.cookTimeMinutes}m</span>
                    )}
                    <span>{recipe.servings} servings</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
