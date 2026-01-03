import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { UNIT_INFO } from '@/types/units';
import { formatQuantity } from '@/utils/recipeScaling';
import { imageService } from './imageService';
import type { Recipe, Ingredient, NutritionInfo, RecipeImage } from '@/types';
import type { Tag } from '@/types/tags';

export interface ShareOptions {
  format: 'text' | 'pdf';
  includeImages: boolean;
  includeNutrition: boolean;
}

export interface ShareResult {
  success: boolean;
  method: 'webshare' | 'clipboard' | 'download';
  error?: string;
}

const LINE_SEPARATOR = '───────────────────────────────────';
const HEADER_SEPARATOR = '═══════════════════════════════════';

export const recipeShareService = {
  /**
   * Format a single ingredient for display
   */
  formatIngredient(ingredient: Ingredient): string {
    const parts: string[] = [];

    // Quantity and unit
    if (ingredient.quantity !== null) {
      const qty = formatQuantity(ingredient.quantity, ingredient.unit);
      if (qty) {
        if (ingredient.unit && ingredient.unit !== 'each') {
          const unitInfo = UNIT_INFO[ingredient.unit];
          parts.push(`${qty} ${unitInfo.abbreviation || unitInfo.name}`);
        } else {
          parts.push(qty);
        }
      }
    }

    // Name
    parts.push(ingredient.name);

    // Preparation notes
    if (ingredient.preparationNotes) {
      parts.push(`(${ingredient.preparationNotes})`);
    }

    // Optional indicator
    if (ingredient.isOptional) {
      parts.push('[optional]');
    }

    return parts.join(' ');
  },

  /**
   * Generate formatted text content for a recipe
   */
  generateTextContent(recipe: Recipe, tags: Tag[]): string {
    const lines: string[] = [];

    // Header
    lines.push(HEADER_SEPARATOR);
    lines.push(recipe.title.toUpperCase());
    lines.push(HEADER_SEPARATOR);
    lines.push('');

    // Description
    if (recipe.description) {
      lines.push(recipe.description);
      lines.push('');
    }

    // Meta info
    const metaParts: string[] = [];
    if (recipe.prepTimeMinutes) {
      metaParts.push(`Prep: ${recipe.prepTimeMinutes} min`);
    }
    if (recipe.cookTimeMinutes) {
      metaParts.push(`Cook: ${recipe.cookTimeMinutes} min`);
    }
    const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
    if (totalTime > 0) {
      metaParts.push(`Total: ${totalTime} min`);
    }
    metaParts.push(`Servings: ${recipe.servings}`);

    if (metaParts.length > 0) {
      lines.push(metaParts.join(' | '));
    }

    // Tags
    if (tags.length > 0) {
      const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));
      lines.push(`Tags: ${sortedTags.map((t) => t.name).join(', ')}`);
    }

    lines.push('');

    // Ingredients
    lines.push(LINE_SEPARATOR);
    lines.push('INGREDIENTS');
    lines.push(LINE_SEPARATOR);
    for (const ingredient of recipe.ingredients) {
      lines.push(`• ${this.formatIngredient(ingredient)}`);
    }
    lines.push('');

    // Instructions
    lines.push(LINE_SEPARATOR);
    lines.push('INSTRUCTIONS');
    lines.push(LINE_SEPARATOR);
    lines.push(recipe.instructions);
    lines.push('');

    // Notes
    if (recipe.notes) {
      lines.push(LINE_SEPARATOR);
      lines.push('NOTES');
      lines.push(LINE_SEPARATOR);
      lines.push(recipe.notes);
      lines.push('');
    }

    // Nutrition
    if (recipe.nutrition) {
      lines.push(LINE_SEPARATOR);
      lines.push('NUTRITION (per serving)');
      lines.push(LINE_SEPARATOR);
      lines.push(this.formatNutritionText(recipe.nutrition));
      lines.push('');
    }

    // Source
    if (recipe.sourceUrl || recipe.referenceCookbook || recipe.referenceOther) {
      lines.push(LINE_SEPARATOR);
      lines.push('SOURCE');
      lines.push(LINE_SEPARATOR);
      if (recipe.referenceCookbook) {
        const pageNum = recipe.referencePageNumber ? `, p. ${recipe.referencePageNumber}` : '';
        lines.push(`From: "${recipe.referenceCookbook}"${pageNum}`);
      }
      if (recipe.sourceUrl) {
        lines.push(`URL: ${recipe.sourceUrl}`);
      }
      if (recipe.referenceOther) {
        lines.push(recipe.referenceOther);
      }
      lines.push('');
    }

    // Footer
    lines.push('Shared from Platecraft');

    return lines.join('\n');
  },

  /**
   * Format nutrition info as text
   */
  formatNutritionText(nutrition: NutritionInfo): string {
    const parts: string[] = [
      `Calories: ${nutrition.calories}`,
      `Protein: ${nutrition.protein}g`,
      `Carbs: ${nutrition.carbohydrates}g`,
      `Fat: ${nutrition.fat}g`,
      `Fiber: ${nutrition.fiber}g`,
      `Sodium: ${nutrition.sodium}mg`,
    ];
    return parts.join(' | ');
  },

  /**
   * Get image as base64 for PDF embedding
   */
  async getImageAsBase64(image: RecipeImage): Promise<string | null> {
    try {
      if (image.isUrl && typeof image.data === 'string') {
        // For URL images, try to fetch and convert
        // Note: This may fail due to CORS restrictions
        try {
          const response = await fetch(image.data);
          const blob = await response.blob();
          return await imageService.blobToBase64(blob);
        } catch {
          // If fetch fails, we can't include this image
          return null;
        }
      }
      if (image.data instanceof Blob) {
        return await imageService.blobToBase64(image.data);
      }
      if (typeof image.data === 'string' && image.data.startsWith('data:')) {
        return image.data; // Already base64
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * Generate PDF document for a recipe
   */
  async generatePdf(
    recipe: Recipe,
    tags: Tag[],
    includeImages: boolean = true
  ): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let yPos = margin;

    // Helper to add a new page if needed
    const checkPageBreak = (heightNeeded: number) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (yPos + heightNeeded > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
    };

    // Add primary image if available
    if (includeImages && recipe.images.length > 0) {
      const primaryImage = recipe.images.find((img) => img.isPrimary) || recipe.images[0];
      const base64 = await this.getImageAsBase64(primaryImage);
      if (base64) {
        try {
          // Determine image format from base64 string
          const format = base64.includes('image/png') ? 'PNG' : 'JPEG';
          const imgWidth = Math.min(contentWidth, 100);
          const imgHeight = 60; // Fixed height, will be adjusted by jsPDF
          doc.addImage(base64, format, margin, yPos, imgWidth, imgHeight);
          yPos += imgHeight + 10;
        } catch {
          // If image fails to add, continue without it
        }
      }
    }

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(recipe.title, contentWidth);
    checkPageBreak(titleLines.length * 8);
    doc.text(titleLines, margin, yPos);
    yPos += titleLines.length * 8 + 2;

    // Description
    if (recipe.description) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'italic');
      const descLines = doc.splitTextToSize(recipe.description, contentWidth);
      checkPageBreak(descLines.length * 5);
      doc.text(descLines, margin, yPos);
      yPos += descLines.length * 5 + 3;
    }

    // Meta info row
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const metaParts: string[] = [];
    if (recipe.prepTimeMinutes) {
      metaParts.push(`Prep: ${recipe.prepTimeMinutes} min`);
    }
    if (recipe.cookTimeMinutes) {
      metaParts.push(`Cook: ${recipe.cookTimeMinutes} min`);
    }
    metaParts.push(`Servings: ${recipe.servings}`);
    checkPageBreak(6);
    doc.text(metaParts.join('  |  '), margin, yPos);
    yPos += 6;

    // Tags
    if (tags.length > 0) {
      const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));
      const tagsText = `Tags: ${sortedTags.map((t) => t.name).join(', ')}`;
      const tagLines = doc.splitTextToSize(tagsText, contentWidth);
      checkPageBreak(tagLines.length * 5);
      doc.text(tagLines, margin, yPos);
      yPos += tagLines.length * 5;
    }

    yPos += 8;

    // Ingredients section
    checkPageBreak(20);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Ingredients', margin, yPos);
    yPos += 8;

    // Ingredients table
    const ingredientRows = recipe.ingredients.map((ing) => {
      const qty = ing.quantity !== null ? formatQuantity(ing.quantity, ing.unit) : '';
      const unit = ing.unit && ing.unit !== 'each' ? UNIT_INFO[ing.unit].abbreviation || UNIT_INFO[ing.unit].name : '';
      const qtyUnit = [qty, unit].filter(Boolean).join(' ');
      let name = ing.name;
      if (ing.preparationNotes) {
        name += `, ${ing.preparationNotes}`;
      }
      if (ing.isOptional) {
        name += ' (optional)';
      }
      return [qtyUnit, name];
    });

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: ingredientRows,
      theme: 'plain',
      bodyStyles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 25, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
      },
      margin: { left: margin, right: margin },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Instructions section
    checkPageBreak(20);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Instructions', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const instructionLines = doc.splitTextToSize(recipe.instructions, contentWidth);
    for (const line of instructionLines) {
      checkPageBreak(5);
      doc.text(line, margin, yPos);
      yPos += 5;
    }
    yPos += 5;

    // Notes section
    if (recipe.notes) {
      checkPageBreak(20);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes', margin, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(recipe.notes, contentWidth);
      for (const line of noteLines) {
        checkPageBreak(5);
        doc.text(line, margin, yPos);
        yPos += 5;
      }
      yPos += 5;
    }

    // Nutrition section
    if (recipe.nutrition) {
      checkPageBreak(40);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Nutrition Facts (per serving)', margin, yPos);
      yPos += 8;

      const nutritionData = [
        ['Calories', `${recipe.nutrition.calories}`],
        ['Protein', `${recipe.nutrition.protein}g`],
        ['Carbohydrates', `${recipe.nutrition.carbohydrates}g`],
        ['Fat', `${recipe.nutrition.fat}g`],
        ['Fiber', `${recipe.nutrition.fiber}g`],
        ['Sodium', `${recipe.nutrition.sodium}mg`],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: nutritionData,
        theme: 'striped',
        bodyStyles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 30, halign: 'right' },
        },
        margin: { left: margin, right: margin },
        tableWidth: 80,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Source section
    if (recipe.sourceUrl || recipe.referenceCookbook || recipe.referenceOther) {
      checkPageBreak(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      const sourceLines: string[] = [];
      if (recipe.referenceCookbook) {
        const pageNum = recipe.referencePageNumber ? `, p. ${recipe.referencePageNumber}` : '';
        sourceLines.push(`From: "${recipe.referenceCookbook}"${pageNum}`);
      }
      if (recipe.sourceUrl) {
        sourceLines.push(`URL: ${recipe.sourceUrl}`);
      }
      if (recipe.referenceOther) {
        sourceLines.push(recipe.referenceOther);
      }
      for (const line of sourceLines) {
        checkPageBreak(5);
        doc.text(line, margin, yPos);
        yPos += 5;
      }
      yPos += 5;
    }

    // Footer
    checkPageBreak(10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128);
    doc.text('Generated by Platecraft', margin, yPos);

    return doc.output('blob');
  },

  /**
   * Check if Web Share API is available
   */
  canUseWebShare(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  },

  /**
   * Check if the browser supports sharing files via Web Share API
   */
  canShareFiles(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({
        files: [new File(['test'], 'test.txt', { type: 'text/plain' })],
      })
    );
  },

  /**
   * Share recipe via Web Share API
   */
  async shareViaWebShare(
    recipe: Recipe,
    tags: Tag[],
    options: ShareOptions
  ): Promise<ShareResult> {
    try {
      if (options.format === 'text') {
        const text = this.generateTextContent(recipe, tags);
        await navigator.share({
          title: recipe.title,
          text: text,
        });
        return { success: true, method: 'webshare' };
      } else {
        // PDF format
        const pdf = await this.generatePdf(recipe, tags, options.includeImages);
        const fileName = this.sanitizeFilename(recipe.title) + '.pdf';
        const file = new File([pdf], fileName, { type: 'application/pdf' });

        if (this.canShareFiles()) {
          await navigator.share({
            title: recipe.title,
            files: [file],
          });
          return { success: true, method: 'webshare' };
        } else {
          // If can't share files, download instead
          this.downloadFile(pdf, fileName);
          return { success: true, method: 'download' };
        }
      }
    } catch (error) {
      // User cancelled or share failed
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, method: 'webshare', error: 'Share cancelled' };
      }
      return {
        success: false,
        method: 'webshare',
        error: error instanceof Error ? error.message : 'Share failed',
      };
    }
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<ShareResult> {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'clipboard', error: 'Failed to copy to clipboard' };
    }
  },

  /**
   * Download a blob as a file
   */
  downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Sanitize filename for download
   */
  sanitizeFilename(name: string): string {
    return name
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  },

  /**
   * Main share method that handles format selection and fallbacks
   */
  async shareRecipe(
    recipe: Recipe,
    tags: Tag[],
    options: ShareOptions
  ): Promise<ShareResult> {
    // Try Web Share API first if available
    if (this.canUseWebShare()) {
      const result = await this.shareViaWebShare(recipe, tags, options);
      if (result.success || result.error === 'Share cancelled') {
        return result;
      }
      // If Web Share failed, fall through to fallback
    }

    // Fallback methods
    if (options.format === 'text') {
      const text = this.generateTextContent(recipe, tags);
      return this.copyToClipboard(text);
    } else {
      const pdf = await this.generatePdf(recipe, tags, options.includeImages);
      const fileName = this.sanitizeFilename(recipe.title) + '.pdf';
      this.downloadFile(pdf, fileName);
      return { success: true, method: 'download' };
    }
  },
};
