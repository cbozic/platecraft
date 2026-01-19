import { useState, useCallback } from 'react';
import { Loader2, CheckCircle, AlertTriangle, Check, X } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { Recipe, NutritionInfo } from '@/types';
import type {
  ReprocessableField,
  ReprocessingConfig,
  RecipeReprocessingResult,
  ReprocessingProgress,
  ApprovedChanges,
} from '@/types/reprocessing';
import { recipeReprocessingService } from '@/services/recipeReprocessingService';
import type { CapitalizationChange } from '@/utils/capitalization';
import styles from './ReprocessModal.module.css';

type Step =
  | 'field-selection'
  | 'scanning'
  | 'summary'
  | 'processing'
  | 'review'
  | 'applying'
  | 'complete';

interface ReprocessModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRecipes: Recipe[];
  onComplete: (updatedRecipeIds: string[]) => void;
}

const FIELD_LABELS: Record<ReprocessableField, string> = {
  nutrition: 'Nutrition Info',
  prepTimeMinutes: 'Prep Time',
  cookTimeMinutes: 'Cook Time',
  description: 'Description',
  capitalization: 'Fix Capitalization',
};

const FIELD_DESCRIPTIONS: Partial<Record<ReprocessableField, string>> = {
  capitalization: 'Fix lowercase or ALL CAPS titles and text',
};

