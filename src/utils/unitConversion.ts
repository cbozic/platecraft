/**
 * Unit Conversion Utilities
 *
 * Provides functions to convert between units within the same category
 * (volume-to-volume, weight-to-weight) and select optimal display units.
 */

import { UNIT_INFO, type MeasurementUnit } from '@/types/units';

export type UnitCategory = 'volume' | 'weight' | 'count';

export interface ConvertedAmount {
  quantity: number;
  unit: MeasurementUnit;
}

export interface OriginalAmount {
  quantity: number | null;
  unit: MeasurementUnit | null;
  recipeId: string;
  recipeName: string;
}

export interface AggregatedAmounts {
  displayQuantity: number;
  displayUnit: MeasurementUnit;
  alternateUnits: ConvertedAmount[];
  originalAmounts: OriginalAmount[];
  isEstimated: boolean;
  estimationNote?: string;
  needsAIEstimation?: boolean;
}

/**
 * Get the category of a unit (volume, weight, or count)
 */
export function getUnitCategory(unit: MeasurementUnit | null): UnitCategory {
  if (!unit) return 'count';

  const info = UNIT_INFO[unit];
  if (!info) return 'count';

  return info.type;
}

/**
 * Convert a quantity to base units (ml for volume, g for weight)
 * Returns null for count units
 */
export function convertToBaseUnit(
  quantity: number,
  unit: MeasurementUnit
): number | null {
  const info = UNIT_INFO[unit];
  if (!info || !info.baseUnitFactor) {
    return null;
  }
  return quantity * info.baseUnitFactor;
}

/**
 * Convert from base units to a target unit
 * Returns null for count units
 */
export function convertFromBaseUnit(
  baseQuantity: number,
  targetUnit: MeasurementUnit
): number | null {
  const info = UNIT_INFO[targetUnit];
  if (!info || !info.baseUnitFactor) {
    return null;
  }
  return baseQuantity / info.baseUnitFactor;
}

/**
 * Convert between two units of the same category
 * Returns null if conversion is not possible
 */
export function convertUnit(
  quantity: number,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit
): number | null {
  const fromCategory = getUnitCategory(fromUnit);
  const toCategory = getUnitCategory(toUnit);

  // Can only convert within same category
  if (fromCategory !== toCategory) {
    return null;
  }

  // Count units can't be converted
  if (fromCategory === 'count') {
    return fromUnit === toUnit ? quantity : null;
  }

  const baseAmount = convertToBaseUnit(quantity, fromUnit);
  if (baseAmount === null) return null;

  return convertFromBaseUnit(baseAmount, toUnit);
}

/**
 * Packaging preferences for common ingredients
 * Used to select the optimal display unit
 */
interface PackagingPreference {
  pattern: RegExp;
  volumeUnit: MeasurementUnit;
  weightUnit: MeasurementUnit;
  volumeThresholds?: { minMl: number; unit: MeasurementUnit }[];
  weightThresholds?: { minG: number; unit: MeasurementUnit }[];
}

const PACKAGING_PREFERENCES: PackagingPreference[] = [
  // Meats - prefer lbs, use oz for small amounts
  {
    pattern: /chicken|beef|pork|lamb|turkey|meat|steak|roast|ground|sausage/i,
    volumeUnit: 'cup',
    weightUnit: 'lb',
    weightThresholds: [
      { minG: 0, unit: 'oz' },
      { minG: 227, unit: 'lb' }, // 0.5 lb = 227g
    ],
  },
  // Liquids - prefer cups, use tbsp for small amounts
  {
    pattern: /milk|cream|broth|stock|juice|water|wine|vinegar|oil/i,
    volumeUnit: 'cup',
    weightUnit: 'oz',
    volumeThresholds: [
      { minMl: 0, unit: 'tbsp' },
      { minMl: 59, unit: 'cup' }, // 0.25 cup = 59ml
    ],
  },
  // Butter - prefer tbsp, switch to cup for large amounts
  {
    pattern: /butter/i,
    volumeUnit: 'tbsp',
    weightUnit: 'oz',
    volumeThresholds: [
      { minMl: 0, unit: 'tbsp' },
      { minMl: 118, unit: 'cup' }, // 0.5 cup = 8 tbsp = 118ml
    ],
  },
  // Spices and seasonings - prefer tsp/tbsp
  {
    pattern:
      /salt|pepper|spice|cumin|paprika|cinnamon|nutmeg|oregano|basil|thyme|rosemary|sage|garlic powder|onion powder|chili powder|cayenne/i,
    volumeUnit: 'tsp',
    weightUnit: 'oz',
    volumeThresholds: [
      { minMl: 0, unit: 'tsp' },
      { minMl: 15, unit: 'tbsp' }, // 1 tbsp = 15ml
    ],
  },
  // Sugar and flour - prefer cups
  {
    pattern: /sugar|flour|cornstarch|baking/i,
    volumeUnit: 'cup',
    weightUnit: 'oz',
  },
  // Cheese - prefer cups (shredded) or oz
  {
    pattern: /cheese/i,
    volumeUnit: 'cup',
    weightUnit: 'oz',
  },
  // Fresh herbs - prefer tbsp or cup
  {
    pattern: /parsley|cilantro|basil|mint|dill|chives/i,
    volumeUnit: 'tbsp',
    weightUnit: 'oz',
    volumeThresholds: [
      { minMl: 0, unit: 'tbsp' },
      { minMl: 59, unit: 'cup' }, // 0.25 cup
    ],
  },
];

