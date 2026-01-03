import { createContext, useContext, type ReactNode } from 'react';
import { useIOSInstallPrompt } from '@/hooks/useIOSInstallPrompt';
import { IOSInstallBanner } from '@/components/pwa/IOSInstallBanner';

interface IOSInstallBannerContextType {
  triggerAfterImport: () => void;
}

const IOSInstallBannerContext = createContext<IOSInstallBannerContextType | null>(null);

export function useIOSInstallBanner() {
  const context = useContext(IOSInstallBannerContext);
  if (!context) {
    throw new Error('useIOSInstallBanner must be used within IOSInstallBannerProvider');
  }
  return context;
}

interface ProviderProps {
  children: ReactNode;
}

export function IOSInstallBannerProvider({ children }: ProviderProps) {
  const {
    isVisible,
    dismissBanner,
    dismissForever,
    triggerAfterImport,
  } = useIOSInstallPrompt();

  return (
    <IOSInstallBannerContext.Provider value={{ triggerAfterImport }}>
      {children}
      {isVisible && (
        <IOSInstallBanner
          onDismiss={dismissBanner}
          onNeverShow={dismissForever}
        />
      )}
    </IOSInstallBannerContext.Provider>
  );
}
