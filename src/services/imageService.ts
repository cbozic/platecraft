import { v4 as uuidv4 } from 'uuid';
import type { RecipeImage } from '@/types';

const MAX_IMAGE_WIDTH = 1500;
const MAX_IMAGE_HEIGHT = 1500;
const JPEG_QUALITY = 0.85;

export const imageService = {
  /**
   * Resize an image file to fit within max dimensions while preserving aspect ratio.
   * Converts to JPEG for consistent compression.
   */
  async resizeImage(
    file: File,
    maxWidth: number = MAX_IMAGE_WIDTH,
    maxHeight: number = MAX_IMAGE_HEIGHT
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        let { width, height } = img;

        // Calculate new dimensions while preserving aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Use high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  },

  /**
   * Convert a Blob to a Base64 data URL string for JSON serialization.
   */
  async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  },

  /**
   * Convert a Base64 data URL string back to a Blob.
   */
  base64ToBlob(base64: string): Blob {
    // Extract the mime type and data from the data URL
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      throw new Error('Invalid base64 data URL');
    }

    const mimeType = match[1];
    const data = match[2];

    // Decode base64 to binary
    const binaryString = atob(data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  },

  /**
   * Create a RecipeImage from a File, with automatic resizing.
   */
  async createRecipeImage(
    file: File,
    caption?: string,
    isPrimary: boolean = false
  ): Promise<RecipeImage> {
    // Resize the image
    const resizedBlob = await this.resizeImage(file);

    return {
      id: uuidv4(),
      data: resizedBlob,
      isUrl: false,
      caption,
      isPrimary,
    };
  },

  /**
   * Create an object URL for displaying a RecipeImage.
   * Remember to revoke the URL when done using URL.revokeObjectURL().
   */
  getImageUrl(image: RecipeImage): string {
    if (image.isUrl && typeof image.data === 'string') {
      return image.data;
    }
    if (image.data instanceof Blob) {
      return URL.createObjectURL(image.data);
    }
    // Handle base64 string (during import before conversion)
    if (typeof image.data === 'string' && image.data.startsWith('data:')) {
      return image.data;
    }
    throw new Error('Invalid image data');
  },

  /**
   * Check if a file is a valid image type.
   */
  isValidImageType(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    return validTypes.includes(file.type);
  },

  /**
   * Get max file size in bytes (10MB).
   */
  getMaxFileSize(): number {
    return 10 * 1024 * 1024;
  },

  /**
   * Validate file size.
   */
  isValidFileSize(file: File): boolean {
    return file.size <= this.getMaxFileSize();
  },

  /**
   * Prepare recipe images for JSON export by converting Blobs to Base64.
   */
  async prepareImagesForExport(images: RecipeImage[]): Promise<RecipeImage[]> {
    return Promise.all(
      images.map(async (image) => {
        if (image.data instanceof Blob) {
          const base64 = await this.blobToBase64(image.data);
          return { ...image, data: base64 };
        }
        return image;
      })
    );
  },

  /**
   * Restore recipe images after JSON import by converting Base64 back to Blobs.
   */
  restoreImagesFromImport(images: RecipeImage[]): RecipeImage[] {
    return images.map((image) => {
      if (typeof image.data === 'string' && image.data.startsWith('data:') && !image.isUrl) {
        const blob = this.base64ToBlob(image.data);
        return { ...image, data: blob };
      }
      return image;
    });
  },
};