/**
 * Select the optimal display unit based on ingredient type and quantity
 */
export function selectOptimalUnit(
  ingredientName: string,
  baseQuantity: number,
  category: UnitCategory
): MeasurementUnit {
  // Count units stay as-is
  if (category === 'count') {
    return 'each';
  }

  // Find matching preference
  const pref = PACKAGING_PREFERENCES.find((p) => p.pattern.test(ingredientName));

  if (category === 'volume') {
    const defaultUnit = pref?.volumeUnit || 'cup';
    const thresholds = pref?.volumeThresholds;

    if (thresholds && thresholds.length > 0) {
      // Find the highest threshold that we meet
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (baseQuantity >= thresholds[i].minMl) {
          return thresholds[i].unit;
        }
      }
    }

    // Default thresholds for volume if no preference
    if (!thresholds) {
      if (baseQuantity < 15) return 'tsp'; // < 1 tbsp
      if (baseQuantity < 59) return 'tbsp'; // < 0.25 cup
      return 'cup';
    }

    return defaultUnit;
  }

  if (category === 'weight') {
    const defaultUnit = pref?.weightUnit || 'oz';
    const thresholds = pref?.weightThresholds;

    if (thresholds && thresholds.length > 0) {
      // Find the highest threshold that we meet
      for (let i = thresholds.length - 1; i >= 0; i--) {
        if (baseQuantity >= thresholds[i].minG) {
          return thresholds[i].unit;
        }
      }
    }

    // Default thresholds for weight if no preference
    if (!thresholds) {
      if (baseQuantity < 227) return 'oz'; // < 0.5 lb
      return 'lb';
    }

    return defaultUnit;
  }

  return 'each';
}

/**
 * Generate alternate unit representations for a quantity
 */
export function generateAlternateUnits(
  quantity: number,
  unit: MeasurementUnit,
  category: UnitCategory
): ConvertedAmount[] {
  const alternates: ConvertedAmount[] = [];

  if (category === 'count') {
    return alternates;
  }

  // Define common units to show for each category
  const volumeUnits: MeasurementUnit[] = ['tsp', 'tbsp', 'cup', 'ml'];
  const weightUnits: MeasurementUnit[] = ['oz', 'lb', 'g'];

  const unitsToConvert = category === 'volume' ? volumeUnits : weightUnits;

  for (const targetUnit of unitsToConvert) {
    if (targetUnit === unit) continue;

    const converted = convertUnit(quantity, unit, targetUnit);
    if (converted !== null && converted > 0) {
      // Only include reasonable values
      if (converted >= 0.01 && converted < 10000) {
        alternates.push({
          quantity: roundToReasonablePrecision(converted),
          unit: targetUnit,
        });
      }
    }
  }

  return alternates;
}

/**
 * Round a quantity to reasonable precision for display
 */
export function roundToReasonablePrecision(value: number): number {
  if (value >= 100) {
    return Math.round(value);
  }
  if (value >= 10) {
    return Math.round(value * 10) / 10;
  }
  if (value >= 1) {
    return Math.round(value * 100) / 100;
  }
  // For small values, keep more precision
  return Math.round(value * 1000) / 1000;
}

/**
 * Aggregate multiple amounts of the same ingredient into a single display value
 * with alternate unit representations
 */