export function ReprocessModal({
  isOpen,
  onClose,
  selectedRecipes,
  onComplete,
}: ReprocessModalProps) {
  const [step, setStep] = useState<Step>('field-selection');
  const [config, setConfig] = useState<ReprocessingConfig>({ fields: ['nutrition'] });
  const [progress, setProgress] = useState<ReprocessingProgress>({
    totalRecipes: 0,
    scannedRecipes: 0,
    processedRecipes: 0,
    recipesWithChanges: 0,
    stage: 'scanning',
  });
  const [results, setResults] = useState<RecipeReprocessingResult[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<Map<string, Set<ReprocessableField>>>(new Map());
  // Track individual capitalization change selections (recipeId -> set of change indices)
  const [selectedCapIndices, setSelectedCapIndices] = useState<Map<string, Set<number>>>(new Map());
  // Track extracted field selections (cookbook, pageNumber)
  type ExtractedField = 'cookbook' | 'pageNumber';
  const [selectedExtracted, setSelectedExtracted] = useState<Map<string, Set<ExtractedField>>>(new Map());
  const [applyResult, setApplyResult] = useState<{ success: number; failed: number } | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [userHint, setUserHint] = useState('');

  const resetState = useCallback(() => {
    setStep('field-selection');
    setConfig({ fields: ['nutrition'] });
    setProgress({
      totalRecipes: 0,
      scannedRecipes: 0,
      processedRecipes: 0,
      recipesWithChanges: 0,
      stage: 'scanning',
    });
    setResults([]);
    setSelectedChanges(new Map());
    setSelectedCapIndices(new Map());
    setSelectedExtracted(new Map());
    setApplyResult(null);
    setIsCancelled(false);
    setUserHint('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleFieldToggle = (field: ReprocessableField) => {
    setConfig((prev) => ({
      fields: prev.fields.includes(field)
        ? prev.fields.filter((f) => f !== field)
        : [...prev.fields, field],
    }));
  };

  const handleStartScanning = async () => {
    if (config.fields.length === 0) return;

    setStep('scanning');
    setIsCancelled(false);

    const scanResults: RecipeReprocessingResult[] = [];
    let recipesWithBlanks = 0;
    let recipesWithPhotos = 0;

    setProgress({
      totalRecipes: selectedRecipes.length,
      scannedRecipes: 0,
      processedRecipes: 0,
      recipesWithChanges: 0,
      stage: 'scanning',
    });

    for (let i = 0; i < selectedRecipes.length; i++) {
      if (isCancelled) break;

      const recipe = selectedRecipes[i];
      const blankFields = recipeReprocessingService.getBlankFields(recipe, config);
      const sourcePhotos = recipeReprocessingService.findSourcePhotos(recipe);
      const hasNotes = recipe.notes && recipe.notes.trim().length > 0;
      const hasHint = userHint && userHint.trim().length > 0;

      // Process recipe if it has blank fields OR has notes/photos OR user provided a hint
      const shouldProcess =
        blankFields.length > 0 || hasNotes || sourcePhotos.length > 0 || hasHint;

      const result: RecipeReprocessingResult = {
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        status: shouldProcess ? 'pending' : 'skipped',
        hasBlankFields: blankFields.length > 0,
        blankFields,
        proposedChanges: [],
        hasSourcePhoto: sourcePhotos.length > 0,
      };

      scanResults.push(result);

      if (shouldProcess) {
        recipesWithBlanks++;
        if (sourcePhotos.length > 0) {
          recipesWithPhotos++;
        }
      }

      setProgress((prev) => ({
        ...prev,
        scannedRecipes: i + 1,
        currentRecipe: { id: recipe.id, title: recipe.title },
      }));
    }

    setResults(scanResults);
    setProgress((prev) => ({
      ...prev,
      recipesWithChanges: recipesWithBlanks,
    }));

    if (recipesWithBlanks === 0) {
      setStep('complete');
      setApplyResult({ success: 0, failed: 0 });
    } else {
      setStep('summary');
    }
  };

  const handleStartProcessing = async () => {
    setStep('processing');
    setIsCancelled(false);

    const recipesToProcess = results.filter((r) => r.status === 'pending');
    const updatedResults = [...results];
    let processedCount = 0;
    let changesCount = 0;

    setProgress((prev) => ({
      ...prev,
      processedRecipes: 0,
      stage: 'extracting',
    }));

    for (const result of recipesToProcess) {
      if (isCancelled) break;

      const recipe = selectedRecipes.find((r) => r.id === result.recipeId);
      if (!recipe) continue;

      setProgress((prev) => ({
        ...prev,
        currentRecipe: { id: recipe.id, title: recipe.title },
      }));

      const processedResult = await recipeReprocessingService.processRecipe(recipe, config, userHint);

      // Update the result in the array
      const index = updatedResults.findIndex((r) => r.recipeId === result.recipeId);
      if (index !== -1) {
        updatedResults[index] = processedResult;
      }

      processedCount++;
      const hasChanges =
        processedResult.proposedChanges.length > 0 ||
        processedResult.extractedCookbook ||
        processedResult.extractedPageNumber;
      if (hasChanges) {
        changesCount++;
        // Auto-select all fields for recipes with changes
        const fieldSet = new Set<ReprocessableField>(
          processedResult.proposedChanges.map(c => c.field)
        );
        setSelectedChanges((prev) => new Map(prev).set(processedResult.recipeId, fieldSet));

        // Auto-select all capitalization sub-changes if present
        const capChange = processedResult.proposedChanges.find(c => c.field === 'capitalization');
        if (capChange && Array.isArray(capChange.newValue)) {
          const capIndices = new Set<number>(
            capChange.newValue.map((_, idx) => idx)
          );
          setSelectedCapIndices((prev) => new Map(prev).set(processedResult.recipeId, capIndices));
        }

        // Auto-select extracted fields (cookbook, pageNumber)
        const extractedSet = new Set<ExtractedField>();
        if (processedResult.extractedCookbook) extractedSet.add('cookbook');
        if (processedResult.extractedPageNumber) extractedSet.add('pageNumber');
        if (extractedSet.size > 0) {
          setSelectedExtracted((prev) => new Map(prev).set(processedResult.recipeId, extractedSet));
        }
      }

      setProgress((prev) => ({
        ...prev,
        processedRecipes: processedCount,
        recipesWithChanges: changesCount,
      }));

      // Rate limiting delay if using vision
      if (processedResult.proposedChanges.some((c) => c.source === 'vision')) {
        await recipeReprocessingService.delay(recipeReprocessingService.getVisionApiDelay());
      }
    }

    setResults(updatedResults);

    if (changesCount === 0) {
      setStep('complete');
      setApplyResult({ success: 0, failed: 0 });
    } else {
      setStep('review');
    }
  };

  const handleToggleRecipeSelection = (recipeId: string) => {
    const result = results.find(r => r.recipeId === recipeId);
    if (!result) return;

    // Check current selection state
    const currentFields = selectedChanges.get(recipeId);
    const currentExtracted = selectedExtracted.get(recipeId);
    const currentCapIndices = selectedCapIndices.get(recipeId);

    const allFields = new Set<ReprocessableField>(result.proposedChanges.map(c => c.field));
    const allExtracted = new Set<ExtractedField>();
    if (result.extractedCookbook) allExtracted.add('cookbook');
    if (result.extractedPageNumber) allExtracted.add('pageNumber');

    // Check if all are currently selected
    const fieldsAllSelected = allFields.size === 0 || (currentFields && [...allFields].every(f => currentFields.has(f)));
    const extractedAllSelected = allExtracted.size === 0 || (currentExtracted && [...allExtracted].every(f => currentExtracted.has(f)));

    // Check capitalization sub-selections
    const capChange = result.proposedChanges.find(c => c.field === 'capitalization');
    const capTotal = capChange && Array.isArray(capChange.newValue) ? capChange.newValue.length : 0;
    const capAllSelected = capTotal === 0 || (currentCapIndices && currentCapIndices.size >= capTotal);

    const allSelected = fieldsAllSelected && extractedAllSelected && capAllSelected;

    // Toggle all selections
    setSelectedChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(recipeId, allSelected ? new Set() : allFields);
      return newMap;
    });

    setSelectedExtracted((prev) => {
      const newMap = new Map(prev);
      newMap.set(recipeId, allSelected ? new Set() : allExtracted);
      return newMap;
    });

    // Also toggle capitalization sub-selections
    if (capTotal > 0) {
      setSelectedCapIndices((prev) => {
        const newMap = new Map(prev);
        newMap.set(recipeId, allSelected ? new Set() : new Set(Array.from({ length: capTotal }, (_, i) => i)));
        return newMap;
      });
    }
  };

  const handleToggleFieldSelection = (recipeId: string, field: ReprocessableField) => {
    setSelectedChanges((prev) => {
      const newMap = new Map(prev);
      const currentSet = new Set(prev.get(recipeId) || []);

      if (currentSet.has(field)) {
        currentSet.delete(field);
      } else {
        currentSet.add(field);
      }

      newMap.set(recipeId, currentSet);
      return newMap;
    });
  };

  const handleToggleCapChange = (recipeId: string, index: number) => {
    setSelectedCapIndices((prev) => {
      const newMap = new Map(prev);
      const currentSet = new Set(prev.get(recipeId) || []);

      if (currentSet.has(index)) {
        currentSet.delete(index);
      } else {
        currentSet.add(index);
      }

      newMap.set(recipeId, currentSet);

      // Sync field-level selection: add/remove 'capitalization' based on sub-selection
      setSelectedChanges((fieldPrev) => {
        const fieldMap = new Map(fieldPrev);
        const fieldSet = new Set(fieldPrev.get(recipeId) || []);
        if (currentSet.size > 0) {
          fieldSet.add('capitalization');
        } else {
          fieldSet.delete('capitalization');
        }
        fieldMap.set(recipeId, fieldSet);
        return fieldMap;
      });

      return newMap;
    });
  };

  const handleToggleAllCapChanges = (recipeId: string, totalChanges: number) => {
    setSelectedCapIndices((prev) => {
      const newMap = new Map(prev);
      const currentSet = prev.get(recipeId);
      const allSelected = currentSet && currentSet.size >= totalChanges;

      const newSet = allSelected
        ? new Set<number>()
        : new Set(Array.from({ length: totalChanges }, (_, i) => i));
      newMap.set(recipeId, newSet);

      // Sync field-level selection
      setSelectedChanges((fieldPrev) => {
        const fieldMap = new Map(fieldPrev);
        const fieldSet = new Set(fieldPrev.get(recipeId) || []);
        if (newSet.size > 0) {
          fieldSet.add('capitalization');
        } else {
          fieldSet.delete('capitalization');
        }
        fieldMap.set(recipeId, fieldSet);
        return fieldMap;
      });

      return newMap;
    });
  };

  const handleToggleExtracted = (recipeId: string, field: ExtractedField) => {
    setSelectedExtracted((prev) => {
      const newMap = new Map(prev);
      const currentSet = new Set(prev.get(recipeId) || []);

      if (currentSet.has(field)) {
        currentSet.delete(field);
      } else {
        currentSet.add(field);
      }

      newMap.set(recipeId, currentSet);
      return newMap;
    });
  };

  const handleSelectAll = () => {
    const newFieldMap = new Map<string, Set<ReprocessableField>>();
    const newCapMap = new Map<string, Set<number>>();
    const newExtractedMap = new Map<string, Set<ExtractedField>>();

    results
      .filter((r) => r.proposedChanges.length > 0 || r.extractedCookbook || r.extractedPageNumber)
      .forEach((r) => {
        newFieldMap.set(r.recipeId, new Set(r.proposedChanges.map(c => c.field)));

        // Also select all capitalization sub-changes
        const capChange = r.proposedChanges.find(c => c.field === 'capitalization');
        if (capChange && Array.isArray(capChange.newValue)) {
          newCapMap.set(r.recipeId, new Set(capChange.newValue.map((_, i) => i)));
        }

        // Also select extracted fields
        const extractedSet = new Set<ExtractedField>();
        if (r.extractedCookbook) extractedSet.add('cookbook');
        if (r.extractedPageNumber) extractedSet.add('pageNumber');
        if (extractedSet.size > 0) {
          newExtractedMap.set(r.recipeId, extractedSet);
        }
      });

    setSelectedChanges(newFieldMap);
    setSelectedCapIndices(newCapMap);
    setSelectedExtracted(newExtractedMap);
  };

  const handleDeselectAll = () => {
    setSelectedChanges(new Map());
    setSelectedCapIndices(new Map());
    setSelectedExtracted(new Map());
  };

  const handleApplyChanges = async () => {
    setStep('applying');
    const changesToApply: ApprovedChanges = new Map();

    // Filter results to only include selected extracted fields
    const filteredResults = results.map((result) => {
      const extractedSel = selectedExtracted.get(result.recipeId);
      return {
        ...result,
        extractedCookbook: extractedSel?.has('cookbook') ? result.extractedCookbook : undefined,
        extractedPageNumber: extractedSel?.has('pageNumber') ? result.extractedPageNumber : undefined,
      };
    });

    for (const result of results) {
      const selectedFields = selectedChanges.get(result.recipeId);
      const extractedSel = selectedExtracted.get(result.recipeId);
      const hasSelectedFields = selectedFields && selectedFields.size > 0;
      const hasSelectedExtracted = extractedSel && extractedSel.size > 0;

      if (!hasSelectedFields && !hasSelectedExtracted) continue;

      const selectedFieldChanges: typeof result.proposedChanges = [];

      if (hasSelectedFields) {
        for (const change of result.proposedChanges) {
          if (!selectedFields!.has(change.field)) continue;

          if (change.field === 'capitalization' && Array.isArray(change.newValue)) {
            // Filter to only selected capitalization changes
            const capIndices = selectedCapIndices.get(result.recipeId);
            if (!capIndices || capIndices.size === 0) continue;

            const filteredCapChanges = change.newValue.filter((_, idx) => capIndices.has(idx));
            if (filteredCapChanges.length > 0) {
              selectedFieldChanges.push({
                ...change,
                newValue: filteredCapChanges,
              });
            }
          } else {
            selectedFieldChanges.push(change);
          }
        }
      }

      // Include recipe if it has field changes OR extracted fields selected
      if (selectedFieldChanges.length > 0 || hasSelectedExtracted) {
        changesToApply.set(result.recipeId, selectedFieldChanges);
      }
    }

    const applyResultData = await recipeReprocessingService.applyChanges(changesToApply, filteredResults);
    setApplyResult(applyResultData);
    setStep('complete');
  };

  const handleComplete = () => {
    // Collect recipe IDs that have any selection (field changes or extracted fields)
    const updatedIds = new Set<string>();
    for (const [id, fieldSet] of selectedChanges.entries()) {
      if (fieldSet.size > 0) updatedIds.add(id);
    }
    for (const [id, extractedSet] of selectedExtracted.entries()) {
      if (extractedSet.size > 0) updatedIds.add(id);
    }
    onComplete(Array.from(updatedIds));
    handleClose();
  };

  const recipesWithChanges = results.filter(
    (r) => r.proposedChanges.length > 0 || r.extractedCookbook || r.extractedPageNumber
  );

  // Count selected changes, expanding capitalization to individual sub-changes
  const selectedCount = results.reduce((total, result) => {
    const selectedFields = selectedChanges.get(result.recipeId);
    const extractedSel = selectedExtracted.get(result.recipeId);

    let count = 0;

    // Count field changes
    if (selectedFields) {
      for (const field of selectedFields) {
        if (field === 'capitalization') {
          // Count individual cap changes
          const capIndices = selectedCapIndices.get(result.recipeId);
          count += capIndices?.size || 0;
        } else {
          count += 1;
        }
      }
    }

    // Count extracted fields
    if (extractedSel) {
      count += extractedSel.size;
    }

    return total + count;
  }, 0);

  const getRecipeSelectionState = (result: RecipeReprocessingResult): 'all' | 'none' | 'partial' => {
    const selectedFields = selectedChanges.get(result.recipeId);
    const extractedSel = selectedExtracted.get(result.recipeId);

    // Total possible selections for this recipe
    const totalFields = result.proposedChanges.length;
    const totalExtracted = (result.extractedCookbook ? 1 : 0) + (result.extractedPageNumber ? 1 : 0);
    const totalPossible = totalFields + totalExtracted;

    // Current selections
    const fieldCount = selectedFields?.size || 0;
    const extractedCount = extractedSel?.size || 0;
    const currentSelected = fieldCount + extractedCount;

    if (currentSelected === 0) return 'none';
    if (currentSelected >= totalPossible) return 'all';
    return 'partial';
  };

  const getCapSelectionState = (recipeId: string, totalChanges: number): 'all' | 'none' | 'partial' => {
    const selectedIndices = selectedCapIndices.get(recipeId);
    if (!selectedIndices || selectedIndices.size === 0) return 'none';
    if (selectedIndices.size >= totalChanges) return 'all';
    return 'partial';
  };

  const formatFieldValue = (field: ReprocessableField, value: unknown): string => {
    if (field === 'nutrition' && value) {
      const n = value as NutritionInfo;
      return `${n.calories} cal, ${n.protein}g protein`;
    }
    if (field === 'prepTimeMinutes' || field === 'cookTimeMinutes') {
      return `${value} min`;
    }
    if (field === 'capitalization' && Array.isArray(value)) {
      const changes = value as CapitalizationChange[];
      const count = changes.length;
      return `${count} field${count !== 1 ? 's' : ''} to fix`;
    }
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    return String(value);
  };

  const formatCapitalizationChanges = (recipeId: string, changes: CapitalizationChange[]): React.ReactNode => {
    const selectedIndices = selectedCapIndices.get(recipeId) || new Set<number>();

    return changes.map((change, i) => {
      let fieldLabel: string;
      if (change.field === 'ingredient') {
        const ingredientLabel = change.ingredientField === 'name' ? 'name' : 'prep notes';
        fieldLabel = `Ingredient ${(change.ingredientIndex ?? 0) + 1} ${ingredientLabel}`;
      } else {
        fieldLabel =
          change.field.charAt(0).toUpperCase() + change.field.slice(1).replace(/([A-Z])/g, ' $1');
      }

      return (
        <div key={i} className={styles.capitalizationChange}>
          <input
            type="checkbox"
            checked={selectedIndices.has(i)}
            onChange={() => handleToggleCapChange(recipeId, i)}
            className={styles.capChangeCheckbox}
          />
          <span className={styles.capitalizationField}>{fieldLabel}:</span>
          <span className={styles.capitalizationOld}>{truncateText(change.oldValue, 30)}</span>
          <span className={styles.capitalizationArrow}>→</span>
          <span className={styles.capitalizationNew}>{truncateText(change.newValue, 30)}</span>
        </div>
      );
    });
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const renderFieldSelection = () => (
    <>
      <div className={styles.content}>
        <p className={styles.description}>
          Select which blank fields to check and attempt to fill in from notes or by re-analyzing
          source photos. You can also provide AI instructions below to guide the extraction
          process. Cookbook and page information will be extracted automatically when available.
        </p>

        <div className={styles.fieldGrid}>
          {(
            [
              'nutrition',
              'prepTimeMinutes',
              'cookTimeMinutes',
              'description',
              'capitalization',
            ] as const
          ).map((field) => (
            <label key={field} className={styles.fieldCheckbox}>
              <input
                type="checkbox"
                checked={config.fields.includes(field)}
                onChange={() => handleFieldToggle(field)}
              />
              <div className={styles.fieldLabelContainer}>
                <span className={styles.fieldLabel}>{FIELD_LABELS[field]}</span>
                {FIELD_DESCRIPTIONS[field] && (
                  <span className={styles.fieldDescription}>{FIELD_DESCRIPTIONS[field]}</span>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className={styles.hintSection}>
          <label className={styles.hintLabel}>AI Instructions (optional)</label>
          <textarea
            className={styles.hintTextarea}
            value={userHint}
            onChange={(e) => setUserHint(e.target.value)}
            placeholder="e.g., This recipe came from the American Heart Association cookbook. Please extract nutrition info carefully."
            rows={3}
          />
          <p className={styles.hintDescription}>
            Provide context or instructions to guide AI when extracting data from source photos
          </p>
        </div>

        <div className={styles.recipeCount}>
          {selectedRecipes.length} recipe{selectedRecipes.length !== 1 ? 's' : ''} selected
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleStartScanning}
          disabled={config.fields.length === 0}
        >
          Start Scanning
        </Button>
      </div>
    </>
  );

  const renderScanning = () => (
    <>
      <div className={styles.content}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Scanning Recipes</h3>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${(progress.scannedRecipes / progress.totalRecipes) * 100}%`,
              }}
            />
          </div>
          <p className={styles.progressText}>
            {progress.scannedRecipes} of {progress.totalRecipes} recipes scanned
          </p>
          {progress.currentRecipe && (
            <p className={styles.progressText}>{progress.currentRecipe.title}</p>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={() => setIsCancelled(true)}>
          Cancel
        </Button>
      </div>
    </>
  );

  const renderSummary = () => {
    const recipesToProcess = results.filter((r) => r.status === 'pending');
    const recipesWithBlanks = results.filter((r) => r.hasBlankFields);
    const recipesWithPhotos = recipesToProcess.filter((r) => r.hasSourcePhoto);
    const recipesWithNotes = recipesToProcess.filter((r) => {
      const recipe = selectedRecipes.find((sr) => sr.id === r.recipeId);
      return recipe?.notes && recipe.notes.trim().length > 0;
    }).length;
    const hasHint = userHint && userHint.trim().length > 0;

    return (
      <>
        <div className={styles.content}>
          <p className={styles.description}>
            Found {recipesToProcess.length} recipe{recipesToProcess.length !== 1 ? 's' : ''} to
            process for data extraction.
            {hasHint && ' AI instructions provided via hint.'}
          </p>

          <div className={styles.summaryStats}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{recipesWithBlanks.length}</span>
              <span className={styles.statLabel}>With blank fields</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{recipesWithPhotos.length}</span>
              <span className={styles.statLabel}>With source photos</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{recipesWithNotes}</span>
              <span className={styles.statLabel}>With notes to check</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                {selectedRecipes.length - recipesToProcess.length}
              </span>
              <span className={styles.statLabel}>Skipped</span>
            </div>
          </div>

          {recipesWithPhotos.length > 10 && (
            <div className={styles.warningBanner}>
              <AlertTriangle size={16} />
              <span>
                {recipesWithPhotos.length} recipes may need Vision API calls. This could take a
                while due to rate limiting.
              </span>
            </div>
          )}

          {hasHint && recipesWithPhotos.length === 0 && (
            <div className={styles.warningBanner}>
              <AlertTriangle size={16} />
              <span>
                AI instructions provided, but no recipes have source photos. Instructions will only
                be used for recipes with source photos.
              </span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleStartProcessing}>
            Start Processing
          </Button>
        </div>
      </>
    );
  };

  const renderProcessing = () => (
    <>
      <div className={styles.content}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Extracting Data</h3>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${
                  (progress.processedRecipes /
                    results.filter((r) => r.hasBlankFields).length) *
                  100
                }%`,
              }}
            />
          </div>
          <p className={styles.progressText}>
            {progress.processedRecipes} of {results.filter((r) => r.hasBlankFields).length} recipes
            processed
          </p>
          {progress.currentRecipe && (
            <p className={styles.progressText}>{progress.currentRecipe.title}</p>
          )}
          <p className={styles.progressText}>
            {progress.recipesWithChanges} recipe
            {progress.recipesWithChanges !== 1 ? 's' : ''} with extractable data
          </p>
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={() => setIsCancelled(true)}>
          Cancel
        </Button>
      </div>
    </>
  );

  const renderReview = () => {
    return (
      <>
        <div className={styles.content}>
          <div className={styles.reviewHeader}>
            <p className={styles.description}>
              Review proposed changes. Only blank fields will be updated.
            </p>
            <div className={styles.selectionControls}>
              <button className={styles.selectionButton} onClick={handleSelectAll}>
                Select All
              </button>
              <button className={styles.selectionButton} onClick={handleDeselectAll}>
                Deselect All
              </button>
            </div>
          </div>

          <div className={styles.recipeList}>
            {recipesWithChanges.length === 0 && (
              <p style={{ color: 'var(--color-text-primary)', padding: 'var(--spacing-md)' }}>
                No recipes with changes found.
              </p>
            )}
            {recipesWithChanges.map((result) => (
              <div key={result.recipeId} className={styles.recipeItem}>
                <div
                  className={styles.recipeHeader}
                  onClick={() => handleToggleRecipeSelection(result.recipeId)}
                >
                  <input
                    type="checkbox"
                    checked={getRecipeSelectionState(result) === 'all'}
                    ref={(el) => {
                      if (el) el.indeterminate = getRecipeSelectionState(result) === 'partial';
                    }}
                    onChange={() => handleToggleRecipeSelection(result.recipeId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <h4 className={styles.recipeTitle}>{result.recipeTitle}</h4>
                  <span className={styles.changeCount}>
                    {result.proposedChanges.length +
                      (result.extractedCookbook ? 1 : 0) +
                      (result.extractedPageNumber ? 1 : 0)}{' '}
                    change
                    {result.proposedChanges.length +
                      (result.extractedCookbook ? 1 : 0) +
                      (result.extractedPageNumber ? 1 : 0) !==
                    1
                      ? 's'
                      : ''}
                  </span>
                </div>
                <div className={styles.changesList}>
                  {result.proposedChanges.map((change, index) => {
                    if (change.field === 'capitalization' && Array.isArray(change.newValue)) {
                      const capChanges = change.newValue as CapitalizationChange[];
                      return (
                        <div key={index} className={styles.changeItem}>
                          <input
                            type="checkbox"
                            checked={getCapSelectionState(result.recipeId, capChanges.length) === 'all'}
                            ref={(el) => {
                              if (el) el.indeterminate = getCapSelectionState(result.recipeId, capChanges.length) === 'partial';
                            }}
                            onChange={() => handleToggleAllCapChanges(result.recipeId, capChanges.length)}
                            className={styles.changeCheckbox}
                          />
                          <Check size={14} className={styles.changeIcon} />
                          <span className={styles.changeField}>{FIELD_LABELS[change.field]}</span>
                          <span className={styles.changeSource}>local analysis</span>
                          <div className={styles.capitalizationChanges}>
                            {formatCapitalizationChanges(result.recipeId, capChanges)}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={index} className={styles.changeItem}>
                        <input
                          type="checkbox"
                          checked={selectedChanges.get(result.recipeId)?.has(change.field) || false}
                          onChange={() => handleToggleFieldSelection(result.recipeId, change.field)}
                          className={styles.changeCheckbox}
                        />
                        <Check size={14} className={styles.changeIcon} />
                        <span className={styles.changeField}>{FIELD_LABELS[change.field]}</span>
                        <span className={styles.changeSource}>from {change.source}</span>
                        <div className={styles.changeValue}>
                          {formatFieldValue(change.field, change.newValue)}
                        </div>
                      </div>
                    );
                  })}
                  {result.extractedCookbook && (
                    <div className={styles.changeItem}>
                      <input
                        type="checkbox"
                        checked={selectedExtracted.get(result.recipeId)?.has('cookbook') || false}
                        onChange={() => handleToggleExtracted(result.recipeId, 'cookbook')}
                        className={styles.changeCheckbox}
                      />
                      <Check size={14} className={styles.changeIcon} />
                      <span className={styles.changeField}>Cookbook</span>
                      <span className={styles.changeSource}>from vision</span>
                      <div className={styles.changeValue}>{result.extractedCookbook}</div>
                    </div>
                  )}
                  {result.extractedPageNumber && (
                    <div className={styles.changeItem}>
                      <input
                        type="checkbox"
                        checked={selectedExtracted.get(result.recipeId)?.has('pageNumber') || false}
                        onChange={() => handleToggleExtracted(result.recipeId, 'pageNumber')}
                        className={styles.changeCheckbox}
                      />
                      <Check size={14} className={styles.changeIcon} />
                      <span className={styles.changeField}>Page Number</span>
                      <span className={styles.changeSource}>from vision</span>
                      <div className={styles.changeValue}>{result.extractedPageNumber}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}

          {results
            .filter((r) => r.hasBlankFields && r.proposedChanges.length === 0)
            .map((result) => (
              <div key={result.recipeId} className={styles.recipeItem}>
                <div className={styles.recipeHeader}>
                  <h4 className={styles.recipeTitle}>{result.recipeTitle}</h4>
                </div>
                <div className={styles.changesList}>
                  <div className={styles.noChangesItem}>
                    <X size={14} />
                    <span>No extractable data found</span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleApplyChanges} disabled={selectedCount === 0}>
          Apply {selectedCount} Change{selectedCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </>
    );
  };

  const renderApplying = () => (
    <div className={styles.content}>
      <div className={styles.processing}>
        <Loader2 size={48} className={styles.spinner} />
        <h3>Applying Changes</h3>
        <p>Updating recipes...</p>
      </div>
    </div>
  );

  const renderComplete = () => (
    <>
      <div className={styles.content}>
        <div className={styles.successSection}>
          <CheckCircle size={64} className={styles.successIcon} />
          <h3>Reprocessing Complete</h3>
          {applyResult && applyResult.success > 0 ? (
            <p>
              Successfully updated {applyResult.success} recipe
              {applyResult.success !== 1 ? 's' : ''}.
              {applyResult.failed > 0 &&
                ` ${applyResult.failed} failed.`}
            </p>
          ) : (
            <p>No recipes needed updates.</p>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <Button variant="primary" onClick={handleComplete}>
          Done
        </Button>
      </div>
    </>
  );

  const getTitle = () => {
    switch (step) {
      case 'field-selection':
        return 'Reprocess Recipes';
      case 'scanning':
        return 'Scanning...';
      case 'summary':
        return 'Reprocessing Summary';
      case 'processing':
        return 'Processing...';
      case 'review':
        return 'Review Changes';
      case 'applying':
        return 'Applying...';
      case 'complete':
        return 'Complete';
      default:
        return 'Reprocess Recipes';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={getTitle()} size="md">
      {step === 'field-selection' && renderFieldSelection()}
      {step === 'scanning' && renderScanning()}
      {step === 'summary' && renderSummary()}
      {step === 'processing' && renderProcessing()}
      {step === 'review' && renderReview()}
      {step === 'applying' && renderApplying()}
      {step === 'complete' && renderComplete()}
    </Modal>
  );
}
