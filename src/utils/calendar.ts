import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';

export interface CalendarDay {
  date: Date;
  dateString: string; // YYYY-MM-DD format
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

export interface CalendarWeek {
  weekNumber: number;
  days: CalendarDay[];
}

/**
 * Get all days to display in a month calendar view
 * Includes days from previous/next months to fill the grid
 */
export function getMonthCalendarDays(
  date: Date,
  weekStartsOn: 0 | 1 = 0
): CalendarDay[] {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  return days.map((day) => ({
    date: day,
    dateString: format(day, 'yyyy-MM-dd'),
    dayOfMonth: day.getDate(),
    isCurrentMonth: isSameMonth(day, date),
    isToday: isToday(day),
    isWeekend: day.getDay() === 0 || day.getDay() === 6,
  }));
}

/**
 * Get days for a week view
 */
export function getWeekDays(
  date: Date,
  weekStartsOn: 0 | 1 = 0
): CalendarDay[] {
  const weekStart = startOfWeek(date, { weekStartsOn });
  const weekEnd = endOfWeek(date, { weekStartsOn });

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return days.map((day) => ({
    date: day,
    dateString: format(day, 'yyyy-MM-dd'),
    dayOfMonth: day.getDate(),
    isCurrentMonth: isSameMonth(day, date),
    isToday: isToday(day),
    isWeekend: day.getDay() === 0 || day.getDay() === 6,
  }));
}

/**
 * Get week days grouped by week for month view
 */
export function getMonthCalendarWeeks(
  date: Date,
  weekStartsOn: 0 | 1 = 0
): CalendarWeek[] {
  const days = getMonthCalendarDays(date, weekStartsOn);
  const weeks: CalendarWeek[] = [];

  for (let i = 0; i < days.length; i += 7) {
    weeks.push({
      weekNumber: Math.floor(i / 7),
      days: days.slice(i, i + 7),
    });
  }

  return weeks;
}

/**
 * Get day names for header
 */
export function getDayNames(
  weekStartsOn: 0 | 1 = 0,
  format: 'short' | 'narrow' | 'long' = 'short'
): string[] {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const narrowDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const dayNames = format === 'long' ? days : format === 'short' ? shortDays : narrowDays;

  if (weekStartsOn === 1) {
    return [...dayNames.slice(1), dayNames[0]];
  }

  return dayNames;
}

/**
 * Check if two dates are the same day
 */
export function areSameDay(date1: Date, date2: Date): boolean {
  return isSameDay(date1, date2);
}

/**
 * Format date for display
 */
export function formatDateForDisplay(date: Date, formatStr: string = 'PPP'): string {
  return format(date, formatStr);
}

/**
 * Get date string in YYYY-MM-DD format
 */
export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse date string in YYYY-MM-DD format
 */
export function fromDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}
