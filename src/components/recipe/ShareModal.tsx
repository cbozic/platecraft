import { useState } from 'react';
import { Share2, Copy, Download, Check, AlertCircle } from 'lucide-react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import { recipeShareService } from '@/services';
import type { Recipe } from '@/types';
import type { Tag } from '@/types/tags';
import type { ShareOptions } from '@/services';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipe: Recipe;
  tags: Tag[];
}

type ShareFormat = 'text' | 'pdf';
type ShareStatus = 'idle' | 'loading' | 'success' | 'error';

export function ShareModal({ isOpen, onClose, recipe, tags }: ShareModalProps) {
  const [format, setFormat] = useState<ShareFormat>('text');
  const [includeImages, setIncludeImages] = useState(true);
  const [status, setStatus] = useState<ShareStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const canUseWebShare = recipeShareService.canUseWebShare();

  const handleShare = async () => {
    setStatus('loading');
    setStatusMessage('');

    const options: ShareOptions = {
      format,
      includeImages: format === 'pdf' && includeImages,
      includeNutrition: true,
    };

    try {
      const result = await recipeShareService.shareRecipe(recipe, tags, options);

      if (result.success) {
        setStatus('success');
        if (result.method === 'clipboard') {
          setStatusMessage('Copied to clipboard!');
        } else if (result.method === 'download') {
          setStatusMessage('PDF downloaded!');
        } else {
          setStatusMessage('Shared successfully!');
        }
        // Auto-close after success
        setTimeout(() => {
          onClose();
          setStatus('idle');
          setStatusMessage('');
        }, 1500);
      } else {
        if (result.error === 'Share cancelled') {
          setStatus('idle');
        } else {
          setStatus('error');
          setStatusMessage(result.error || 'Failed to share');
        }
      }
    } catch (error) {
      console.error('Share error:', error);
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  };

  const handleCopy = async () => {
    setStatus('loading');
    const text = recipeShareService.generateTextContent(recipe, tags);
    const result = await recipeShareService.copyToClipboard(text);

    if (result.success) {
      setStatus('success');
      setStatusMessage('Copied to clipboard!');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setStatusMessage('');
      }, 1500);
    } else {
      setStatus('error');
      setStatusMessage('Failed to copy');
    }
  };

  const handleDownload = async () => {
    setStatus('loading');
    setStatusMessage('Generating PDF...');

    try {
      const pdf = await recipeShareService.generatePdf(recipe, tags, includeImages);
      const fileName = recipeShareService.sanitizeFilename(recipe.title) + '.pdf';
      recipeShareService.downloadFile(pdf, fileName);

      setStatus('success');
      setStatusMessage('PDF downloaded!');
      setTimeout(() => {
        onClose();
        setStatus('idle');
        setStatusMessage('');
      }, 1500);
    } catch {
      setStatus('error');
      setStatusMessage('Failed to generate PDF');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <Check size={16} className={styles.successIcon} />;
      case 'error':
        return <AlertCircle size={16} className={styles.errorIcon} />;
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Recipe" size="sm">
      <div className={styles.content}>
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Format</label>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="format"
                value="text"
                checked={format === 'text'}
                onChange={() => setFormat('text')}
                className={styles.radioInput}
              />
              <span className={styles.radioText}>
                <span className={styles.radioTitle}>Formatted Text</span>
                <span className={styles.radioDescription}>
                  Plain text that works in any app
                </span>
              </span>
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="format"
                value="pdf"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
                className={styles.radioInput}
              />
              <span className={styles.radioText}>
                <span className={styles.radioTitle}>PDF Document</span>
                <span className={styles.radioDescription}>
                  Printable recipe with formatting
                </span>
              </span>
            </label>
          </div>
        </div>

        {format === 'pdf' && recipe.images.length > 0 && (
          <div className={styles.section}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(e) => setIncludeImages(e.target.checked)}
                className={styles.checkboxInput}
              />
              <span className={styles.checkboxText}>Include recipe image</span>
            </label>
          </div>
        )}

        {statusMessage && (
          <div className={`${styles.status} ${styles[status]}`}>
            {getStatusIcon()}
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      <ModalFooter>
        {canUseWebShare ? (
          <Button
            onClick={handleShare}
            isLoading={status === 'loading'}
            leftIcon={<Share2 size={18} />}
          >
            Share
          </Button>
        ) : (
          <>
            {format === 'text' ? (
              <Button
                onClick={handleCopy}
                isLoading={status === 'loading'}
                leftIcon={<Copy size={18} />}
              >
                Copy to Clipboard
              </Button>
            ) : (
              <Button
                onClick={handleDownload}
                isLoading={status === 'loading'}
                leftIcon={<Download size={18} />}
              >
                Download PDF
              </Button>
            )}
          </>
        )}
        <Button variant="ghost" onClick={onClose} disabled={status === 'loading'}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
