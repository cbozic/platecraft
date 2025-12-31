# Platecraft - Requirements Specification

## Overview
**Platecraft** is a browser-based recipe management application built with TypeScript and React that allows users to catalog recipes, plan meals on a calendar, and generate shopping lists.

---

## 1. Technical Requirements

### 1.1 Technology Stack
- **Frontend**: TypeScript + React
- **Storage**: IndexedDB (browser-based, no backend)
- **Offline Support**: Service Worker/PWA for offline capability
- **External APIs**:
  - OCR service (Tesseract.js or cloud API) for recipe image scanning
  - Nutritional database API (USDA FoodData Central or Nutritionix)
  - Apple Calendar (via iCal URL import)

### 1.2 Device Support
- Fully responsive design (equal support for mobile and desktop)
- Touch-friendly interface for mobile/tablet use
- Keyboard navigation support for desktop

### 1.3 Data Persistence
- IndexedDB for all local data (recipes, meal plans, shopping lists, settings)
- Support for storing binary image data
- No server-side storage or user accounts (single-user, single-device)

---

## 2. Recipe Management

### 2.1 Recipe Data Model
Each recipe contains:
- **Title** (required)
- **Description** (optional)
- **Ingredient list** with quantities and units
- **Instructions** (multi-step, preserves formatting including newlines and spacing)
- **Notes** (free-form text, preserves formatting)
- **Tags** (predefined + custom)
- **Images/Photos** (multiple allowed, stored in IndexedDB)
- **Serving size** (base serving count)
- **Prep time** and **Cook time** (optional)
- **Source URL** (optional - for web recipes)
- **Source reference** (optional - for cookbook citations):
  - Cookbook name
  - Page number
  - Other reference (magazine, family recipe, etc.)
- **Nutritional information** per serving:
  - Calories
  - Protein (g)
  - Carbohydrates (g)
  - Fat (g)
  - Fiber (g)
  - Sodium (mg)
  - Additional custom nutrients (optional)
- **Created date** and **Last modified date**

### 2.2 Predefined Tags
System-provided tags (users cannot delete, but can hide):
- Quick Prep (< 15 min prep)
- Slow Cooker
- Instant Pot
- One Pot
- Meal Prep Friendly
- Freezer Friendly
- Kid Friendly
- Vegetarian
- Vegan
- Gluten Free
- Dairy Free
- Low Carb
- High Protein
- Budget Friendly
- Holiday
- Breakfast
- Lunch
- Dinner
- Dessert
- Snack
- Appetizer
- Side Dish
- Beverage

### 2.3 Custom Tags
- Users can create unlimited custom tags
- Custom tags can be edited or deleted
- Tags are displayed as filterable chips/badges

### 2.4 Recipe Organization
- Flat list with tag-based filtering (no folders/hierarchy)
- Search by title, ingredients, tags, or notes
- Sort by: name, date created, date modified, prep time, cook time
- Favorites/starred recipes

### 2.5 Serving Size Scaling
- Base serving size stored with recipe
- User can adjust desired servings
- All ingredient quantities automatically recalculate
- Scaled quantities display with original in parentheses

### 2.6 OCR Recipe Import
- Upload photo of recipe (cookbook page, recipe card, etc.)
- OCR extracts text using Tesseract.js or cloud API
- Parsed text presented in editable form
- User confirms/corrects before saving
- Original image optionally attached to recipe

### 2.7 Recipe Import Methods
Three methods for importing recipes into the system:

**Photo Import**:
- Upload image of recipe (cookbook page, recipe card, handwritten)
- OCR extracts text using Tesseract.js (client-side)
- AI parses extracted text into structured recipe fields
- Preview parsed recipe before saving, allowing manual corrections

**URL Import**:
- Paste URL from recipe website
- Attempt to extract schema.org/Recipe JSON-LD (preferred, no AI needed)
- Fallback: Use CORS proxy (allorigins.win) to fetch page content
- If proxy fails: Manual paste fallback available
- AI parses raw text into structured recipe if schema.org not found

**Text Paste Import**:
- Paste recipe text from any source (email, message, document)
- AI parses into structured recipe fields
- Supports various formats (ingredient lists, numbered steps, etc.)

All import methods show a preview/edit form before final save.

### 2.8 AI Integration for Recipe Parsing
Two modes for AI-powered recipe parsing:

**API Mode**:
- User provides their Anthropic API key in settings
- Key stored locally in browser (never sent to any server except Anthropic)
- Automatic parsing when importing recipes
- Rate limit handling with clear error messages