export function aggregateAmounts(
  amounts: Array<{
    quantity: number | null;
    unit: MeasurementUnit | null;
    recipeId: string;
    recipeName: string;
  }>,
  ingredientName: string
): AggregatedAmounts {
  // Track original amounts for transparency
  const originalAmounts: OriginalAmount[] = amounts.map((a) => ({
    quantity: a.quantity,
    unit: a.unit,
    recipeId: a.recipeId,
    recipeName: a.recipeName,
  }));

  // Filter to valid quantities
  const validAmounts = amounts.filter(
    (a) => a.quantity !== null && a.quantity > 0
  );

  if (validAmounts.length === 0) {
    return {
      displayQuantity: 0,
      displayUnit: 'each',
      alternateUnits: [],
      originalAmounts,
      isEstimated: false,
    };
  }

  // Group amounts by category
  const byCategory = new Map<
    UnitCategory,
    Array<{ quantity: number; unit: MeasurementUnit | null }>
  >();

  for (const amount of validAmounts) {
    const category = getUnitCategory(amount.unit);
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push({
      quantity: amount.quantity!,
      unit: amount.unit,
    });
  }

  // If all amounts are in the same category, aggregate them
  if (byCategory.size === 1) {
    const [[category, categoryAmounts]] = byCategory.entries();

    // For count units with same unit, just sum
    if (category === 'count') {
      const total = categoryAmounts.reduce((sum, a) => sum + a.quantity, 0);
      const unit = categoryAmounts[0].unit || 'each';
      return {
        displayQuantity: roundToReasonablePrecision(total),
        displayUnit: unit,
        alternateUnits: [],
        originalAmounts,
        isEstimated: false,
      };
    }

    // For volume/weight, convert to base unit, sum, then convert to optimal
    let totalBase = 0;
    for (const amount of categoryAmounts) {
      if (amount.unit) {
        const base = convertToBaseUnit(amount.quantity, amount.unit);
        if (base !== null) {
          totalBase += base;
        }
      }
    }

    const optimalUnit = selectOptimalUnit(ingredientName, totalBase, category);
    const displayQuantity = convertFromBaseUnit(totalBase, optimalUnit);

    if (displayQuantity !== null) {
      const alternates = generateAlternateUnits(
        displayQuantity,
        optimalUnit,
        category
      );

      return {
        displayQuantity: roundToReasonablePrecision(displayQuantity),
        displayUnit: optimalUnit,
        alternateUnits: alternates,
        originalAmounts,
        isEstimated: false,
      };
    }
  }

  // Multiple categories - needs cross-category estimation
  // For now, return the largest category's aggregate and mark for estimation
  const categories = Array.from(byCategory.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  const [primaryCategory, primaryAmounts] = categories[0];

  // Aggregate primary category
  if (primaryCategory === 'count') {
    const total = primaryAmounts.reduce((sum, a) => sum + a.quantity, 0);
    const unit = primaryAmounts[0].unit || 'each';
    return {
      displayQuantity: roundToReasonablePrecision(total),
      displayUnit: unit,
      alternateUnits: [],
      originalAmounts,
      isEstimated: false,
      needsAIEstimation: true,
    };
  }

  let totalBase = 0;
  for (const amount of primaryAmounts) {
    if (amount.unit) {
      const base = convertToBaseUnit(amount.quantity, amount.unit);
      if (base !== null) {
        totalBase += base;
      }
    }
  }

  const optimalUnit = selectOptimalUnit(
    ingredientName,
    totalBase,
    primaryCategory
  );
  const displayQuantity = convertFromBaseUnit(totalBase, optimalUnit);

  if (displayQuantity !== null) {
    return {
      displayQuantity: roundToReasonablePrecision(displayQuantity),
      displayUnit: optimalUnit,
      alternateUnits: generateAlternateUnits(
        displayQuantity,
        optimalUnit,
        primaryCategory
      ),
      originalAmounts,
      isEstimated: false,
      needsAIEstimation: byCategory.size > 1,
    };
  }

  // Fallback
  return {
    displayQuantity: validAmounts[0].quantity!,
    displayUnit: validAmounts[0].unit || 'each',
    alternateUnits: [],
    originalAmounts,
    isEstimated: false,
    needsAIEstimation: byCategory.size > 1,
  };
}

/**
 * Check if two units are compatible for conversion (same category)
 */
export function areUnitsCompatible(
  unit1: MeasurementUnit | null,
  unit2: MeasurementUnit | null
): boolean {
  return getUnitCategory(unit1) === getUnitCategory(unit2);
}

/**
 * Format a quantity and unit for display
 */
export function formatQuantityUnit(
  quantity: number | null,
  unit: MeasurementUnit | null
): string {
  if (quantity === null) {
    return unit ? UNIT_INFO[unit]?.name || unit : '';
  }

  const formattedQty = roundToReasonablePrecision(quantity);
  const unitInfo = unit ? UNIT_INFO[unit] : null;
  const unitStr = unitInfo?.abbreviation || unit || '';

  return unitStr ? `${formattedQty} ${unitStr}` : `${formattedQty}`;
}
