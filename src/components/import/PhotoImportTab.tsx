import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Copy, Check, AlertCircle, ChevronRight, Loader2, Upload, Image, X, Eye, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { recipeImportService, ocrService, imageService } from '@/services';
import type { OcrProgress, OcrQualityAssessment } from '@/services';
import { recipeRepository } from '@/db';
import type { ParsedRecipe, AiParsingMode, RecipeImage } from '@/types';
import { RECIPE_VISION_PROMPT } from '@/types/import';
import styles from './PhotoImportTab.module.css';

type ImportStep = 'upload' | 'ocr' | 'ocr-review' | 'vision-processing' | 'processing' | 'manual-prompt' | 'manual-response' | 'manual-vision-prompt' | 'manual-vision-response' | 'preview' | 'error';

export function PhotoImportTab() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferredMode, setPreferredMode] = useState<AiParsingMode>('manual');
  const [apiAvailable, setApiAvailable] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [visionPromptCopied, setVisionPromptCopied] = useState(false);
  const [manualVisionResponse, setManualVisionResponse] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sourceImage, setSourceImage] = useState<RecipeImage | null>(null);
  const [ocrQuality, setOcrQuality] = useState<OcrQualityAssessment | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const checkApiMode = async () => {
      const available = await recipeImportService.isApiModeAvailable();
      setApiAvailable(available);
      const mode = await recipeImportService.getPreferredMode();
      setPreferredMode(mode);
    };
    checkApiMode();
  }, []);

  // Clean up preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    if (!ocrService.isValidImageType(file)) {
      setError('Please select a valid image file (JPEG, PNG, GIF, WebP, or BMP)');
      setStep('error');
      return;
    }

    // Validate file size
    if (!ocrService.isValidFileSize(file)) {
      setError('Image is too large. Please select an image under 10MB.');
      setStep('error');
      return;
    }

    // Create preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setSelectedFile(file);
  }, [previewUrl]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExtractText = async () => {
    if (!selectedFile) return;

    setStep('ocr');
    setOcrProgress({ status: 'Starting...', progress: 0 });
    setError(null);

    const result = await ocrService.extractText(selectedFile, (progress) => {
      setOcrProgress(progress);
    });

    if (!result.success || !result.text) {
      setError(result.error || 'Failed to extract text from image');
      setStep('error');
      return;
    }

    setExtractedText(result.text);
    setOcrConfidence(result.confidence ?? null);

    // Store the image blob for potential vision mode
    setImageBlob(selectedFile);

    // Create a RecipeImage from the uploaded file for attachment
    try {
      const recipeImage = await imageService.createRecipeImage(
        selectedFile,
        'Source photo',
        true // isPrimary
      );
      setSourceImage(recipeImage);
    } catch (err) {
      console.error('Failed to create source image:', err);
      // Continue without the image - not critical
    }

    // Assess OCR quality
    const quality = ocrService.assessQuality(result.text, result.confidence ?? 0);
    setOcrQuality(quality);

    // If quality is poor, show review step
    if (quality.isPoor) {
      setStep('ocr-review');
      return;
    }

    // Proceed to AI parsing
    await proceedToParsing(result.text);
  };

  const proceedToParsing = async (text: string) => {
    if (preferredMode === 'api' && apiAvailable) {
      setStep('processing');
      const parseResult = await recipeImportService.parseWithApi(text);

      if (parseResult.success && parseResult.recipe) {
        setParsedRecipe(parseResult.recipe);
        setStep('preview');
      } else {
        setError(parseResult.error || 'Failed to parse recipe');
        setStep('error');
      }
    } else {
      const prompt = recipeImportService.getManualPrompt(text);
      setManualPrompt(prompt);
      setStep('manual-prompt');
    }
  };

  const handleUseOcrAnyway = async () => {
    await proceedToParsing(extractedText);
  };

  const handleTryVisionMode = async () => {
    if (!imageBlob) {
      setError('Image not available. Please try again.');
      setStep('error');
      return;
    }

    setStep('vision-processing');
    const result = await recipeImportService.parseWithVision(imageBlob);

    if (result.success && result.recipe) {
      setParsedRecipe(result.recipe);
      setStep('preview');
    } else {
      setError(result.error || 'Vision parsing failed. Try using the OCR text or manual mode.');
      setStep('error');
    }
  };

  const handleManualVisionMode = () => {
    setStep('manual-vision-prompt');
  };

  const handleDownloadImage = () => {
    if (!previewUrl || !selectedFile) return;

    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = selectedFile.name || 'recipe-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyVisionPrompt = async () => {
    try {
      await navigator.clipboard.writeText(RECIPE_VISION_PROMPT);
      setVisionPromptCopied(true);
      setTimeout(() => setVisionPromptCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleManualVisionResponseSubmit = () => {
    if (!manualVisionResponse.trim()) return;

    const result = recipeImportService.parseManualResponse(manualVisionResponse);

    if (result.success && result.recipe) {
      setParsedRecipe(result.recipe);
      setStep('preview');
    } else {
      setError(result.error || 'Failed to parse response. Make sure you copied the complete JSON.');
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
      const formData = recipeImportService.convertToRecipeFormData(parsedRecipe, sourceImage || undefined);
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

    // Note: We can't easily pass the Blob through sessionStorage, so images won't be preserved
    // when editing before save. This is a limitation of the current approach.
    const formData = recipeImportService.convertToRecipeFormData(parsedRecipe);
    sessionStorage.setItem('importedRecipe', JSON.stringify(formData));
    navigate('/recipes/new?imported=true');
  };

  const handleStartOver = () => {
    setStep('upload');
    setError(null);
    setParsedRecipe(null);
    setManualPrompt('');
    setManualResponse('');
    setManualVisionResponse('');
    setExtractedText('');
    setOcrProgress(null);
    setOcrConfidence(null);
    setSourceImage(null);
    setOcrQuality(null);
    setImageBlob(null);
    setVisionPromptCopied(false);
    handleRemoveFile();
  };

  const handleRetryWithManual = () => {
    if (extractedText) {
      const prompt = recipeImportService.getManualPrompt(extractedText);
      setManualPrompt(prompt);
      setError(null);
      setStep('manual-prompt');
    } else {
      handleStartOver();
    }
  };

  // Upload step
  if (step === 'upload') {
    return (
      <div className={styles.container}>
        <div className={styles.uploadSection}>
          <label className={styles.label}>Upload a photo of your recipe</label>

          {!selectedFile ? (
            <div
              className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} strokeWidth={1.5} className={styles.dropzoneIcon} />
              <p className={styles.dropzoneText}>
                Drag and drop an image here, or click to browse
              </p>
              <p className={styles.dropzoneHint}>
                Supports JPEG, PNG, GIF, WebP, BMP (max 10MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                onChange={handleInputChange}
                className={styles.fileInput}
              />
            </div>
          ) : (
            <div className={styles.preview}>
              <div className={styles.previewImageWrapper}>
                <img src={previewUrl!} alt="Recipe preview" className={styles.previewImage} />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={handleRemoveFile}
                  aria-label="Remove image"
                >
                  <X size={18} />
                </button>
              </div>
              <div className={styles.previewInfo}>
                <Image size={16} />
                <span className={styles.fileName}>{selectedFile.name}</span>
                <span className={styles.fileSize}>
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.tips}>
          <h4>Tips for best results:</h4>
          <ul>
            <li>Use good lighting and avoid shadows</li>
            <li>Keep the text in focus and readable</li>
            <li>Capture the full recipe (ingredients and instructions)</li>
            <li>Avoid glare on glossy cookbook pages</li>
          </ul>
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
            onClick={handleExtractText}
            disabled={!selectedFile}
            rightIcon={<ChevronRight size={18} />}
          >
            Extract Text
          </Button>
        </div>
      </div>
    );
  }

  // OCR step
  if (step === 'ocr') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Reading image...</h3>
          {ocrProgress && (
            <>
              <p>{ocrProgress.status}</p>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${ocrProgress.progress * 100}%` }}
                />
              </div>
            </>
          )}
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
          <p>Claude is analyzing the extracted text</p>
          {ocrConfidence !== null && (
            <p className={styles.confidenceText}>
              Text recognition confidence: {Math.round(ocrConfidence * 100)}%
            </p>
          )}
        </div>
      </div>
    );
  }

  // Vision processing step
  if (step === 'vision-processing') {
    return (
      <div className={styles.container}>
        <div className={styles.processing}>
          <Loader2 size={48} className={styles.spinner} />
          <h3>Analyzing image with Claude Vision...</h3>
          <p>Claude is reading the recipe directly from the image</p>
        </div>
      </div>
    );
  }

  // OCR Review step (when quality is poor)
  if (step === 'ocr-review') {
    return (
      <div className={styles.container}>
        <div className={styles.reviewSection}>
          <div className={styles.warningBanner}>
            <AlertTriangle size={24} />
            <div>
              <strong>OCR quality may be low</strong>
              {ocrQuality?.reason && <p>{ocrQuality.reason}</p>}
            </div>
          </div>

          <p className={styles.instruction}>
            The text extracted from this image may not be accurate. This often happens with handwritten recipes or poor image quality.
          </p>

          {ocrConfidence !== null && (
            <p className={styles.confidenceText}>
              Recognition confidence: {Math.round(ocrConfidence * 100)}% | Quality score: {Math.round((ocrQuality?.score ?? 0) * 100)}%
            </p>
          )}

          <div className={styles.extractedTextPreview}>
            <h4>Extracted Text Preview:</h4>
            <pre className={styles.extractedText}>{extractedText}</pre>
          </div>

          <div className={styles.reviewOptions}>
            {apiAvailable ? (
              <div className={styles.optionCard}>
                <Eye size={24} />
                <div>
                  <h4>Try Vision Mode</h4>
                  <p>Let Claude read the recipe directly from the image. Better for handwritten text.</p>
                </div>
                <Button onClick={handleTryVisionMode} leftIcon={<Eye size={18} />}>
                  Use Vision
                </Button>
              </div>
            ) : (
              <div className={styles.optionCard}>
                <Eye size={24} />
                <div>
                  <h4>Manual Vision Mode</h4>
                  <p>Upload the image to Claude yourself and paste the response. Best for handwritten text.</p>
                </div>
                <Button onClick={handleManualVisionMode} leftIcon={<Eye size={18} />}>
                  Use Vision
                </Button>
              </div>
            )}

            <div className={styles.optionCard}>
              <ChevronRight size={24} />
              <div>
                <h4>Use This Text Anyway</h4>
                <p>Proceed with the extracted text. You can review and edit the result.</p>
              </div>
              <Button variant="outline" onClick={handleUseOcrAnyway}>
                Continue
              </Button>
            </div>
          </div>

          <div className={styles.actions}>
            <Button variant="outline" onClick={handleStartOver}>
              Start Over
            </Button>
          </div>
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
            Text was extracted from your image. Copy the prompt below and paste it into a Claude conversation.
          </p>

          {ocrConfidence !== null && (
            <p className={styles.confidenceText}>
              Text recognition confidence: {Math.round(ocrConfidence * 100)}%
            </p>
          )}

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
            placeholder={'Paste Claude\'s JSON response here...\n\nExample:\n{\n  "title": "Recipe Name",\n  "ingredients": [...],\n  "instructions": "..."\n}'}
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

  // Manual vision prompt step
  if (step === 'manual-vision-prompt') {
    return (
      <div className={styles.container}>
        <div className={styles.manualSection}>
          <h3>Step 1: Download the image</h3>
          <p className={styles.instruction}>
            Download your recipe image, then upload it to Claude along with the prompt below.
          </p>

          {previewUrl && (
            <div className={styles.imagePreviewSmall}>
              <img src={previewUrl} alt="Recipe" />
              <Button
                variant="outline"
                leftIcon={<Download size={18} />}
                onClick={handleDownloadImage}
              >
                Download Image
              </Button>
            </div>
          )}

          <h3 className={styles.stepTitle}>Step 2: Copy this prompt to Claude</h3>
          <p className={styles.instruction}>
            Upload the image to Claude (claude.ai) and paste this prompt:
          </p>

          <div className={styles.promptBox}>
            <pre className={styles.promptText}>{RECIPE_VISION_PROMPT}</pre>
            <Button
              variant="outline"
              size="sm"
              leftIcon={visionPromptCopied ? <Check size={16} /> : <Copy size={16} />}
              onClick={handleCopyVisionPrompt}
              className={styles.copyButton}
            >
              {visionPromptCopied ? 'Copied!' : 'Copy'}
            </Button>
          </div>

          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setStep('ocr-review')}>
              Back
            </Button>
            <Button onClick={() => setStep('manual-vision-response')} rightIcon={<ChevronRight size={18} />}>
              I&apos;ve sent it to Claude
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Manual vision response step
  if (step === 'manual-vision-response') {
    return (
      <div className={styles.container}>
        <div className={styles.manualSection}>
          <h3>Step 3: Paste Claude&apos;s response</h3>
          <p className={styles.instruction}>
            Copy the JSON response from Claude and paste it below.
          </p>

          <textarea
            value={manualVisionResponse}
            onChange={(e) => setManualVisionResponse(e.target.value)}
            placeholder={'Paste Claude\'s JSON response here...\n\nExample:\n{\n  "title": "Recipe Name",\n  "ingredients": [...],\n  "instructions": "..."\n}'}
            className={styles.textarea}
            rows={12}
          />

          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setStep('manual-vision-prompt')}>
              Back
            </Button>
            <Button
              onClick={handleManualVisionResponseSubmit}
              disabled={!manualVisionResponse.trim()}
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
            <span className={styles.ocrBadge}>
              <Image size={14} />
              From photo
            </span>
          </div>
          <p className={styles.instruction}>
            Review the imported recipe below. You can save it directly or edit it first.
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
            {extractedText && apiAvailable && preferredMode === 'api' && (
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
