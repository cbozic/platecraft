export type CalendarProvider = 'ical';
export type CalendarSourceType = 'url' | 'file';

export interface ExternalCalendar {
  id: string;
  name: string;
  provider: CalendarProvider;
  color: string;
  isVisible: boolean;
  sourceType: CalendarSourceType;
  // For iCal URL subscriptions
  icalUrl?: string;
  lastSynced?: Date;
  // For file imports
  originalFileName?: string;
  lastImported?: Date;
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
