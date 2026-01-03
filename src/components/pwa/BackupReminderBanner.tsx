import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import styles from './BackupReminderBanner.module.css';

interface BackupReminderBannerProps {
  onBackUp: () => void;
  onDismiss: () => void;
  onNeverShow: () => void;
}

export function BackupReminderBanner({ onBackUp, onDismiss, onNeverShow }: BackupReminderBannerProps) {
  return createPortal(
    <div className={styles.banner} role="alert">
      <button
        className={styles.dismissButton}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={18} />
      </button>

      <div className={styles.content}>
        <div className={styles.icon}>
          <Download size={24} />
        </div>
        <div className={styles.text}>
          <p className={styles.title}>Time for a backup!</p>
          <p className={styles.description}>
            It's been a while since you last backed up your recipes and data.
          </p>
        </div>
      </div>

      <div className={styles.actions}>
        <button className={styles.backupButton} onClick={onBackUp}>
          Back Up Now
        </button>
      </div>

      <button className={styles.neverShowLink} onClick={onNeverShow}>
        Don't remind me
      </button>
    </div>,
    document.body
  );
}
