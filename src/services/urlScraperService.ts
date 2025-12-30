import type { ParsedRecipe, ParsedIngredient } from '@/types';

// Multiple CORS proxy options for fallback
const CORS_PROXIES = [
  {
    name: 'corsproxy.io',
    getUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: async (response: Response) => response.text(),
  },
  {
    name: 'allorigins',
    getUrl: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parseResponse: async (response: Response) => {
      const data = await response.json();
      return data.contents as string;
    },
  },
];

export interface UrlScrapeResult {
  success: boolean;
  recipe?: ParsedRecipe;
  rawText?: string; // For AI parsing fallback
  error?: string;
  usedSchemaOrg?: boolean;
}

export const urlScraperService = {
  /**
   * Fetch a URL through CORS proxies with fallback
   */
  async fetchUrl(url: string): Promise<{ success: boolean; html?: string; error?: string }> {
    const errors: string[] = [];

    for (const proxy of CORS_PROXIES) {
      try {
        const proxyUrl = proxy.getUrl(url);
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          errors.push(`${proxy.name}: ${response.status} ${response.statusText}`);
          continue;
        }

        const html = await proxy.parseResponse(response);
        if (html && html.length > 0) {
          return { success: true, html };
        }
        errors.push(`${proxy.name}: Empty response`);
      } catch (error) {
        errors.push(`${proxy.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      success: false,
      error: `Failed to fetch URL through all proxies. Errors: ${errors.join('; ')}`,
    };
  },

  /**
   * Extract schema.org/Recipe JSON-LD from HTML
   */
  extractSchemaOrgRecipe(html: string): ParsedRecipe | null {
    try {
      // Find all JSON-LD scripts
      const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
      let match;

      while ((match = jsonLdRegex.exec(html)) !== null) {
        try {
          const jsonContent = match[1].trim();
          const data = JSON.parse(jsonContent);

          // Handle array of schemas
          const schemas = Array.isArray(data) ? data : [data];

          for (const schema of schemas) {
            // Check if it's a Recipe or contains a Recipe
            const recipe = this.findRecipeInSchema(schema);
            if (recipe) {
              return this.convertSchemaOrgToRecipe(recipe);
            }
          }
        } catch {
          // Continue to next script tag if JSON parsing fails
          continue;
        }
      }

      return null;
    } catch {
      return null;
    }
  },

  /**
   * Recursively find Recipe schema in JSON-LD data
   */
  findRecipeInSchema(data: unknown): Record<string, unknown> | null {
    if (!data || typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;

    // Check if this is a Recipe
    if (obj['@type'] === 'Recipe' || obj['@type']?.toString().includes('Recipe')) {
      return obj;
    }

    // Check @graph array (common in structured data)
    if (Array.isArray(obj['@graph'])) {
      for (const item of obj['@graph']) {
        const recipe = this.findRecipeInSchema(item);
        if (recipe) return recipe;
      }
    }

    // Check nested objects
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        const recipe = this.findRecipeInSchema(obj[key]);
        if (recipe) return recipe;
      }
    }

    return null;
  },

  /**
   * Convert schema.org Recipe to our ParsedRecipe format
   */
  convertSchemaOrgToRecipe(schema: Record<string, unknown>): ParsedRecipe {
    const recipe: ParsedRecipe = {
      title: this.extractString(schema.name) || 'Untitled Recipe',
      description: this.extractString(schema.description) || undefined,
      ingredients: this.parseSchemaIngredients(schema.recipeIngredient),
      instructions: this.parseSchemaInstructions(schema.recipeInstructions),
      servings: this.parseServings(schema.recipeYield),
      prepTimeMinutes: this.parseIsoDuration(schema.prepTime),
      cookTimeMinutes: this.parseIsoDuration(schema.cookTime),
    };

    // Add notes if available
    const notes: string[] = [];
    if (schema.author) {
      const author = this.extractString(schema.author) ||
        (typeof schema.author === 'object' ? this.extractString((schema.author as Record<string, unknown>).name) : null);
      if (author) notes.push(`Author: ${author}`);
    }
    if (notes.length > 0) {
      recipe.notes = notes.join('\n');
    }

    return recipe;
  },

  /**
   * Parse schema.org recipeIngredient array
   */
  parseSchemaIngredients(ingredients: unknown): ParsedIngredient[] {
    if (!Array.isArray(ingredients)) return [];

    return ingredients
      .map((ing) => {
        const text = typeof ing === 'string' ? ing : this.extractString(ing);
        if (!text) return null;

        // Try to parse quantity and unit from ingredient text
        const parsed = this.parseIngredientText(text);
        return parsed;
      })
      .filter((ing): ing is ParsedIngredient => ing !== null);
  },

  /**
   * Parse a single ingredient text into structured format
   */
  parseIngredientText(text: string): ParsedIngredient {
    // Common patterns: "2 cups flour", "1/2 tsp salt", "3 large eggs"
    const quantityPattern = /^([\d\/\.\s]+)?\s*(tsp|tbsp|tablespoons?|teaspoons?|cups?|oz|ounces?|lb|pounds?|g|grams?|kg|ml|l|liters?|quarts?|pints?|gallons?|cloves?|slices?|cans?|packages?|bunch|pinch|dash|each|whole)?\s*(.+)$/i;

    const match = text.trim().match(quantityPattern);

    if (match) {
      const [, quantityStr, unit, name] = match;
      let quantity: number | null = null;

      if (quantityStr) {
        // Handle fractions like "1/2" or "1 1/2"
        const fractionMatch = quantityStr.trim().match(/^(\d+)?\s*(\d+)\/(\d+)$/);
        if (fractionMatch) {
          const [, whole, num, denom] = fractionMatch;
          quantity = (whole ? parseInt(whole) : 0) + parseInt(num) / parseInt(denom);
        } else {
          quantity = parseFloat(quantityStr.trim());
          if (isNaN(quantity)) quantity = null;
        }
      }

      return {
        name: name?.trim() || text.trim(),
        quantity,
        unit: unit?.toLowerCase() || null,
      };
    }

    return { name: text.trim() };
  },

  /**
   * Parse schema.org recipeInstructions
   */
  parseSchemaInstructions(instructions: unknown): string {
    if (!instructions) return '';

    // Handle string
    if (typeof instructions === 'string') {
      return instructions;
    }

    // Handle array
    if (Array.isArray(instructions)) {
      return instructions
        .map((step, index) => {
          if (typeof step === 'string') {
            return `${index + 1}. ${step}`;
          }
          if (typeof step === 'object' && step !== null) {
            const obj = step as Record<string, unknown>;
            // HowToStep or HowToSection
            const text = this.extractString(obj.text) || this.extractString(obj.name);
            if (text) {
              return `${index + 1}. ${text}`;
            }
            // Handle HowToSection with itemListElement
            if (Array.isArray(obj.itemListElement)) {
              return this.parseSchemaInstructions(obj.itemListElement);
            }
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
    }

    return '';
  },

  /**
   * Parse ISO 8601 duration to minutes
   */
  parseIsoDuration(duration: unknown): number | undefined {
    if (typeof duration !== 'string') return undefined;

    // Pattern: PT1H30M, PT45M, PT2H, etc.
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!match) return undefined;

    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;

    const total = hours * 60 + minutes;
    return total > 0 ? total : undefined;
  },

  /**
   * Parse recipe yield/servings
   */
  parseServings(yield_: unknown): number | undefined {
    if (typeof yield_ === 'number') return yield_;
    if (typeof yield_ === 'string') {
      const match = yield_.match(/(\d+)/);
      if (match) return parseInt(match[1]);
    }
    if (Array.isArray(yield_) && yield_.length > 0) {
      return this.parseServings(yield_[0]);
    }
    return undefined;
  },

  /**
   * Extract string from various schema.org formats
   */
  extractString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.name === 'string') return obj.name;
      if (typeof obj['@value'] === 'string') return obj['@value'];
    }
    return null;
  },

  /**
   * Extract plain text from HTML for AI parsing
   */
  extractTextFromHtml(html: string): string {
    // Remove scripts and styles
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML tags but keep content
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit text length for AI parsing
    if (text.length > 10000) {
      text = text.substring(0, 10000) + '...';
    }

    return text;
  },

  /**
   * Main method: scrape a recipe URL
   */
  async scrapeRecipeUrl(url: string): Promise<UrlScrapeResult> {
    // Validate URL
    try {
      new URL(url);
    } catch {
      return { success: false, error: 'Invalid URL format' };
    }

    // Fetch the page
    const fetchResult = await this.fetchUrl(url);
    if (!fetchResult.success || !fetchResult.html) {
      return {
        success: false,
        error: fetchResult.error || 'Failed to fetch URL',
      };
    }

    // Try to extract schema.org Recipe
    const schemaRecipe = this.extractSchemaOrgRecipe(fetchResult.html);
    if (schemaRecipe) {
      return {
        success: true,
        recipe: {
          ...schemaRecipe,
          sourceUrl: url,
        },
        usedSchemaOrg: true,
      };
    }

    // Fallback: extract text for AI parsing
    const rawText = this.extractTextFromHtml(fetchResult.html);
    return {
      success: true,
      rawText,
      usedSchemaOrg: false,
    };
  },
};
