import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Copy, Check, AlertCircle, ChevronRight, Loader2, Upload, Image, X, Eye, AlertTriangle, Download, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { recipeImportService, ocrService, imageService } from '@/services';
import type { OcrProgress, OcrQualityAssessment } from '@/services';
import { recipeRepository, settingsRepository } from '@/db';
import { useImportStatePersistence, compressImageForStorage } from '@/hooks';
import type { ParsedRecipe, RecipeImage } from '@/types';
import { RECIPE_VISION_PROMPT } from '@/types/import';
import styles from './PhotoImportTab.module.css';

type ImportStep = 'upload' | 'ocr' | 'ocr-review' | 'vision-processing' | 'processing' | 'manual-prompt' | 'manual-response' | 'manual-vision-prompt' | 'manual-vision-response' | 'preview' | 'error';

// State that gets persisted to survive iOS Safari page refreshes
interface PersistedState {
  step: ImportStep;
  extractedText: string;
  manualPrompt: string;
  manualResponse: string;
  manualVisionResponse: string;
  ocrConfidence: number | null;
  ocrQuality: OcrQualityAssessment | null;
  error: string | null;
  // Compressed thumbnails for display when resuming (not the full images)
  imageThumbnails: string[];
}

export function PhotoImportTab() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [extractedText, setExtractedText] = useState('');
  const [ocrProgress, setOcrProgress] = useState<OcrProgress | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiAvailable, setApiAvailable] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualResponse, setManualResponse] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [visionPromptCopied, setVisionPromptCopied] = useState(false);
  const [manualVisionResponse, setManualVisionResponse] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sourceImages, setSourceImages] = useState<RecipeImage[]>([]);
  const [ocrQuality, setOcrQuality] = useState<OcrQualityAssessment | null>(null);
  const [imageBlobs, setImageBlobs] = useState<Blob[]>([]);
  const [wasRestored, setWasRestored] = useState(false);
  const [imageThumbnails, setImageThumbnails] = useState<string[]>([]);
  const [useVisionMode, setUseVisionMode] = useState(false);

  // Combine state for persistence
  const persistedState = useMemo((): PersistedState => ({
    step,
    extractedText,
    manualPrompt,
    manualResponse,
    manualVisionResponse,
    ocrConfidence,
    ocrQuality,
    error,
    imageThumbnails,
  }), [step, extractedText, manualPrompt, manualResponse, manualVisionResponse, ocrConfidence, ocrQuality, error, imageThumbnails]);

  // Restore callback
  const handleRestoreState = useCallback((state: Partial<PersistedState>) => {
    if (state.step) setStep(state.step);
    if (state.extractedText) setExtractedText(state.extractedText);
    if (state.manualPrompt) setManualPrompt(state.manualPrompt);
    if (state.manualResponse !== undefined) setManualResponse(state.manualResponse);
    if (state.manualVisionResponse !== undefined) setManualVisionResponse(state.manualVisionResponse);
    if (state.ocrConfidence !== undefined) setOcrConfidence(state.ocrConfidence);
    if (state.ocrQuality !== undefined) setOcrQuality(state.ocrQuality);
    if (state.error !== undefined) setError(state.error);
    if (state.imageThumbnails && state.imageThumbnails.length > 0) {
      setImageThumbnails(state.imageThumbnails);
      setPreviewUrls(state.imageThumbnails); // Use thumbnails as previews when restoring
    }

    // Mark as restored if we're past the upload step
    if (state.step && state.step !== 'upload') {
      setWasRestored(true);
    }
  }, []);

  // Check if state is worth persisting (user has made progress in manual workflow)
  const shouldPersist = useCallback((state: PersistedState): boolean => {
    // Persist if user is in manual workflow steps (where app switching happens)
    const manualSteps: ImportStep[] = ['manual-prompt', 'manual-response', 'manual-vision-prompt', 'manual-vision-response', 'ocr-review'];
    return manualSteps.includes(state.step);
  }, []);

  const { clearPersistedState } = useImportStatePersistence(
    'photo',
    persistedState,
    handleRestoreState,
    shouldPersist
  );

  useEffect(() => {
    const loadSettings = async () => {
      const available = await recipeImportService.isApiModeAvailable();
      setApiAvailable(available);

      // Load default photo import mode preference
      const defaultMode = await settingsRepository.getDefaultPhotoImportMode();
      setUseVisionMode(defaultMode === 'vision');
    };
    loadSettings();
  }, []);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleFilesSelect = useCallback((files: File[]) => {
    const validFiles: File[] = [];
    const newPreviewUrls: string[] = [];

    for (const file of files) {
      // Validate file type
      if (!ocrService.isValidImageType(file)) {
        setError(`"${file.name}" is not a valid image file (JPEG, PNG, GIF, WebP, or BMP)`);
        setStep('error');
        return;
      }

      // Validate file size
      if (!ocrService.isValidFileSize(file)) {
        setError(`"${file.name}" is too large. Please select images under 10MB.`);
        setStep('error');
        return;
      }

      validFiles.push(file);
      newPreviewUrls.push(URL.createObjectURL(file));
    }

    // Add to existing files
    setSelectedFiles(prev => [...prev, ...validFiles]);
    setPreviewUrls(prev => [...prev, ...newPreviewUrls]);
  }, []);

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
      handleFilesSelect(Array.from(files));
    }
  }, [handleFilesSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFilesSelect(Array.from(files));
    }
    // Reset input so the same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = useCallback((index: number) => {
    // Revoke the URL for the removed file
    URL.revokeObjectURL(previewUrls[index]);

    // Remove from both arrays
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  }, [previewUrls]);

  const handleClearAllFiles = useCallback(() => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setPreviewUrls([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrls]);

  // Handle direct vision mode (skip OCR)
  const handleDirectVisionMode = async () => {
    if (selectedFiles.length === 0) return;

    setError(null);

    // Store the image blobs for vision processing
    setImageBlobs(selectedFiles);

    // Create thumbnails for potential state persistence
    const thumbnails: string[] = [];
    for (const file of selectedFiles) {
      try {
        const thumbnail = await compressImageForStorage(file);
        if (thumbnail) thumbnails.push(thumbnail);
      } catch (err) {
        console.warn('Failed to create thumbnail:', err);
      }
    }
    setImageThumbnails(thumbnails);

    if (apiAvailable) {
      // Use API vision mode
      setStep('vision-processing');
      const result = await recipeImportService.parseWithVision(selectedFiles[0]);

      if (result.success && result.recipe) {
        setParsedRecipe(result.recipe);
        setStep('preview');
      } else {
        setError(result.error || 'Vision parsing failed. Try using OCR mode or manual mode.');
        setStep('error');
      }
    } else {
      // Manual vision mode - user will upload to Claude themselves
      setStep('manual-vision-prompt');
    }
  };

  // Handle the main action button click
  const handleProcessImages = async () => {
    if (useVisionMode) {
      await handleDirectVisionMode();
    } else {
      await handleExtractText();
    }
  };

  const handleExtractText = async () => {
    if (selectedFiles.length === 0) return;

    setStep('ocr');
    setError(null);

    const allTexts: string[] = [];
    const allConfidences: number[] = [];
    const blobs: Blob[] = [];
    const thumbnails: string[] = [];
    const images: RecipeImage[] = [];

    // Process each file
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const imageNum = i + 1;
      const totalImages = selectedFiles.length;

      setOcrProgress({
        status: `Reading image ${imageNum} of ${totalImages}...`,
        progress: i / totalImages
      });

      const result = await ocrService.extractText(file, (progress) => {
        // Scale progress for this image within the overall progress
        const overallProgress = (i + progress.progress) / totalImages;
        setOcrProgress({
          status: totalImages > 1
            ? `Image ${imageNum}/${totalImages}: ${progress.status}`
            : progress.status,
          progress: overallProgress
        });
      });

      if (!result.success || !result.text) {
        setError(`Failed to extract text from image ${imageNum}: ${result.error || 'Unknown error'}`);
        setStep('error');
        return;
      }

      allTexts.push(result.text);
      allConfidences.push(result.confidence ?? 0);
      blobs.push(file);

      // Create thumbnail for state persistence
      try {
        const thumbnail = await compressImageForStorage(file);
        if (thumbnail) {
          thumbnails.push(thumbnail);
        }
      } catch (err) {
        console.warn(`Failed to create thumbnail for image ${imageNum}:`, err);
      }

      // Create RecipeImage for this file
      try {
        const recipeImage = await imageService.createRecipeImage(
          file,
          totalImages > 1 ? `Source photo ${imageNum}` : 'Source photo',
          i === 0 // First image is primary
        );
        images.push(recipeImage);
      } catch (err) {
        console.error(`Failed to create source image ${imageNum}:`, err);
      }
    }

    // Combine all extracted text
    const combinedText = selectedFiles.length > 1
      ? allTexts.map((text, i) => `--- Image ${i + 1} ---\n${text}`).join('\n\n')
      : allTexts[0];

    // Use lowest confidence as overall confidence
    const overallConfidence = Math.min(...allConfidences);

    setExtractedText(combinedText);
    setOcrConfidence(overallConfidence);
    setImageBlobs(blobs);
    setImageThumbnails(thumbnails);
    setSourceImages(images);

    // Assess OCR quality using overall confidence and combined text
    const quality = ocrService.assessQuality(combinedText, overallConfidence);
    setOcrQuality(quality);

    // If quality is poor, show review step
    if (quality.isPoor) {
      setStep('ocr-review');
      return;
    }

    // Proceed to AI parsing
    await proceedToParsing(combinedText);
  };

  const proceedToParsing = async (text: string) => {
    // If API key is available, always use automatic mode
    if (apiAvailable) {
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
    if (imageBlobs.length === 0) {
      setError('Images not available. Please try again.');
      setStep('error');
      return;
    }

    setStep('vision-processing');
    // Use the first image for vision mode (API typically handles one image at a time)
    // For multiple images, users should use OCR mode which combines text from all images
    const result = await recipeImportService.parseWithVision(imageBlobs[0]);

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

  const handleDownloadImage = (index: number) => {
    if (!previewUrls[index] || !selectedFiles[index]) return;

    const link = document.createElement('a');
    link.href = previewUrls[index];
    link.download = selectedFiles[index].name || `recipe-image-${index + 1}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllImages = () => {
    // Download each image with a small delay to avoid browser blocking
    selectedFiles.forEach((_, index) => {
      setTimeout(() => handleDownloadImage(index), index * 200);
    });
  };

  const handleCopyVisionPrompt = async () => {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(RECIPE_VISION_PROMPT);
        setVisionPromptCopied(true);
        setTimeout(() => setVisionPromptCopied(false), 2000);
        return;
      } catch (err) {
        console.warn('Clipboard API failed, trying fallback:', err);
      }
    }

    // Fallback for iOS Safari and older browsers
    const textArea = document.createElement('textarea');
    textArea.value = RECIPE_VISION_PROMPT;

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
    textArea.setSelectionRange(0, RECIPE_VISION_PROMPT.length);

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setVisionPromptCopied(true);
        setTimeout(() => setVisionPromptCopied(false), 2000);
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textArea);
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
    textArea.setSelectionRange(0, manualPrompt.length);

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2000);
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
      const formData = recipeImportService.convertToRecipeFormData(parsedRecipe, sourceImages.length > 0 ? sourceImages : undefined);
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

    // Note: We can't easily pass the Blob through sessionStorage, so images won't be preserved
    // when editing before save. This is a limitation of the current approach.
    const formData = recipeImportService.convertToRecipeFormData(parsedRecipe);
    sessionStorage.setItem('importedRecipe', JSON.stringify(formData));
    clearPersistedState(); // Clear persisted state when editing
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
    setSourceImages([]);
    setOcrQuality(null);
    setImageBlobs([]);
    setVisionPromptCopied(false);
    setWasRestored(false);
    setImageThumbnails([]);
    clearPersistedState(); // Clear persisted state when starting over
    handleClearAllFiles();
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
          <label className={styles.label}>Upload photos of your recipe</label>

          <div
            className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={48} strokeWidth={1.5} className={styles.dropzoneIcon} />
            <p className={styles.dropzoneText}>
              Drag and drop images here, or click to browse
            </p>
            <p className={styles.dropzoneHint}>
              Supports JPEG, PNG, GIF, WebP, BMP (max 10MB each). Select multiple images if your recipe spans multiple pages.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
              multiple
              onChange={handleInputChange}
              className={styles.fileInput}
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className={styles.previewGrid}>
              {selectedFiles.map((file, index) => (
                <div key={index} className={styles.preview}>
                  <div className={styles.previewImageWrapper}>
                    <img src={previewUrls[index]} alt={`Recipe preview ${index + 1}`} className={styles.previewImage} />
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      aria-label={`Remove image ${index + 1}`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className={styles.previewInfo}>
                    <Image size={16} />
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileSize}>
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                </div>
              ))}
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
              <span>Using automatic parsing with Claude API</span>
            </p>
          ) : (
            <p className={styles.modeText}>
              <span>Manual mode - you&apos;ll copy a prompt to Claude and paste the response back</span>
            </p>
          )}
        </div>

        <div className={styles.visionToggle}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={useVisionMode}
              onChange={(e) => setUseVisionMode(e.target.checked)}
              className={styles.toggleInput}
            />
            <span className={styles.toggleSwitch} />
            <span className={styles.toggleText}>
              <Eye size={16} />
              Skip OCR, use Vision
            </span>
          </label>
          <p className={styles.toggleHint}>
            {useVisionMode
              ? 'Claude will read directly from the image. Best for handwritten recipes.'
              : 'Text will be extracted first, then parsed. Best for printed text.'}
          </p>
        </div>

        <div className={styles.actions}>
          <Button
            onClick={handleProcessImages}
            disabled={selectedFiles.length === 0}
            rightIcon={useVisionMode ? <Eye size={18} /> : <ChevronRight size={18} />}
          >
            {useVisionMode
              ? `Use Vision${selectedFiles.length > 1 ? ' (first image)' : ''}`
              : `Extract Text${selectedFiles.length > 1 ? ` from ${selectedFiles.length} Images` : ''}`}
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
          <h3>Reading {selectedFiles.length > 1 ? 'images' : 'image'}...</h3>
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
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
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
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
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
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
          <h3>Step 1: Download the {previewUrls.length > 1 ? 'images' : 'image'}</h3>
          <p className={styles.instruction}>
            Download your recipe {previewUrls.length > 1 ? 'images' : 'image'}, then upload {previewUrls.length > 1 ? 'them' : 'it'} to Claude along with the prompt below.
          </p>

          {previewUrls.length > 0 && (
            <div className={styles.imagePreviewSmall}>
              {previewUrls.length === 1 ? (
                <>
                  <img src={previewUrls[0]} alt="Recipe" />
                  <Button
                    variant="outline"
                    leftIcon={<Download size={18} />}
                    onClick={() => handleDownloadImage(0)}
                  >
                    Download Image
                  </Button>
                </>
              ) : (
                <>
                  <div className={styles.multiImagePreview}>
                    {previewUrls.map((url, index) => (
                      <img key={index} src={url} alt={`Recipe ${index + 1}`} />
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    leftIcon={<Download size={18} />}
                    onClick={handleDownloadAllImages}
                  >
                    Download All {previewUrls.length} Images
                  </Button>
                </>
              )}
            </div>
          )}

          <h3 className={styles.stepTitle}>Step 2: Copy this prompt to Claude</h3>
          <p className={styles.instruction}>
            Upload the {previewUrls.length > 1 ? 'images' : 'image'} to Claude (claude.ai) and paste this prompt:
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
          {wasRestored && (
            <div className={styles.restoredBanner}>
              <RotateCcw size={16} />
              <span>Your progress was restored. Pick up where you left off!</span>
            </div>
          )}
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
            {extractedText && apiAvailable && (
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
