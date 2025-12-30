export interface Tag {
  id: string;
  name: string;
  color?: string;
  isSystem: boolean; // System tags can't be deleted
  isHidden: boolean; // User can hide system tags
}

export const SYSTEM_TAGS: Omit<Tag, 'id'>[] = [
  { name: 'Quick Prep', isSystem: true, isHidden: false },
  { name: 'Slow Cooker', isSystem: true, isHidden: false },
  { name: 'Instant Pot', isSystem: true, isHidden: false },
  { name: 'One Pot', isSystem: true, isHidden: false },
  { name: 'Meal Prep Friendly', isSystem: true, isHidden: false },
  { name: 'Freezer Friendly', isSystem: true, isHidden: false },
  { name: 'Kid Friendly', isSystem: true, isHidden: false },
  { name: 'Vegetarian', isSystem: true, isHidden: false },
  { name: 'Vegan', isSystem: true, isHidden: false },
  { name: 'Gluten Free', isSystem: true, isHidden: false },
  { name: 'Dairy Free', isSystem: true, isHidden: false },
  { name: 'Low Carb', isSystem: true, isHidden: false },
  { name: 'High Protein', isSystem: true, isHidden: false },
  { name: 'Budget Friendly', isSystem: true, isHidden: false },
  { name: 'Holiday', isSystem: true, isHidden: false },
  { name: 'Breakfast', isSystem: true, isHidden: false },
  { name: 'Lunch', isSystem: true, isHidden: false },
  { name: 'Dinner', isSystem: true, isHidden: false },
  { name: 'Dessert', isSystem: true, isHidden: false },
  { name: 'Snack', isSystem: true, isHidden: false },
  { name: 'Appetizer', isSystem: true, isHidden: false },
  { name: 'Side Dish', isSystem: true, isHidden: false },
  { name: 'Beverage', isSystem: true, isHidden: false },
];
