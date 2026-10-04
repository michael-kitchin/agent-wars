/**
 * Pure rules for the optional origin bonuses, shared by main-process dice, AI tools, and renderer tooltips.
 *
 * Purpose: One place decides whether a unit qualifies, so live dice, estimates, briefings, and tooltips never disagree.
 * When to use: Any code that needs to know whether a unit's roll gets the +1.
 * Expected outcome: Deterministic results with no logging and no I/O.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from './ipc/gameStateTypes';
import type {
  OriginBonusPlace,
  OriginBonusSettings,
  OriginBonusSource,
  OriginBonusTheater,
  OriginHitBonus,
} from './originBonusTypes';
import { isPipelineTerrainKind, type PipelineTerrainKind } from './pipelineTerrain';
import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { effectiveRes4TerrainKindString, type TacticalBattleTerrainPick } from './tacticalTerrainCombatModifiers';
import type { UnitOrigin } from './unitOriginTypes';

/**
 * The amount a qualifying unit adds to its hit threshold.
 *
 * Purpose: Single source for the bonus size used by dice, estimates, rule text, and tooltips.
 * When to use: Building thresholds and any text that states the bonus.
 * Expected outcome: Always 1; the two bonuses do not stack.
 * Exceptions: None.
 */
export const ORIGIN_HIT_BONUS = 1 as const;

/**
 * Settings with both bonuses off.
 *
 * Purpose: Default for missing databases, missing rows, and tests that do not exercise bonuses.
 * When to use: Wherever settings are required but the match has none.
 * Expected outcome: Every bonus check returns no bonus.
 * Exceptions: None.
 */
export const ORIGIN_BONUS_OFF: OriginBonusSettings = Object.freeze({
  countryBonusEnabled: false,
  terrainBonusEnabled: false,
});

/**
 * Legacy and plural terrain spellings mapped to pipeline terrain kinds.
 *
 * Purpose: Battle cells and older data use `forests`, `mountains`, `ocean`, or `sea`; births use pipeline kinds.
 * When to use: Only from `normalizeOriginTerrainKind`.
 * Expected outcome: Each alias maps to exactly one pipeline kind.
 * Exceptions: None.
 */
const TERRAIN_KIND_ALIASES: Readonly<Record<string, PipelineTerrainKind>> = Object.freeze({
  ocean: 'water',
  sea: 'water',
  forests: 'forest',
  mountains: 'mountain',
  wetland: 'wetlands',
});

/**
 * Normalizes a terrain kind for origin terrain matching.
 *
 * Purpose: Lets a `forest` birth match a `forests` cell while rejecting unknown values.
 * When to use: On both sides of every terrain comparison.
 * Expected outcome: A pipeline terrain kind, or `null` for empty or unknown input. Urban and rubble are flags, not kinds.
 * Exceptions: None.
 */
export function normalizeOriginTerrainKind(raw: string | null | undefined): PipelineTerrainKind | null {
  const kind = (raw ?? '').trim().toLowerCase();
  if (kind.length === 0) return null;
  const aliased = TERRAIN_KIND_ALIASES[kind] ?? kind;
  return isPipelineTerrainKind(aliased) ? aliased : null;
}

/**
 * Reads the two match flags from a game-state snapshot.
 *
 * Purpose: Snapshot flags are optional on fixtures; this turns them into strict booleans.
 * When to use: Tools, briefings, prompts, and the renderer, which all hold a snapshot rather than the database.
 * Expected outcome: Each flag is true only when the snapshot field is exactly `true`.
 * Exceptions: None.
 */
export function originBonusSettingsFromSnapshot(
  state: Pick<GameStateSnapshot, 'countryBonusEnabled' | 'terrainBonusEnabled' | 'weatherBonusEnabled' | 'startMonth'>
): OriginBonusSettings {
  return {
    countryBonusEnabled: state.countryBonusEnabled === true,
    terrainBonusEnabled: state.terrainBonusEnabled === true,
    ...(state.weatherBonusEnabled === true
      ? { weatherBonusEnabled: true as const, startMonth: state.startMonth }
      : {}),
  };
}

/**
 * Lists the reasons a unit qualifies for an origin bonus at a place.
 *
 * Purpose: The one matcher behind dice, estimates, assessments, briefings, and tooltips.
 * When to use: With the place where the roll happens (see the place helpers below).
 * Expected outcome: `[]`, `['country']`, `['terrain']`, or `['country', 'terrain']`. Terrain is checked only in the
 *   tactical theater. A missing origin or any `null` field never matches.
 * Exceptions: None.
 */
