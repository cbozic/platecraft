import { UNIT_INFO } from '@/types/units';
import type { MeasurementUnit } from '@/types/units';

/**
 * Common fraction representations
 */
const FRACTIONS: [number, string][] = [
  [0.125, '⅛'],
  [0.25, '¼'],
  [0.333, '⅓'],
  [0.375, '⅜'],
  [0.5, '½'],
  [0.625, '⅝'],
  [0.666, '⅔'],
  [0.75, '¾'],
  [0.875, '⅞'],
];

/**
 * Tolerance for matching fractions
 */
const FRACTION_TOLERANCE = 0.02;

/**
 * Scale a quantity by a factor
 */
export function scaleQuantity(quantity: number | null, scaleFactor: number): number | null {
  if (quantity === null) return null;
  return quantity * scaleFactor;
}

/**
 * Check if a unit is metric
 */
export function isMetricUnit(unit: MeasurementUnit | null): boolean {
  if (!unit) return false;
  const info = UNIT_INFO[unit];
  return info?.system === 'metric';
}

/**
 * Check if a unit is a count unit (should display as whole numbers when possible)
 */
export function isCountUnit(unit: MeasurementUnit | null): boolean {
  if (!unit) return true; // No unit = likely a count (e.g., "2 eggs")
  const info = UNIT_INFO[unit];
  return info?.type === 'count';
}

/**
 * Convert a decimal to a fraction string
 * Returns null if no close fraction match
 */
function decimalToFraction(decimal: number): string | null {
  // Check for exact or close matches
  for (const [value, symbol] of FRACTIONS) {
    if (Math.abs(decimal - value) < FRACTION_TOLERANCE) {
      return symbol;
    }
  }
  return null;
}

/**
 * Format a number as a fraction string (for US/UK units)
 * Examples: 1.5 -> "1½", 0.25 -> "¼", 2.333 -> "2⅓"
 */
export function formatAsFraction(value: number): string {
  if (value === 0) return '0';

  const wholePart = Math.floor(value);
  const fractionalPart = value - wholePart;

  // If it's a whole number, just return it
  if (fractionalPart < FRACTION_TOLERANCE) {
    return wholePart.toString();
  }

  // If it's very close to the next whole number, round up
  if (fractionalPart > 1 - FRACTION_TOLERANCE) {
    return (wholePart + 1).toString();
  }

  // Try to find a fraction match
  const fractionSymbol = decimalToFraction(fractionalPart);

  if (fractionSymbol) {
    if (wholePart === 0) {
      return fractionSymbol;
    }
    return `${wholePart}${fractionSymbol}`;
  }

  // No fraction match - round to nearest quarter
  const roundedFraction = Math.round(fractionalPart * 4) / 4;
  const roundedSymbol = decimalToFraction(roundedFraction);

  if (roundedSymbol) {
    if (wholePart === 0) {
      return roundedSymbol;
    }
    return `${wholePart}${roundedSymbol}`;
  }

  // Fallback to decimal
  if (wholePart === 0) {
    return value.toFixed(2).replace(/\.?0+$/, '');
  }
  return `${wholePart}${fractionalPart.toFixed(2).substring(1).replace(/\.?0+$/, '')}`;
}

/**
 * Format a number as a decimal string (for metric units)
 * Rounds to 2 decimal places and removes trailing zeros
 */
export function formatAsDecimal(value: number): string {
  if (value === 0) return '0';

  // Round to 2 decimal places
  const rounded = Math.round(value * 100) / 100;

  // Format and remove trailing zeros
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Format a quantity for display based on the unit system
 * - US/UK units: Show as fractions
 * - Metric units: Show as decimals
 * - Count units: Round to whole numbers when close
 */
export function formatQuantity(
  quantity: number | null,
  unit: MeasurementUnit | null
): string {
  if (quantity === null) return '';

  // For count units, prefer whole numbers
  if (isCountUnit(unit)) {
    // If very close to a whole number, round
    const rounded = Math.round(quantity);
    if (Math.abs(quantity - rounded) < 0.1) {
      return rounded.toString();
    }
    // Otherwise show as decimal
    return formatAsDecimal(quantity);
  }

  // For metric units, use decimals
  if (isMetricUnit(unit)) {
    return formatAsDecimal(quantity);
  }

  // For US/UK units, use fractions
  return formatAsFraction(quantity);
}

/**
 * Get a human-readable scale label
 * Examples: 1 -> null, 2 -> "2x", 0.5 -> "½x"
 */
export function getScaleLabel(scaleFactor: number): string | null {
  if (Math.abs(scaleFactor - 1) < 0.01) {
    return null; // No label needed for 1x
  }

  if (scaleFactor >= 1) {
    // For whole numbers or simple fractions
    if (Math.abs(scaleFactor - Math.round(scaleFactor)) < 0.01) {
      return `${Math.round(scaleFactor)}x`;
    }
    return `${formatAsFraction(scaleFactor)}x`;
  }

  // For fractions less than 1
  return `${formatAsFraction(scaleFactor)}x`;
}
