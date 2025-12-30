import { useRef, useCallback, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { imageService } from '@/services';
import type { RecipeImage } from '@/types';
import styles from './ImageUploader.module.css';

interface ImageUploaderProps {
  onImageAdd: (image: RecipeImage) => void;
}

export function ImageUploader({ onImageAdd }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      // Validate file type
      if (!imageService.isValidImageType(file)) {
        setError('Please select a valid image file (JPEG, PNG, GIF, WebP, or BMP)');
        return;
      }

      // Validate file size
      if (!imageService.isValidFileSize(file)) {
        setError('Image is too large. Please select an image under 10MB.');
        return;
      }

      setIsProcessing(true);
      try {
        const recipeImage = await imageService.createRecipeImage(file);
        onImageAdd(recipeImage);
      } catch (err) {
        setError(`Failed to process image: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [onImageAdd]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''} ${isProcessing ? styles.dropzoneProcessing : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={isProcessing ? undefined : handleClick}
      >
        {isProcessing ? (
          <>
            <Loader2 size={24} className={styles.spinner} />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <Upload size={24} />
            <span>Add Image</span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
          onChange={handleInputChange}
          className={styles.fileInput}
          disabled={isProcessing}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
