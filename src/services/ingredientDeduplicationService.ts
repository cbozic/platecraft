import { settingsRepository } from '@/db';
import { ingredientMappingRepository } from '@/db/repositories';
import type { PendingIngredientMatch, IngredientMapping, MeasurementUnit, RefinedIngredientGroup } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { UNIT_INFO } from '@/types/units';
import {
  getUnitCategory,
  convertToBaseUnit,
  roundToReasonablePrecision,
  type UnitCategory,
} from '@/utils/unitConversion';
import {
  GRAMS_PER_EACH,
  GRAMS_PER_CUP,
  findBestWeightMatch,
} from '@/utils/ingredientWeights';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CONFIDENCE_THRESHOLD = 0.7;

// Ingredient info for deduplication
interface IngredientInfo {
  name: string;
  recipeId: string;
  recipeName: string;
  quantity: number | null;
  unit: MeasurementUnit | null;
}

// Result from deduplication
interface DeduplicationResult {
  canonicalName: string;
  originalNames: string[];
}

const INGREDIENT_MATCHING_PROMPT = `Analyze this list of ingredients from multiple recipes and identify which ones are likely the same ingredient with different names or descriptions.

Ingredients:
{ingredientList}

For each group of equivalent ingredients, return:
1. The ingredient names that should be merged
2. A suggested canonical (standard) name to use
3. A confidence score (0-1) for how certain you are they're the same

IMPORTANT RULES:
- Only group ingredients that are truly the same item
- "chicken breast" and "chicken thighs" are DIFFERENT ingredients - do NOT merge
- "garlic" and "garlic cloves" ARE the same - merge them
- "boneless skinless chicken breast" and "chicken breast" ARE the same - merge them
- Consider that different quantities/preparations don't make ingredients different
- If units are incompatible (e.g., "1 cup shredded cheese" vs "8 oz block cheese"), still merge if same ingredient
- Be conservative - when in doubt, don't merge

Return ONLY valid JSON with no markdown code blocks:
{
  "matches": [
    {
      "ingredientNames": ["boneless, skinless chicken breast", "chicken breast"],
      "suggestedCanonicalName": "chicken breast",
      "confidence": 0.95
    }
  ]
}

If no ingredients should be merged, return: {"matches": []}`;

