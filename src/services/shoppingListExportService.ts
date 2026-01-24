import { format } from 'date-fns';
import { UNIT_INFO } from '@/types/units';
import { formatQuantity } from '@/utils/recipeScaling';
import { DEFAULT_STORE_SECTIONS } from '@/types/shopping';
import type { ShoppingList, ShoppingItem, StoreSectionInfo } from '@/types/shopping';
import type { MeasurementUnit } from '@/types/units';

export type ExportFormat = 'markdown' | 'json' | 'csv';

export interface ExportOptions {
  format: ExportFormat;
  includeRecipeSources: boolean;
  includeNotes: boolean;
  includeCheckedItems: boolean;
  groupBySection: boolean;
}

export interface ExportResult {
  success: boolean;
  method: 'clipboard' | 'download';
  error?: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
  format: 'markdown',
  includeRecipeSources: true,
  includeNotes: true,
  includeCheckedItems: false,
  groupBySection: true,
};

/**
 * Get section info by id, falling back to defaults
 */
function getSectionInfo(sectionId: string): StoreSectionInfo {
  const found = DEFAULT_STORE_SECTIONS.find((s) => s.id === sectionId);
  if (found) return found;
  // Return a default for custom sections
  return {
    id: sectionId,
    name: sectionId.charAt(0).toUpperCase() + sectionId.slice(1).replace(/_/g, ' '),
    order: 999,
    isCustom: true,
  };
}

/**
 * Format a shopping item's quantity and unit for display
 */
function formatItemQuantity(item: ShoppingItem): string {
  if (item.quantity === null) return '';

  const qty = formatQuantity(item.quantity, item.unit);
  if (!qty) return '';

  if (item.unit && item.unit !== 'each') {
    const unitInfo = UNIT_INFO[item.unit as MeasurementUnit];
    if (unitInfo) {
      return `${qty} ${unitInfo.abbreviation || unitInfo.name}`;
    }
  }

  return qty;
}

/**
 * Group items by store section
 */
function groupItemsBySection(
  items: ShoppingItem[]
): Map<string, ShoppingItem[]> {
  const grouped = new Map<string, ShoppingItem[]>();

  for (const item of items) {
    const section = item.storeSection || 'other';
    const existing = grouped.get(section) || [];
    existing.push(item);
    grouped.set(section, existing);
  }

  return grouped;
}

/**
 * Sort sections by their defined order
 */
