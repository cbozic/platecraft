export interface Tag {
  id: string; // UUID for Dexie primary key
  name: string; // Unique identifier used throughout the app (case-insensitive)
  color?: string;
}

// Helper to create a tag with auto-generated ID
export function createTag(name: string, color?: string): Tag {
  return {
    id: crypto.randomUUID(),
    name,
    color,
  };
}

// Default tags prepopulated on first run
// Users can edit or delete any of these
export const DEFAULT_TAGS: Tag[] = [
  { id: 'default-quick-prep', name: 'Quick Prep' },
  { id: 'default-slow-cooker', name: 'Slow Cooker' },
  { id: 'default-instant-pot', name: 'Instant Pot' },
  { id: 'default-one-pot', name: 'One Pot' },
  { id: 'default-meal-prep', name: 'Meal Prep Friendly' },
  { id: 'default-freezer', name: 'Freezer Friendly' },
  { id: 'default-kid-friendly', name: 'Kid Friendly' },
  { id: 'default-vegetarian', name: 'Vegetarian' },
  { id: 'default-vegan', name: 'Vegan' },
  { id: 'default-gluten-free', name: 'Gluten Free' },
  { id: 'default-dairy-free', name: 'Dairy Free' },
  { id: 'default-low-carb', name: 'Low Carb' },
  { id: 'default-high-protein', name: 'High Protein' },
  { id: 'default-budget', name: 'Budget Friendly' },
  { id: 'default-holiday', name: 'Holiday' },
  { id: 'default-breakfast', name: 'Breakfast' },
  { id: 'default-lunch', name: 'Lunch' },
  { id: 'default-dinner', name: 'Dinner' },
  { id: 'default-dessert', name: 'Dessert' },
  { id: 'default-snack', name: 'Snack' },
  { id: 'default-appetizer', name: 'Appetizer' },
  { id: 'default-side-dish', name: 'Side Dish' },
  { id: 'default-beverage', name: 'Beverage' },
];

// Legacy type for backwards compatibility during import
export interface LegacyTag {
  id: string;
  name: string;
  color?: string;
  isSystem: boolean;
  isHidden: boolean;
}
