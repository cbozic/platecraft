import { createPortal } from 'react-dom';
import { X, Share } from 'lucide-react';
import styles from './IOSInstallBanner.module.css';

interface IOSInstallBannerProps {
  onDismiss: () => void;
  onNeverShow: () => void;
}

export function IOSInstallBanner({ onDismiss, onNeverShow }: IOSInstallBannerProps) {
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
        <div className={styles.text}>
          <p className={styles.title}>Install Platecraft to keep your recipes!</p>
          <p className={styles.instructions}>
            Tap <Share size={14} className={styles.shareIcon} /> then <strong>"Add to Home Screen"</strong>
          </p>
        </div>
      </div>

      <button className={styles.neverShowLink} onClick={onNeverShow}>
        Don't show again
      </button>
    </div>,
    document.body
  );
}