export function originBonusSources(input: {
  readonly settings: OriginBonusSettings;
  readonly theater: OriginBonusTheater;
  readonly origin: UnitOrigin | null | undefined;
  readonly place: OriginBonusPlace;
}): OriginBonusSource[] {
  const { settings, theater, origin, place } = input;
  if (!origin) return [];
  const sources: OriginBonusSource[] = [];
  if (settings.countryBonusEnabled && origin.birthCountryName !== null && origin.birthCountryName === place.countryName) {
    sources.push('country');
  }
  if (theater === 'tactical' && settings.terrainBonusEnabled) {
    const birthKind = normalizeOriginTerrainKind(origin.birthTerrainKind);
    if (birthKind !== null && birthKind === normalizeOriginTerrainKind(place.terrainKind)) sources.push('terrain');
  }
  return sources;
}

/**
 * Converts qualifying reasons into the threshold bonus.
 *
 * Purpose: Enforces the no-stacking rule in one place.
 * When to use: After `originBonusSources`, before building a hit threshold.
 * Expected outcome: `1` when any reason applies, otherwise `0`.
 * Exceptions: None.
 */
export function originHitBonusFromSources(sources: ReadonlyArray<OriginBonusSource>): OriginHitBonus {
  return sources.length > 0 ? ORIGIN_HIT_BONUS : 0;
}

/**
 * Builds the Bonus cell of the briefing's unit status table.
 *
 * Purpose: Keeps the table cell wording next to the other origin bonus text.
 * When to use: `buildUnitStatusTable` when the Bonus column is shown.
 * Expected outcome: `+1 country`, `+1 country, terrain`, or `—` when the unit does not qualify.
 * Exceptions: None.
 */
export function formatOriginBonusTableCell(sources: ReadonlyArray<OriginBonusSource>): string {
  return sources.length > 0 ? `+${ORIGIN_HIT_BONUS} ${sources.join(', ')}` : '—';
}

/**
 * Describes a res4 cell inside a battle as an origin bonus place.
 *
 * Purpose: Battle cells carry their own country and terrain.
 * When to use: For any tactical roll or assessment, with the sub-unit's own `h3Index`.
 * Expected outcome: The cell's birth country (or `null`) and its effective raw terrain kind.
 * Exceptions: None.
 */
export function tacticalOriginBonusPlace(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'res4CountryNameByH3'>,
  res4H3Index: string
): OriginBonusPlace {
  return {
    countryName: battle.res4CountryNameByH3?.[res4H3Index] ?? null,
    terrainKind: effectiveRes4TerrainKindString(battle, res4H3Index),
  };
}

/**
 * Country name lookups per snapshot hex list, so repeated calls do not rescan the hexes.
 *
 * Purpose: The renderer asks once per unit label; a weak map keeps memory tied to the snapshot.
 * When to use: Only from `strategicHexCountryNameAt`.
 * Expected outcome: One map per `hexes` array, released with it.
 * Exceptions: None.
 */
const countryNameByHexesArray = new WeakMap<GameStateSnapshot['hexes'], ReadonlyMap<string, string | null>>();

/**
 * Returns the majority country name of a strategic hex from a snapshot.
 *
 * Purpose: Strategic places use the hex's majority country, which main puts on snapshot hexes when the country bonus is on.
 * When to use: Strategic estimates, assessments, and tooltips.
 * Expected outcome: The name, or `null` when the hex is unknown, has no country, or the snapshot omits countries.
 * Exceptions: None.
 */
export function strategicHexCountryNameAt(state: Pick<GameStateSnapshot, 'hexes'>, res1H3Index: string): string | null {
  let byH3 = countryNameByHexesArray.get(state.hexes);
  if (!byH3) {
    byH3 = new Map(state.hexes.map((h) => [h.h3Index, h.countryName ?? null] as const));
    countryNameByHexesArray.set(state.hexes, byH3);
  }
  return byH3.get(res1H3Index) ?? null;
}

/**
 * Describes a strategic res1 hex as an origin bonus place.
 *
 * Purpose: The strategic map uses the country test only.
 * When to use: For any strategic roll or assessment, with the unit's hex at roll time.
 * Expected outcome: The hex's majority country and a `null` terrain kind.
 * Exceptions: None.
 */
export function strategicOriginBonusPlace(state: Pick<GameStateSnapshot, 'hexes'>, res1H3Index: string): OriginBonusPlace {
  return { countryName: strategicHexCountryNameAt(state, res1H3Index), terrainKind: null };
}
