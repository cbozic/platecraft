import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Upload, Trash2, AlertTriangle, CheckCircle, XCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { Button, Card, CardHeader, CardBody, Modal, ModalFooter, Input } from '@/components/ui';
import { TagManager, CalendarSettings, StapleIngredientsManager } from '@/components/settings';
import { settingsRepository } from '@/db';
import { dataService, type ImportResult } from '@/services';
import type { UserSettings, Theme, UnitSystem, CalendarStartDay, PlatecraftExport, PhotoImportMode, EncryptedExport } from '@/types';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [dataStats, setDataStats] = useState<{
    recipes: number;
    customTags: number;
    mealPlans: number;
    shoppingLists: number;
  } | null>(null);

  // Import modal state
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<PlatecraftExport | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clear data modal state
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Data version for forcing child component refresh
  const [dataVersion, setDataVersion] = useState(0);

  // API key state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  // USDA API key state
  const [usdaKeyInput, setUsdaKeyInput] = useState('');
  const [showUsdaKey, setShowUsdaKey] = useState(false);
  const [usdaKeySaved, setUsdaKeySaved] = useState(false);

  // Export encryption state
  const [exportPasswordModalOpen, setExportPasswordModalOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportPasswordError, setExportPasswordError] = useState<string | null>(null);

  // Import decryption state
  const [importPasswordModalOpen, setImportPasswordModalOpen] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [importPasswordError, setImportPasswordError] = useState<string | null>(null);
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState<EncryptedExport | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [settingsData, stats] = await Promise.all([
        settingsRepository.get(),
        dataService.getDataStats(),
      ]);
      setSettings(settingsData);
      setDataStats(stats);
      // Initialize API key input with masked value if key exists
      if (settingsData.anthropicApiKey) {
        setApiKeyInput(settingsData.anthropicApiKey);
      }
      if (settingsData.usdaApiKey) {
        setUsdaKeyInput(settingsData.usdaApiKey);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleSaveApiKey = async () => {
    if (!settings) return;
    const trimmedKey = apiKeyInput.trim();
    await settingsRepository.setAnthropicApiKey(trimmedKey || undefined);
    setSettings({ ...settings, anthropicApiKey: trimmedKey || undefined });
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleClearApiKey = async () => {
    if (!settings) return;
    await settingsRepository.setAnthropicApiKey(undefined);
    setSettings({ ...settings, anthropicApiKey: undefined });
    setApiKeyInput('');
  };

  const handlePhotoImportModeChange = async (mode: PhotoImportMode) => {
    if (!settings) return;
    await settingsRepository.setDefaultPhotoImportMode(mode);
    setSettings({ ...settings, defaultPhotoImportMode: mode });
  };

  const handleSaveUsdaKey = async () => {
    if (!settings) return;
    const trimmedKey = usdaKeyInput.trim();
    await settingsRepository.setUsdaApiKey(trimmedKey || undefined);
    setSettings({ ...settings, usdaApiKey: trimmedKey || undefined });
    setUsdaKeySaved(true);
    setTimeout(() => setUsdaKeySaved(false), 2000);
  };

  const handleClearUsdaKey = async () => {
    if (!settings) return;
    await settingsRepository.setUsdaApiKey(undefined);
    setSettings({ ...settings, usdaApiKey: undefined });
    setUsdaKeyInput('');
  };

  const handleDailyCalorieGoalChange = async (value: number | undefined) => {
    if (!settings) return;
    await settingsRepository.setDailyCalorieGoal(value);
    setSettings({ ...settings, dailyCalorieGoal: value });
  };

  const handleExportClick = () => {
    // Show password modal for encrypted export
    setExportPassword('');
    setExportPasswordConfirm('');
    setExportPasswordError(null);
    setExportPasswordModalOpen(true);
  };

  const handleExportWithPassword = async () => {
    // Validate passwords match
    if (exportPassword !== exportPasswordConfirm) {
      setExportPasswordError('Passwords do not match');
      return;
    }

    if (exportPassword.length < 4) {
      setExportPasswordError('Password must be at least 4 characters');
      return;
    }

    setIsExporting(true);
    setExportPasswordError(null);

    try {
      await dataService.downloadEncryptedExport(exportPassword);
      setExportPasswordModalOpen(false);
      setExportPassword('');
      setExportPasswordConfirm('');
    } catch (error) {
      console.error('Export failed:', error);
      setExportPasswordError('Failed to export data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportClose = () => {
    setExportPasswordModalOpen(false);
    setExportPassword('');
    setExportPasswordConfirm('');
    setExportPasswordError(null);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setImportError(null);
    setImportResult(null);
    setImportData(null);
    setImportPassword('');
    setImportPasswordError(null);
    setPendingEncryptedImport(null);

    try {
      const data = await dataService.readImportFile(file);

      // Check if the file is encrypted
      if (dataService.isEncryptedExport(data)) {
        // Show password modal for encrypted import
        setPendingEncryptedImport(data);
        setImportPasswordModalOpen(true);
      } else {
        // Validate unencrypted data
        const validation = dataService.validateImportData(data);

        if (!validation.valid) {
          setImportError(`Invalid file format:\n${validation.errors.join('\n')}`);
          setImportModalOpen(true);
          return;
        }

        setImportData(data as PlatecraftExport);
        setImportModalOpen(true);
      }
    } catch (error) {
      setImportError(`Failed to read file: ${error}`);
      setImportModalOpen(true);
    }

    // Reset file input
    e.target.value = '';
  };

  const handleImportDecrypt = async () => {
    if (!pendingEncryptedImport) return;

    setImportPasswordError(null);

    try {
      const decryptedData = await dataService.decryptImportData(pendingEncryptedImport, importPassword);

      // Validate decrypted data
      const validation = dataService.validateImportData(decryptedData);

      if (!validation.valid) {
        setImportPasswordError(`Invalid file format:\n${validation.errors.join('\n')}`);
        return;
      }

      // Close password modal and open import modal
      setImportPasswordModalOpen(false);
      setPendingEncryptedImport(null);
      setImportPassword('');
      setImportData(decryptedData);
      setImportModalOpen(true);
    } catch (error) {
      setImportPasswordError('Incorrect password or corrupted file');
    }
  };

  const handleImportPasswordClose = () => {
    setImportPasswordModalOpen(false);
    setPendingEncryptedImport(null);
    setImportPassword('');
    setImportPasswordError(null);
  };

  const handleImportConfirm = async () => {
    if (!importData) return;

    setIsImporting(true);
    try {
      const result = await dataService.importData(importData, importMode);
      setImportResult(result);

      // Refresh data stats
      const stats = await dataService.getDataStats();
      setDataStats(stats);

      // Reload settings (especially important in replace mode where settings are imported)
      const updatedSettings = await settingsRepository.get();
      setSettings(updatedSettings);

      // Update API key inputs with imported values (if any)
      if (updatedSettings.anthropicApiKey) {
        setApiKeyInput(updatedSettings.anthropicApiKey);
      } else {
        setApiKeyInput('');
      }
      if (updatedSettings.usdaApiKey) {
        setUsdaKeyInput(updatedSettings.usdaApiKey);
      } else {
        setUsdaKeyInput('');
      }

      // Force child components to refresh by incrementing version
      setDataVersion(prev => prev + 1);
    } catch (error) {
      setImportResult({
        success: false,
        errors: [`Import failed: ${error}`],
        imported: { recipes: 0, tags: 0, mealPlans: 0, dayNotes: 0, recurringMeals: 0, shoppingLists: 0 },
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClose = () => {
    setImportModalOpen(false);
    setImportData(null);
    setImportResult(null);
    setImportError(null);
    setImportMode('merge');
  };

  const handleClearData = async () => {
    setIsClearing(true);
    try {
      await dataService.clearAllData(true);
      setClearModalOpen(false);

      // Refresh data stats
      const stats = await dataService.getDataStats();
      setDataStats(stats);

      // Reload settings
      await loadData();

      // Force child components to refresh by incrementing version
      setDataVersion(prev => prev + 1);
    } catch (error) {
      console.error('Failed to clear data:', error);
      alert('Failed to clear data. Please try again.');
    } finally {
      setIsClearing(false);
    }
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
            <h2 className={styles.sectionTitle}>Calendar Integration</h2>
          </CardHeader>
          <CardBody>
            <CalendarSettings key={`calendars-${dataVersion}`} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Tags</h2>
          </CardHeader>
          <CardBody>
            <TagManager key={`tags-${dataVersion}`} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Shopping List Staples</h2>
          </CardHeader>
          <CardBody>
            <StapleIngredientsManager key={`staples-${dataVersion}`} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Nutrition</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>USDA FoodData Central API Key</h3>
                <p className={styles.settingDescription}>
                  Optional. Enables nutrition lookup for ingredients. Get a free API key at{' '}
                  <a
                    href="https://fdc.nal.usda.gov/api-key-signup.html"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    fdc.nal.usda.gov
                  </a>
                </p>
              </div>
              <div className={styles.apiKeyControl}>
                <div className={styles.apiKeyInputRow}>
                  <input
                    type={showUsdaKey ? 'text' : 'password'}
                    value={usdaKeyInput}
                    onChange={(e) => setUsdaKeyInput(e.target.value)}
                    placeholder="Enter API key..."
                    className={styles.apiKeyInput}
                  />
                  <button
                    type="button"
                    onClick={() => setShowUsdaKey(!showUsdaKey)}
                    className={styles.apiKeyToggle}
                    aria-label={showUsdaKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showUsdaKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className={styles.apiKeyActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveUsdaKey}
                    disabled={!usdaKeyInput.trim()}
                  >
                    {usdaKeySaved ? 'Saved!' : 'Save Key'}
                  </Button>
                  {settings?.usdaApiKey && (
                    <Button variant="ghost" size="sm" onClick={handleClearUsdaKey}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Daily Calorie Goal</h3>
                <p className={styles.settingDescription}>
                  Set your daily calorie target for meal planning reference
                </p>
              </div>
              <div className={styles.settingControl}>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="50"
                  value={settings.dailyCalorieGoal || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    handleDailyCalorieGoalChange(value);
                  }}
                  placeholder="2000"
                  className={styles.numberInput}
                  style={{ width: '100px' }}
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Recipe Import</h2>
          </CardHeader>
          <CardBody>
            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Anthropic API Key</h3>
                <p className={styles.settingDescription}>
                  Optional. Enables automatic recipe parsing when importing. Your key is stored
                  locally and only sent to Anthropic.
                </p>
              </div>
              <div className={styles.apiKeyControl}>
                <div className={styles.apiKeyInputRow}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-ant-..."
                    className={styles.apiKeyInput}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className={styles.apiKeyToggle}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className={styles.apiKeyActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveApiKey}
                    disabled={!apiKeyInput.trim()}
                  >
                    {apiKeySaved ? 'Saved!' : 'Save Key'}
                  </Button>
                  {settings?.anthropicApiKey && (
                    <Button variant="ghost" size="sm" onClick={handleClearApiKey}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.setting}>
              <div className={styles.settingInfo}>
                <h3 className={styles.settingLabel}>Default Photo Import Mode</h3>
                <p className={styles.settingDescription}>
                  Choose how photos are processed by default. OCR extracts text first (best for
                  printed recipes), while Vision reads directly from the image (best for handwritten).
                </p>
              </div>
              <div className={styles.settingControl}>
                <select
                  value={settings.defaultPhotoImportMode || 'ocr'}
                  onChange={(e) =>
                    handlePhotoImportModeChange(e.target.value as PhotoImportMode)
                  }
                  className={styles.select}
                >
                  <option value="ocr">OCR First (Recommended)</option>
                  <option value="vision">Vision (Direct)</option>
                </select>
              </div>
            </div>

          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className={styles.sectionTitle}>Data Management</h2>
          </CardHeader>
          <CardBody>
            {dataStats && (
              <div className={styles.dataStats}>
                <p>
                  <strong>{dataStats.recipes}</strong> recipes,{' '}
                  <strong>{dataStats.customTags}</strong> custom tags,{' '}
                  <strong>{dataStats.mealPlans}</strong> planned meals,{' '}
                  <strong>{dataStats.shoppingLists}</strong> shopping lists
                </p>
              </div>
            )}
            <div className={styles.dataActions}>
              <Button
                leftIcon={<Download size={18} />}
                onClick={handleExportClick}
              >
                Export All Data
              </Button>
              <Button
                variant="outline"
                leftIcon={<Upload size={18} />}
                onClick={handleImportClick}
              >
                Import Data
              </Button>
              <Button
                variant="danger"
                leftIcon={<Trash2 size={18} />}
                onClick={() => setClearModalOpen(true)}
              >
                Clear All Data
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </CardBody>
        </Card>
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={handleImportClose}
        title="Import Data"
        size="md"
      >
        <div className={styles.importModal}>
          {importError && (
            <div className={styles.importError}>
              <XCircle size={20} />
              <pre>{importError}</pre>
            </div>
          )}

          {importData && !importResult && (
            <>
              <div className={styles.importPreview}>
                <h4>File contains:</h4>
                <ul>
                  <li>{importData.recipes?.length || 0} recipes</li>
                  <li>{importData.customTags?.length || 0} custom tags</li>
                  <li>{importData.mealPlans?.length || 0} meal plans</li>
                  <li>{importData.shoppingLists?.length || 0} shopping lists</li>
                </ul>
                <p className={styles.exportDate}>
                  Exported: {new Date(importData.exportDate).toLocaleString()}
                </p>
              </div>

              <div className={styles.importMode}>
                <h4>Import mode:</h4>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                  />
                  <span>
                    <strong>Merge</strong> - Add to existing data (skip duplicates)
                  </span>
                </label>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>
                    <strong>Replace</strong> - Clear existing data first
                  </span>
                </label>
              </div>

              <ModalFooter>
                <Button variant="outline" onClick={handleImportClose}>
                  Cancel
                </Button>
                <Button onClick={handleImportConfirm} disabled={isImporting}>
                  {isImporting ? 'Importing...' : 'Import'}
                </Button>
              </ModalFooter>
            </>
          )}

          {importResult && (
            <>
              <div className={importResult.success ? styles.importSuccess : styles.importWarning}>
                {importResult.success ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                <span>{importResult.success ? 'Import completed!' : 'Import completed with errors'}</span>
              </div>

              <div className={styles.importSummary}>
                <h4>Imported:</h4>
                <ul>
                  <li>{importResult.imported.recipes} recipes</li>
                  <li>{importResult.imported.tags} tags</li>
                  <li>{importResult.imported.mealPlans} meal plans</li>
                  <li>{importResult.imported.shoppingLists} shopping lists</li>
                </ul>
              </div>

              {importResult.errors.length > 0 && (
                <div className={styles.importErrors}>
                  <h4>Errors:</h4>
                  <ul>
                    {importResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>...and {importResult.errors.length - 10} more</li>
                    )}
                  </ul>
                </div>
              )}

              <ModalFooter>
                <Button onClick={handleImportClose}>Done</Button>
              </ModalFooter>
            </>
          )}

          {!importData && !importError && (
            <ModalFooter>
              <Button variant="outline" onClick={handleImportClose}>
                Cancel
              </Button>
            </ModalFooter>
          )}
        </div>
      </Modal>

      {/* Clear Data Confirmation Modal */}
      <Modal
        isOpen={clearModalOpen}
        onClose={() => setClearModalOpen(false)}
        title="Clear All Data"
        size="sm"
      >
        <div className={styles.clearModal}>
          <div className={styles.clearWarning}>
            <AlertTriangle size={32} />
            <p>
              This will permanently delete all your recipes, meal plans, shopping lists, and
              custom tags. This action cannot be undone.
            </p>
          </div>

          <p className={styles.clearSuggestion}>
            Consider exporting your data first as a backup.
          </p>

          <ModalFooter>
            <Button variant="outline" onClick={() => setClearModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearData} disabled={isClearing}>
              {isClearing ? 'Clearing...' : 'Clear All Data'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Export Password Modal */}
      <Modal
        isOpen={exportPasswordModalOpen}
        onClose={handleExportClose}
        title="Encrypt Backup"
        size="sm"
      >
        <div className={styles.passwordModal}>
          <div className={styles.passwordInfo}>
            <Lock size={24} />
            <p>
              Your backup will be encrypted with a password. You'll need this password to import
              the backup later.
            </p>
          </div>

          {exportPasswordError && (
            <div className={styles.passwordError}>
              <XCircle size={16} />
              <span>{exportPasswordError}</span>
            </div>
          )}

          <div className={styles.passwordField}>
            <label htmlFor="export-password">Password</label>
            <div className={styles.passwordInputWrapper}>
              <Input
                id="export-password"
                type={showExportPassword ? 'text' : 'password'}
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Enter password"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowExportPassword(!showExportPassword)}
              >
                {showExportPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className={styles.passwordField}>
            <label htmlFor="export-password-confirm">Confirm Password</label>
            <div className={styles.passwordInputWrapper}>
              <Input
                id="export-password-confirm"
                type={showExportPassword ? 'text' : 'password'}
                value={exportPasswordConfirm}
                onChange={(e) => setExportPasswordConfirm(e.target.value)}
                placeholder="Confirm password"
              />
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={handleExportClose}>
              Cancel
            </Button>
            <Button
              onClick={handleExportWithPassword}
              disabled={isExporting || !exportPassword || !exportPasswordConfirm}
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>

      {/* Import Password Modal */}
      <Modal
        isOpen={importPasswordModalOpen}
        onClose={handleImportPasswordClose}
        title="Decrypt Backup"
        size="sm"
      >
        <div className={styles.passwordModal}>
          <div className={styles.passwordInfo}>
            <Lock size={24} />
            <p>This backup is encrypted. Enter the password to decrypt it.</p>
          </div>

          {importPasswordError && (
            <div className={styles.passwordError}>
              <XCircle size={16} />
              <span>{importPasswordError}</span>
            </div>
          )}

          <div className={styles.passwordField}>
            <label htmlFor="import-password">Password</label>
            <div className={styles.passwordInputWrapper}>
              <Input
                id="import-password"
                type={showImportPassword ? 'text' : 'password'}
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                placeholder="Enter password"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowImportPassword(!showImportPassword)}
              >
                {showImportPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={handleImportPasswordClose}>
              Cancel
            </Button>
            <Button onClick={handleImportDecrypt} disabled={!importPassword}>
              Decrypt
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}
