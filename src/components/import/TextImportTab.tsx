import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Copy, Check, AlertCircle, ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { recipeImportService } from '@/services';
import { recipeRepository } from '@/db';
import { useImportStatePersistence } from '@/hooks';
import type { ParsedRecipe, AiParsingMode } from '@/types';
import styles from './TextImportTab.module.css';

type ImportStep = 'input' | 'processing' | 'manual-prompt' | 'manual-response' | 'preview' | 'error';

// State that gets persisted to survive iOS Safari page refreshes
interface PersistedState {
  step: ImportStep;
  rawText: string;
  manualPrompt: string;
  manualResponse: string;
  error: string | null;
}

export function TextImportTab() {
  const navigate = useNavigate();
  const [step, setStep] = useState<ImportStep>('input');
  const [rawText, setRawText] = useState('');
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferredMode, setPreferredMode] = useState<AiParsingMode>('manual');
  const [apiAvailable, setApiAvailable] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wasRestored, setWasRestored] = useState(false);

  // Combine state for persistence
  const persistedState = useMemo((): PersistedState => ({
    step,
    rawText,
    manualPrompt,
    manualResponse,
    error,
  }), [step, rawText, manualPrompt, manualResponse, error]);

  // Restore callback
  const handleRestoreState = useCallback((state: Partial<PersistedState>) => {
    if (state.step) setStep(state.step);
    if (state.rawText) setRawText(state.rawText);
    if (state.manualPrompt) setManualPrompt(state.manualPrompt);
    if (state.manualResponse !== undefined) setManualResponse(state.manualResponse);
    if (state.error !== undefined) setError(state.error);

    // Mark as restored if we're past the input step
    if (state.step && state.step !== 'input') {
      setWasRestored(true);
    }
  }, []);

  // Check if state is worth persisting (user has made progress)
  const shouldPersist = useCallback((state: PersistedState): boolean => {
    // Persist if user is in manual workflow steps (where app switching happens)
    const manualSteps: ImportStep[] = ['manual-prompt', 'manual-response'];
    return manualSteps.includes(state.step) || (state.step === 'input' && state.rawText.length > 0);
  }, []);

  const { clearPersistedState } = useImportStatePersistence(
    'text',
    persistedState,
    handleRestoreState,
    shouldPersist
  );

  useEffect(() => {
    const checkApiMode = async () => {
      const available = await recipeImportService.isApiModeAvailable();
      setApiAvailable(available);
      const mode = await recipeImportService.getPreferredMode();
      setPreferredMode(mode);
    };
    checkApiMode();
  }, []);

  const handleParse = async () => {
    if (!rawText.trim()) return;

    if (preferredMode === 'api' && apiAvailable) {
      // Use API mode
      setStep('processing');
      setError(null);

      const result = await recipeImportService.parseWithApi(rawText);

      if (result.success && result.recipe) {
        setParsedRecipe(result.recipe);
        setStep('preview');
      } else {
        setError(result.error || 'Failed to parse recipe');
        setStep('error');
      }
    } else {
      // Use manual mode
      const prompt = recipeImportService.getManualPrompt(rawText);
      setManualPrompt(prompt);
      setStep('manual-prompt');
    }
  };

  const handleCopyPrompt = async () => {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(manualPrompt);
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2000);
        return;
      } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);
      }
    }

    // Fallback for iOS Safari and older browsers
    const textArea = document.createElement('textarea');
    textArea.value = manualPrompt;

    // Avoid scrolling to bottom on iOS
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    // For iOS
    textArea.setSelectionRange(0, manualPrompt.length);

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2000);
      } else {
        console.error('execCommand copy failed');
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
  };

  const handleManualResponseSubmit = () => {
    if (!manualResponse.trim()) return;

    const result = recipeImportService.parseManualResponse(manualResponse);

    if (result.success && result.recipe) {
      setParsedRecipe(result.recipe);
      setStep('preview');
    } else {
      setError(result.error || 'Failed to parse response. Make sure you copied the complete JSON.');
      setStep('error');
    }
  };

  const handleSaveRecipe = async () => {
    if (!parsedRecipe) return;

    setIsSaving(true);
    try {
      const formData = recipeImportService.convertToRecipeFormData(parsedRecipe);
      const newRecipe = await recipeRepository.create(formData);
      clearPersistedState(); // Clear persisted state on successful save
      navigate(`/recipes/${newRecipe.id}`);
    } catch (err) {
      setError(`Failed to save recipe: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStep('error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBeforeSave = () => {
    if (!parsedRecipe) return;

    // Store the parsed recipe in sessionStorage for the form to pick up
    const formData = recipeImportService.convertToRecipeFormData(parsedRecipe);
    sessionStorage.setItem('importedRecipe', JSON.stringify(formData));
    clearPersistedState(); // Clear persisted state when editing
    navigate('/recipes/new?imported=true');
  };

  const handleStartOver = () => {
    setStep('input');
    setError(null);
    setParsedRecipe(null);
    setManualPrompt('');
    setManualResponse('');
    setWasRestored(false);
    clearPersistedState(); // Clear persisted state when starting over
  };

  const handleRetryWithManual = () => {
    const prompt = recipeImportService.getManualPrompt(rawText);
    setManualPrompt(prompt);
    setError(null);
    setStep('manual-prompt');
  };

  // Input step
  if (step === 'input') {
    return (
      <div className={styles.container}>
        <div className={styles.inputSection}>
          <label className={styles.label}>Paste your recipe text below</label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Example:

Chocolate Chip Cookies

Makes 24 cookies
Prep: 15 minutes
Cook: 10-12 minutes

Ingredients:
- 2 1/4 cups all-purpose flour
- 1 cup butter, softened
- 3/4 cup sugar
- 2 eggs
- 1 tsp vanilla
- 2 cups chocolate chips

Instructions:
1. Preheat oven to 375°F
2. Mix flour and butter until creamy
3. Add sugar and eggs, beat well
4. Stir in chocolate chips
5. Drop by spoonfuls onto baking sheet
6. Bake 10-12 minutes until golden`}
            className={styles.textarea}
            rows={16}
          />
        </div>

        <div className={styles.modeInfo}>
          {apiAvailable ? (
            <p className={styles.modeText}>
              <Sparkles size={16} />
              <span>
                {preferredMode === 'api'
                  ? 'Using automatic parsing with Claude API'
                  : 'Using manual paste mode (you can change this in Settings)'}
              </span>
            </p>
          ) : (
            <p className={styles.modeText}>
              <span>Manual mode - you&apos;ll copy a prompt to Claude and paste the response back</span>
            </p>
          )}
        </div>

        <div className={styles.actions}>
          <Button
            onClick={handleParse}
            disabled={!rawText.trim()}
            rightIcon={<ChevronRight size={18} />}
          >
            Parse Recipe
          </Button>
        </div>
      </div>
    );
  }

  // Processing step (API mode)
  if (step === 'processing') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Parsing recipe...</h3>
          <p>Claude is analyzing your recipe text</p>
        </div>
      </div>
    );
  }

  // Manual prompt step
  if (step === 'manual-prompt') {
    return (
      <div className={styles.container}>
        <div className={styles.manualSection}>
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
          <h3>Step 1: Copy this prompt to Claude</h3>
          <p className={styles.instruction}>
            Copy the text below and paste it into a Claude conversation (claude.ai or the Claude app).
          </p>

          <div className={styles.promptBox}>
            <pre className={styles.promptText}>{manualPrompt}</pre>
            <Button
              variant="outline"
              size="sm"
              leftIcon={promptCopied ? <Check size={16} /> : <Copy size={16} />}
              onClick={handleCopyPrompt}
              className={styles.copyButton}
            >
              {promptCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Back
            </Button>
            <Button onClick={() => setStep('manual-response')} rightIcon={<ChevronRight size={18} />}>
              I&apos;ve sent it to Claude
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Manual response step
  if (step === 'manual-response') {
    return (
      <div className={styles.container}>
        <div className={styles.manualSection}>
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
          <h3>Step 2: Paste Claude&apos;s response</h3>
          <p className={styles.instruction}>
            Copy the JSON response from Claude and paste it below.
          </p>

          <textarea
            value={manualResponse}
            onChange={(e) => setManualResponse(e.target.value)}
            placeholder={'Paste Claude\'s JSON response here...\n\nExample:\n{\n  "title": "Chocolate Chip Cookies",\n  "ingredients": [...],\n  "instructions": "..."\n}'}
            className={styles.textarea}
            rows={12}
          />

          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setStep('manual-prompt')}>
              Back
            </Button>
            <Button
              onClick={handleManualResponseSubmit}
              disabled={!manualResponse.trim()}
              rightIcon={<ChevronRight size={18} />}
            >
              Parse Response
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Preview step
  if (step === 'preview' && parsedRecipe) {
    return (
      <div className={styles.container}>
        <div className={styles.previewSection}>
          <h3>Recipe Preview</h3>
          <p className={styles.instruction}>
            Review the parsed recipe below. You can save it directly or edit it first.
          </p>

          <div className={styles.previewCard}>
            <h4 className={styles.previewTitle}>{parsedRecipe.title}</h4>

            {parsedRecipe.description && (
              <p className={styles.previewDescription}>{parsedRecipe.description}</p>
            )}

            <div className={styles.previewMeta}>
              {parsedRecipe.servings && <span>Servings: {parsedRecipe.servings}</span>}
              {parsedRecipe.prepTimeMinutes && <span>Prep: {parsedRecipe.prepTimeMinutes} min</span>}
              {parsedRecipe.cookTimeMinutes && <span>Cook: {parsedRecipe.cookTimeMinutes} min</span>}
            </div>

            <div className={styles.previewSection}>
              <h5>Ingredients ({parsedRecipe.ingredients.length})</h5>
              <ul className={styles.ingredientList}>
                {parsedRecipe.ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.quantity && `${ing.quantity} `}
                    {ing.unit && `${ing.unit} `}
                    {ing.name}
                    {ing.notes && ` (${ing.notes})`}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.previewSection}>
              <h5>Instructions</h5>
              <p className={styles.instructionsText}>{parsedRecipe.instructions}</p>
            </div>

            {parsedRecipe.notes && (
              <div className={styles.previewSection}>
                <h5>Notes</h5>
                <p>{parsedRecipe.notes}</p>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
            <Button variant="outline" onClick={handleEditBeforeSave}>
              Edit First
            </Button>
            <Button onClick={handleSaveRecipe} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Recipe'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Error step
  if (step === 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.errorSection}>
          <div className={styles.errorIcon}>
            <AlertCircle size={48} />
          </div>
          <h3>Something went wrong</h3>
          <p className={styles.errorMessage}>{error}</p>

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
            {apiAvailable && preferredMode === 'api' && (
              <Button variant="outline" onClick={handleRetryWithManual}>
                Try Manual Mode
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
