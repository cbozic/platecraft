import type {
  RecipeSite,
  ProteinCategory,
  RecipeSearchResult,
  SiteScraperConfig
} from '@/types/bulkImport';
import type { NutritionInfo } from '@/types/recipe';

/**
 * Build a DuckDuckGo search URL to find recipes on a specific site
 * DuckDuckGo's HTML endpoint is more scraper-friendly than Google
 */
export function buildDuckDuckGoSearchUrl(site: RecipeSite, protein: ProteinCategory, lowFat: boolean = true): string {
  const siteMap: Record<RecipeSite, string> = {
    allrecipes: 'allrecipes.com',
    foodnetwork: 'foodnetwork.com',
    epicurious: 'epicurious.com',
  };

  const siteDomain = siteMap[site];
  const lowFatTerm = lowFat ? 'low fat ' : '';
  const query = `site:${siteDomain} ${lowFatTerm}${protein} recipes`;

  // Use DuckDuckGo's HTML-only endpoint which is more reliable for scraping
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

/**
 * Parse DuckDuckGo search results HTML to extract recipe URLs
 */
export function parseDuckDuckGoResults(
  html: string,
  site: RecipeSite,
  protein: ProteinCategory
): RecipeSearchResult[] {
  const results: RecipeSearchResult[] = [];
  const seenUrls = new Set<string>();

  console.log(`[DuckDuckGo Parser] Starting parse for ${site}/${protein}, HTML length: ${html.length}`);

  // DuckDuckGo HTML search results have links in <a class="result__a"> tags
  // The href contains a redirect URL with the actual URL encoded in it

  // Pattern 1: Look for result links with uddg parameter (DuckDuckGo's redirect format)
  const uddgPattern = /href="[^"]*uddg=([^&"]+)[^"]*"[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)</gi;
  let match;

  while ((match = uddgPattern.exec(html)) !== null) {
    try {
      const encodedUrl = match[1];
      const title = match[2].trim();
      const decodedUrl = decodeURIComponent(encodedUrl);

      // Filter to only include URLs from the target site
      if (!decodedUrl.includes(getSiteDomain(site))) continue;

      // Skip non-recipe URLs
      if (!isRecipeUrl(decodedUrl, site)) continue;

      if (seenUrls.has(decodedUrl)) continue;
      seenUrls.add(decodedUrl);

      results.push({
        url: decodedUrl,
        title: cleanTitle(title),
        rating: undefined,
        reviewCount: undefined,
        thumbnailUrl: undefined,
        site,
        proteinCategory: protein,
      });
    } catch {
      // Skip malformed URLs
    }
  }

  console.log(`[DuckDuckGo Parser] Found ${results.length} recipes from uddg pattern`);

  // Pattern 2: Look for direct links in result snippets (fallback)
  if (results.length < 5) {
    const siteUrlPatterns: Record<RecipeSite, RegExp> = {
      allrecipes: /https?:\/\/(?:www\.)?allrecipes\.com\/recipe\/(\d+)\/([a-z0-9-]+)/gi,
      foodnetwork: /https?:\/\/(?:www\.)?foodnetwork\.com\/recipes\/([^\/\s"]+)\/([a-z0-9-]+)/gi,
      epicurious: /https?:\/\/(?:www\.)?epicurious\.com\/recipes\/(?:food\/views\/)?([a-z0-9-]+)/gi,
    };

    const pattern = siteUrlPatterns[site];
    let urlMatch;

    while ((urlMatch = pattern.exec(html)) !== null) {
      const url = urlMatch[0];

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Extract title from URL
      const title = extractTitleFromUrl(url, site);

      results.push({
        url,
        title,
        rating: undefined,
        reviewCount: undefined,
        thumbnailUrl: undefined,
        site,
        proteinCategory: protein,
      });
    }

    console.log(`[DuckDuckGo Parser] After fallback pattern, total: ${results.length}`);
  }

  return results;
}

/**
 * Get the domain for a recipe site
 */
function getSiteDomain(site: RecipeSite): string {
  const domains: Record<RecipeSite, string> = {
    allrecipes: 'allrecipes.com',
    foodnetwork: 'foodnetwork.com',
    epicurious: 'epicurious.com',
  };
  return domains[site];
}

/**
 * Check if a URL is a recipe URL (not a category, search, or other page)
 */
function isRecipeUrl(url: string, site: RecipeSite): boolean {
  switch (site) {
    case 'allrecipes':
      return /allrecipes\.com\/recipe\/\d+/.test(url);
    case 'foodnetwork':
      return /foodnetwork\.com\/recipes\/[^\/]+\/[^\/]+/.test(url);
    case 'epicurious':
      return /epicurious\.com\/recipes\//.test(url);
    default:
      return false;
  }
}

/**
 * Extract a readable title from a recipe URL
 */
function extractTitleFromUrl(url: string, site: RecipeSite): string {
  let slug = '';

  switch (site) {
    case 'allrecipes': {
      const match = url.match(/\/recipe\/\d+\/([a-z0-9-]+)/i);
      slug = match ? match[1] : '';
      break;
    }
    case 'foodnetwork': {
      const match = url.match(/\/recipes\/[^\/]+\/([a-z0-9-]+)/i);
      slug = match ? match[1] : '';
      break;
    }
    case 'epicurious': {
      const match = url.match(/\/recipes\/(?:food\/views\/)?([a-z0-9-]+)/i);
      slug = match ? match[1] : '';
      break;
    }
  }

  // Convert slug to title
  return slug
    .replace(/-\d+$/, '') // Remove trailing numbers
    .replace(/-/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Recipe';
}

/**
 * Decode URL-encoded and HTML-encoded characters in text
 */
function decodeText(text: string): string {
  let decoded = text;

  // Decode URL-encoded characters (e.g., %27 -> ', %20 -> space)
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // If decodeURIComponent fails (malformed %), try to decode common ones manually
    decoded = decoded
      .replace(/%27/g, "'")
      .replace(/%22/g, '"')
      .replace(/%20/g, ' ')
      .replace(/%26/g, '&')
      .replace(/%3C/g, '<')
      .replace(/%3E/g, '>')
      .replace(/%2F/g, '/');
  }

  // Decode HTML entities
  decoded = decoded
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#8217;/g, "'") // Right single quote
    .replace(/&#8216;/g, "'") // Left single quote
    .replace(/&#8220;/g, '"') // Left double quote
    .replace(/&#8221;/g, '"') // Right double quote
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return decoded;
}

/**
 * Clean up a title from search results
 */
function cleanTitle(title: string): string {
  // First decode any encoded characters
  const decoded = decodeText(title);

  return decoded
    .replace(/\s*\|.*$/, '') // Remove "| Site Name" suffixes
    .replace(/\s*-\s*(?:AllRecipes|Food Network|Epicurious).*$/i, '')
    .trim();
}

/**
 * Build category page URL for a specific site and protein category
 * These are direct links to category/collection pages that are server-rendered
 */
export function buildCategoryUrl(site: RecipeSite, protein: ProteinCategory, lowFat: boolean = true): string {
  switch (site) {
    case 'allrecipes':
      // AllRecipes has good category pages with server-rendered content
      // Use protein-specific categories - low-fat filtering happens at import time
      const arCategoryMap: Record<ProteinCategory, string> = {
        chicken: 'https://www.allrecipes.com/recipes/201/meat-and-poultry/chicken/',
        beef: 'https://www.allrecipes.com/recipes/200/meat-and-poultry/beef/',
        pork: 'https://www.allrecipes.com/recipes/205/meat-and-poultry/pork/',
        vegetarian: 'https://www.allrecipes.com/recipes/87/everyday-cooking/vegetarian/',
      };
      // For low-fat, we use the healthy recipes section but note this won't be protein-specific
      if (lowFat) {
        // Add search parameter to filter for healthy recipes
        return arCategoryMap[protein] + '?sort=rating';
      }
      return arCategoryMap[protein];

    case 'foodnetwork':
      // Food Network search pages - these tend to have server-rendered content
      const fnSearchMap: Record<ProteinCategory, string> = {
        chicken: 'https://www.foodnetwork.com/search/chicken-',
        beef: 'https://www.foodnetwork.com/search/beef-',
        pork: 'https://www.foodnetwork.com/search/pork-',
        vegetarian: 'https://www.foodnetwork.com/search/vegetarian-',
      };
      return fnSearchMap[protein];

    case 'epicurious':
      // Epicurious search/ingredient pages
      const epiSearchMap: Record<ProteinCategory, string> = {
        chicken: 'https://www.epicurious.com/search/chicken',
        beef: 'https://www.epicurious.com/search/beef',
        pork: 'https://www.epicurious.com/search/pork',
        vegetarian: 'https://www.epicurious.com/search/vegetarian',
      };
      return epiSearchMap[protein];
  }
}

/**
 * Parse search results page HTML to extract recipe URLs, titles, and ratings
 */
export function parseSearchResultsPage(
  html: string,
  site: RecipeSite,
  protein: ProteinCategory
): RecipeSearchResult[] {
  switch (site) {
    case 'allrecipes':
      return parseAllRecipesSearchResults(html, protein);
    case 'foodnetwork':
      return parseFoodNetworkSearchResults(html, protein);
    case 'epicurious':
      return parseEpicuriousSearchResults(html, protein);
  }
}

/**
 * Parse AllRecipes category/gallery pages
 * Looks for recipe links in gallery and category pages, including embedded JSON data
 */
function parseAllRecipesSearchResults(
  html: string,
  protein: ProteinCategory
): RecipeSearchResult[] {
  const results: RecipeSearchResult[] = [];
  const seenUrls = new Set<string>();

  console.log(`[AllRecipes Parser] Starting parse for ${protein}, HTML length: ${html.length}`);

  // Strategy 1: Look for embedded JSON data (Apollo state, Next.js data, etc.)
  // AllRecipes often includes recipe data in script tags
  const jsonDataPatterns = [
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi,
    /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/i,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i,
  ];

  for (const pattern of jsonDataPatterns) {
    const matches = html.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      try {
        const jsonStr = match[1];
        if (jsonStr && jsonStr.length > 100) {
          // Look for recipe URLs within the JSON
          const recipeUrlMatches = jsonStr.matchAll(/allrecipes\.com\/recipe\/(\d+)\/([a-z0-9-]+)/gi);
          for (const urlMatch of recipeUrlMatches) {
            const recipeId = urlMatch[1];
            const recipeSlug = urlMatch[2];
            const url = `https://www.allrecipes.com/recipe/${recipeId}/${recipeSlug}/`;

            if (seenUrls.has(url)) continue;
            seenUrls.add(url);

            const title = recipeSlug
              .replace(/-/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            results.push({
              url,
              title,
              rating: undefined,
              reviewCount: undefined,
              thumbnailUrl: undefined,
              site: 'allrecipes',
              proteinCategory: protein,
            });
          }
        }
      } catch {
        // Continue if JSON parsing fails
      }
    }
  }

  console.log(`[AllRecipes Parser] Found ${results.length} recipes from embedded JSON`);

  // Strategy 2: Look for recipe URLs in HTML attributes and content
  // AllRecipes recipe URLs: https://www.allrecipes.com/recipe/12345/recipe-name/
  const urlPattern = /https?:\/\/(?:www\.)?allrecipes\.com\/recipe\/(\d+)\/([a-z0-9-]+)\/?/gi;
  let urlMatch;

  while ((urlMatch = urlPattern.exec(html)) !== null) {
    const recipeId = urlMatch[1];
    const recipeSlug = urlMatch[2];
    const url = `https://www.allrecipes.com/recipe/${recipeId}/${recipeSlug}/`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let title = recipeSlug
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Try to find better title near this URL
    const matchIndex = urlMatch.index;
    const surroundingHtml = html.substring(
      Math.max(0, matchIndex - 500),
      Math.min(html.length, matchIndex + 500)
    );

    const titlePatterns = [
      /title=["']([^"']+)["']/i,
      /alt=["']([^"']+)["']/i,
      /aria-label=["']([^"']+)["']/i,
    ];

    for (const pattern of titlePatterns) {
      const match = surroundingHtml.match(pattern);
      if (match && match[1]) {
        const foundTitle = match[1]
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
        if (foundTitle.length > 3 && foundTitle.length < 150) {
          title = foundTitle;
          break;
        }
      }
    }

    // Extract rating from surrounding context
    let rating: number | undefined;
    const ratingMatch = surroundingHtml.match(/"ratingValue"[:\s]*["']?(\d+(?:\.\d+)?)["']?/i);
    if (ratingMatch) {
      const ratingVal = parseFloat(ratingMatch[1]);
      if (ratingVal >= 0 && ratingVal <= 5) {
        rating = ratingVal;
      }
    }

    // Extract thumbnail
    let thumbnailUrl: string | undefined;
    const imgMatch = surroundingHtml.match(/src=["']([^"']+(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    if (imgMatch && imgMatch[1].startsWith('http')) {
      thumbnailUrl = imgMatch[1];
    }

    results.push({
      url,
      title,
      rating,
      reviewCount: undefined,
      thumbnailUrl,
      site: 'allrecipes',
      proteinCategory: protein,
    });
  }

  // Strategy 3: Look for data attributes containing recipe IDs
  const dataIdPattern = /data-(?:doc-id|content-id|recipe-id)=["'](\d+)["']/gi;
  let dataMatch;
  while ((dataMatch = dataIdPattern.exec(html)) !== null) {
    const recipeId = dataMatch[1];
    // Try to find the corresponding URL or slug
    const surroundingHtml = html.substring(
      Math.max(0, dataMatch.index - 1000),
      Math.min(html.length, dataMatch.index + 1000)
    );

    const slugMatch = surroundingHtml.match(/\/recipe\/\d+\/([a-z0-9-]+)/i);
    if (slugMatch) {
      const url = `https://www.allrecipes.com/recipe/${recipeId}/${slugMatch[1]}/`;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        const title = slugMatch[1]
          .replace(/-/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        results.push({
          url,
          title,
          rating: undefined,
          reviewCount: undefined,
          thumbnailUrl: undefined,
          site: 'allrecipes',
          proteinCategory: protein,
        });
      }
    }
  }

  console.log(`[AllRecipes Parser] Total recipes found: ${results.length}`);
  return results;
}

/**
 * Parse Food Network search results
 */
function parseFoodNetworkSearchResults(
  html: string,
  protein: ProteinCategory
): RecipeSearchResult[] {
  const results: RecipeSearchResult[] = [];
  const seenUrls = new Set<string>();

  console.log(`[Food Network Parser] Starting parse for ${protein}, HTML length: ${html.length}`);

  // Strategy 1: Look for embedded JSON data
  const jsonMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonMatches) {
    try {
      const jsonStr = match[1];
      // Look for recipe URLs in JSON
      const recipeUrlMatches = jsonStr.matchAll(/foodnetwork\.com\/recipes\/([^\/\s"']+)\/([a-z0-9-]+)/gi);
      for (const urlMatch of recipeUrlMatches) {
        const chefSlug = urlMatch[1];
        const recipeSlug = urlMatch[2];
        const url = `https://www.foodnetwork.com/recipes/${chefSlug}/${recipeSlug}`;

        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        const title = recipeSlug
          .replace(/-\d+$/, '')
          .replace(/-/g, ' ')
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        results.push({
          url,
          title,
          rating: undefined,
          reviewCount: undefined,
          thumbnailUrl: undefined,
          site: 'foodnetwork',
          proteinCategory: protein,
        });
      }
    } catch {
      // Continue on error
    }
  }

  console.log(`[Food Network Parser] Found ${results.length} recipes from JSON`);

  // Strategy 2: Look for Food Network recipe URLs anywhere in HTML
  const urlPattern = /https?:\/\/(?:www\.)?foodnetwork\.com\/recipes\/([^\/\s"']+)\/([a-z0-9-]+(?:-\d+)?)/gi;
  let urlMatch;

  while ((urlMatch = urlPattern.exec(html)) !== null) {
    const chefSlug = urlMatch[1];
    const recipeSlug = urlMatch[2];
    const url = `https://www.foodnetwork.com/recipes/${chefSlug}/${recipeSlug}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let title = recipeSlug
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Try to find better title
    const matchIndex = urlMatch.index;
    const surroundingHtml = html.substring(
      Math.max(0, matchIndex - 500),
      Math.min(html.length, matchIndex + 500)
    );

    const titleMatch = surroundingHtml.match(/(?:title|alt|aria-label)=["']([^"']{5,100})["']/i);
    if (titleMatch && !titleMatch[1].includes('http')) {
      title = titleMatch[1].replace(/&amp;/g, '&').trim();
    }

    results.push({
      url,
      title,
      rating: undefined,
      reviewCount: undefined,
      thumbnailUrl: undefined,
      site: 'foodnetwork',
      proteinCategory: protein,
    });
  }

  // Strategy 3: Look for href links with recipe paths
  const hrefPattern = /href=["'](\/recipes\/[^\/\s"']+\/[a-z0-9-]+(?:-\d+)?)["']/gi;
  let hrefMatch;

  while ((hrefMatch = hrefPattern.exec(html)) !== null) {
    const recipePath = hrefMatch[1];
    const url = `https://www.foodnetwork.com${recipePath}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const pathMatch = recipePath.match(/\/recipes\/[^\/]+\/([a-z0-9-]+)/i);
    const title = pathMatch
      ? pathMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Recipe';

    results.push({
      url,
      title,
      rating: undefined,
      reviewCount: undefined,
      thumbnailUrl: undefined,
      site: 'foodnetwork',
      proteinCategory: protein,
    });
  }

  console.log(`[Food Network Parser] Total recipes found: ${results.length}`);
  return results;
}

/**
 * Parse Epicurious search results
 */
function parseEpicuriousSearchResults(
  html: string,
  protein: ProteinCategory
): RecipeSearchResult[] {
  const results: RecipeSearchResult[] = [];
  const seenUrls = new Set<string>();

  console.log(`[Epicurious Parser] Starting parse for ${protein}, HTML length: ${html.length}`);

  // Strategy 1: Look for embedded JSON data (Next.js __NEXT_DATA__ or JSON-LD)
  const jsonPatterns = [
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  ];

  for (const pattern of jsonPatterns) {
    const matches = html.matchAll(new RegExp(pattern.source, 'gi'));
    for (const match of matches) {
      try {
        const jsonStr = match[1];
        // Look for recipe URLs in JSON
        const recipeUrlMatches = jsonStr.matchAll(/epicurious\.com\/recipes\/(?:food\/views\/)?([a-z0-9-]+(?:-\d+)?)/gi);
        for (const urlMatch of recipeUrlMatches) {
          const recipeSlug = urlMatch[1];
          const url = `https://www.epicurious.com/recipes/food/views/${recipeSlug}`;

          if (seenUrls.has(url)) continue;
          seenUrls.add(url);

          const title = recipeSlug
            .replace(/-\d+$/, '')
            .replace(/-/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          results.push({
            url,
            title,
            rating: undefined,
            reviewCount: undefined,
            thumbnailUrl: undefined,
            site: 'epicurious',
            proteinCategory: protein,
          });
        }
      } catch {
        // Continue on error
      }
    }
  }

  console.log(`[Epicurious Parser] Found ${results.length} recipes from JSON`);

  // Strategy 2: Look for Epicurious recipe URLs anywhere in HTML
  const urlPattern = /https?:\/\/(?:www\.)?epicurious\.com\/recipes\/(?:food\/views\/)?([a-z0-9-]+(?:-\d+)?)/gi;
  let urlMatch;

  while ((urlMatch = urlPattern.exec(html)) !== null) {
    const recipeSlug = urlMatch[1];
    const url = `https://www.epicurious.com/recipes/food/views/${recipeSlug}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let title = recipeSlug
      .replace(/-\d+$/, '')
      .replace(/-/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Try to find better title
    const matchIndex = urlMatch.index;
    const surroundingHtml = html.substring(
      Math.max(0, matchIndex - 500),
      Math.min(html.length, matchIndex + 500)
    );

    const titleMatch = surroundingHtml.match(/(?:title|alt|aria-label)=["']([^"']{5,100})["']/i);
    if (titleMatch && !titleMatch[1].includes('http')) {
      title = titleMatch[1].replace(/&amp;/g, '&').trim();
    }

    results.push({
      url,
      title,
      rating: undefined,
      reviewCount: undefined,
      thumbnailUrl: undefined,
      site: 'epicurious',
      proteinCategory: protein,
    });
  }

  // Strategy 3: Look for href links with recipe paths
  const hrefPattern = /href=["'](\/recipes\/(?:food\/views\/)?[a-z0-9-]+(?:-\d+)?)["']/gi;
  let hrefMatch;

  while ((hrefMatch = hrefPattern.exec(html)) !== null) {
    const recipePath = hrefMatch[1];
    const fullPath = recipePath.includes('/food/views/') ? recipePath : `/recipes/food/views/${recipePath.replace('/recipes/', '')}`;
    const url = `https://www.epicurious.com${fullPath}`;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const pathMatch = fullPath.match(/\/([a-z0-9-]+)(?:-\d+)?$/i);
    const title = pathMatch
      ? pathMatch[1].replace(/-\d+$/, '').replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'Recipe';

    results.push({
      url,
      title,
      rating: undefined,
      reviewCount: undefined,
      thumbnailUrl: undefined,
      site: 'epicurious',
      proteinCategory: protein,
    });
  }

  console.log(`[Epicurious Parser] Total recipes found: ${results.length}`);
  return results;
}

/**
 * Extract nutrition information from recipe page HTML
 * Checks schema.org first, then falls back to HTML parsing
 */
export function extractNutritionFromRecipePage(
  html: string,
  site: RecipeSite
): NutritionInfo | null {
  // First, try to extract from schema.org JSON-LD
  const schemaOrgNutrition = extractSchemaOrgNutrition(html);
  if (schemaOrgNutrition) {
    return schemaOrgNutrition;
  }

  // Fallback to site-specific HTML parsing
  switch (site) {
    case 'allrecipes':
      return parseAllRecipesNutrition(html);
    case 'foodnetwork':
      return parseFoodNetworkNutrition(html);
    case 'epicurious':
      return parseEpicuriousNutrition(html);
  }
}

/**
 * Extract nutrition from schema.org Recipe JSON-LD
 */
function extractSchemaOrgNutrition(html: string): NutritionInfo | null {
  try {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;

    while ((match = jsonLdRegex.exec(html)) !== null) {
      try {
        const jsonContent = match[1].trim();
        const data = JSON.parse(jsonContent);

        const schemas = Array.isArray(data) ? data : [data];

        for (const schema of schemas) {
          const nutrition = findNutritionInSchema(schema);
          if (nutrition) {
            return nutrition;
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Recursively find nutrition data in schema.org structure
 */
function findNutritionInSchema(data: unknown): NutritionInfo | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  // Check if this object has nutrition property
  if (obj.nutrition && typeof obj.nutrition === 'object') {
    return parseSchemaOrgNutrition(obj.nutrition as Record<string, unknown>);
  }

  // Check @graph array
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      const nutrition = findNutritionInSchema(item);
      if (nutrition) return nutrition;
    }
  }

  return null;
}

/**
 * Parse schema.org nutrition object to our NutritionInfo format
 */
function parseSchemaOrgNutrition(nutrition: Record<string, unknown>): NutritionInfo | null {
  try {
    const getValue = (key: string): number | undefined => {
      const value = nutrition[key];
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const match = value.match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : undefined;
      }
      return undefined;
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    const calories = getValue('calories');
    const protein = getValue('proteinContent');
    const carbs = getValue('carbohydrateContent');
    const fat = getValue('fatContent');
    const fiber = getValue('fiberContent');
    const sodium = getValue('sodiumContent');

    // Only return if we have at least calories
    if (calories === undefined) return null;

    return {
      calories,
      protein: protein ?? 0,
      carbohydrates: carbs ?? 0,
      fat: fat ?? 0,
      fiber: fiber ?? 0,
      sodium: sodium ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Parse AllRecipes nutrition facts from HTML
 */
function parseAllRecipesNutrition(html: string): NutritionInfo | null {
  // AllRecipes typically has nutrition in a table or structured div
  // Look for patterns like "Calories: 250" or "Protein 15g"
  const nutritionPattern = /(calories|protein|carbohydrate|fat|fiber|sodium)[:\s]+(\d+(?:\.\d+)?)\s*(g|mg)?/gi;

  const nutrition: Partial<NutritionInfo> = {};
  let match;

  while ((match = nutritionPattern.exec(html)) !== null) {
    const [, nutrient, value, _unit] = match;
    const numValue = parseFloat(value);

    switch (nutrient.toLowerCase()) {
      case 'calories':
        nutrition.calories = numValue;
        break;
      case 'protein':
        nutrition.protein = numValue;
        break;
      case 'carbohydrate':
        nutrition.carbohydrates = numValue;
        break;
      case 'fat':
        nutrition.fat = numValue;
        break;
      case 'fiber':
        nutrition.fiber = numValue;
        break;
      case 'sodium':
        nutrition.sodium = numValue;
        break;
    }
  }

  // Only return if we have calories
  if (nutrition.calories === undefined) return null;

  return {
    calories: nutrition.calories,
    protein: nutrition.protein ?? 0,
    carbohydrates: nutrition.carbohydrates ?? 0,
    fat: nutrition.fat ?? 0,
    fiber: nutrition.fiber ?? 0,
    sodium: nutrition.sodium ?? 0,
  };
}

/**
 * Parse Food Network nutrition facts from HTML
 */
function parseFoodNetworkNutrition(html: string): NutritionInfo | null {
  // Similar pattern to AllRecipes
  return parseAllRecipesNutrition(html);
}

/**
 * Parse Epicurious nutrition facts from HTML
 */
function parseEpicuriousNutrition(html: string): NutritionInfo | null {
  // Similar pattern to AllRecipes
  return parseAllRecipesNutrition(html);
}

/**
 * Sort recipe search results by rating (descending), then by review count
 */
export function sortByRating(results: RecipeSearchResult[]): RecipeSearchResult[] {
  return [...results].sort((a, b) => {
    // If both have ratings, sort by rating first
    if (a.rating !== undefined && b.rating !== undefined) {
      if (a.rating !== b.rating) {
        return b.rating - a.rating; // Higher rating first
      }
      // If ratings are equal, sort by review count
      if (a.reviewCount !== undefined && b.reviewCount !== undefined) {
        return b.reviewCount - a.reviewCount;
      }
      if (a.reviewCount !== undefined) return -1;
      if (b.reviewCount !== undefined) return 1;
    }

    // Items with ratings come before items without
    if (a.rating !== undefined) return -1;
    if (b.rating !== undefined) return 1;

    // If neither has rating, maintain original order
    return 0;
  });
}

/**
 * Site configuration objects
 */
export const SITE_CONFIGS: Record<RecipeSite, SiteScraperConfig> = {
  allrecipes: {
    name: 'allrecipes',
    displayName: 'AllRecipes',
    searchUrlBuilder: (protein) => buildCategoryUrl('allrecipes', protein),
    parseSearchResults: (html) => parseAllRecipesSearchResults(html, 'beef'), // protein is passed separately
    hasSchemaOrg: true,
  },
  foodnetwork: {
    name: 'foodnetwork',
    displayName: 'Food Network',
    searchUrlBuilder: (protein) => buildCategoryUrl('foodnetwork', protein),
    parseSearchResults: (html) => parseFoodNetworkSearchResults(html, 'beef'),
    hasSchemaOrg: true,
  },
  epicurious: {
    name: 'epicurious',
    displayName: 'Epicurious',
    searchUrlBuilder: (protein) => buildCategoryUrl('epicurious', protein),
    parseSearchResults: (html) => parseEpicuriousSearchResults(html, 'beef'),
    hasSchemaOrg: true,
  },
};