export const ingredientDeduplicationService = {
  /**
   * Check if AI deduplication is available (API key configured)
   */
  async isAIAvailable(): Promise<boolean> {
    return settingsRepository.hasAnthropicApiKey();
  },

  /**
   * Get all confirmed ingredient mappings as a lookup map
   * Returns Map<lowerCaseName, canonicalName>
   */
  async getMappingsMap(): Promise<Map<string, string>> {
    return ingredientMappingRepository.getMappingsMap();
  },

  /**
   * Find canonical name for an ingredient using saved mappings
   */
  async findCanonicalName(ingredientName: string): Promise<string | null> {
    return ingredientMappingRepository.findCanonicalName(ingredientName);
  },

  /**
   * Apply saved mappings to a list of ingredients
   * Returns the canonical name for each ingredient, or original name if no mapping
   */
  async applyMappings(
    ingredients: IngredientInfo[]
  ): Promise<{ deduped: DeduplicationResult[]; unmapped: IngredientInfo[] }> {
    const mappingsMap = await this.getMappingsMap();
    const deduped: DeduplicationResult[] = [];
    const unmapped: IngredientInfo[] = [];
    const seenCanonical = new Map<string, Set<string>>();

    for (const ing of ingredients) {
      const lowerName = ing.name.toLowerCase();
      const canonical = mappingsMap.get(lowerName);

      if (canonical) {
        // This ingredient has a known mapping
        const canonicalLower = canonical.toLowerCase();
        if (!seenCanonical.has(canonicalLower)) {
          seenCanonical.set(canonicalLower, new Set());
        }
        seenCanonical.get(canonicalLower)!.add(ing.name);
      } else {
        // No mapping found
        unmapped.push(ing);
      }
    }

    // Build deduplication results
    for (const [canonicalLower, originalNames] of seenCanonical) {
      const canonical = mappingsMap.get(canonicalLower) || canonicalLower;
      deduped.push({
        canonicalName: canonical,
        originalNames: Array.from(originalNames),
      });
    }

    return { deduped, unmapped };
  },

  /**
   * Use AI to identify potential ingredient matches
   * Returns pending matches for user confirmation
   * @param ingredients - List of ingredients to analyze
   * @param signal - Optional AbortSignal to cancel the request
   */
  async identifyPotentialMatches(
    ingredients: IngredientInfo[],
    signal?: AbortSignal
  ): Promise<{ matches: PendingIngredientMatch[]; error?: string; cancelled?: boolean }> {
    const apiKey = await settingsRepository.getAnthropicApiKey();

    if (!apiKey) {
      return { matches: [], error: 'No API key configured' };
    }

    // Get unique ingredient names with their recipe info
    const uniqueNames = new Map<string, IngredientInfo[]>();
    for (const ing of ingredients) {
      const lower = ing.name.toLowerCase();
      if (!uniqueNames.has(lower)) {
        uniqueNames.set(lower, []);
      }
      uniqueNames.get(lower)!.push(ing);
    }

    // If only one unique ingredient, nothing to match
    if (uniqueNames.size < 2) {
      return { matches: [] };
    }

    // Build the ingredient list for the prompt
    const ingredientList = Array.from(uniqueNames.keys())
      .map((name) => `- ${name}`)
      .join('\n');

    const prompt = INGREDIENT_MATCHING_PROMPT.replace('{ingredientList}', ingredientList);

    try {
      // Check if already aborted
      if (signal?.aborted) {
        return { matches: [], cancelled: true };
      }

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
        signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `API request failed: ${response.status}`;

        if (response.status === 401) {
          return { matches: [], error: 'Invalid API key' };
        }

        if (response.status === 429) {
          return { matches: [], error: 'Rate limit exceeded' };
        }

        return { matches: [], error: errorMessage };
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return { matches: [], error: 'No response from API' };
      }

      // Parse the JSON response
      const parsed = this.parseAIResponse(content);
      if (!parsed) {
        return { matches: [], error: 'Failed to parse AI response' };
      }

      // Convert to PendingIngredientMatch format
      const pendingMatches: PendingIngredientMatch[] = [];
      for (const match of parsed.matches) {
        // Filter to only high-confidence matches
        if (match.confidence < CONFIDENCE_THRESHOLD) {
          continue;
        }

        // Build affected recipes list
        const affectedRecipes: PendingIngredientMatch['affectedRecipes'] = [];
        for (const name of match.ingredientNames) {
          const infos = uniqueNames.get(name.toLowerCase()) || [];
          for (const info of infos) {
            affectedRecipes.push({
              recipeId: info.recipeId,
              recipeName: info.recipeName,
              ingredientName: info.name,
            });
          }
        }

        if (affectedRecipes.length > 0) {
          pendingMatches.push({
            id: uuidv4(),
            ingredientNames: match.ingredientNames,
            suggestedCanonicalName: match.suggestedCanonicalName,
            confidence: match.confidence,
            affectedRecipes,
          });
        }
      }

      return { matches: pendingMatches };
    } catch (error) {
      // Check if the request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        return { matches: [], cancelled: true };
      }
      return {
        matches: [],
        error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  /**
   * Parse the AI response JSON
   */
  parseAIResponse(
    content: string
  ): { matches: Array<{ ingredientNames: string[]; suggestedCanonicalName: string; confidence: number }> } | null {
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      // Validate structure
      if (!parsed.matches || !Array.isArray(parsed.matches)) {
        return { matches: [] };
      }

      // Validate each match
      const validMatches = parsed.matches.filter(
        (m: unknown) =>
          m &&
          typeof m === 'object' &&
          Array.isArray((m as Record<string, unknown>).ingredientNames) &&
          typeof (m as Record<string, unknown>).suggestedCanonicalName === 'string' &&
          typeof (m as Record<string, unknown>).confidence === 'number'
      );

      return { matches: validMatches };
    } catch {
      return null;
    }
  },

  /**
   * Confirm a pending match and save to database
   */
  async confirmMatch(match: PendingIngredientMatch): Promise<IngredientMapping> {
    // Check if a mapping already exists for the canonical name
    const existing = await ingredientMappingRepository.getByCanonicalName(match.suggestedCanonicalName);

    if (existing) {
      // Add new variants to existing mapping
      for (const name of match.ingredientNames) {
        if (name.toLowerCase() !== existing.canonicalName.toLowerCase()) {
          await ingredientMappingRepository.addVariant(existing.id, name);
        }
      }
      return ingredientMappingRepository.getById(existing.id) as Promise<IngredientMapping>;
    }

    // Create new mapping
    const variants = match.ingredientNames.filter(
      (n) => n.toLowerCase() !== match.suggestedCanonicalName.toLowerCase()
    );
    return ingredientMappingRepository.create(match.suggestedCanonicalName, variants, true);
  },

  /**
   * Reject a pending match (currently just ignores it, could track rejections in future)
   */
  async rejectMatch(_matchId: string): Promise<void> {
    // For now, rejecting a match just means not saving it
    // In the future, we could track rejections to avoid suggesting again
  },

  /**
   * Confirm all pending matches at once
   */
  async confirmAllMatches(matches: PendingIngredientMatch[]): Promise<IngredientMapping[]> {
    const results: IngredientMapping[] = [];
    for (const match of matches) {
      const mapping = await this.confirmMatch(match);
      results.push(mapping);
    }
    return results;
  },

  /**
   * Confirm refined ingredient groups (for manual splitting/regrouping)
   * Only creates mappings for groups with 2+ ingredients
   */
  async confirmRefinedGroups(groups: RefinedIngredientGroup[]): Promise<IngredientMapping[]> {
    const results: IngredientMapping[] = [];

    for (const group of groups) {
      // Skip single-ingredient groups - no mapping needed
      if (group.ingredientNames.length < 2) {
        continue;
      }

      // Use the canonical name, or fall back to first ingredient name
      const canonicalName = group.canonicalName.trim() || group.ingredientNames[0];

      // Check if a mapping already exists for this canonical name
      const existing = await ingredientMappingRepository.getByCanonicalName(canonicalName);

      if (existing) {
        // Add new variants to existing mapping
        for (const name of group.ingredientNames) {
          if (name.toLowerCase() !== existing.canonicalName.toLowerCase()) {
            await ingredientMappingRepository.addVariant(existing.id, name);
          }
        }
        const updated = await ingredientMappingRepository.getById(existing.id);
        if (updated) {
          results.push(updated);
        }
      } else {
        // Create new mapping
        const variants = group.ingredientNames.filter(
          (n) => n.toLowerCase() !== canonicalName.toLowerCase()
        );
        const mapping = await ingredientMappingRepository.create(canonicalName, variants, true);
        results.push(mapping);
      }
    }

    return results;
  },

  /**
   * Estimate unit conversion for cross-category amounts (e.g., "each" to "lb")
   * Uses local data first, falls back to AI estimation if needed
   */
  async estimateUnitConversion(
    requests: UnitEstimationRequest[],
    signal?: AbortSignal
  ): Promise<UnitEstimationResult[]> {
    const results: UnitEstimationResult[] = [];
    const needsAI: UnitEstimationRequest[] = [];

    // Try local estimation first
    for (const req of requests) {
      const localResult = this.tryLocalEstimation(req);
      if (localResult) {
        results.push(localResult);
      } else {
        needsAI.push(req);
      }
    }

    // If we have requests that need AI estimation and AI is available
    if (needsAI.length > 0) {
      const aiResults = await this.estimateWithAI(needsAI, signal);
      results.push(...aiResults);
    }

    return results;
  },

  /**
   * Try to estimate conversion using local weight data
   */
  tryLocalEstimation(request: UnitEstimationRequest): UnitEstimationResult | null {
    const { ingredientName, fromQuantity, fromUnit, toCategory } = request;
    const fromCategory = getUnitCategory(fromUnit);
    const name = ingredientName.toLowerCase();

    // Count → Weight conversion
    if (fromCategory === 'count' && toCategory === 'weight') {
      const gramsPerEach = findBestWeightMatch(name, GRAMS_PER_EACH);

      // Check if we found a specific match (not default)
      const hasSpecificMatch = GRAMS_PER_EACH[name] !== undefined ||
        Object.keys(GRAMS_PER_EACH).some(key => key !== '_default' && (name.includes(key) || key.includes(name)));

      if (hasSpecificMatch) {
        const totalGrams = fromQuantity * gramsPerEach;
        const inLbs = totalGrams / 453.592;
        const perItemOz = gramsPerEach / 28.3495;

        return {
          ingredientName,
          estimatedQuantityInGrams: totalGrams,
          estimatedDisplayQuantity: roundToReasonablePrecision(inLbs),
          estimatedDisplayUnit: 'lb',
          confidence: 0.85,
          isLocal: true,
          displayNote: `~${roundToReasonablePrecision(perItemOz)} oz each`,
        };
      }
    }

    // Volume → Weight conversion using GRAMS_PER_CUP
    if (fromCategory === 'volume' && toCategory === 'weight') {
      const gramsPerCup = findBestWeightMatch(name, GRAMS_PER_CUP);

      // Check if we found a specific match
      const hasSpecificMatch = GRAMS_PER_CUP[name] !== undefined ||
        Object.keys(GRAMS_PER_CUP).some(key => key !== '_default' && (name.includes(key) || key.includes(name)));

      if (hasSpecificMatch && fromUnit) {
        const baseVolumeMl = convertToBaseUnit(fromQuantity, fromUnit);
        if (baseVolumeMl !== null) {
          const cups = baseVolumeMl / 236.588;
          const totalGrams = cups * gramsPerCup;
          const inLbs = totalGrams / 453.592;

          return {
            ingredientName,
            estimatedQuantityInGrams: totalGrams,
            estimatedDisplayQuantity: roundToReasonablePrecision(inLbs),
            estimatedDisplayUnit: 'lb',
            confidence: 0.8,
            isLocal: true,
            displayNote: `~${Math.round(gramsPerCup)}g per cup`,
          };
        }
      }
    }

    // Weight → Count conversion (reverse of count → weight)
    if (fromCategory === 'weight' && toCategory === 'count') {
      const gramsPerEach = findBestWeightMatch(name, GRAMS_PER_EACH);

      const hasSpecificMatch = GRAMS_PER_EACH[name] !== undefined ||
        Object.keys(GRAMS_PER_EACH).some(key => key !== '_default' && (name.includes(key) || key.includes(name)));

      if (hasSpecificMatch && fromUnit) {
        const baseGrams = convertToBaseUnit(fromQuantity, fromUnit);
        if (baseGrams !== null) {
          const count = baseGrams / gramsPerEach;
          const perItemOz = gramsPerEach / 28.3495;

          return {
            ingredientName,
            estimatedQuantityInGrams: baseGrams,
            estimatedDisplayQuantity: roundToReasonablePrecision(count),
            estimatedDisplayUnit: 'each',
            confidence: 0.85,
            isLocal: true,
            displayNote: `~${roundToReasonablePrecision(perItemOz)} oz each`,
          };
        }
      }
    }

    return null;
  },

  /**
   * Use AI to estimate unit conversions for ingredients without local data
   */
  async estimateWithAI(
    requests: UnitEstimationRequest[],
    signal?: AbortSignal
  ): Promise<UnitEstimationResult[]> {
    const apiKey = await settingsRepository.getAnthropicApiKey();

    if (!apiKey || requests.length === 0) {
      // Return fallback estimates
      return requests.map(req => ({
        ingredientName: req.ingredientName,
        estimatedQuantityInGrams: 0,
        estimatedDisplayQuantity: req.fromQuantity,
        estimatedDisplayUnit: req.fromUnit || 'each',
        confidence: 0,
        isLocal: false,
        displayNote: 'Could not estimate conversion',
      }));
    }

    const ingredientList = requests
      .map(r => `- ${r.ingredientName}: ${r.fromQuantity} ${r.fromUnit || 'each'} → convert to ${r.toCategory}`)
      .join('\n');

    const prompt = UNIT_ESTIMATION_PROMPT.replace('{ingredientList}', ingredientList);

    try {
      if (signal?.aborted) {
        return [];
      }

      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal,
      });

      if (!response.ok) {
        return requests.map(req => ({
          ingredientName: req.ingredientName,
          estimatedQuantityInGrams: 0,
          estimatedDisplayQuantity: req.fromQuantity,
          estimatedDisplayUnit: req.fromUnit || 'each',
          confidence: 0,
          isLocal: false,
          displayNote: 'API error - could not estimate',
        }));
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        return [];
      }

      return this.parseUnitEstimationResponse(content, requests);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return [];
      }
      return requests.map(req => ({
        ingredientName: req.ingredientName,
        estimatedQuantityInGrams: 0,
        estimatedDisplayQuantity: req.fromQuantity,
        estimatedDisplayUnit: req.fromUnit || 'each',
        confidence: 0,
        isLocal: false,
        displayNote: 'Network error - could not estimate',
      }));
    }
  },

  /**
   * Parse AI response for unit estimations
   */
  parseUnitEstimationResponse(
    content: string,
    _requests: UnitEstimationRequest[]
  ): UnitEstimationResult[] {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.estimations || !Array.isArray(parsed.estimations)) {
        return [];
      }

      const results: UnitEstimationResult[] = [];

      for (const est of parsed.estimations) {
        if (
          est &&
          typeof est.ingredientName === 'string' &&
          typeof est.estimatedQuantity === 'number' &&
          typeof est.estimatedUnit === 'string'
        ) {
          // Convert to grams for internal storage
          const unitInfo = UNIT_INFO[est.estimatedUnit as MeasurementUnit];
          let grams = 0;
          if (unitInfo?.type === 'weight' && unitInfo.baseUnitFactor) {
            grams = est.estimatedQuantity * unitInfo.baseUnitFactor;
          }

          results.push({
            ingredientName: est.ingredientName,
            estimatedQuantityInGrams: grams,
            estimatedDisplayQuantity: roundToReasonablePrecision(est.estimatedQuantity),
            estimatedDisplayUnit: est.estimatedUnit as MeasurementUnit,
            confidence: est.confidence || 0.7,
            isLocal: false,
            displayNote: est.displayNote || `AI estimate`,
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  },
};

// Types for unit estimation
export interface UnitEstimationRequest {
  ingredientName: string;
  fromQuantity: number;
  fromUnit: MeasurementUnit | null;
  toCategory: UnitCategory;
}

export interface UnitEstimationResult {
  ingredientName: string;
  estimatedQuantityInGrams: number;
  estimatedDisplayQuantity: number;
  estimatedDisplayUnit: MeasurementUnit;
  confidence: number;
  isLocal: boolean;
  displayNote: string;
}

const UNIT_ESTIMATION_PROMPT = `For each ingredient, estimate the unit conversion based on typical weights/measures.

Ingredients to convert:
{ingredientList}

For each ingredient, provide your best estimate of the conversion. Consider:
- Average weights for count-based items (e.g., chicken breast ~6 oz)
- Standard densities for volume-to-weight (e.g., flour ~125g per cup)
- Common packaging sizes

Return ONLY valid JSON with no markdown code blocks:
{
  "estimations": [
    {
      "ingredientName": "chicken breast",
      "fromQuantity": 2,
      "fromUnit": "each",
      "estimatedQuantity": 0.75,
      "estimatedUnit": "lb",
      "confidence": 0.8,
      "displayNote": "~6 oz per breast"
    }
  ]
}`;
