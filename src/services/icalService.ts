import type { ExternalEvent, PlannedMeal, Recipe, MealSlot } from '@/types';
import { format } from 'date-fns';

// CORS proxies for fetching external iCal URLs
// We try multiple proxies since availability and reliability varies
const CORS_PROXIES = [
  // Try direct fetch first (works for public calendars with CORS headers)
  (url: string) => url,
  // Various CORS proxy services
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

/**
 * Parse an iCal date string to a Date object
 */
function parseIcalDate(dateStr: string): { date: Date; isAllDay: boolean } {
  // Remove any timezone identifier suffix like ;TZID=...
  const cleanStr = dateStr.split(';')[0];

  // Check if it's a date-only value (YYYYMMDD) or datetime (YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ)
  if (cleanStr.length === 8) {
    // Date only - all day event
    const year = parseInt(cleanStr.slice(0, 4), 10);
    const month = parseInt(cleanStr.slice(4, 6), 10) - 1;
    const day = parseInt(cleanStr.slice(6, 8), 10);
    return { date: new Date(year, month, day), isAllDay: true };
  }

  // DateTime format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const year = parseInt(cleanStr.slice(0, 4), 10);
  const month = parseInt(cleanStr.slice(4, 6), 10) - 1;
  const day = parseInt(cleanStr.slice(6, 8), 10);
  const hour = parseInt(cleanStr.slice(9, 11), 10);
  const minute = parseInt(cleanStr.slice(11, 13), 10);
  const second = parseInt(cleanStr.slice(13, 15), 10) || 0;

  // If ends with Z, it's UTC
  if (cleanStr.endsWith('Z')) {
    return { date: new Date(Date.UTC(year, month, day, hour, minute, second)), isAllDay: false };
  }

  // Otherwise treat as local time
  return { date: new Date(year, month, day, hour, minute, second), isAllDay: false };
}

/**
 * Parse iCal content into events
 */
function parseIcalContent(content: string, calendarId: string): ExternalEvent[] {
  const events: ExternalEvent[] = [];

  // Unfold lines (iCal spec says long lines are folded with CRLF + space/tab)
  const unfoldedContent = content.replace(/\r?\n[ \t]/g, '');

  // Split into lines
  const lines = unfoldedContent.split(/\r?\n/);

  let currentEvent: Partial<ExternalEvent> | null = null;
  let inEvent = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = { calendarId };
    } else if (trimmedLine === 'END:VEVENT' && currentEvent) {
      inEvent = false;
      // Only add if we have required fields
      if (currentEvent.id && currentEvent.startTime && currentEvent.endTime) {
        events.push(currentEvent as ExternalEvent);
      }
      currentEvent = null;
    } else if (inEvent && currentEvent) {
      // Parse property
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex === -1) continue;

      const propertyPart = trimmedLine.slice(0, colonIndex);
      const value = trimmedLine.slice(colonIndex + 1);

      // Property name might have parameters (e.g., DTSTART;TZID=America/New_York)
      const propertyName = propertyPart.split(';')[0].toUpperCase();

      switch (propertyName) {
        case 'UID':
          currentEvent.id = value;
          break;
        case 'SUMMARY':
          currentEvent.title = decodeIcalText(value);
          break;
        case 'DESCRIPTION':
          currentEvent.description = decodeIcalText(value);
          break;
        case 'LOCATION':
          currentEvent.location = decodeIcalText(value);
          break;
        case 'DTSTART': {
          const { date, isAllDay } = parseIcalDate(value);
          currentEvent.startTime = date;
          currentEvent.isAllDay = isAllDay;
          break;
        }
        case 'DTEND': {
          const { date } = parseIcalDate(value);
          currentEvent.endTime = date;
          break;
        }
      }
    }
  }

  return events;
}

/**
 * Decode iCal text escaping
 */
function decodeIcalText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Encode text for iCal format
 */
function encodeIcalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Format a date for iCal (YYYYMMDDTHHmmssZ for UTC)
 */
