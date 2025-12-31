import { useState, useMemo } from 'react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Calendar } from 'lucide-react';
import { Modal, ModalFooter, Button, Input } from '@/components/ui';
import styles from './PrintRecipesDatePicker.module.css';

interface PrintRecipesDatePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onPrint: (startDate: Date, endDate: Date) => void;
}

type QuickRange = 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'this-month' | 'next-7-days' | 'custom';

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'this-week', label: 'This Week' },
  { id: 'next-week', label: 'Next Week' },
  { id: 'next-7-days', label: 'Next 7 Days' },
  { id: 'this-month', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
];

export function PrintRecipesDatePicker({
  isOpen,
  onClose,
  onPrint,
}: PrintRecipesDatePickerProps) {
  const [selectedRange, setSelectedRange] = useState<QuickRange>('this-week');
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();

    switch (selectedRange) {
      case 'today':
        return { startDate: today, endDate: today };
      case 'tomorrow':
        const tomorrow = addDays(today, 1);
        return { startDate: tomorrow, endDate: tomorrow };
      case 'this-week':
        return {
          startDate: startOfWeek(today, { weekStartsOn: 0 }),
          endDate: endOfWeek(today, { weekStartsOn: 0 }),
        };
      case 'next-week':
        const nextWeek = addDays(today, 7);
        return {
          startDate: startOfWeek(nextWeek, { weekStartsOn: 0 }),
          endDate: endOfWeek(nextWeek, { weekStartsOn: 0 }),
        };
      case 'next-7-days':
        return { startDate: today, endDate: addDays(today, 6) };
      case 'this-month':
        return {
          startDate: startOfMonth(today),
          endDate: endOfMonth(today),
        };
      case 'custom':
        return {
          startDate: new Date(customStart),
          endDate: new Date(customEnd),
        };
      default:
        return { startDate: today, endDate: today };
    }
  }, [selectedRange, customStart, customEnd]);

  const handlePrint = () => {
    onPrint(startDate, endDate);
    onClose();
    setSelectedRange('this-week');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Print Recipes"
      size="md"
    >
      <div className={styles.content}>
        <div className={styles.section}>
          <label className={styles.label}>Select Date Range</label>
          <div className={styles.rangeGrid}>
            {QUICK_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                className={`${styles.rangeButton} ${selectedRange === range.id ? styles.selected : ''}`}
                onClick={() => setSelectedRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {selectedRange === 'custom' && (
          <div className={styles.customDates}>
            <Input
              type="date"
              label="Start Date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </div>
        )}

        <div className={styles.preview}>
          <Calendar size={16} />
          <span>
            {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
          </span>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handlePrint}>Print Recipes</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
