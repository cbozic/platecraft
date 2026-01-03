import { createContext, useContext, type ReactNode } from 'react';
import { useBackupReminder } from '@/hooks/useBackupReminder';
import { BackupReminderBanner } from '@/components/pwa/BackupReminderBanner';

interface BackupReminderContextType {
  showBanner: () => void;
}

const BackupReminderContext = createContext<BackupReminderContextType | null>(null);

export function useBackupReminderContext() {
  const context = useContext(BackupReminderContext);
  if (!context) {
    throw new Error('useBackupReminderContext must be used within BackupReminderProvider');
  }
  return context;
}

interface ProviderProps {
  children: ReactNode;
}

export function BackupReminderProvider({ children }: ProviderProps) {
  const {
    isVisible,
    showBanner,
    dismissBanner,
    dismissForever,
    goToSettings,
  } = useBackupReminder();

  return (
    <BackupReminderContext.Provider value={{ showBanner }}>
      {children}
      {isVisible && (
        <BackupReminderBanner
          onBackUp={goToSettings}
          onDismiss={dismissBanner}
          onNeverShow={dismissForever}
        />
      )}
    </BackupReminderContext.Provider>
  );
}