function sortSections(
  sectionMap: Map<string, ShoppingItem[]>
): Array<{ section: StoreSectionInfo; items: ShoppingItem[] }> {
  return Array.from(sectionMap.entries())
    .map(([sectionId, items]) => ({
      section: getSectionInfo(sectionId),
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.section.order - b.section.order);
}

/**
 * Filter items based on export options
 */
function filterItems(items: ShoppingItem[], options: ExportOptions): ShoppingItem[] {
  return items.filter((item) => {
    if (!options.includeCheckedItems && item.isChecked) {
      return false;
    }
    return true;
  });
}

// ============================================================================
// MARKDOWN EXPORT
// ============================================================================

/**
 * Generate Markdown/plain text export of a shopping list
 * This format is optimized for AI agents and human readability
 */
function generateMarkdownExport(list: ShoppingList, options: ExportOptions): string {
  const lines: string[] = [];
  const filteredItems = filterItems(list.items, options);

  // Header
  lines.push(`# ${list.name}`);
  lines.push('');
  lines.push(`**Date Range:** ${format(new Date(list.dateRangeStart), 'MMM d')} - ${format(new Date(list.dateRangeEnd), 'MMM d, yyyy')}`);
  lines.push(`**Total Items:** ${filteredItems.length}`);
  lines.push('');

  if (filteredItems.length === 0) {
    lines.push('*No items to display.*');
    return lines.join('\n');
  }

  if (options.groupBySection) {
    // Group by section
    const grouped = groupItemsBySection(filteredItems);
    const sorted = sortSections(grouped);

    for (const { section, items } of sorted) {
      if (items.length === 0) continue;

      lines.push(`## ${section.name}`);
      lines.push('');

      for (const item of items) {
        const line = formatMarkdownItem(item, options);
        lines.push(line);
      }
      lines.push('');
    }
  } else {
    // Flat list sorted alphabetically
    const sortedItems = [...filteredItems].sort((a, b) => a.name.localeCompare(b.name));

    lines.push('## Items');
    lines.push('');

    for (const item of sortedItems) {
      const line = formatMarkdownItem(item, options);
      lines.push(line);
    }
  }

  // Footer with context for AI agents
  lines.push('---');
  lines.push('*Exported from Platecraft*');

  return lines.join('\n');
}

/**
 * Format a single item for Markdown export
 */
function formatMarkdownItem(item: ShoppingItem, options: ExportOptions): string {
  const parts: string[] = [];

  // Checkbox
  const checkbox = item.isChecked ? '- [x]' : '- [ ]';
  parts.push(checkbox);

  // Quantity and name
  const qty = formatItemQuantity(item);
  if (qty) {
    parts.push(`**${qty}** ${item.name}`);
  } else {
    parts.push(item.name);
  }

  // Notes
  if (options.includeNotes && item.notes) {
    parts.push(`*(${item.notes})*`);
  }

  // Estimation indicator
  if (item.isEstimated && item.estimationNote) {
    parts.push(`[~${item.estimationNote}]`);
  }

  let line = parts.join(' ');

  // Recipe sources (on new line, indented)
  if (options.includeRecipeSources && item.sourceRecipeDetails && item.sourceRecipeDetails.length > 0) {
    const sources = item.sourceRecipeDetails
      .map((s) => {
        const sourceQty = s.quantity !== null ? formatQuantity(s.quantity, s.unit) : '';
        const sourceUnit = s.unit && s.unit !== 'each' ? ` ${UNIT_INFO[s.unit]?.abbreviation || s.unit}` : '';
        const qtyPart = sourceQty ? ` (${sourceQty}${sourceUnit})` : '';
        return `${s.recipeName}${qtyPart}`;
      })
      .join(', ');
    line += `\n  - *From: ${sources}*`;
  }

  return line;
}

// ============================================================================
// JSON EXPORT
// ============================================================================

/**
 * JSON export structure for shopping lists
 */
interface ShoppingListJsonExport {
  exportVersion: string;
  exportedAt: string;
  list: {
    id: string;
    name: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    createdAt: string;
    updatedAt: string;
  };
  itemCount: number;
  sections: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      isChecked: boolean;
      notes?: string;
      isEstimated?: boolean;
      estimationNote?: string;
      isManual: boolean;
      isRecurring: boolean;
      sources?: Array<{
        recipeId: string;
        recipeName: string;
        quantity: number | null;
        unit: string | null;
        originalIngredientName: string;
      }>;
    }>;
  }>;
}

/**
 * Generate JSON export of a shopping list
 */
