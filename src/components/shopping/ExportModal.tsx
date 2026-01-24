import { useState } from 'react';
import { Download, Copy, FileText, FileJson, FileSpreadsheet, Check, List } from 'lucide-react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import {
  shoppingListExportService,
  type ExportFormat,
  type ExportOptions,
} from '@/services/shoppingListExportService';
import type { ShoppingList } from '@/types';
import styles from './ExportModal.module.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  list: ShoppingList;
}

interface FormatOption {
  id: ExportFormat;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'text',
    label: 'Plain Text',
    description: 'Simple bulleted list, easy to copy anywhere',
    icon: <List size={20} />,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'Rich format with checkboxes, great for AI assistants',
    icon: <FileText size={20} />,
  },
  {
    id: 'json',
    label: 'JSON',
    description: 'Structured data for apps and integrations',
    icon: <FileJson size={20} />,
  },
  {
    id: 'csv',
    label: 'CSV',
    description: 'Spreadsheet format for Excel/Google Sheets',
    icon: <FileSpreadsheet size={20} />,
  },
];

export function ExportModal({ isOpen, onClose, list }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('text');
  const [includeRecipeSources, setIncludeRecipeSources] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeCheckedItems, setIncludeCheckedItems] = useState(false);
  const [groupBySection, setGroupBySection] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const options: Partial<ExportOptions> = {
    format,
    includeRecipeSources,
    includeNotes,
    includeCheckedItems,
    groupBySection,
  };

  const handleCopy = async () => {
    const result = await shoppingListExportService.exportList(list, options, 'copy');
    if (result.success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleDownload = async () => {
    await shoppingListExportService.exportList(list, options, 'download');
    onClose();
  };

  const handleClose = () => {
    setCopySuccess(false);
    onClose();
  };

  // Calculate item counts for display
  const uncheckedCount = list.items.filter((i) => !i.isChecked).length;
  const checkedCount = list.items.filter((i) => i.isChecked).length;
  const exportCount = includeCheckedItems ? list.items.length : uncheckedCount;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Export Shopping List" size="md">
      <div className={styles.content}>
        {/* Format Selection */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Export Format</label>
          <div className={styles.formatOptions}>
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`${styles.formatOption} ${format === opt.id ? styles.formatOptionSelected : ''}`}
                onClick={() => setFormat(opt.id)}
              >
                <span className={styles.formatIcon}>{opt.icon}</span>
                <span className={styles.formatLabel}>{opt.label}</span>
                <span className={styles.formatDescription}>{opt.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Export Options */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Options</label>
          <div className={styles.options}>
            {(format === 'markdown' || format === 'json' || format === 'csv') && (
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={includeRecipeSources}
                  onChange={(e) => setIncludeRecipeSources(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>Include recipe sources</span>
              </label>
            )}

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeNotes}
                onChange={(e) => setIncludeNotes(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Include notes</span>
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeCheckedItems}
                onChange={(e) => setIncludeCheckedItems(e.target.checked)}
                className={styles.checkbox}
              />
              <span>Include checked items ({checkedCount})</span>
            </label>

            {format !== 'csv' && (
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={groupBySection}
                  onChange={(e) => setGroupBySection(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>Group by store section</span>
              </label>
            )}
          </div>
        </div>

        {/* Export Summary */}
        <div className={styles.summary}>
          <span className={styles.summaryText}>
            Exporting {exportCount} item{exportCount !== 1 ? 's' : ''} as {format.toUpperCase()}
          </span>
        </div>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="outline"
          leftIcon={copySuccess ? <Check size={16} /> : <Copy size={16} />}
          onClick={handleCopy}
        >
          {copySuccess ? 'Copied!' : 'Copy'}
        </Button>
        <Button leftIcon={<Download size={16} />} onClick={handleDownload}>
          Download
        </Button>
      </ModalFooter>
    </Modal>
  );
}
