import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Copy, Check, AlertCircle, ChevronRight, Loader2, Globe, ExternalLink, Tag } from 'lucide-react';
import { Button } from '@/components/ui';
import { recipeImportService, urlScraperService, tagScanningService } from '@/services';
import { recipeRepository } from '@/db';
import type { ParsedRecipe, AiParsingMode } from '@/types';
import styles from './UrlImportTab.module.css';

type ImportStep = 'input' | 'fetching' | 'parsing' | 'manual-prompt' | 'manual-response' | 'preview' | 'error';

export function UrlImportTab() {
  const navigate = useNavigate();
  const [step, setStep] = useState<ImportStep>('input');
  const [url, setUrl] = useState('');
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferredMode, setPreferredMode] = useState<AiParsingMode>('manual');
  const [apiAvailable, setApiAvailable] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [usedSchemaOrg, setUsedSchemaOrg] = useState(false);
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    const checkApiMode = async () => {
      const available = await recipeImportService.isApiModeAvailable();
      setApiAvailable(available);
      const mode = await recipeImportService.getPreferredMode();
      setPreferredMode(mode);
    };
    checkApiMode();
  }, []);

  // Helper to detect and apply tags to a parsed recipe
  const applyDetectedTags = (recipe: ParsedRecipe): ParsedRecipe => {
    try {
      const detectedTags = tagScanningService.detectTags(recipe);
      // Combine any existing tags with detected tags (deduped)
      const allTags = new Set([...(recipe.tags || []), ...detectedTags]);
      return { ...recipe, tags: Array.from(allTags) };
    } catch (err) {
      console.warn('Tag scanning failed:', err);
      return recipe;
    }
  };

  const handleFetchUrl = async () => {
    if (!url.trim()) return;

    setStep('fetching');
    setError(null);

    const result = await urlScraperService.scrapeRecipeUrl(url.trim());

    if (!result.success) {
      setError(result.error || 'Failed to fetch URL');
      setStep('error');
      return;
    }

    // If schema.org recipe was found, show preview directly
    if (result.usedSchemaOrg && result.recipe) {
      const recipeWithTags = applyDetectedTags(result.recipe);
      setParsedRecipe(recipeWithTags);
      setUsedSchemaOrg(true);
      setStep('preview');
      return;
    }

    // Need to parse with AI
    if (result.rawText) {
      setRawText(result.rawText);
      setUsedSchemaOrg(false);

      if (preferredMode === 'api' && apiAvailable) {
        // Use API mode
        setStep('parsing');
        const parseResult = await recipeImportService.parseWithApi(result.rawText);

        if (parseResult.success && parseResult.recipe) {
          const recipeWithUrl = { ...parseResult.recipe, sourceUrl: url.trim() };
          const recipeWithTags = applyDetectedTags(recipeWithUrl);
          setParsedRecipe(recipeWithTags);
          setStep('preview');
        } else {
          setError(parseResult.error || 'Failed to parse recipe');
          setStep('error');
        }
      } else {
        // Use manual mode
        const prompt = recipeImportService.getManualPrompt(result.rawText);
        setManualPrompt(prompt);
        setStep('manual-prompt');
      }
    } else {
      setError('Could not extract recipe content from this URL');
      setStep('error');
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(manualPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleManualResponseSubmit = () => {
    if (!manualResponse.trim()) return;

    const result = recipeImportService.parseManualResponse(manualResponse);

    if (result.success && result.recipe) {
      const recipeWithUrl = { ...result.recipe, sourceUrl: url.trim() };
      const recipeWithTags = applyDetectedTags(recipeWithUrl);
      setParsedRecipe(recipeWithTags);
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

    const formData = recipeImportService.convertToRecipeFormData(parsedRecipe);
    sessionStorage.setItem('importedRecipe', JSON.stringify(formData));
    navigate('/recipes/new?imported=true');
  };

  const handleStartOver = () => {
    setStep('input');
    setError(null);
    setParsedRecipe(null);
    setManualPrompt('');
    setManualResponse('');
    setRawText('');
    setUsedSchemaOrg(false);
  };

  const handleRetryWithManual = () => {
    if (rawText) {
      const prompt = recipeImportService.getManualPrompt(rawText);
      setManualPrompt(prompt);
      setError(null);
      setStep('manual-prompt');
    } else {
      handleStartOver();
    }
  };

  // Input step
  if (step === 'input') {
    return (
      <div className={styles.container}>
        <div className={styles.inputSection}>
          <label className={styles.label}>Paste the recipe URL</label>
          <div className={styles.urlInputWrapper}>
            <Globe size={20} className={styles.urlIcon} />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com/recipe/chocolate-cake"
              className={styles.urlInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && url.trim()) {
                  handleFetchUrl();
                }
              }}
            />
          </div>
          <p className={styles.hint}>
            Paste a URL from any recipe website. We&apos;ll try to automatically extract the recipe.
          </p>
        </div>

        <div className={styles.supportedSites}>
          <h4>Works best with sites that use structured data:</h4>
          <ul>
            <li>AllRecipes, Food Network, Epicurious</li>
            <li>Serious Eats, Bon Appetit, NY Times Cooking</li>
            <li>Most recipe blogs with standard formatting</li>
          </ul>
        </div>

        <div className={styles.actions}>
          <Button
            onClick={handleFetchUrl}
            disabled={!url.trim()}
            rightIcon={<ChevronRight size={18} />}
          >
            Import Recipe
          </Button>
        </div>
      </div>
    );
  }

  // Fetching step
  if (step === 'fetching') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Fetching recipe...</h3>
          <p>Downloading page content</p>
        </div>
      </div>
    );
  }

  // Parsing step (API mode)
  if (step === 'parsing') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Parsing recipe...</h3>
          <p>Claude is analyzing the page content</p>
        </div>
      </div>
    );
  }

  // Manual prompt step
  if (step === 'manual-prompt') {
    return (
      <div className={styles.container}>
        <div className={styles.manualSection}>
          <h3>Step 1: Copy this prompt to Claude</h3>
          <p className={styles.instruction}>
            The page didn&apos;t have structured recipe data. Copy the text below and paste it into a Claude conversation.
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
          <h3>Step 2: Paste Claude&apos;s response</h3>
          <p className={styles.instruction}>
            Copy the JSON response from Claude and paste it below.
          </p>

          <textarea
            value={manualResponse}
            onChange={(e) => setManualResponse(e.target.value)}
            placeholder={'Paste Claude\'s JSON response here...\n\nExample:\n{\n  "title": "Chocolate Cake",\n  "ingredients": [...],\n  "instructions": "..."\n}'}
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
          <div className={styles.previewHeader}>
            <h3>Recipe Preview</h3>
            {usedSchemaOrg && (
              <span className={styles.schemaOrgBadge}>
                <Sparkles size={14} />
                Auto-detected
              </span>
            )}
          </div>
          <p className={styles.instruction}>
            Review the imported recipe below. You can save it directly or edit it first.
          </p>

          {parsedRecipe.sourceUrl && (
            <a
              href={parsedRecipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.sourceLink}
            >
              <ExternalLink size={14} />
              View original recipe
            </a>
          )}

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

            {parsedRecipe.tags && parsedRecipe.tags.length > 0 && (
              <div className={styles.previewTags}>
                <Tag size={14} />
                <span className={styles.tagLabel}>Auto-detected tags:</span>
                <div className={styles.tagList}>
                  {parsedRecipe.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.previewSectionContent}>
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

            <div className={styles.previewSectionContent}>
              <h5>Instructions</h5>
              <p className={styles.instructionsText}>{parsedRecipe.instructions}</p>
            </div>

            {parsedRecipe.notes && (
              <div className={styles.previewSectionContent}>
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
    const isCorsError = error?.includes('proxies') || error?.includes('CORS') || error?.includes('fetch');

    return (
      <div className={styles.container}>
        <div className={styles.errorSection}>
          <div className={styles.errorIcon}>
            <AlertCircle size={48} />
          </div>
          <h3>Something went wrong</h3>
          <p className={styles.errorMessage}>{error}</p>

          {isCorsError && !rawText && (
            <p className={styles.corsHint}>
              Some websites block recipe scraping. Try copying the recipe text directly
              and using the <strong>Text</strong> import tab instead.
            </p>
          )}

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
            {rawText && apiAvailable && preferredMode === 'api' && (
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