function generateJsonExport(list: ShoppingList, options: ExportOptions): string {
  const filteredItems = filterItems(list.items, options);
  const grouped = groupItemsBySection(filteredItems);
  const sorted = sortSections(grouped);

  const exportData: ShoppingListJsonExport = {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    list: {
      id: list.id,
      name: list.name,
      dateRangeStart: new Date(list.dateRangeStart).toISOString(),
      dateRangeEnd: new Date(list.dateRangeEnd).toISOString(),
      createdAt: new Date(list.createdAt).toISOString(),
      updatedAt: new Date(list.updatedAt).toISOString(),
    },
    itemCount: filteredItems.length,
    sections: sorted.map(({ section, items }) => ({
      id: section.id,
      name: section.name,
      items: items.map((item) => {
        const exportItem: ShoppingListJsonExport['sections'][0]['items'][0] = {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          isChecked: item.isChecked,
          isManual: item.isManual,
          isRecurring: item.isRecurring,
        };

        if (options.includeNotes && item.notes) {
          exportItem.notes = item.notes;
        }

        if (item.isEstimated) {
          exportItem.isEstimated = item.isEstimated;
          if (item.estimationNote) {
            exportItem.estimationNote = item.estimationNote;
          }
        }

        if (options.includeRecipeSources && item.sourceRecipeDetails && item.sourceRecipeDetails.length > 0) {
          exportItem.sources = item.sourceRecipeDetails.map((s) => ({
            recipeId: s.recipeId,
            recipeName: s.recipeName,
            quantity: s.quantity,
            unit: s.unit,
            originalIngredientName: s.originalIngredientName,
          }));
        }

        return exportItem;
      }),
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

// ============================================================================
// CSV EXPORT
// ============================================================================

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV export of a shopping list
 */
function generateCsvExport(list: ShoppingList, options: ExportOptions): string {
  const filteredItems = filterItems(list.items, options);
  const rows: string[] = [];

  // Header row
  const headers = [
    'Name',
    'Quantity',
    'Unit',
    'Section',
    'Checked',
  ];

  if (options.includeNotes) {
    headers.push('Notes');
  }

  if (options.includeRecipeSources) {
    headers.push('Recipe Sources');
  }

  rows.push(headers.join(','));

  // Sort items by section, then by name
  const grouped = groupItemsBySection(filteredItems);
  const sorted = sortSections(grouped);

  for (const { section, items } of sorted) {
    for (const item of items) {
      const values: string[] = [
        escapeCsvValue(item.name),
        item.quantity !== null ? item.quantity.toString() : '',
        item.unit || '',
        escapeCsvValue(section.name),
        item.isChecked ? 'Yes' : 'No',
      ];

      if (options.includeNotes) {
        values.push(escapeCsvValue(item.notes || ''));
      }

      if (options.includeRecipeSources) {
        const sources = item.sourceRecipeDetails
          ?.map((s) => s.recipeName)
          .join('; ') || '';
        values.push(escapeCsvValue(sources));
      }

      rows.push(values.join(','));
    }
  }

  return rows.join('\n');
}

// ============================================================================
// MAIN EXPORT SERVICE
// ============================================================================

export const shoppingListExportService = {
  /**
   * Generate export content based on format
   */
  generateExport(list: ShoppingList, options: Partial<ExportOptions> = {}): string {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    switch (mergedOptions.format) {
      case 'markdown':
        return generateMarkdownExport(list, mergedOptions);
      case 'json':
        return generateJsonExport(list, mergedOptions);
      case 'csv':
        return generateCsvExport(list, mergedOptions);
      default:
        return generateMarkdownExport(list, mergedOptions);
    }
  },

  /**
   * Get file extension for export format
   */
  getFileExtension(format: ExportFormat): string {
    switch (format) {
      case 'markdown':
        return 'md';
      case 'json':
        return 'json';
      case 'csv':
        return 'csv';
      default:
        return 'txt';
    }
  },

  /**
   * Get MIME type for export format
   */
  getMimeType(format: ExportFormat): string {
    switch (format) {
      case 'markdown':
        return 'text/markdown';
      case 'json':
        return 'application/json';
      case 'csv':
        return 'text/csv';
      default:
        return 'text/plain';
    }
  },

  /**
   * Sanitize filename for download
   */
  sanitizeFilename(name: string): string {
    return name
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, '_')
      .trim()
      .substring(0, 100);
  },

  /**
   * Copy export content to clipboard
   */
  async copyToClipboard(content: string): Promise<ExportResult> {
    try {
      await navigator.clipboard.writeText(content);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'clipboard', error: 'Failed to copy to clipboard' };
    }
  },

  /**
   * Download export as a file
   */
  downloadFile(content: string, filename: string, mimeType: string): ExportResult {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true, method: 'download' };
    } catch (error) {
      return {
        success: false,
        method: 'download',
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  },

  /**
   * Export shopping list with the specified format and action
   */
  async exportList(
    list: ShoppingList,
    options: Partial<ExportOptions> = {},
    action: 'copy' | 'download' = 'download'
  ): Promise<ExportResult> {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const content = this.generateExport(list, mergedOptions);

    if (action === 'copy') {
      return this.copyToClipboard(content);
    }

    const filename = `${this.sanitizeFilename(list.name)}.${this.getFileExtension(mergedOptions.format)}`;
    const mimeType = this.getMimeType(mergedOptions.format);
    return this.downloadFile(content, filename, mimeType);
  },
};
