// Unit types for ingredient measurements

export type VolumeUnitUS = 'tsp' | 'tbsp' | 'fl_oz' | 'cup' | 'pint_us' | 'quart' | 'gallon_us';
export type VolumeUnitMetric = 'ml' | 'l';
export type VolumeUnitUK = 'pint_uk' | 'gallon_uk';
export type VolumeUnit = VolumeUnitUS | VolumeUnitMetric | VolumeUnitUK;

export type WeightUnitUS = 'oz' | 'lb';
export type WeightUnitMetric = 'g' | 'kg';
export type WeightUnitUK = 'stone';
export type WeightUnit = WeightUnitUS | WeightUnitMetric | WeightUnitUK;

export type CountUnit = 'each' | 'slice' | 'clove' | 'bunch' | 'can' | 'package' | 'pinch' | 'dash' | 'to_taste';

export type MeasurementUnit = VolumeUnit | WeightUnit | CountUnit;

export type UnitSystem = 'us' | 'metric' | 'uk';

export interface UnitInfo {
  unit: MeasurementUnit;
  name: string;
  abbreviation: string;
  type: 'volume' | 'weight' | 'count';
  system: UnitSystem | 'universal';
  baseUnitFactor?: number; // Factor to convert to base unit (ml for volume, g for weight)
}

export const UNIT_INFO: Record<MeasurementUnit, UnitInfo> = {
  // Volume - US
  tsp: { unit: 'tsp', name: 'teaspoon', abbreviation: 'tsp', type: 'volume', system: 'us', baseUnitFactor: 4.929 },
  tbsp: { unit: 'tbsp', name: 'tablespoon', abbreviation: 'tbsp', type: 'volume', system: 'us', baseUnitFactor: 14.787 },
  fl_oz: { unit: 'fl_oz', name: 'fluid ounce', abbreviation: 'fl oz', type: 'volume', system: 'us', baseUnitFactor: 29.574 },
  cup: { unit: 'cup', name: 'cup', abbreviation: 'cup', type: 'volume', system: 'us', baseUnitFactor: 236.588 },
  pint_us: { unit: 'pint_us', name: 'pint (US)', abbreviation: 'pt', type: 'volume', system: 'us', baseUnitFactor: 473.176 },
  quart: { unit: 'quart', name: 'quart', abbreviation: 'qt', type: 'volume', system: 'us', baseUnitFactor: 946.353 },
  gallon_us: { unit: 'gallon_us', name: 'gallon (US)', abbreviation: 'gal', type: 'volume', system: 'us', baseUnitFactor: 3785.41 },

  // Volume - Metric
  ml: { unit: 'ml', name: 'milliliter', abbreviation: 'ml', type: 'volume', system: 'metric', baseUnitFactor: 1 },
  l: { unit: 'l', name: 'liter', abbreviation: 'L', type: 'volume', system: 'metric', baseUnitFactor: 1000 },

  // Volume - UK
  pint_uk: { unit: 'pint_uk', name: 'pint (UK)', abbreviation: 'pt', type: 'volume', system: 'uk', baseUnitFactor: 568.261 },
  gallon_uk: { unit: 'gallon_uk', name: 'gallon (UK)', abbreviation: 'gal', type: 'volume', system: 'uk', baseUnitFactor: 4546.09 },

  // Weight - US
  oz: { unit: 'oz', name: 'ounce', abbreviation: 'oz', type: 'weight', system: 'us', baseUnitFactor: 28.3495 },
  lb: { unit: 'lb', name: 'pound', abbreviation: 'lb', type: 'weight', system: 'us', baseUnitFactor: 453.592 },

  // Weight - Metric
  g: { unit: 'g', name: 'gram', abbreviation: 'g', type: 'weight', system: 'metric', baseUnitFactor: 1 },
  kg: { unit: 'kg', name: 'kilogram', abbreviation: 'kg', type: 'weight', system: 'metric', baseUnitFactor: 1000 },

  // Weight - UK
  stone: { unit: 'stone', name: 'stone', abbreviation: 'st', type: 'weight', system: 'uk', baseUnitFactor: 6350.29 },

  // Count units (universal)
  each: { unit: 'each', name: 'each', abbreviation: '', type: 'count', system: 'universal' },
  slice: { unit: 'slice', name: 'slice', abbreviation: 'slice', type: 'count', system: 'universal' },
  clove: { unit: 'clove', name: 'clove', abbreviation: 'clove', type: 'count', system: 'universal' },
  bunch: { unit: 'bunch', name: 'bunch', abbreviation: 'bunch', type: 'count', system: 'universal' },
  can: { unit: 'can', name: 'can', abbreviation: 'can', type: 'count', system: 'universal' },
  package: { unit: 'package', name: 'package', abbreviation: 'pkg', type: 'count', system: 'universal' },
  pinch: { unit: 'pinch', name: 'pinch', abbreviation: 'pinch', type: 'count', system: 'universal' },
  dash: { unit: 'dash', name: 'dash', abbreviation: 'dash', type: 'count', system: 'universal' },
  to_taste: { unit: 'to_taste', name: 'to taste', abbreviation: 'to taste', type: 'count', system: 'universal' },
};
