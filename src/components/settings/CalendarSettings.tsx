import { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, Plus, Trash2, Eye, EyeOff, Download, AlertCircle, AlertTriangle, RefreshCw, Link, Upload } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button, Input, Modal, ModalFooter } from '@/components/ui';
import { icalService, cryptoService } from '@/services';
import { db } from '@/db';
import type { ExternalCalendar, ExternalEvent } from '@/types';
import styles from './CalendarSettings.module.css';

// Default colors for calendars
const CALENDAR_COLORS = [
  '#4285f4', // Blue
  '#ea4335', // Red
  '#34a853', // Green
  '#fbbc04', // Yellow
  '#9334e6', // Purple
  '#ff6d01', // Orange
  '#46bdc6', // Teal
  '#e91e63', // Pink
];

interface AddCalendarFormData {
  name: string;
  url: string;
  color: string;
}

export function CalendarSettings() {
  const [calendars, setCalendars] = useState<ExternalCalendar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<AddCalendarFormData>({
    name: '',
    url: '',
    color: CALENDAR_COLORS[0],
  });

  // File import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importEvents, setImportEvents] = useState<ExternalEvent[]>([]);
  const [importMode, setImportMode] = useState<'new' | 'update'>('new');
  const [selectedCalendarForUpdate, setSelectedCalendarForUpdate] = useState<string>('');
  const [importCalendarName, setImportCalendarName] = useState('');
  const [importColor, setImportColor] = useState(CALENDAR_COLORS[0]);
  const [isImporting, setIsImporting] = useState(false);
  const icsFileInputRef = useRef<HTMLInputElement>(null);

  const loadCalendars = useCallback(async () => {
    try {
      const icalCalendars = await db.externalCalendars
        .where('provider')
        .equals('ical')
        .toArray();

      // Decrypt icalUrl for each calendar if encrypted
      const decryptedCalendars = await Promise.all(
        icalCalendars.map(async (calendar) => {
          if (calendar.icalUrl) {
            try {
              const parsed = JSON.parse(calendar.icalUrl);
              if (cryptoService.isEncryptedField(parsed)) {
                const decryptedUrl = await cryptoService.decryptField(parsed);
                return { ...calendar, icalUrl: decryptedUrl };
              }
            } catch {
              // Not JSON/encrypted, use as-is (legacy plaintext)
            }
          }
          return calendar;
        })
      );

      setCalendars(decryptedCalendars);
    } catch (err) {
      console.error('Failed to load calendars:', err);
      setError('Failed to load calendars');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalendars();
  }, [loadCalendars]);

  // Split calendars by type
  const urlCalendars = calendars.filter((c) => c.sourceType === 'url' || (!c.sourceType && c.icalUrl));
  const fileCalendars = calendars.filter((c) => c.sourceType === 'file');

  const handleAddCalendar = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      setError('Please enter both a name and URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(formData.url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setIsAdding(true);
    setError(null);
    setWarning(null);

    // Check for common wrong URL formats
    const url = formData.url.trim();
    if (url.includes('calendar.google.com/calendar/u/') && url.includes('?cid=')) {
      setError(
        'This looks like a shareable link, not an iCal URL. ' +
        'In Google Calendar settings, look for "Secret address in iCal format" under "Integrate calendar".'
      );
      setIsAdding(false);
      return;
    }

    const calendarId = uuidv4();
    let fetchSucceeded = false;
    let fetchError: string | null = null;
    let fetchedEvents: import('@/types').ExternalEvent[] = [];

    // Try to fetch and validate the iCal URL, but don't block on failure
    try {
      fetchedEvents = await icalService.fetchIcalUrl(url, calendarId);
      fetchSucceeded = true;
    } catch (err) {
      console.warn('Initial calendar fetch failed (will retry in background):', err);
      fetchError = err instanceof Error ? err.message : 'Unknown error';
    }

    // Save the calendar regardless of fetch success
    try {
      // Encrypt the URL before storing in DB
      const encryptedUrl = await cryptoService.encryptField(url);

      const calendarForDb: ExternalCalendar = {
        id: calendarId,
        name: formData.name.trim(),
        provider: 'ical',
        color: formData.color,
        isVisible: true,
        sourceType: 'url',
        icalUrl: JSON.stringify(encryptedUrl),
        // If fetch succeeded, set lastSynced; otherwise leave undefined to trigger background sync
        lastSynced: fetchSucceeded ? new Date() : undefined,
      };

      await db.externalCalendars.add(calendarForDb);

      // Save fetched events if we got any (using bulkPut to handle any duplicates)
      if (fetchedEvents.length > 0) {
        await db.externalEvents.bulkPut(fetchedEvents);
      }

      // Keep plaintext URL in state for UI use
      const calendarForState: ExternalCalendar = {
        ...calendarForDb,
        icalUrl: url,
      };
      setCalendars((prev) => [...prev, calendarForState]);

      // Reset form
      setFormData({
        name: '',
        url: '',
        color: CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length],
      });
      setShowAddForm(false);

      // Show warning if initial fetch failed but calendar was saved
      if (!fetchSucceeded) {
        setWarning(
          `Calendar "${formData.name.trim()}" was added but initial sync failed (${fetchError}). ` +
          'It will sync automatically when you view the calendar.'
        );
      }
    } catch (err) {
      console.error('Failed to save calendar:', err);
      setError('Failed to save calendar. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveCalendar = async (calendarId: string) => {
    if (!window.confirm('Remove this calendar? Events from this calendar will no longer appear.')) {
      return;
    }

    try {
      // Remove calendar and its events
      await db.externalCalendars.delete(calendarId);
      await db.externalEvents.where('calendarId').equals(calendarId).delete();
      setCalendars((prev) => prev.filter((c) => c.id !== calendarId));
    } catch (err) {
      console.error('Failed to remove calendar:', err);
      setError('Failed to remove calendar');
    }
  };

  const handleToggleVisibility = async (calendar: ExternalCalendar) => {
    try {
      const updatedCalendar = { ...calendar, isVisible: !calendar.isVisible };
      await db.externalCalendars.put(updatedCalendar);
      setCalendars((prev) =>
        prev.map((c) => (c.id === calendar.id ? updatedCalendar : c))
      );
    } catch (err) {
      console.error('Failed to toggle visibility:', err);
    }
  };

  const handleSyncCalendar = async (calendar: ExternalCalendar) => {
    if (!calendar.icalUrl) return;

    setIsSyncing(calendar.id);
    setError(null);

    try {
      const events = await icalService.fetchIcalUrl(calendar.icalUrl, calendar.id);

      // Replace old events with new ones (using bulkPut to handle duplicates gracefully)
      await db.externalEvents.where('calendarId').equals(calendar.id).delete();
      if (events.length > 0) {
        await db.externalEvents.bulkPut(events);
      }

      // Update last synced time
      const updatedCalendar = { ...calendar, lastSynced: new Date() };
      await db.externalCalendars.put(updatedCalendar);
      setCalendars((prev) =>
        prev.map((c) => (c.id === calendar.id ? updatedCalendar : c))
      );

      // Clear any pending sync warning since sync succeeded
      setWarning(null);
    } catch (err) {
      console.error('Failed to sync calendar:', err);
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to sync "${calendar.name}": ${errorMsg}. Try again in a moment.`);
    } finally {
      setIsSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    for (const calendar of urlCalendars) {
      if (calendar.icalUrl) {
        await handleSyncCalendar(calendar);
      }
    }
  };

  // File import handlers
  const handleIcsFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.ics')) {
      setError('Please select a valid .ics file');
      e.target.value = '';
      return;
    }

    setError(null);

    try {
      // Preview: parse file without saving
      const tempId = 'preview';
      const events = await icalService.readIcsFile(file, tempId);

      setImportFile(file);
      setImportEvents(events);
      setImportCalendarName(file.name.replace(/\.ics$/i, ''));
      setImportColor(CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length]);
      setImportMode('new');
      setSelectedCalendarForUpdate('');
      setShowImportModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read .ics file');
    }

    // Reset input
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    if (!importFile) return;

    setIsImporting(true);
    setError(null);

    try {
      let calendarId: string;

      if (importMode === 'new') {
        // Create new calendar
        calendarId = uuidv4();
        const newCalendar: ExternalCalendar = {
          id: calendarId,
          name: importCalendarName.trim() || importFile.name.replace(/\.ics$/i, ''),
          provider: 'ical',
          color: importColor,
          isVisible: true,
          sourceType: 'file',
          originalFileName: importFile.name,
          lastImported: new Date(),
        };
        await db.externalCalendars.add(newCalendar);
      } else {
        // Update existing calendar
        calendarId = selectedCalendarForUpdate;
      }

      // Parse events with correct calendar ID
      const events = await icalService.readIcsFile(importFile, calendarId);

      if (importMode === 'update') {
        // Smart merge with deduplication
        const existingEvents = await db.externalEvents
          .where('calendarId')
          .equals(calendarId)
          .toArray();

        const { toCreate, toUpdate, toDelete } = icalService.mergeImportedEvents(
          events,
          existingEvents,
          { removeOrphans: true }
        );

        // Apply changes
        if (toDelete.length > 0) {
          await db.externalEvents.bulkDelete(toDelete);
        }
        if (toUpdate.length > 0) {
          await db.externalEvents.bulkPut(toUpdate);
        }
        if (toCreate.length > 0) {
          await db.externalEvents.bulkAdd(toCreate);
        }

        // Update calendar metadata
        const calendar = calendars.find((c) => c.id === calendarId);
        if (calendar) {
          await db.externalCalendars.update(calendarId, {
            lastImported: new Date(),
            originalFileName: importFile.name,
          });
        }
      } else {
        // New calendar - just add all events
        if (events.length > 0) {
          await db.externalEvents.bulkAdd(events);
        }
      }

      // Refresh calendar list
      await loadCalendars();

      // Close modal and reset
      setShowImportModal(false);
      setImportFile(null);
      setImportEvents([]);
      setImportMode('new');
      setSelectedCalendarForUpdate('');
      setImportCalendarName('');
    } catch (err) {
      console.error('Failed to import calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to import calendar');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReimport = (calendar: ExternalCalendar) => {
    setImportMode('update');
    setSelectedCalendarForUpdate(calendar.id);
    setImportCalendarName(calendar.name);
    setImportColor(calendar.color);
    icsFileInputRef.current?.click();
  };

  const getNextColor = () => {
    return CALENDAR_COLORS[calendars.length % CALENDAR_COLORS.length];
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>Loading calendars...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {error && (
        <div className={styles.error}>
          <AlertCircle size={16} />
          <span>{error}</span>
          <button
            className={styles.dismissError}
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}

      {warning && (
        <div className={styles.warning}>
          <AlertTriangle size={16} />
          <span>{warning}</span>
          <button
            className={styles.dismissWarning}
            onClick={() => setWarning(null)}
            aria-label="Dismiss warning"
          >
            &times;
          </button>
        </div>
      )}

      {/* Info text */}
      <div className={styles.info}>
        <Calendar size={18} />
        <p>
          Subscribe to iCal URLs or import .ics files to display events alongside your meal plans.
        </p>
      </div>

      {/* URL Subscriptions section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4>Subscribed Calendars</h4>
          {urlCalendars.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSyncAll}
              disabled={isSyncing !== null}
              leftIcon={<RefreshCw size={14} />}
            >
              Sync All
            </Button>
          )}
        </div>

        {urlCalendars.length > 0 ? (
          <div className={styles.calendarList}>
            {urlCalendars.map((calendar) => (
              <div key={calendar.id} className={styles.calendarItem}>
                <div className={styles.calendarInfo}>
                  <span
                    className={styles.calendarColor}
                    style={{ backgroundColor: calendar.color }}
                  />
                  <div className={styles.calendarDetails}>
                    <span className={styles.calendarName}>{calendar.name}</span>
                    {calendar.lastSynced ? (
                      <span className={styles.lastSynced}>
                        Last synced: {new Date(calendar.lastSynced).toLocaleString()}
                      </span>
                    ) : (
                      <span className={styles.pendingSync}>
                        <RefreshCw size={10} className={styles.spinning} />
                        Pending sync...
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.calendarActions}>
                  <button
                    className={styles.iconButton}
                    onClick={() => handleToggleVisibility(calendar)}
                    title={calendar.isVisible ? 'Hide calendar' : 'Show calendar'}
                  >
                    {calendar.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    className={styles.iconButton}
                    onClick={() => handleSyncCalendar(calendar)}
                    disabled={isSyncing === calendar.id}
                    title="Sync calendar"
                  >
                    <RefreshCw
                      size={16}
                      className={isSyncing === calendar.id ? styles.spinning : ''}
                    />
                  </button>
                  <button
                    className={`${styles.iconButton} ${styles.deleteButton}`}
                    onClick={() => handleRemoveCalendar(calendar.id)}
                    title="Remove calendar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No subscribed calendars</p>
        )}

        {/* Add calendar form */}
        {showAddForm ? (
          <div className={styles.addForm}>
            <h4>Subscribe to Calendar URL</h4>
            <div className={styles.formField}>
              <label htmlFor="calendar-name">Calendar Name</label>
              <Input
                id="calendar-name"
                placeholder="e.g., Family Calendar"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="calendar-url">iCal URL</label>
              <Input
                id="calendar-url"
                placeholder="https://calendar.google.com/calendar/ical/..."
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
              <div className={styles.urlHelp}>
                <details>
                  <summary className={styles.helpToggle}>
                    <Link size={12} />
                    How to get the iCal URL
                  </summary>
                  <div className={styles.helpContent}>
                    <p><strong>Google Calendar:</strong></p>
                    <ol>
                      <li>Open Google Calendar settings</li>
                      <li>Click your calendar under "Settings for my calendars"</li>
                      <li>Under "Access permissions", check "Make available to public"</li>
                      <li>Scroll to "Integrate calendar"</li>
                      <li>Copy "Public address in iCal format"</li>
                    </ol>
                    <p className={styles.helpNote}>
                      Note: Private calendar URLs often don't work due to Google's security restrictions.
                    </p>
                    <p><strong>Apple Calendar:</strong></p>
                    <ol>
                      <li>Right-click calendar → Share Calendar</li>
                      <li>Check "Public Calendar"</li>
                      <li>Copy the webcal:// URL</li>
                    </ol>
                  </div>
                </details>
              </div>
            </div>
            <div className={styles.formField}>
              <label>Color</label>
              <div className={styles.colorPicker}>
                {CALENDAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.colorOption} ${
                      formData.color === color ? styles.selected : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
            </div>
            <div className={styles.formActions}>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ name: '', url: '', color: getNextColor() });
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCalendar}
                disabled={isAdding || !formData.name.trim() || !formData.url.trim()}
              >
                {isAdding ? 'Adding...' : 'Subscribe'}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setShowAddForm(true);
              setFormData({ ...formData, color: getNextColor() });
            }}
            leftIcon={<Plus size={16} />}
            className={styles.addButton}
          >
            Subscribe to URL
          </Button>
        )}
      </div>

      {/* Imported Calendars section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h4>Imported Calendars</h4>
        </div>

        {fileCalendars.length > 0 ? (
          <div className={styles.calendarList}>
            {fileCalendars.map((calendar) => (
              <div key={calendar.id} className={styles.calendarItem}>
                <div className={styles.calendarInfo}>
                  <span
                    className={styles.calendarColor}
                    style={{ backgroundColor: calendar.color }}
                  />
                  <div className={styles.calendarDetails}>
                    <span className={styles.calendarName}>{calendar.name}</span>
                    <span className={styles.lastSynced}>
                      {calendar.originalFileName && `File: ${calendar.originalFileName}`}
                      {calendar.lastImported && (
                        <> · Imported: {new Date(calendar.lastImported).toLocaleString()}</>
                      )}
                    </span>
                  </div>
                </div>
                <div className={styles.calendarActions}>
                  <button
                    className={styles.iconButton}
                    onClick={() => handleToggleVisibility(calendar)}
                    title={calendar.isVisible ? 'Hide calendar' : 'Show calendar'}
                  >
                    {calendar.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    className={styles.iconButton}
                    onClick={() => handleReimport(calendar)}
                    title="Re-import from file"
                  >
                    <Upload size={16} />
                  </button>
                  <button
                    className={`${styles.iconButton} ${styles.deleteButton}`}
                    onClick={() => handleRemoveCalendar(calendar.id)}
                    title="Remove calendar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No imported calendars</p>
        )}

        <Button
          variant="outline"
          onClick={() => {
            setImportMode('new');
            setSelectedCalendarForUpdate('');
            icsFileInputRef.current?.click();
          }}
          leftIcon={<Upload size={16} />}
          className={styles.addButton}
        >
          Import .ics File
        </Button>

        <input
          ref={icsFileInputRef}
          type="file"
          accept=".ics,text/calendar"
          onChange={handleIcsFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {/* Export section */}
      <div className={styles.exportSection}>
        <h4>Export Meals</h4>
        <p className={styles.exportDescription}>
          Download your meal plan as an .ics file to import into any calendar app.
        </p>
        <Button
          variant="outline"
          leftIcon={<Download size={16} />}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('platecraft:export-meals'));
          }}
        >
          Export Meal Plan
        </Button>
      </div>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => {
          setShowImportModal(false);
          setImportFile(null);
          setImportEvents([]);
        }}
        title="Import Calendar"
        size="md"
      >
        <div className={styles.importModal}>
          <div className={styles.importPreview}>
            <p><strong>File:</strong> {importFile?.name}</p>
            <p><strong>Events found:</strong> {importEvents.length}</p>
          </div>

          <div className={styles.importOptions}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="importMode"
                checked={importMode === 'new'}
                onChange={() => {
                  setImportMode('new');
                  setSelectedCalendarForUpdate('');
                }}
              />
              <span>Create new calendar</span>
            </label>

            {importMode === 'new' && (
              <>
                <div className={styles.formField}>
                  <label htmlFor="import-name">Calendar Name</label>
                  <Input
                    id="import-name"
                    placeholder="Calendar name"
                    value={importCalendarName}
                    onChange={(e) => setImportCalendarName(e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label>Color</label>
                  <div className={styles.colorPicker}>
                    {CALENDAR_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${styles.colorOption} ${
                          importColor === color ? styles.selected : ''
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setImportColor(color)}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {fileCalendars.length > 0 && (
              <>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'update'}
                    onChange={() => setImportMode('update')}
                  />
                  <span>Update existing calendar</span>
                </label>

                {importMode === 'update' && (
                  <div className={styles.formField}>
                    <select
                      value={selectedCalendarForUpdate}
                      onChange={(e) => setSelectedCalendarForUpdate(e.target.value)}
                      className={styles.select}
                    >
                      <option value="">Select calendar...</option>
                      {fileCalendars.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <p className={styles.updateNote}>
                      Events will be merged: new events added, changed events updated, deleted events removed.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowImportModal(false);
                setImportFile(null);
                setImportEvents([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={
                isImporting ||
                (importMode === 'new' && !importCalendarName.trim()) ||
                (importMode === 'update' && !selectedCalendarForUpdate)
              }
            >
              {isImporting ? 'Importing...' : 'Import'}
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    </div>
  );
}
