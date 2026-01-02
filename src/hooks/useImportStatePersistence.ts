import { useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY_PREFIX = 'platecraft_import_';
const STATE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface StoredState<T> {
  data: T;
  timestamp: number;
}

/**
 * Hook for persisting import state to localStorage to survive iOS Safari page refreshes.
 *
 * iOS Safari aggressively reloads pages when switching between apps, which causes
 * users to lose their import progress when copying prompts to Claude and back.
 * This hook saves critical state to localStorage so users can resume where they left off.
 */
export function useImportStatePersistence<T extends object>(
  tabKey: 'text' | 'url' | 'photo',
  currentState: T,
  setState: (state: Partial<T>) => void,
  shouldPersist: (state: T) => boolean
) {
  const storageKey = `${STORAGE_KEY_PREFIX}${tabKey}`;
  const hasRestored = useRef(false);
  const isInitialized = useRef(false);

  // Restore state from localStorage on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;

      const parsed: StoredState<T> = JSON.parse(stored);

      // Check if state has expired
      if (Date.now() - parsed.timestamp > STATE_EXPIRY_MS) {
        localStorage.removeItem(storageKey);
        return;
      }

      // Restore the state
      setState(parsed.data);
    } catch (err) {
      console.warn('Failed to restore import state:', err);
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, setState]);

  // Mark as initialized after first render
  useEffect(() => {
    // Small delay to let restored state settle
    const timer = setTimeout(() => {
      isInitialized.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Save state to localStorage when it changes (debounced)
  useEffect(() => {
    // Don't save during initial restore
    if (!isInitialized.current) return;

    // Only persist if in a state worth saving
    if (!shouldPersist(currentState)) return;

    const timer = setTimeout(() => {
      try {
        const toStore: StoredState<T> = {
          data: currentState,
          timestamp: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(toStore));
      } catch (err) {
        console.warn('Failed to persist import state:', err);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [currentState, storageKey, shouldPersist]);

  // Clear persisted state
  const clearPersistedState = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Failed to clear persisted state:', err);
    }
  }, [storageKey]);

  // Check if we have persisted state (for showing resume UI)
  const hasPersistedState = useCallback((): boolean => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return false;

      const parsed: StoredState<T> = JSON.parse(stored);
      return Date.now() - parsed.timestamp <= STATE_EXPIRY_MS;
    } catch {
      return false;
    }
  }, [storageKey]);

  return {
    clearPersistedState,
    hasPersistedState,
  };
}

/**
 * Converts an image blob to a compressed base64 string for storage.
 * Returns null if the image is too large to store efficiently.
 */
export async function compressImageForStorage(blob: Blob, maxSize = 100000): Promise<string | null> {
  try {
    // Create an image element
    const img = new Image();
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    URL.revokeObjectURL(url);

    // Calculate dimensions for thumbnail (max 200px on longest side)
    const maxDim = 200;
    let width = img.width;
    let height = img.height;

    if (width > height && width > maxDim) {
      height = (height * maxDim) / width;
      width = maxDim;
    } else if (height > maxDim) {
      width = (width * maxDim) / height;
      height = maxDim;
    }

    // Draw to canvas and convert to base64
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, width, height);

    // Convert to JPEG with low quality
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

    // Check if it's small enough
    if (dataUrl.length > maxSize) {
      return null;
    }

    return dataUrl;
  } catch (err) {
    console.warn('Failed to compress image for storage:', err);
    return null;
  }
}

/**
 * Clears all import state from localStorage.
 * Useful for debugging or when user wants to reset everything.
 */
export function clearAllImportState(): void {
  const keys = ['text', 'url', 'photo'];
  keys.forEach(key => {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`);
    } catch (err) {
      console.warn('Failed to clear import state:', err);
    }
  });
}
