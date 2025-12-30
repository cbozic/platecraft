import { useState, useEffect } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, CardBody } from '@/components/ui';
import { TagManager } from '@/components/settings';
import { settingsRepository } from '@/db';
import type { UserSettings, Theme, UnitSystem, CalendarStartDay } from '@/types';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await settingsRepository.get();
        setSettings(data);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleThemeChange = async (theme: Theme) => {
    if (!settings) return;
    await settingsRepository.setTheme(theme);
    setSettings({ ...settings, theme });
    document.documentElement.setAttribute('data-theme', theme === 'system' ? '' : theme);
  };

  const handleUnitSystemChange = async (system: UnitSystem) => {
    if (!settings) return;
    await settingsRepository.setDefaultUnitSystem(system);
    setSettings({ ...settings, defaultUnitSystem: system });
  };

  const handleCalendarStartChange = async (day: CalendarStartDay) => {
    if (!settings) return;
    await settingsRepository.setCalendarStartDay(day);
    setSettings({ ...settings, calendarStartDay: day });
  };

  if (isLoading || !settings) {
    return (
      <div className={styles.loading}>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.sections}>
        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Display</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Theme</h3>
                <p className={styles.settingDescription}>
                  Choose your preferred color scheme
                </p>
              </div>
              <div className={styles.settingControl}>
                <select
                  value={settings.theme}
                  onChange={(e) => handleThemeChange(e.target.value as Theme)}
                  className={styles.select}
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Measurements</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Default Unit System</h3>
                <p className={styles.settingDescription}>
                  Used for new recipes and conversions
                </p>
              </div>
              <div className={styles.settingControl}>
                <select
                  value={settings.defaultUnitSystem}
                  onChange={(e) => handleUnitSystemChange(e.target.value as UnitSystem)}
                  className={styles.select}
                >
                  <option value="us">US Customary</option>
                  <option value="metric">Metric</option>
                  <option value="uk">UK Imperial</option>
                </select>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Default Servings</h3>
                <p className={styles.settingDescription}>
                  Default serving size for new recipes
                </p>
              </div>
              <div className={styles.settingControl}>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.defaultServings}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (value > 0) {
                      settingsRepository.setDefaultServings(value);
                      setSettings({ ...settings, defaultServings: value });
                    }
                  }}
                  className={styles.numberInput}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Calendar</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Week Starts On</h3>
                <p className={styles.settingDescription}>
                  First day of the week in calendar views
                </p>
              </div>
              <div className={styles.settingControl}>
                <select
                  value={settings.calendarStartDay}
                  onChange={(e) =>
                    handleCalendarStartChange(parseInt(e.target.value, 10) as CalendarStartDay)
                  }
                  className={styles.select}
                >
                  <option value={0}>Sunday</option>
                  <option value={1}>Monday</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Tags</h2>
          </CardHeader>
          <CardBody>
            <TagManager />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Data Management</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.dataActions}>
              <Button variant="outline" leftIcon={<Download size={18} />}>
                Export All Data
              </Button>
              <Button variant="outline" leftIcon={<Upload size={18} />}>
                Import Data
              </Button>
              <Button variant="danger" leftIcon={<Trash2 size={18} />}>
                Clear All Data
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
