/**
 * Translates no-entry zone hex codes to H3 indexes and back.
 *
 * Purpose: A commander writes a zone as briefing hex codes, the store keeps H3 indexes, and prompts print the codes again.
 * When to use: Storing a zone from a talk reply, and printing a stored zone in a prompt.
 * Expected outcome: Unknown codes and indexes are skipped quietly, because a model reply often holds them.
 * Exceptions: None. A registry error is logged and treated as an unknown code.
 */

import { isValidCell } from 'h3-js';
import { logError, logTrace } from '../logger';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getH3IndexForCode,
  getHexCodeForContext,
} from '../briefing/map/hexCoordinates';
import { SIDE_AGREEMENT_ZONE_MAX_HEXES } from '../../shared/sideAgreements';

/**
 * The two lookups a zone needs.
 *
 * Contract: Each direction returns null for something it does not know and never throws.
 * When to use: Passing a fake in a test, or the strategic lookups in production.
 * Expected outcome: One code or one index per call.
 * Exceptions: None.
 */
export interface ZoneCodeTranslator {
  /**
   * Finds the H3 index of a hex code.
   *
   * Contract: Trims and uppercases the code first. Null for an unknown code.
   * When to use: Storing a zone.
   * Expected outcome: A strategic H3 index or null.
   * Exceptions: None.
   */
  readonly codeToH3: (code: string) => string | null;
  /**
   * Finds the hex code of an H3 index.
   *
   * Contract: Null for text that is not an H3 cell, and for an index the registry does not know.
   * When to use: Printing a stored zone.
   * Expected outcome: A two-character code or null.
   * Exceptions: None.
   */
  readonly h3ToCode: (h3Index: string) => string | null;
}

/**
 * The strategic coordinate context both directions use.
 *
 * Purpose: Zones are only ever strategic.
 * When to use: Calling the registry lookups.
 * Expected outcome: `{ mode: 'strategic' }`.
 * Exceptions: None.
 */
const STRATEGIC_CONTEXT = { mode: 'strategic' } as const;

/**
 * The production translator, built on the strategic hex registry.
 *
 * Purpose: `hexCodeTranslator.ts` throws and logs an error for every unknown code, which a model reply often holds, so this translator returns null instead.
 * When to use: The default for `zoneCodesToH3` and `zoneH3ToCodes`.
 * Expected outcome: The registry is built on first use, because the talk stage can run before any briefing has built it.
 * Exceptions: None. A registry error is logged with the code or index only.
 */
export const STRATEGIC_ZONE_CODE_TRANSLATOR: ZoneCodeTranslator = {
  codeToH3: (code) => {
    try {
      ensureStrategicCoordinateRegistryInitialized();
      return getH3IndexForCode(code.trim().toUpperCase(), STRATEGIC_CONTEXT) ?? null;
    } catch (err) {
      logError('sideAgreementZoneCodes codeToH3 failed', { codeLength: code.length, err });
      return null;
    }
  },
  h3ToCode: (h3Index) => {
    try {
      // The registry lookup maps any text to the nearest hex, so an invalid index must be refused first.
      if (!isValidCell(h3Index)) return null;
      ensureStrategicCoordinateRegistryInitialized();
      return getHexCodeForContext(h3Index, STRATEGIC_CONTEXT) ?? null;
    } catch (err) {
      logError('sideAgreementZoneCodes h3ToCode failed', { h3Index, err });
      return null;
    }
  },
};

/**
 * Translates the hex codes of a reply to H3 indexes.
 *
 * Purpose: Store only real hexes, without duplicates, and no more than `SIDE_AGREEMENT_ZONE_MAX_HEXES`.
 * When to use: Storing a `no_entry_zone` agreement.
 * Expected outcome: The H3 indexes in order, and the count of everything skipped (non-strings, unknown codes, repeats, and codes over the limit).
 * Exceptions: None.
 */
export function zoneCodesToH3(
  codes: readonly unknown[],
  translator: ZoneCodeTranslator = STRATEGIC_ZONE_CODE_TRANSLATOR
): { readonly h3: string[]; readonly droppedCount: number } {
  const h3: string[] = [];
  let droppedCount = 0;
  for (const code of codes) {
    if (typeof code !== 'string') {
      droppedCount += 1;
      continue;
    }
    const index = translator.codeToH3(code.trim().toUpperCase());
    if (index === null || h3.includes(index) || h3.length >= SIDE_AGREEMENT_ZONE_MAX_HEXES) {
      droppedCount += 1;
      continue;
    }
    h3.push(index);
  }
  logTrace('sideAgreementZoneCodes zoneCodesToH3', { codeCount: codes.length, keptCount: h3.length, droppedCount });
  return { h3, droppedCount };
}

/**
 * Translates stored H3 indexes back to hex codes.
 *
 * Purpose: Prompts name hexes the way the briefing does.
 * When to use: Building an agreement view.
 * Expected outcome: The codes in order. An index the registry does not know is skipped.
 * Exceptions: None.
 */
export function zoneH3ToCodes(
  h3Indexes: readonly string[],
  translator: ZoneCodeTranslator = STRATEGIC_ZONE_CODE_TRANSLATOR
): string[] {
  const codes: string[] = [];
  for (const index of h3Indexes) {
    const code = translator.h3ToCode(index);
    if (code !== null) codes.push(code);
  }
  logTrace('sideAgreementZoneCodes zoneH3ToCodes', { indexCount: h3Indexes.length, codeCount: codes.length });
  return codes;
}
