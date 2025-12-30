import Tesseract from 'tesseract.js';

export interface OcrResult {
  success: boolean;
  text?: string;
  confidence?: number;
  error?: string;
}

export interface OcrQualityAssessment {
  score: number; // 0-1 overall quality score
  isPoor: boolean; // true if quality is below acceptable threshold
  reason?: string; // Human-readable reason for poor quality
}

export interface OcrProgress {
  status: string;
  progress: number; // 0-1
}

export const ocrService = {
  /**
   * Extract text from an image using Tesseract.js OCR
   */
  async extractText(
    imageSource: File | string,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<OcrResult> {
    try {
      const result = await Tesseract.recognize(imageSource, 'eng', {
        logger: (m) => {
          if (onProgress && m.status && typeof m.progress === 'number') {
            onProgress({
              status: this.formatStatus(m.status),
              progress: m.progress,
            });
          }
        },
      });

      const text = result.data.text.trim();

      if (!text) {
        return {
          success: false,
          error: 'No text could be extracted from the image. Try a clearer photo.',
        };
      }

      return {
        success: true,
        text,
        confidence: result.data.confidence / 100, // Convert to 0-1 scale
      };
    } catch (error) {
      return {
        success: false,
        error: `OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  /**
   * Format Tesseract status messages for display
   */
  formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'loading tesseract core': 'Loading OCR engine...',
      'initializing tesseract': 'Initializing...',
      'loading language traineddata': 'Loading language data...',
      'initializing api': 'Preparing...',
      'recognizing text': 'Reading text...',
    };

    return statusMap[status] || status;
  },

  /**
   * Validate that a file is a supported image type
   */
  isValidImageType(file: File): boolean {
    const supportedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
    ];
    return supportedTypes.includes(file.type);
  },

  /**
   * Get maximum recommended file size in bytes (10MB)
   */
  getMaxFileSize(): number {
    return 10 * 1024 * 1024;
  },

  /**
   * Validate file size
   */
  isValidFileSize(file: File): boolean {
    return file.size <= this.getMaxFileSize();
  },

  /**
   * Assess the quality of OCR output to detect potential garbage text
   * from handwritten/cursive sources or poor image quality
   */
  assessQuality(text: string, confidence: number): OcrQualityAssessment {
    const MIN_TEXT_LENGTH = 100;
    const MAX_SPECIAL_CHAR_RATIO = 0.3;
    const MIN_WORD_RATIO = 0.4;

    const reasons: string[] = [];
    let score = 1.0;

    // Check OCR confidence score - weight this heavily
    if (confidence < 0.4) {
      score -= 0.5;
      reasons.push('Very low OCR confidence');
    } else if (confidence < 0.6) {
      score -= 0.35;
      reasons.push('Low OCR confidence');
    } else if (confidence < 0.75) {
      score -= 0.15;
      reasons.push('Moderate OCR confidence');
    }

    // Check text length - recipes typically need at least some content
    if (text.length < MIN_TEXT_LENGTH) {
      score -= 0.2;
      reasons.push('Very little text extracted');
    }

    // Check for high ratio of special/garbage characters
    const specialChars = text.match(/[^a-zA-Z0-9\s.,;:!?'"()\-\/]/g) || [];
    const specialCharRatio = text.length > 0 ? specialChars.length / text.length : 0;
    if (specialCharRatio > MAX_SPECIAL_CHAR_RATIO) {
      score -= 0.3;
      reasons.push('High ratio of unrecognizable characters');
    }

    // Check for word-like patterns (sequences of 3+ letters)
    const words = text.match(/[a-zA-Z]{3,}/g) || [];
    const wordCharCount = words.join('').length;
    const letterCount = (text.match(/[a-zA-Z]/g) || []).length;
    const wordRatio = letterCount > 0 ? wordCharCount / letterCount : 0;
    if (wordRatio < MIN_WORD_RATIO) {
      score -= 0.2;
      reasons.push('Few recognizable words');
    }

    // Check for common recipe keywords as a sanity check
    const recipeKeywords = /\b(cup|tbsp|tsp|teaspoon|tablespoon|ounce|pound|ingredient|mix|stir|bake|cook|add|heat|preheat|serve|minutes|hours|degrees)\b/i;
    if (!recipeKeywords.test(text)) {
      score -= 0.1;
      reasons.push('Missing common recipe terms');
    }

    // Clamp score to 0-1 range
    score = Math.max(0, Math.min(1, score));

    // Flag as poor if score is below threshold OR confidence is very low
    const isPoor = score < 0.6 || confidence < 0.5;
    const reason = reasons.length > 0 ? reasons.join('. ') : undefined;

    return { score, isPoor, reason };
  },
};
