import { format } from 'date-fns';
import type { ExternalEvent } from '@/types';
import styles from './ExternalEventCard.module.css';

interface ExternalEventCardProps {
  event: ExternalEvent;
  compact?: boolean;
  color?: string;
}

export function ExternalEventCard({
  event,
  compact = false,
  color = '#4285f4', // Google Calendar default blue
}: ExternalEventCardProps) {
  const formatTime = (date: Date): string => {
    return format(date, 'h:mm a');
  };

  if (compact) {
    // Compact mode for month view
    return (
      <div
        className={styles.eventLabelCompact}
        title={`${event.title}${event.isAllDay ? ' (All day)' : ` at ${formatTime(event.startTime)}`}`}
      >
        <span className={styles.eventDot} style={{ backgroundColor: color }} />
        <span className={styles.eventTitle}>{event.title}</span>
        {!event.isAllDay && (
          <span className={styles.eventTime}>{formatTime(event.startTime)}</span>
        )}
      </div>
    );
  }

  // Full mode for week view
  return (
    <div className={styles.eventCard} style={{ borderColor: color }}>
      <div className={styles.eventCardContent}>
        <span className={styles.eventCardTitle}>{event.title}</span>
        {event.isAllDay ? (
          <span className={styles.allDayBadge}>All day</span>
        ) : (
          <span className={styles.eventCardTime}>
            {formatTime(event.startTime)} - {formatTime(event.endTime)}
          </span>
        )}
      </div>
    </div>
  );
}
