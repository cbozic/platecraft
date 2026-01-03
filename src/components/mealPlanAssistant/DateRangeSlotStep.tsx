import { useState, useMemo, useEffect } from 'react';
import { format, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { CalendarDays, Utensils, Users, Heart, Shuffle } from 'lucide-react';
import { Input } from '@/components/ui';
import type { MealSlot } from '@/types';
import styles from './DateRangeSlotStep.module.css';

interface DateRangeSlotStepProps {
  startDate: Date;
  endDate: Date;
  selectedSlots: string[];
  defaultServings: number;
  favoritesWeight: number;
  mealSlots: MealSlot[];
  onDateRangeChange: (startDate: Date, endDate: Date) => void;
  onToggleSlot: (slotId: string) => void;
  onServingsChange: (servings: number) => void;
  onFavoritesWeightChange: (weight: number) => void;
}

type QuickRange = 'this-week' | 'next-week' | 'next-7-days' | 'next-14-days' | 'current-month' | 'next-month' | 'custom';

const QUICK_RANGES: { id: QuickRange; label: string }[] = [
  { id: 'this-week', label: 'This Week' },
  { id: 'next-week', label: 'Next Week' },
  { id: 'next-7-days', label: 'Next 7 Days' },
  { id: 'next-14-days', label: 'Next 2 Weeks' },
  { id: 'current-month', label: 'Current Month' },
  { id: 'next-month', label: 'Next Month' },
  { id: 'custom', label: 'Custom' },
];

export function DateRangeSlotStep({
  startDate,
  endDate,
  selectedSlots,
  defaultServings,
  favoritesWeight,
  mealSlots,
  onDateRangeChange,
  onToggleSlot,
  onServingsChange,
  onFavoritesWeightChange,
}: DateRangeSlotStepProps) {
  const [customStart, setCustomStart] = useState(format(startDate, 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(endDate, 'yyyy-MM-dd'));
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [servingsInput, setServingsInput] = useState(defaultServings.toString());

  // Sync local servings input with prop changes
  useEffect(() => {
    setServingsInput(defaultServings.toString());
  }, [defaultServings]);

  // Determine which quick range is currently selected
  const currentQuickRange = useMemo((): QuickRange => {
    // If user explicitly clicked Custom, show custom
    if (isCustomMode) {
      return 'custom';
    }

    const today = new Date();
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 });
    const nextWeekStart = startOfWeek(addDays(today, 7), { weekStartsOn: 0 });
    const nextWeekEnd = endOfWeek(addDays(today, 7), { weekStartsOn: 0 });
    const currentMonthStart = startOfMonth(today);
    const currentMonthEnd = endOfMonth(today);
    const nextMonthStart = startOfMonth(addMonths(today, 1));
    const nextMonthEnd = endOfMonth(addMonths(today, 1));

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    if (
      startStr === format(thisWeekStart, 'yyyy-MM-dd') &&
      endStr === format(thisWeekEnd, 'yyyy-MM-dd')
    ) {
      return 'this-week';
    }
    if (
      startStr === format(nextWeekStart, 'yyyy-MM-dd') &&
      endStr === format(nextWeekEnd, 'yyyy-MM-dd')
    ) {
      return 'next-week';
    }
    if (
      startStr === format(today, 'yyyy-MM-dd') &&
      endStr === format(addDays(today, 6), 'yyyy-MM-dd')
    ) {
      return 'next-7-days';
    }
    if (
      startStr === format(today, 'yyyy-MM-dd') &&
      endStr === format(addDays(today, 13), 'yyyy-MM-dd')
    ) {
      return 'next-14-days';
    }
    if (
      startStr === format(currentMonthStart, 'yyyy-MM-dd') &&
      endStr === format(currentMonthEnd, 'yyyy-MM-dd')
    ) {
      return 'current-month';
    }
    if (
      startStr === format(nextMonthStart, 'yyyy-MM-dd') &&
      endStr === format(nextMonthEnd, 'yyyy-MM-dd')
    ) {
      return 'next-month';
    }
    return 'custom';
  }, [startDate, endDate, isCustomMode]);

  const handleQuickRangeSelect = (range: QuickRange) => {
    const today = new Date();

    // Reset custom mode when selecting a preset
    if (range !== 'custom') {
      setIsCustomMode(false);
    }

    switch (range) {
      case 'this-week': {
        const start = startOfWeek(today, { weekStartsOn: 0 });
        const end = endOfWeek(today, { weekStartsOn: 0 });
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-week': {
        const start = startOfWeek(addDays(today, 7), { weekStartsOn: 0 });
        const end = endOfWeek(addDays(today, 7), { weekStartsOn: 0 });
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-7-days': {
        const start = today;
        const end = addDays(today, 6);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-14-days': {
        const start = today;
        const end = addDays(today, 13);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'current-month': {
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'next-month': {
        const start = startOfMonth(addMonths(today, 1));
        const end = endOfMonth(addMonths(today, 1));
        onDateRangeChange(start, end);
        setCustomStart(format(start, 'yyyy-MM-dd'));
        setCustomEnd(format(end, 'yyyy-MM-dd'));
        break;
      }
      case 'custom':
        // Enable custom mode to show date pickers
        setIsCustomMode(true);
        break;
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') {
      setCustomStart(value);
      onDateRangeChange(new Date(value), endDate);
    } else {
      setCustomEnd(value);
      onDateRangeChange(startDate, new Date(value));
    }
  };

  const totalDays = differenceInDays(endDate, startDate) + 1;
  const totalMeals = totalDays * selectedSlots.length;

  return (
    <div className={styles.container}>
      {/* Date Range Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <CalendarDays size={20} />
          <div>
            <h3 className={styles.title}>Date Range</h3>
            <p className={styles.description}>Select the period to fill with meals.</p>
          </div>
        </div>

        <div className={styles.rangeGrid}>
          {QUICK_RANGES.map((range) => (
            <button
              key={range.id}
              type="button"
              className={`${styles.rangeButton} ${currentQuickRange === range.id ? styles.selected : ''}`}
              onClick={() => handleQuickRangeSelect(range.id)}
            >
              {range.label}
            </button>
          ))}
        </div>

        {currentQuickRange === 'custom' && (
          <div className={styles.customDates}>
            <Input
              type="date"
              label="Start Date"
              value={customStart}
              onChange={(e) => handleCustomDateChange('start', e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              value={customEnd}
              onChange={(e) => handleCustomDateChange('end', e.target.value)}
            />
          </div>
        )}

        <div className={styles.datePreview}>
          {format(startDate, 'MMM d, yyyy')} — {format(endDate, 'MMM d, yyyy')}
          <span className={styles.dayCount}>({totalDays} days)</span>
        </div>
      </div>

      {/* Meal Slots Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Utensils size={20} />
          <div>
            <h3 className={styles.title}>Meal Slots</h3>
            <p className={styles.description}>Choose which meals to fill.</p>
          </div>
        </div>

        <div className={styles.slotList}>
          {mealSlots.map((slot) => {
            const isSelected = selectedSlots.includes(slot.id);
            return (
              <label key={slot.id} className={styles.slotItem}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSlot(slot.id)}
                  className={styles.checkbox}
                />
                <span className={styles.slotName}>{slot.name}</span>
              </label>
            );
          })}
        </div>

        {selectedSlots.length === 0 && (
          <div className={styles.warning}>Please select at least one meal slot.</div>
        )}
      </div>

      {/* Servings Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Users size={20} />
          <div>
            <h3 className={styles.title}>Default Servings</h3>
            <p className={styles.description}>How many people are you cooking for?</p>
          </div>
        </div>

        <div className={styles.servingsInput}>
          <Input
            type="number"
            value={servingsInput}
            onChange={(e) => {
              const value = e.target.value;
              setServingsInput(value);

              // Only update parent if it's a valid number
              const numValue = parseInt(value);
              if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
                onServingsChange(numValue);
              }
            }}
            onBlur={() => {
              // On blur, ensure we have a valid value
              const numValue = parseInt(servingsInput);
              if (isNaN(numValue) || numValue < 1) {
                setServingsInput('1');
                onServingsChange(1);
              } else if (numValue > 20) {
                setServingsInput('20');
                onServingsChange(20);
              }
            }}
            min={1}
            max={20}
            className={styles.servingsField}
          />
          <span className={styles.servingsLabel}>servings per meal</span>
        </div>
      </div>

      {/* Favorites Weight Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <Heart size={20} />
          <div>
            <h3 className={styles.title}>Recipe Selection</h3>
            <p className={styles.description}>Balance between favorites and variety.</p>
          </div>
        </div>

        <div className={styles.sliderContainer}>
          <div className={styles.sliderLabels}>
            <span className={styles.sliderLabelLeft}>
              <Shuffle size={14} />
              Random
            </span>
            <span className={styles.sliderLabelRight}>
              <Heart size={14} />
              Favorites
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={favoritesWeight}
            onChange={(e) => onFavoritesWeightChange(parseInt(e.target.value))}
            className={styles.slider}
          />
          <div className={styles.sliderValue}>
            {favoritesWeight === 0
              ? 'All random'
              : favoritesWeight === 100
                ? 'Favorites only'
                : favoritesWeight < 50
                  ? `${100 - favoritesWeight}% random, ${favoritesWeight}% favorites`
                  : `${favoritesWeight}% favorites, ${100 - favoritesWeight}% random`}
          </div>
        </div>
      </div>

      {/* Summary */}
      {selectedSlots.length > 0 && (
        <div className={styles.summary}>
          Planning <strong>{totalMeals}</strong> meals ({selectedSlots.length} per day × {totalDays}{' '}
          days)
        </div>
      )}
    </div>
  );
}
