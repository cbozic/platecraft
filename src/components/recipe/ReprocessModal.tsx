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
  const [selectedChanges, setSelectedChanges] = useState<Map<string, boolean>>(new Map());
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
        // Auto-select recipes with changes
        setSelectedChanges((prev) => new Map(prev).set(processedResult.recipeId, true));
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
    setSelectedChanges((prev) => {
      const newMap = new Map(prev);
      newMap.set(recipeId, !newMap.get(recipeId));
      return newMap;
    });
  };

  const handleSelectAll = () => {
    const newMap = new Map<string, boolean>();
    results
      .filter((r) => r.proposedChanges.length > 0)
      .forEach((r) => newMap.set(r.recipeId, true));
    setSelectedChanges(newMap);
  };

  const handleDeselectAll = () => {
    setSelectedChanges(new Map());
  };

  const handleApplyChanges = async () => {
    setStep('applying');

    const changesToApply: ApprovedChanges = new Map();

    for (const result of results) {
      const isSelected = selectedChanges.get(result.recipeId);
      const hasChanges =
        result.proposedChanges.length > 0 ||
        result.extractedCookbook ||
        result.extractedPageNumber;
      if (isSelected && hasChanges) {
        changesToApply.set(result.recipeId, result.proposedChanges);
      }
    }

    const applyResultData = await recipeReprocessingService.applyChanges(changesToApply, results);
    setApplyResult(applyResultData);
    setStep('complete');
  };

  const handleComplete = () => {
    const updatedIds = Array.from(selectedChanges.entries())
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    onComplete(updatedIds);
    handleClose();
  };

  const recipesWithChanges = results.filter(
    (r) => r.proposedChanges.length > 0 || r.extractedCookbook || r.extractedPageNumber
  );
  const selectedCount = Array.from(selectedChanges.values()).filter(Boolean).length;

  const formatFieldValue = (field: ReprocessableField, value: unknown): string => {
    if (field === 'nutrition' && value) {
      const n = value as NutritionInfo;
      return `${n.calories} cal, ${n.protein}g protein`;
    }
    if (field === 'prepTimeMinutes' || field === 'cookTimeMinutes') {
      return `${value} min`;
    }
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 50) + '...' : value;
    }
    return String(value);
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
          {(['nutrition', 'prepTimeMinutes', 'cookTimeMinutes', 'description'] as const).map(
            (field) => (
              <label key={field} className={styles.fieldCheckbox}>
                <input
                  type="checkbox"
                  checked={config.fields.includes(field)}
                  onChange={() => handleFieldToggle(field)}
                />
                <span className={styles.fieldLabel}>{FIELD_LABELS[field]}</span>
              </label>
            )
          )}
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
                    checked={selectedChanges.get(result.recipeId) || false}
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
                  {result.proposedChanges.map((change, index) => (
                    <div key={index} className={styles.changeItem}>
                      <Check size={14} className={styles.changeIcon} />
                      <span className={styles.changeField}>{FIELD_LABELS[change.field]}</span>
                      <span className={styles.changeSource}>from {change.source}</span>
                      <div className={styles.changeValue}>
                        {formatFieldValue(change.field, change.newValue)}
                      </div>
                    </div>
                  ))}
                  {result.extractedCookbook && (
                    <div className={styles.changeItem}>
                      <Check size={14} className={styles.changeIcon} />
                      <span className={styles.changeField}>Cookbook</span>
                      <span className={styles.changeSource}>from vision</span>
                      <div className={styles.changeValue}>{result.extractedCookbook}</div>
                    </div>
                  )}
                  {result.extractedPageNumber && (
                    <div className={styles.changeItem}>
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