**Manual Paste Mode**:
- Available when API key not configured or as user preference
- App generates a formatted prompt with the raw recipe text
- User copies prompt to Claude chat (web/app)
- User copies Claude's JSON response back into app
- App parses JSON and populates preview form

AI is used for:
- Parsing ingredient quantities, units, and names
- Extracting prep and cook times
- Formatting instructions into clean steps
- Identifying recipe metadata (servings, description)

Manual mode always available as fallback if API is unavailable or rate limited.

---

## 3. Ingredient System

### 3.1 Ingredient Data Model
Each ingredient entry contains:
- **Name** (required)
- **Quantity** (numeric, supports fractions like "1/2")
- **Unit** (from supported units list)
- **Store section** (required - for shopping list grouping, e.g., Produce, Dairy, Meat & Seafood)
- **Optional flag** (marks ingredient as optional)

### 3.2 Unit Conversion
Supported unit systems: US Customary, Metric, UK Imperial

**Volume Units**:
| US | Metric | UK |
|---|---|---|
| teaspoon (tsp) | milliliter (ml) | - |
| tablespoon (tbsp) | - | - |
| fluid ounce (fl oz) | - | - |
| cup | liter (L) | - |
| pint (US) | - | pint (UK/Imperial) |
| quart | - | - |
| gallon (US) | - | gallon (UK/Imperial) |

**Weight Units**:
| US | Metric | UK |
|---|---|---|
| ounce (oz) | gram (g) | - |
| pound (lb) | kilogram (kg) | stone |

**Other Units**:
- each/whole
- slice
- clove
- bunch
- can
- package
- pinch
- dash
- to taste

### 3.3 Conversion Features
- Convert any recipe between US/Metric/UK systems
- Intelligent rounding (1.97 cups → 2 cups)
- Volume-to-weight conversion for common ingredients (flour, sugar, butter, etc.)
- User preference for default unit system

---

## 4. Nutritional Information

### 4.1 Data Entry Methods
1. **Automatic lookup**: Search ingredient database (USDA/Nutritionix API)
   - Per-ingredient nutritional data
   - Auto-calculate recipe totals
2. **Manual entry**: User enters values directly
3. **Hybrid**: Auto-suggested values with manual override

### 4.2 Display
- Nutrition facts panel (FDA-style format)
- Per-serving and per-recipe totals
- Percentage of daily values (based on 2000 cal diet, configurable)

---

## 5. Calendar & Meal Planning

### 5.1 Calendar Views
- **Month view**: Overview of all planned meals
- **Week view**: Detailed daily breakdown
- Both views printable

### 5.2 Meal Planning
- Drag-and-drop recipes onto calendar dates
- Drag-and-drop to move meals between slots and days
- Multiple meals per day (breakfast, lunch, dinner, snacks)
- Meal slots are customizable (user can add/rename slots)
- **Meal notes**: Add notes when planning a meal (e.g., "marinate overnight", "double the sauce")
- **Meal extras**: Add side dishes/extras when planning a meal (e.g., "green beans", "dinner rolls")
  - Extras are added to shopping list when generating
  - Each extra has a name and store section
- Copy meals between days
- Recurring meal plans (e.g., "Taco Tuesday" every week)
- Notes on specific days (not tied to recipes)

### 5.3 External Calendar Integration
**Calendar Integration**:
- Read-only access to user's calendars
- iCal URL import (paste shareable calendar link)
- iCal file import (.ics files from local computer)
  - Smart deduplication when re-importing updated files (by event UID)
  - Option to update existing calendar or create new one
- Display events alongside meal plans
- User selects which calendars to show
- Periodic refresh of iCal URL data
- Display external events alongside meal plans

**Meal Export**:
- Export planned meals to .ics file for import into other calendar apps

### 5.4 Calendar Display
- Meal plans shown prominently
- **Month view**: Shows meal names (truncated) with color indicator dots
- **Week view**: Shows full meal cards with recipe title and actions
- External calendar events shown in secondary style
- Color coding for different meal types
- Visual indicator for days with shopping needs
- Print-friendly layout for both views

### 5.5 Meal Plan Assistant (Intelligent Planning)
Four-step wizard for intelligent meal planning based on available ingredients:

**Step 1 - Ingredients Input**:
- List ingredients currently on hand
- Simple text input with add/remove capability
- Used for recipe matching in later steps

**Step 2 - Day Rules**:
- Set tag preferences for specific days (e.g., "Taco Tuesday")
- Select from existing recipe tags
- Optional - can skip for fully automatic suggestions

