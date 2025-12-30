import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Card, CardBody } from '@/components/ui';
import { recipeRepository, tagRepository } from '@/db';
import type { Tag, Ingredient } from '@/types';
import { UNIT_INFO } from '@/types/units';
import styles from './RecipeFormPage.module.css';

const emptyIngredient: Omit<Ingredient, 'id'> = {
  name: '',
  quantity: null,
  unit: null,
  preparationNotes: '',
  isOptional: false,
};

export function RecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<(Ingredient | Omit<Ingredient, 'id'>)[]>([
    { ...emptyIngredient },
  ]);
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [servings, setServings] = useState(4);
  const [prepTime, setPrepTime] = useState<number | ''>('');
  const [cookTime, setCookTime] = useState<number | ''>('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const tags = await tagRepository.getVisibleTags();
        setAvailableTags(tags);

        if (id) {
          const recipe = await recipeRepository.getById(id);
          if (recipe) {
            setTitle(recipe.title);
            setDescription(recipe.description || '');
            setIngredients(recipe.ingredients);
            setInstructions(recipe.instructions);
            setNotes(recipe.notes || '');
            setServings(recipe.servings);
            setPrepTime(recipe.prepTimeMinutes || '');
            setCookTime(recipe.cookTimeMinutes || '');
            setSourceUrl(recipe.sourceUrl || '');
            setSourceReference(recipe.sourceReference || '');
            setSelectedTags(recipe.tags);
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { ...emptyIngredient }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (
    index: number,
    field: keyof Ingredient,
    value: string | number | boolean | null
  ) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleToggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter((t) => t !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    try {
      const formData = {
        title: title.trim(),
        description: description.trim(),
        ingredients: ingredients
          .filter((ing) => ing.name.trim())
          .map((ing) => ({
            ...ing,
            name: ing.name.trim(),
            preparationNotes: ing.preparationNotes?.trim() || undefined,
          })),
        instructions: instructions,
        notes: notes,
        tags: selectedTags,
        servings,
        prepTimeMinutes: prepTime || null,
        cookTimeMinutes: cookTime || null,
        sourceUrl: sourceUrl.trim(),
        sourceReference: sourceReference.trim(),
        nutrition: null,
      };

      if (isEditing && id) {
        await recipeRepository.update(id, formData);
        navigate(`/recipes/${id}`);
      } else {
        const newRecipe = await recipeRepository.create(formData);
        navigate(`/recipes/${newRecipe.id}`);
      }
    } catch (error) {
      console.error('Failed to save recipe:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to={isEditing ? `/recipes/${id}` : '/'} className={styles.backLink}>
          <ArrowLeft size={20} />
          <span>Cancel</span>
        </Link>
        <h1 className={styles.title}>{isEditing ? 'Edit Recipe' : 'New Recipe'}</h1>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Basic Info</h2>
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                fullWidth
              />
              <div className={styles.field}>
                <label className={styles.label}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={styles.textarea}
                  rows={2}
                  placeholder="Brief description of the recipe"
                />
              </div>
              <div className={styles.row}>
                <Input
                  label="Servings"
                  type="number"
                  min={1}
                  value={servings}
                  onChange={(e) => setServings(parseInt(e.target.value, 10) || 1)}
                />
                <Input
                  label="Prep Time (min)"
                  type="number"
                  min={0}
                  value={prepTime}
                  onChange={(e) => setPrepTime(e.target.value ? parseInt(e.target.value, 10) : '')}
                />
                <Input
                  label="Cook Time (min)"
                  type="number"
                  min={0}
                  value={cookTime}
                  onChange={(e) => setCookTime(e.target.value ? parseInt(e.target.value, 10) : '')}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Ingredients</h2>
              {ingredients.map((ingredient, index) => (
                <div key={index} className={styles.ingredientRow}>
                  <input
                    type="number"
                    step="any"
                    placeholder="Qty"
                    value={ingredient.quantity ?? ''}
                    onChange={(e) =>
                      handleIngredientChange(
                        index,
                        'quantity',
                        e.target.value ? parseFloat(e.target.value) : null
                      )
                    }
                    className={styles.qtyInput}
                  />
                  <select
                    value={ingredient.unit || ''}
                    onChange={(e) =>
                      handleIngredientChange(
                        index,
                        'unit',
                        e.target.value || null
                      )
                    }
                    className={styles.unitSelect}
                  >
                    <option value="">Unit</option>
                    {Object.entries(UNIT_INFO).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.abbreviation || info.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Ingredient name"
                    value={ingredient.name}
                    onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                    className={styles.nameInput}
                  />
                  <input
                    type="text"
                    placeholder="Prep notes"
                    value={ingredient.preparationNotes || ''}
                    onChange={(e) =>
                      handleIngredientChange(index, 'preparationNotes', e.target.value)
                    }
                    className={styles.prepInput}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveIngredient(index)}
                    disabled={ingredients.length === 1}
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                leftIcon={<Plus size={18} />}
                onClick={handleAddIngredient}
              >
                Add Ingredient
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Instructions</h2>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className={styles.textarea}
                rows={10}
                placeholder="Step-by-step instructions..."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Notes</h2>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={styles.textarea}
                rows={4}
                placeholder="Tips, variations, or other notes..."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Tags</h2>
              <div className={styles.tagList}>
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`${styles.tagButton} ${selectedTags.includes(tag.id) ? styles.tagSelected : ''}`}
                    onClick={() => handleToggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Source</h2>
              <Input
                label="URL"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                fullWidth
              />
              <Input
                label="Reference"
                value={sourceReference}
                onChange={(e) => setSourceReference(e.target.value)}
                placeholder="Cookbook name, page number, etc."
                fullWidth
              />
            </div>
          </CardBody>
        </Card>

        <div className={styles.formActions}>
          <Link to={isEditing ? `/recipes/${id}` : '/'}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Save Changes' : 'Create Recipe'}
          </Button>
        </div>
      </form>
    </div>
  );
}
