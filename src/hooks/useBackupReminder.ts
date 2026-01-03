import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsRepository, db } from '@/db';

const STORAGE_KEYS = {
  DISMISSED_UNTIL: 'platecraft_backup_dismissed_until',
  NEVER_SHOW: 'platecraft_backup_never_show',
} as const;

const REMINDER_THRESHOLD_DAYS = 90; // 3 months
const DISMISS_DURATION_DAYS = 7; // How long "Dismiss" hides the banner

interface UseBackupReminderReturn {
  isVisible: boolean;
  showBanner: () => void;
  dismissBanner: () => void;
  dismissForever: () => void;
  goToSettings: () => void;
}

export function useBackupReminder(): UseBackupReminderReturn {
  const [isVisible, setIsVisible] = useState(false);
  const navigate = useNavigate();

  // Check if backup reminder should be shown
  useEffect(() => {
    async function checkBackupStatus() {
      // Check if user has permanently dismissed
      const neverShow = localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) === 'true';
      if (neverShow) return;

      // Check if temporarily dismissed
      const dismissedUntil = localStorage.getItem(STORAGE_KEYS.DISMISSED_UNTIL);
      if (dismissedUntil) {
        const dismissDate = new Date(dismissedUntil);
        if (dismissDate > new Date()) {
          return; // Still within dismiss period
        }
        // Dismiss period expired, clear it
        localStorage.removeItem(STORAGE_KEYS.DISMISSED_UNTIL);
      }

      // Get last backup date from settings
      const lastBackupDate = await settingsRepository.getLastBackupDate();

      if (!lastBackupDate) {
        // Never backed up - check if user has any data worth backing up
        const stats = await getDataStats();
        if (stats.recipes > 0 || stats.mealPlans > 0) {
          setIsVisible(true);
        }
        return;
      }

      // Check if it's been more than 90 days since last backup
      const daysSinceBackup = getDaysSince(lastBackupDate);
      if (daysSinceBackup >= REMINDER_THRESHOLD_DAYS) {
        setIsVisible(true);
      }
    }

    checkBackupStatus();
  }, []);

  const showBanner = useCallback(() => {
    if (localStorage.getItem(STORAGE_KEYS.NEVER_SHOW) !== 'true') {
      setIsVisible(true);
    }
  }, []);

  const dismissBanner = useCallback(() => {
    // Hide for 7 days
    const dismissUntil = new Date();
    dismissUntil.setDate(dismissUntil.getDate() + DISMISS_DURATION_DAYS);
    localStorage.setItem(STORAGE_KEYS.DISMISSED_UNTIL, dismissUntil.toISOString());
    setIsVisible(false);
  }, []);

  const dismissForever = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.NEVER_SHOW, 'true');
    setIsVisible(false);
  }, []);

  const goToSettings = useCallback(() => {
    setIsVisible(false);
    navigate('/settings', { state: { scrollTo: 'data-management' } });
  }, [navigate]);

  return {
    isVisible,
    showBanner,
    dismissBanner,
    dismissForever,
    goToSettings,
  };
}

function getDaysSince(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function getDataStats(): Promise<{ recipes: number; mealPlans: number }> {
  const [recipes, mealPlans] = await Promise.all([
    db.recipes.count(),
    db.plannedMeals.count(),
  ]);
  return { recipes, mealPlans };
}