**Step 3 - Date Range & Slots**:
- Select week to plan
- Choose which meal slots to fill (Breakfast, Lunch, Dinner, etc.)
- Preview calendar for selected dates

**Step 4 - Preview & Approval**:
- Review AI-suggested meal plan
- See ingredient coverage statistics
- Swap individual meals with alternatives
- Lock preferred meals to prevent changes
- Reject meals to remove from plan
- Apply approved plan to calendar

**Algorithm Features**:
- Fuzzy string matching (Levenshtein distance) for ingredient matching
- Unit conversion for quantity tracking
- Tag-based recipe filtering for day rules
- Fallback to random selection when no matches
- Tracks ingredient usage across multiple recipes

---

## 6. Shopping List

### 6.1 List Generation
- Select date range (e.g., "next 7 days")
- Automatically aggregate ingredients from all planned recipes
- **Include meal extras**: Side dishes/extras added to meals are included in the shopping list
- **Smart combining**: Merge same ingredients across recipes
  - "2 eggs" + "3 eggs" = "5 eggs"
  - Handles unit conversion when combining
  - Groups by ingredient name, shows source recipes

### 6.2 List Organization
- Group by store aisle/section:
  - Produce
  - Dairy
  - Meat & Seafood
  - Bakery
  - Frozen
  - Canned Goods
  - Dry Goods & Pasta
  - Condiments & Sauces
  - Snacks
  - Beverages
  - Household (non-food)
  - Other
- Custom sections allowed
- Drag to reorder sections

### 6.3 Manual Items
- Add items not from recipes
- Assign to any section
- Set quantity and unit (optional)
- Recurring items (auto-add to every list)

### 6.4 List Interaction
- Check off items as acquired
- Checked items move to bottom or hide
- Uncheck all / clear checked
- Edit quantities inline
- Delete items
- Add notes to items

### 6.5 Multiple Lists
- Save shopping lists with names
- View history of past lists
- Duplicate list as starting point

### 6.6 Print Support
- Print-optimized layout
- Compact format for paper
- Checkboxes for manual marking

---

## 7. Import/Export

### 7.1 Export
- Export all data as single JSON file
- **Format preservation**: Maintain exact spacing, newlines, and formatting in instructions/notes
- Include all: recipes, tags, meal plans, shopping lists, settings
- Export individual recipes as JSON
- Export shopping list as plain text or JSON

### 7.2 Import
- Import from JSON (full backup or individual recipes)
- Merge or replace options when importing
- Validation with error reporting
- **Format preservation**: Restore exact formatting from import

### 7.3 JSON Structure
```json
{
  "version": "1.0",
  "exportDate": "ISO-8601 timestamp",
  "recipes": [...],
  "customTags": [...],
  "mealPlans": [...],
  "shoppingLists": [...],
  "settings": {...}
}
```

---

## 8. Print Functionality

### 8.1 Printable Views
- Individual recipe (full page format)
- Recipe card (compact, multiple per page)
- Calendar month view
- Calendar week view
- Shopping list
- **Recipes by date range**: Print full recipes for all planned meals within a selected date range
  - Grouped by day with date headers
  - Sorted by meal slot order (Breakfast, Lunch, Dinner, etc.)
  - Ingredients scaled to planned serving sizes
  - Includes recipe instructions and notes

### 8.2 Print Options
- Include/exclude images
- Include/exclude nutritional info
- Font size adjustment
- Paper size selection (Letter, A4)

---

## 9. User Interface

### 9.1 Main Navigation
- Recipes (browse/search)
- Add Recipe
- Import Recipe (Photo/URL/Text)
- Calendar (meal planning)
- Shopping List
- Settings

### 9.2 Recipe Views
- Grid view (card with image thumbnails)
- List view (compact rows)
- Detail view (full recipe display)
- Edit mode

### 9.3 Search & Filter
- Global search bar
- Filter panel:
  - By tags (multi-select)
  - By prep time range
  - By cook time range
  - Has image (yes/no)
  - Has nutritional info (yes/no)

### 9.4 Settings
- Default unit system (US/Metric/UK)
- Default serving size
- Theme (light/dark/system)
- Calendar start day (Sunday/Monday)
- Default meal slots
- Manage custom tags
- Manage store sections
- External calendar connections
- Data management (import/export/clear)
- **Recipe Import Settings**:
  - Anthropic API key (stored locally, masked display)
  - Preferred import method (API or Manual paste)

---

## 10. Offline Capability

### 10.1 PWA Features
- Service Worker for offline access
- Installable as app (Add to Home Screen)
- All core features work offline
- Background sync when connection restored

