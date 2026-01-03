import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEYS = {
  FIRST_VISIT_SHOWN: 'platecraft_ios_install_first_visit_shown',
  NEVER_SHOW: 'platecraft_ios_install_never_show',
} as const;

interface IOSDetection {
  isIOS: boolean;
  isIOSSafari: boolean;
  isStandalone: boolean;
}

function getIOSDetection(): IOSDetection {
  if (typeof window === 'undefined') {
    return { isIOS: false, isIOSSafari: false, isStandalone: false };
  }

  const ua = window.navigator.userAgent;

  // iOS detection (includes iPad with iPadOS 13+)
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Safari only (not Chrome/Firefox/Edge on iOS)
  const isIOSSafari =
    isIOS &&
    /Safari/.test(ua) &&
    !/CriOS/.test(ua) && // Chrome iOS
    !/FxiOS/.test(ua) && // Firefox iOS
    !/EdgiOS/.test(ua); // Edge iOS

  // Already installed as standalone app
  const isStandalone =
    ('standalone' in window.navigator &&
      (window.navigator as Navigator & { standalone: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches;

  return { isIOS, isIOSSafari, isStandalone };
}

interface UseIOSInstallPromptReturn {
  isVisible: boolean;
  showBanner: () => void;
  dismissBanner: () => void;
  dismissForever: () => void;
  triggerAfterImport: () => void;
}

export function useIOSInstallPrompt(): UseIOSInstallPromptReturn {
  const [isVisible, setIsVisible] = useState(false);

  const detection = useMemo(() => getIOSDetection(), []);
  const isEligible = detection.isIOSSafari && !detection.isStandalone;

  // Check for first visit
  useEffect(() => {
    if (!isEligible) return;

    const neverShow = localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) === 'true';
    if (neverShow) return;

    const hasShownFirstVisit = localStorage.getItem(STORAGE_KEYS.FIRST_VISIT_SHOWN) === 'true';
    if (!hasShownFirstVisit) {
      setIsVisible(true);
      localStorage.setItem(STORAGE_KEYS.FIRST_VISIT_SHOWN, 'true');
    }
  }, [isEligible]);

  // Listen for display mode changes (user installs while app is open)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsVisible(false);
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const showBanner = useCallback(() => {
    if (isEligible && localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) !== 'true') {
      setIsVisible(true);
    }
  }, [isEligible]);

  const dismissBanner = useCallback(() => {
    setIsVisible(false);
  }, []);

  const dismissForever = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.NEVER_SHOW, 'true');
    setIsVisible(false);
  }, []);

  const triggerAfterImport = useCallback(() => {
    if (isEligible && localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) !== 'true') {
      setIsVisible(true);
    }
  }, [isEligible]);

  return {
    isVisible,
    showBanner,
    dismissBanner,
    dismissForever,
    triggerAfterImport,
  };
}