function formatIcalDateTime(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Generate a unique ID for an event
 */
function generateEventUid(mealId: string): string {
  return `${mealId}@platecraft.app`;
}

/**
 * Get default meal times for a slot
 */
function getMealSlotTimes(slot: MealSlot): { startHour: number; endHour: number } {
  const slotName = slot.name.toLowerCase();

  if (slotName.includes('breakfast')) {
    return { startHour: 8, endHour: 9 };
  } else if (slotName.includes('lunch')) {
    return { startHour: 12, endHour: 13 };
  } else if (slotName.includes('dinner') || slotName.includes('supper')) {
    return { startHour: 18, endHour: 19 };
  } else if (slotName.includes('snack')) {
    return { startHour: 15, endHour: 15 };
  }

  // Default to lunch time
  return { startHour: 12, endHour: 13 };
}

/**
 * Check if two events have different content (for update detection)
 */
function hasEventChanged(existing: ExternalEvent, updated: ExternalEvent): boolean {
  return (
    existing.title !== updated.title ||
    existing.description !== updated.description ||
    existing.location !== updated.location ||
    new Date(existing.startTime).getTime() !== new Date(updated.startTime).getTime() ||
    new Date(existing.endTime).getTime() !== new Date(updated.endTime).getTime() ||
    existing.isAllDay !== updated.isAllDay
  );
}

export const icalService = {
  /**
   * Read and parse a local .ics file
   */
  readIcsFile(file: File, calendarId: string): Promise<ExternalEvent[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;

          // Validate iCal format
          if (!content.includes('BEGIN:VCALENDAR')) {
            throw new Error('Invalid iCal format: missing VCALENDAR');
          }

          const events = parseIcalContent(content, calendarId);
          resolve(events);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Failed to parse .ics file'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  /**
   * Smart merge imported events with existing events (deduplication by UID)
   */
  mergeImportedEvents(
    newEvents: ExternalEvent[],
    existingEvents: ExternalEvent[],
    options: { removeOrphans?: boolean } = {}
  ): {
    toCreate: ExternalEvent[];
    toUpdate: ExternalEvent[];
    toDelete: string[];
  } {
    const existingByUid = new Map(existingEvents.map((e) => [e.id, e]));
    const newUids = new Set(newEvents.map((e) => e.id));

    const toCreate: ExternalEvent[] = [];
    const toUpdate: ExternalEvent[] = [];
    const toDelete: string[] = [];

    // Process new events
    for (const event of newEvents) {
      const existing = existingByUid.get(event.id);
      if (existing) {
        // Update existing event - check if actually changed
        if (hasEventChanged(existing, event)) {
          toUpdate.push({ ...event });
        }
      } else {
        // Create new event
        toCreate.push(event);
      }
    }

    // Find orphaned events (in existing but not in new)
    if (options.removeOrphans) {
      for (const existing of existingEvents) {
        if (!newUids.has(existing.id)) {
          toDelete.push(existing.id);
        }
      }
    }

    return { toCreate, toUpdate, toDelete };
  },

  /**
   * Normalize a calendar URL (convert webcal:// to https://)
   */
  normalizeCalendarUrl(url: string): string {
    // webcal:// is just a convention - the actual content is served over HTTPS
    if (url.startsWith('webcal://')) {
      return url.replace('webcal://', 'https://');
    }
    // Also handle webcals:// (secure webcal, though rare)
    if (url.startsWith('webcals://')) {
      return url.replace('webcals://', 'https://');
    }
    return url;
  },

  /**
   * Fetch and parse an iCal URL
   */
  async fetchIcalUrl(url: string, calendarId: string): Promise<ExternalEvent[]> {
    // Normalize the URL (convert webcal:// to https://)
    const normalizedUrl = this.normalizeCalendarUrl(url);

    let lastError: Error | null = null;
    let allForbidden = true;
    const FETCH_TIMEOUT = 10000; // 10 seconds per attempt
    const MAX_RETRIES = 2; // Try each proxy up to 2 times

    // Helper to fetch with timeout
    const fetchWithTimeout = async (proxyUrl: string): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      try {
        const response = await fetch(proxyUrl, {
          headers: {
            'Accept': 'text/calendar, text/plain, */*',
          },
          signal: controller.signal,
        });
        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Try each CORS proxy with retries
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      for (const proxyFn of CORS_PROXIES) {
        try {
          const proxyUrl = proxyFn(normalizedUrl);
          const response = await fetchWithTimeout(proxyUrl);

          if (!response.ok) {
            if (response.status !== 403) {
              allForbidden = false;
            }
            throw new Error(`HTTP ${response.status}`);
          }

          allForbidden = false;
          const content = await response.text();

          // Verify it looks like iCal content
          if (!content.includes('BEGIN:VCALENDAR')) {
            throw new Error('Invalid iCal format');
          }

          return parseIcalContent(content, calendarId);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            lastError = new Error('Request timed out');
          } else {
            lastError = error instanceof Error ? error : new Error(String(error));
          }
          // Continue to next proxy
        }
      }
      // Small delay before retry round
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Provide helpful error message
    if (allForbidden) {
      throw new Error(
        'Access denied (403). Google Calendar private URLs often block proxy requests. ' +
        'Try making the calendar public, or use a different calendar service.'
      );
    }

    throw lastError || new Error('Failed to fetch iCal URL');
  },

  /**
   * Generate iCal content from planned meals
   */
  generateIcsFromMeals(
    meals: PlannedMeal[],
    recipesById: Map<string, Recipe>,
    mealSlotsById: Map<string, MealSlot>
  ): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Platecraft//Meal Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Platecraft Meals',
    ];

    for (const meal of meals) {
      const recipe = recipesById.get(meal.recipeId);
      if (!recipe) continue;

      const slot = mealSlotsById.get(meal.slotId);
      const slotTimes = slot ? getMealSlotTimes(slot) : { startHour: 12, endHour: 13 };
      const slotName = slot?.name || 'Meal';

      // Parse the meal date and set times
      const [year, month, day] = meal.date.split('-').map(Number);
      const startDate = new Date(year, month - 1, day, slotTimes.startHour, 0, 0);
      const endDate = new Date(year, month - 1, day, slotTimes.endHour, 0, 0);

      // Build description
      const descriptionParts: string[] = [];
      if (recipe.description) {
        descriptionParts.push(recipe.description);
      }
      descriptionParts.push(`Servings: ${meal.servings}`);
      if (meal.notes) {
        descriptionParts.push(`Notes: ${meal.notes}`);
      }
      if (meal.extraItems && meal.extraItems.length > 0) {
        const extras = meal.extraItems.map(e => e.name).join(', ');
        descriptionParts.push(`Extras: ${extras}`);
      }

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${generateEventUid(meal.id)}`);
      lines.push(`DTSTAMP:${formatIcalDateTime(new Date())}`);
      lines.push(`DTSTART:${formatIcalDateTime(startDate)}`);
      lines.push(`DTEND:${formatIcalDateTime(endDate)}`);
      lines.push(`SUMMARY:${encodeIcalText(`${slotName}: ${recipe.title}`)}`);

      if (descriptionParts.length > 0) {
        lines.push(`DESCRIPTION:${encodeIcalText(descriptionParts.join('\\n'))}`);
      }

      // Add categories
      lines.push('CATEGORIES:Meal,Platecraft');

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    return lines.join('\r\n');
  },

  /**
   * Download iCal content as a file
   */
  downloadIcsFile(content: string, filename: string = 'platecraft-meals.ics'): void {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  },

  /**
   * Export meals to an .ics file and trigger download
   */
  exportMealsToIcs(
    meals: PlannedMeal[],
    recipesById: Map<string, Recipe>,
    mealSlotsById: Map<string, MealSlot>,
    filename?: string
  ): void {
    const content = this.generateIcsFromMeals(meals, recipesById, mealSlotsById);
    const defaultFilename = `platecraft-meals-${format(new Date(), 'yyyy-MM-dd')}.ics`;
    this.downloadIcsFile(content, filename || defaultFilename);
  },
};
