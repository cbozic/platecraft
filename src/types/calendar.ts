export type CalendarProvider = 'google' | 'ical';

export interface ExternalCalendar {
  id: string;
  name: string;
  provider: CalendarProvider;
  color: string;
  isVisible: boolean;
  // For Google OAuth
  googleCalendarId?: string;
  // For iCal URL import
  icalUrl?: string;
  lastSynced?: Date;
}

export interface ExternalEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  location?: string;
}

export type CalendarView = 'month' | 'week';

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  meals: PlannedMealWithRecipe[];
  externalEvents: ExternalEvent[];
  note?: string;
}

export interface PlannedMealWithRecipe {
  id: string;
  slotId: string;
  slotName: string;
  recipeId: string;
  recipeName: string;
  recipeImage?: string;
  servings: number;
  notes?: string;
}
