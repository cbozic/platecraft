import { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, Trash2, Image as ImageIcon, Star } from 'lucide-react';
import { imageService } from '@/services';
import type { RecipeImage } from '@/types';
import styles from './ImageGallery.module.css';

interface ImageGalleryProps {
  images: RecipeImage[];
  onDelete?: (imageId: string) => void;
  onSetPrimary?: (imageId: string) => void;
  editable?: boolean;
}

export function ImageGallery({ images, onDelete, onSetPrimary, editable = false }: ImageGalleryProps) {
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [selectedImage, setSelectedImage] = useState<RecipeImage | null>(null);

  // Create object URLs for blob images
  useEffect(() => {
    const urls = new Map<string, string>();

    images.forEach((img) => {
      try {
        const url = imageService.getImageUrl(img);
        urls.set(img.id, url);
      } catch (err) {
        console.error('Failed to create URL for image:', err);
      }
    });

    setImageUrls(urls);

    // Cleanup blob URLs on unmount
    return () => {
      urls.forEach((url, id) => {
        const img = images.find((i) => i.id === id);
        // Only revoke if it's a blob URL (not a regular URL or data URL)
        if (img && !img.isUrl && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [images]);

  const handleImageClick = useCallback((image: RecipeImage) => {
    setSelectedImage(image);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent, imageId: string) => {
      e.stopPropagation();
      if (onDelete) {
        onDelete(imageId);
      }
    },
    [onDelete]
  );

  const handleSetPrimary = useCallback(
    (e: React.MouseEvent, imageId: string) => {
      e.stopPropagation();
      onSetPrimary?.(imageId);
    },
    [onSetPrimary]
  );

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className={styles.gallery}>
        {images.map((image) => {
          const url = imageUrls.get(image.id);
          if (!url) return null;

          return (
            <div
              key={image.id}
              className={styles.imageContainer}
              onClick={() => handleImageClick(image)}
            >
              <img src={url} alt={image.caption || 'Recipe image'} className={styles.thumbnail} />
              <div className={styles.overlay}>
                <ZoomIn size={20} className={styles.zoomIcon} />
              </div>
              {image.caption && <span className={styles.caption}>{image.caption}</span>}
              {image.isPrimary && (
                <div className={styles.primaryBadge} aria-label="Primary image">
                  <Star size={14} fill="currentColor" />
                </div>
              )}
              {editable && onSetPrimary && !image.isPrimary && (
                <button
                  type="button"
                  className={styles.setPrimaryButton}
                  onClick={(e) => handleSetPrimary(e, image.id)}
                  aria-label="Set as primary image"
                >
                  <Star size={14} />
                </button>
              )}
              {editable && onDelete && (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={(e) => handleDelete(e, image.id)}
                  aria-label="Delete image"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Full-size modal */}
      {selectedImage && (
        <div className={styles.modal} onClick={handleCloseModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={handleCloseModal}
              aria-label="Close"
            >
              <X size={24} />
            </button>
            <img
              src={imageUrls.get(selectedImage.id)}
              alt={selectedImage.caption || 'Recipe image'}
              className={styles.fullImage}
            />
            {selectedImage.caption && (
              <p className={styles.modalCaption}>{selectedImage.caption}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Placeholder for empty state
export function ImageGalleryPlaceholder() {
  return (
    <div className={styles.placeholder}>
      <ImageIcon size={32} strokeWidth={1.5} />
      <span>No images attached</span>
    </div>
  );
}