### 10.2 External Service Handling
- OCR: Queue requests when offline, process when online
- Nutritional lookup: Cache results, show cached data offline
- Calendar sync: Show last-synced data, refresh when online
- Clear offline/online status indicator

---

## 11. Accessibility

### 11.1 Requirements
- WCAG 2.1 AA compliance
- Keyboard navigation throughout
- Screen reader compatible
- Sufficient color contrast
- Focus indicators
- Alt text for images
- Resizable text (up to 200%)

---

## 12. Future Considerations (Out of Scope for v1)

These features are explicitly NOT included in initial requirements:
- Multi-user / family sharing
- Backend / cloud sync
- Social features (sharing recipes publicly)
- Meal prep instructions generator
- Grocery store integration (pricing, availability)
- Voice commands
- Integration with smart home devices
- Recipe recommendations / suggestions

---

## Appendix: User Flow Diagrams

### A. Adding a Recipe
1. Click "Add Recipe"
2. Choose: Manual entry OR OCR from image
3. If OCR: Upload image -> Review extracted text -> Edit as needed
4. Enter/confirm: Title, ingredients, instructions, notes
5. Add tags, images, nutritional info
6. Save recipe

### B. Planning a Meal
1. Navigate to Calendar
2. Select date (month or week view)
3. Click meal slot (breakfast/lunch/dinner/etc.)
4. Search or browse recipes
5. Select recipe -> Added to calendar
6. Repeat for desired days

### C. Generating Shopping List
1. Navigate to Shopping List
2. Select date range (e.g., "This week")
3. System aggregates ingredients from planned meals
4. Review combined list, organized by store section
5. Add any manual items
6. Print or use on mobile while shopping
7. Check off items as acquired

---

## Implementation Status

### Completed
- [x] Project scaffolding (Vite + React + TypeScript)
- [x] IndexedDB setup with Dexie.js
- [x] Type definitions for all data models
- [x] Base UI components (Button, Input, Card, Modal)
- [x] Calendar components (CalendarGrid, WeekView, DayCell, RecipePicker)
- [x] useCalendar hook for calendar state management
- [x] Shopping list components (DateRangePicker, ShoppingListDetail, ShoppingItemRow, AddItemModal)
- [x] useShoppingList hook for shopping list state management
- [x] Shopping list generation from meal plans (including meal extras)
- [x] Tag management (create, edit, delete custom tags; hide system tags)
- [x] Import/Export functionality with merge/replace modes
- [x] Clear all data functionality
- [x] PWA configuration with service worker
- [x] Drag-and-drop to move meals between slots and days
- [x] Month view shows meal names (not just dots)
- [x] Print-optimized calendar styles
- [x] Recipe form (add/edit recipes) with store section per ingredient
- [x] Recipe detail view with source information display
- [x] Meal notes when adding to calendar
- [x] Meal extras (side dishes) when adding to calendar
- [x] Notes/extras indicator on calendar meal cards
- [x] Recipe source reference fields (cookbook, page, other)

### In Progress / Remaining
- All core features completed!

### Recently Completed
- [x] Recipe search and filtering (full-text search, multi-tag, favorites, prep/cook time, servings)
- [x] Favorites/starred recipes with toggle and filtering
- [x] Meal slot customization in settings
- [x] iCal URL subscription import
- [x] iCal file import (.ics) with deduplication
- [x] Export meals to .ics file
- [x] Unit system support (US/Metric/UK) with smart formatting
- [x] Recipe scaling with fraction display (½, ⅔, etc.)
- [x] Print recipes by date range (with scaled ingredients)
- [x] Meal Plan Assistant (4-step wizard with ingredient matching and day rules)
- [x] Nutritional information lookup (USDA FoodData Central API integration)
- [x] Nutrition facts display on recipe detail page (FDA-style panel)
- [x] Manual nutrition entry in recipe form
- [x] Daily calorie goal setting
- [x] Calculate nutrition from ingredients (auto-sum ingredient nutrition with weight estimation)

**Recipe Import (COMPLETED)**:
- [x] Import types and settings (API key storage with masked display)
- [x] Import page with Photo/URL/Text tabs
- [x] Text paste import with AI parsing
- [x] Manual paste flow (copy prompt to Claude, paste response back)
- [x] API integration (Claude Sonnet via Anthropic API)
- [x] URL import with schema.org parsing + CORS proxy fallback
- [x] Photo import with Tesseract.js OCR + vision mode fallback

---

*Requirements Version: 1.9*
*Last Updated: December 31, 2025*
