import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { Button, Input, Card, CardBody } from '@/components/ui';
import { ImageGallery, ImageUploader, NutritionLookup, IngredientNutritionCalculator } from '@/components/recipe';
import { recipeRepository, tagRepository } from '@/db';
import { imageService } from '@/services';
import { useIOSInstallBanner } from '@/context/IOSInstallBannerContext';
import type { Tag, Ingredient, RecipeImage, NutritionInfo } from '@/types';
import { UNIT_INFO } from '@/types/units';
import { DEFAULT_STORE_SECTIONS } from '@/types';
import styles from './RecipeFormPage.module.css';

const emptyIngredient: Omit<Ingredient, 'id'> = {
  name: '',
  quantity: null,
  unit: null,
  isOptional: false,
  storeSection: 'other',
};

interface LocationState {
  from?: 'calendar' | 'recipes' | 'mealPlanAssistant';
}

export function RecipeFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  const { triggerAfterImport } = useIOSInstallBanner();
  const isEditing = Boolean(id);
  const isImporting = searchParams.get('imported') === 'true';

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
  const [referenceCookbook, setReferenceCookbook] = useState('');
  const [referencePageNumber, setReferencePageNumber] = useState<number | ''>('');
  const [referenceOther, setReferenceOther] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [images, setImages] = useState<RecipeImage[]>([]);
  const [hasNutrition, setHasNutrition] = useState(false);
  const [nutrition, setNutrition] = useState<NutritionInfo>({
    calories: 0,
    protein: 0,
    carbohydrates: 0,
    fat: 0,
    fiber: 0,
    sodium: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const tags = await tagRepository.getVisibleTags();
        setAvailableTags(tags.sort((a, b) => a.name.localeCompare(b.name)));

        if (id) {
          // Editing existing recipe
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
            setReferenceCookbook(recipe.referenceCookbook || '');
            setReferencePageNumber(recipe.referencePageNumber || '');
            setReferenceOther(recipe.referenceOther || '');
            setSelectedTags(recipe.tags);
            setImages(recipe.images || []);
            if (recipe.nutrition) {
              setHasNutrition(true);
              setNutrition(recipe.nutrition);
            }
          }
        } else if (isImporting) {
          // Loading imported recipe from sessionStorage
          const importedData = sessionStorage.getItem('importedRecipe');
          if (importedData) {
            try {
              const imported = JSON.parse(importedData);
              setTitle(imported.title || '');
              setDescription(imported.description || '');
              if (imported.ingredients && imported.ingredients.length > 0) {
                setIngredients(imported.ingredients);
              }
              setInstructions(imported.instructions || '');
              setNotes(imported.notes || '');
              setServings(imported.servings || 4);
              setPrepTime(imported.prepTimeMinutes || '');
              setCookTime(imported.cookTimeMinutes || '');
              setSourceUrl(imported.sourceUrl || '');
              setReferenceCookbook(imported.referenceCookbook || '');
              setReferencePageNumber(imported.referencePageNumber || '');
              setReferenceOther(imported.referenceOther || '');
              setSelectedTags(imported.tags || []);
              // Restore nutrition data
              if (imported.nutrition) {
                setNutrition(imported.nutrition);
                setHasNutrition(true);
              }
              // Restore images from base64 to Blobs
              if (imported.images && imported.images.length > 0) {
                const restoredImages = imageService.restoreImagesFromImport(imported.images);
                setImages(restoredImages);
              }
              // Clear the imported data from sessionStorage
              sessionStorage.removeItem('importedRecipe');
            } catch (e) {
              console.error('Failed to parse imported recipe:', e);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, isImporting]);

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

  const handleAddImage = useCallback((image: RecipeImage) => {
    setImages((prev) => [...prev, image]);
  }, []);

  const handleDeleteImage = useCallback((imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
  }, []);

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
        referenceCookbook: referenceCookbook.trim(),
        referencePageNumber: referencePageNumber || null,
        referenceOther: referenceOther.trim(),
        nutrition: hasNutrition ? nutrition : null,
        images,
      };

      if (isEditing && id) {
        await recipeRepository.update(id, formData);
        navigate(`/recipes/${id}`, { state: { from: locationState?.from } });
      } else {
        const newRecipe = await recipeRepository.create(formData);
        triggerAfterImport();
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
        <Link
          to={isEditing ? `/recipes/${id}` : '/'}
          className={styles.backLink}
          state={isEditing ? { from: locationState?.from } : undefined}
        >
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
                  <select
                    value={ingredient.storeSection || 'other'}
                    onChange={(e) =>
                      handleIngredientChange(index, 'storeSection', e.target.value)
                    }
                    className={styles.sectionSelect}
                  >
                    {DEFAULT_STORE_SECTIONS.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
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
              <h2 className={styles.sectionTitle}>Images</h2>
              {images.length > 0 && (
                <ImageGallery
                  images={images}
                  editable
                  onDelete={handleDeleteImage}
                />
              )}
              <ImageUploader onImageAdd={handleAddImage} />
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
              <div className={styles.row}>
                <Input
                  label="Cookbook"
                  value={referenceCookbook}
                  onChange={(e) => setReferenceCookbook(e.target.value)}
                  placeholder="Cookbook name"
                />
                <Input
                  label="Page"
                  type="number"
                  min={1}
                  value={referencePageNumber}
                  onChange={(e) => setReferencePageNumber(e.target.value ? parseInt(e.target.value, 10) : '')}
                  placeholder="Page #"
                />
              </div>
              <Input
                label="Other Reference"
                value={referenceOther}
                onChange={(e) => setReferenceOther(e.target.value)}
                placeholder="Magazine, family recipe, etc."
                fullWidth
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className={styles.formSection}>
              <h2 className={styles.sectionTitle}>Nutrition Information</h2>
              <div className={styles.nutritionToggle}>
                <input
                  type="checkbox"
                  id="hasNutrition"
                  checked={hasNutrition}
                  onChange={(e) => setHasNutrition(e.target.checked)}
                />
                <label htmlFor="hasNutrition">
                  Add nutrition information (per serving)
                </label>
              </div>
              {hasNutrition && (
                <>
                  <div className={styles.nutritionGrid}>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Calories <span className={styles.nutritionUnit}>(kcal)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={nutrition.calories || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            calories: e.target.value ? parseInt(e.target.value, 10) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Protein <span className={styles.nutritionUnit}>(g)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={nutrition.protein || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            protein: e.target.value ? parseFloat(e.target.value) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Carbohydrates <span className={styles.nutritionUnit}>(g)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={nutrition.carbohydrates || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            carbohydrates: e.target.value ? parseFloat(e.target.value) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Fat <span className={styles.nutritionUnit}>(g)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={nutrition.fat || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            fat: e.target.value ? parseFloat(e.target.value) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Fiber <span className={styles.nutritionUnit}>(g)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={nutrition.fiber || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            fiber: e.target.value ? parseFloat(e.target.value) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                    <div className={styles.nutritionField}>
                      <label className={styles.nutritionLabel}>
                        Sodium <span className={styles.nutritionUnit}>(mg)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={nutrition.sodium || ''}
                        onChange={(e) =>
                          setNutrition({
                            ...nutrition,
                            sodium: e.target.value ? parseInt(e.target.value, 10) : 0,
                          })
                        }
                        className={styles.nutritionInput}
                      />
                    </div>
                  </div>
                  <div className={styles.nutritionActions}>
                    <IngredientNutritionCalculator
                      ingredients={ingredients.filter((i): i is Ingredient => 'id' in i && !!i.name.trim())}
                      servings={servings}
                      onCalculate={(nutritionData) => setNutrition(nutritionData)}
                    />
                    <NutritionLookup
                      onSelect={(nutritionData) => setNutrition(nutritionData)}
                      ingredientName={title}
                    />
                    <p className={styles.nutritionHelp}>
                      Calculate from ingredients (recommended), or look up a single food item.
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardBody>
        </Card>

        <div className={styles.formActions}>
          <Link
            to={isEditing ? `/recipes/${id}` : '/'}
            state={isEditing ? { from: locationState?.from } : undefined}
          >
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
