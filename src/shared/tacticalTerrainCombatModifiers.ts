/**
 * Tactical terrain combat modifiers (movement point budgets and ranged LOS / range caps).
 *
 * ## Tactical terrain combat modifiers — locked semantics
 *
 * 1. **Mountain ranged block (armor, naval):** Tactical ranged uses implicit **line of sight (LOS)** via
 *    `computeGridPathCellsPure(attackerH3, targetH3)` on res4 indexes. If **any** cell on that trace is **mountain**, the
 *    attack is not allowed for armor or naval. **Infantry** is excluded. Air strikes and ferry do not use this helper.
 *    A caller that passes unit type air still receives the block. Battles inside the twelve
 *    res1 hexes that contain a pentagon have res4 pairs where H3's straight-line `gridPathCells` throws; those are traced
 *    by the BFS fallback so clear terrain stays shootable. Only a pair with **no** derivable path at all is treated as
 *    **blocked** (fail closed). Ranged-phase return fire for ground units reuses this module via
 *    `returnFireEligibility` / `tacticalRangedDirectFirePassesTerrainAndRange` (planning parity).
 * 2. **Forest / urban / rubble ranged cap (armor, infantry):** When the attacker’s **terrain anchor** cell is forest-class,
 *    **urban** (`res4IsUrbanByH3`), or **rubble** (`res4IsRubbleByH3`), **effective max ranged range is 1** H3 grid step.
 * 3. **Forest movement (armor):** From a **forest** anchor cell, armor uses the **same movement point budget as infantry**
 *    for that march leg (`MOVEMENT_RANGE_BY_UNIT_TYPE.infantry`).
 * 4. **Urban / rubble movement (armor, infantry):** From an **urban** or **rubble** anchor cell, armor and infantry use
 *    **movement point budget 1** for that march leg.
 *
 * Baseline ranges and budgets live in `tacticalRanges.ts`; this module **reduces** them when rules apply.
 */

import { computeGridPathCellsPure, isWithinGridRangePure } from './h3GridRangePure';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import { tacticalWeatherMovementBudget } from './weatherBonusRules';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from './tacticalRanges';
import { tacticalRes4CellHasActiveTransportCorridor } from './tacticalRes4TransportLink';
import { normalizeDbTerrainKindToTacticalCategory, type TacticalMovementCategory } from './tacticalTerrainMovement';

/**
 * Snapshot fields required for terrain-normalized res4 reads used by ranged LOS and forest detection.
 *
 * Contract: Callers pass the same `Pick` shape from `TacticalBattleSnapshot` so helpers stay DB-free.
 * When to use: Arguments to `effectiveRes4TerrainKindString`, mountain/forest predicates, and ranged caps.
 * Expected outcome: Undefined maps are treated as “inherit parent kind only”.
 * Exceptions: None.
 */
export type TacticalBattleTerrainPick = Pick<
  TacticalBattleSnapshot,
  | 'res4TerrainKindByH3'
  | 'strategicHexTerrain'
  | 'strategicHexTerrainKind'
  | 'res4IsUrbanByH3'
  | 'res4IsRubbleByH3'
  | 'res4RoadSidesByH3'
  | 'res4RailSidesByH3'
>;

/**
 * Builds optional `res4IsUrbanByH3` / `res4IsRubbleByH3` records for all res4 cells in the tactical footprint from merged DB rows.
 *
 * Contract: Urban means `isUrban && !isRubble`; rubble means `isRubble` on the merged override row for that `h3Index`.
 * When to use: `computeTacticalBattleSnapshot` and `refreshTacticalBattleRes4TerrainFromGameDb` after loading `getRes4TerrainOverridesForRendererFromGame`.
 * Expected outcome: Omitted properties when no cell qualifies (empty objects are not attached).
 * Exceptions: None.
 */
export function tacticalRes4UrbanRubbleFlagRecordsForFootprint(
  footprint: readonly string[],
  mergedRows: ReadonlyArray<{ h3Index: string; isUrban?: boolean; isRubble?: boolean; terrainKind?: string }>
): Pick<TacticalBattleSnapshot, 'res4IsUrbanByH3' | 'res4IsRubbleByH3'> {
  const byH3 = new Map(mergedRows.map((r) => [r.h3Index, r] as const));
  const res4IsUrbanByH3: Record<string, boolean> = {};
  const res4IsRubbleByH3: Record<string, boolean> = {};
  const foot = new Set(footprint);
  for (const cell of foot) {
    const row = byH3.get(cell);
    if (!row) continue;
    if (row.isRubble) {
      res4IsRubbleByH3[cell] = true;
    } else if (row.isUrban) {
      res4IsUrbanByH3[cell] = true;
    }
  }
  const out: Pick<TacticalBattleSnapshot, 'res4IsUrbanByH3' | 'res4IsRubbleByH3'> = {};
  if (Object.keys(res4IsUrbanByH3).length > 0) out.res4IsUrbanByH3 = res4IsUrbanByH3;
  if (Object.keys(res4IsRubbleByH3).length > 0) out.res4IsRubbleByH3 = res4IsRubbleByH3;
  return out;
}

/**
 * Returns the effective terrain kind string for one res4 cell (override or strategic parent fallback).
 *
 * Contract: Matches movement resolver fallback: `res4TerrainKindByH3[cell] ?? strategicHexTerrainKind ?? 'plains'`.
 * When to use: Normalizing a cell to `TacticalMovementCategory` for forest/mountain checks.
 * Expected outcome: Non-empty string suitable for `normalizeDbTerrainKindToTacticalCategory`.
 * Exceptions: None.
 */
export function effectiveRes4TerrainKindString(battle: TacticalBattleTerrainPick, res4H3: string): string {
  const fromMap = battle.res4TerrainKindByH3?.[res4H3];
  if (fromMap !== undefined && fromMap !== null && String(fromMap).trim().length > 0) {
    return String(fromMap);
  }
  return battle.strategicHexTerrainKind ?? 'plains';
}

/**
 * Returns the tactical movement category for a res4 cell using parent `terrain` for water disambiguation.
 *
 * Contract: Uses `normalizeDbTerrainKindToTacticalCategory` with `battle.strategicHexTerrain ?? 'land'`.
 * When to use: Forest and mountain classification for combat modifiers.
 * Expected outcome: One of the known `TacticalMovementCategory` values.
 * Exceptions: None.
 */
export function tacticalRes4MovementCategory(battle: TacticalBattleTerrainPick, res4H3: string): TacticalMovementCategory {
  const kind = effectiveRes4TerrainKindString(battle, res4H3);
  const parentTerrain = battle.strategicHexTerrain ?? 'land';
  return normalizeDbTerrainKindToTacticalCategory(kind, parentTerrain);
}

/**
 * Land vs water glyph for the tactical operational map and AI plan-state hex rows.
 *
 * Purpose: Child res4 kinds (wetlands, coastal, plains, …) must not inherit the enclosing res1 ocean as “water”.
 * When to use: `buildTacticalAiPlanState` so the tactical ASCII map reads land/water from plan-state hex rows.
 * Expected outcome: `'water'` for open water/ocean/sea; `'land'` for every other occupiable category including coastal and wetlands.
 * Exceptions: None.
 */
export function tacticalRes4BriefingLandWater(battle: TacticalBattleTerrainPick, res4H3: string): 'land' | 'water' {
  const kind = (effectiveRes4TerrainKindString(battle, res4H3) || '').toLowerCase();
  if (kind === 'water' || kind === 'ocean' || kind === 'sea') return 'water';
  return tacticalRes4MovementCategory(battle, res4H3) === 'water' ? 'water' : 'land';
}

/**
 * Returns true when the res4 cell is treated as **mountain** for implicit ranged LOS blocking.
 *
 * Contract: `tacticalRes4MovementCategory(...) === 'mountains'`.
 * When to use: Scanning `computeGridPathCellsPure` traces for air/armor/naval ranged validation.
 * Expected outcome: Stable for a fixed snapshot.
 * Exceptions: None.
 */
export function tacticalRes4CellIsMountain(battle: TacticalBattleTerrainPick, res4H3: string): boolean {
  return tacticalRes4MovementCategory(battle, res4H3) === 'mountains';
}

/**
 * Returns true when the cell counts as **urban** or **rubble** for movement and ranged caps (feature flags).
 *
 * Contract: Rubble from `res4IsRubbleByH3`; urban from `res4IsUrbanByH3` (urban infrastructure not yet rubble).
 * When to use: Before applying urban/rubble movement budget 1 and ranged range cap.
 * Expected outcome: False when both maps omit the cell.
 * Exceptions: None.
 */
export function tacticalRes4CellIsUrbanOrRubble(battle: TacticalBattleTerrainPick, res4H3: string): boolean {
  return !!battle.res4IsRubbleByH3?.[res4H3] || !!battle.res4IsUrbanByH3?.[res4H3];
}

/**
 * Returns true when a res4 cell hosts strikeable urban, airport, or seaport infrastructure (not already rubble).
 *
 * Purpose: Lets tactical ranged validation and AI legal-target lists allow infra-only shots alongside enemy-occupied hexes.
 * When to use: After loading `listRes4FeatureOverridesForGame` rows filtered to the battle footprint and parent res1.
 * Expected outcome: True when snapshot maps or a matching non-rubble override row still carries urban, airport, or seaport.
 * Exceptions: None; empty `res4FeatureRows` still allows hits from `res4IsUrbanByH3` / `res4IsSeaportByH3` alone.
 */
export function tacticalRes4HasStrikeableInfrastructure(
  battle: Pick<
    TacticalBattleSnapshot,
    'res4IsUrbanByH3' | 'res4IsRubbleByH3' | 'res4IsSeaportByH3' | 'res4RoadSidesByH3' | 'res4RailSidesByH3'
  >,
  res4H3: string,
  res4FeatureRows: ReadonlyArray<{
    h3Index: string;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
    isRubble: boolean;
  }>
): boolean {
  if (battle.res4IsRubbleByH3?.[res4H3]) return false;
  if (battle.res4IsUrbanByH3?.[res4H3]) return true;
  if (battle.res4IsSeaportByH3?.[res4H3]) return true;
  const row = res4FeatureRows.find((r) => r.h3Index === res4H3);
  if (row?.isRubble) return false;
  if (row && (row.isUrban || row.isAirport || row.isSeaport)) return true;
  return tacticalRes4CellHasActiveTransportCorridor({
    cellH3: res4H3,
    roadSidesByH3: battle.res4RoadSidesByH3,
    railSidesByH3: battle.res4RailSidesByH3,
    rubbleByH3: battle.res4IsRubbleByH3,
  });
}

/**
 * Returns true when the cell is **forest-class** for movement and ranged caps (terrain normalization).
 *
 * Contract: Category `forests`; does not use urban/rubble flags.
 * When to use: Armor forest movement parity and forest branch of ranged cap.
 * Expected outcome: False on plains, urban-only tiles without forest kind, etc.
 * Exceptions: None.
 */
export function tacticalRes4CellIsForestClass(battle: TacticalBattleTerrainPick, res4H3: string): boolean {
  return tacticalRes4MovementCategory(battle, res4H3) === 'forests';
}

/**
 * Resolves the res4 cell used for **terrain** when applying march-budget modifiers (embarked land uses carrier cell).
 *
 * Contract: Infantry/armor with `embarkedOnSubUnitId` pointing at a naval sub-unit uses that naval’s `h3Index`; else `u.h3Index`.
 * When to use: Movement budget and ranged-cap reads at order validation time.
 * Expected outcome: Always returns some H3 string (caller's sub-unit row).
 * Exceptions: None; missing carrier falls back to `u.h3Index`.
 */
export function tacticalMovementTerrainAnchorH3(
  u: Pick<TacticalSubUnitSnapshot, 'h3Index' | 'embarkedOnSubUnitId' | 'unitType'>,
  subUnits: readonly Pick<TacticalSubUnitSnapshot, 'id' | 'h3Index' | 'unitType'>[]
): string {
  const emb = u.embarkedOnSubUnitId;
  if (emb && (u.unitType === 'infantry' || u.unitType === 'armor')) {
    const naval = subUnits.find((x) => x.id === emb && x.unitType === 'naval');
    if (naval) return naval.h3Index;
  }
  return u.h3Index;
}

/**
 * Returns true when armor/infantry **direct** ranged orders use the forest/urban/rubble **max range 1** cap.
 *
 * Contract: True iff the anchor is urban, rubble, or forest-class. A road or rail mask does not make it true.
 * When to use: Inside `effectiveTacticalRangedMaxRangeForAttacker`.
 * Expected outcome: True for an urban, rubble, or forest-class anchor. False for every other cell, including desert or plains whose only extra feature is a road or rail. The caller applies the result only to infantry and armor.
 * Exceptions: None.
 */
export function tacticalForestUrbanRubbleRangedCapActive(battle: TacticalBattleTerrainPick, attackerAnchorH3: string): boolean {
  if (tacticalRes4CellIsUrbanOrRubble(battle, attackerAnchorH3)) return true;
  return tacticalRes4CellIsForestClass(battle, attackerAnchorH3);
}

/**
 * Returns the **effective** tactical ranged max range in H3 grid steps for one attacker cell and unit type.
 *
 * Contract: Baseline from `RANGED_RANGE_BY_UNIT_TYPE`; infantry and armor on forest, urban, or rubble return `min(baseline, 1)`. Road and rail masks do not change the result.
 * When to use: Tactical `validateGroupRangedTarget` and apply-phase ranged filters.
 * Expected outcome: Non-negative integer; 0 means no ranged for that type.
 * Exceptions: None.
 */
export function effectiveTacticalRangedMaxRangeForAttacker(
  battle: TacticalBattleTerrainPick,
  unitType: string,
  attackerAnchorH3: string
): number {
  const baseline = RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0;
  if ((unitType === 'infantry' || unitType === 'armor') && tacticalForestUrbanRubbleRangedCapActive(battle, attackerAnchorH3)) {
    return Math.min(baseline, 1);
  }
  return baseline;
}

/**
 * Describes whether mountain LOS rules apply and whether the shot is blocked (including LOS trace failures).
 *
 * Contract: `applies` false for infantry. For air/armor/naval: `blocked` true when any LOS cell is mountain, or when no
 * path can be derived at all (`traceFailed`). Pairs where `gridPathCells` throws at an icosahedron face crossing are
 * traced by the `computeGridPathCellsPure` BFS fallback instead of counting as a failure, so a clear shot across a face
 * boundary is no longer rejected as blocked terrain.
 * When to use: `validateGroupRangedTarget` logs at **error** when `traceFailed`; `blocked` gates the order.
 * Expected outcome: `blocked` false when LOS is clear and a path was derived.
 * Exceptions: None.
 */
export function tacticalMountainLosBlockedState(
  battle: TacticalBattleTerrainPick,
  attackerH3: string,
  targetH3: string,
  unitType: string
): { applies: boolean; blocked: boolean; traceFailed: boolean } {
  if (unitType !== 'air' && unitType !== 'armor' && unitType !== 'naval') {
    return { applies: false, blocked: false, traceFailed: false };
  }
  const path = computeGridPathCellsPure(attackerH3, targetH3);
  if (path === null) {
    return { applies: true, blocked: true, traceFailed: true };
  }
  for (const h of path) {
    if (tacticalRes4CellIsMountain(battle, h)) {
      return { applies: true, blocked: true, traceFailed: false };
    }
  }
  return { applies: true, blocked: false, traceFailed: false };
}

/**
 * Returns true when **implicit LOS** is blocked by **mountain** (or LOS trace failed) for armor or naval, and also for air if that unit type is passed in. Air strikes and ferry do not call this.
 *
 * Contract: Thin boolean over `tacticalMountainLosBlockedState`.
 * When to use: Apply-phase ranged filters where logging is unnecessary.
 * Expected outcome: Same as `tacticalMountainLosBlockedState(...).blocked` when `applies`, else false.
 * Exceptions: None.
 */
export function tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(
  battle: TacticalBattleTerrainPick,
  attackerH3: string,
  targetH3: string,
  unitType: string
): boolean {
  const s = tacticalMountainLosBlockedState(battle, attackerH3, targetH3, unitType);
  return s.blocked;
}

/**
 * Returns true when a **direct** tactical ranged shot passes **range + mountain LOS** rules (ignores enemy occupancy).
 *
 * Contract: Requires `targetH3` inside `footprint`; effective range from `effectiveTacticalRangedMaxRangeForAttacker`;
 * then `isWithinGridRangePure` (same semantics as `isWithinGridRangeSafe`) and not `tacticalMountainBlocksImplicitLosForAirArmorNavalRanged`.
 * When to use: Defense-in-depth filter in `applyTacticalAirStrikeThenRangedPhaseOnBattle` and briefing ranged enumeration.
 * Expected outcome: False for out-of-footprint, out-of-range, or mountain-blocked LOS for air/armor/naval.
 * Exceptions: None.
 */
export function tacticalRangedDirectFirePassesTerrainAndRange(
  battle: TacticalBattleTerrainPick,
  footprint: ReadonlySet<string>,
  unitType: string,
  attackerAnchorH3: string,
  targetH3: string
): boolean {
  if (!footprint.has(targetH3)) return false;
  const eff = effectiveTacticalRangedMaxRangeForAttacker(battle, unitType, attackerAnchorH3);
  if (eff < 1) return false;
  if (!isWithinGridRangePure(attackerAnchorH3, targetH3, eff)) return false;
  if (tacticalMountainBlocksImplicitLosForAirArmorNavalRanged(battle, attackerAnchorH3, targetH3, unitType)) {
    return false;
  }
  return true;
}

/**
 * Returns the **movement point budget** for one tactical march leg after terrain modifiers.
 *
 * Contract: Urban/rubble + armor or infantry ⇒ **1**; else armor in forest ⇒ **infantry** baseline; else `MOVEMENT_RANGE_BY_UNIT_TYPE[moveType]` with unit fallback like snapshot guards. When the computed budget is **0** but the leg is not an **air** march (air does not use tactical res4 marching), the result is **1** so first-leg truncation and `planTacticalRes4March` stay aligned with finite-cost reachability.
 * When to use: `tacticalComputeMovementOrderOutcome`, human twin, and `tacticalMarchFirstStopAlongPath` callers.
 * Expected outcome: Positive integer suitable for `planTacticalRes4MarchWithSessionCache` for infantry/armor/naval; **0** only for air (no tactical march).
 * Exceptions: None.
 */
export function effectiveTacticalMovementPointBudgetForMarchLeg(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'weather' | 'weatherBonusEnabled'>,
  subUnit: Pick<TacticalSubUnitSnapshot, 'unitType' | 'h3Index' | 'embarkedOnSubUnitId' | 'weatherTags'>,
  allSubUnits: readonly Pick<TacticalSubUnitSnapshot, 'id' | 'h3Index' | 'unitType' | 'embarkedOnSubUnitId'>[],
  moveType: string
): number {
  const anchor = tacticalMovementTerrainAnchorH3(subUnit, allSubUnits);
  const base = MOVEMENT_RANGE_BY_UNIT_TYPE[moveType] ?? MOVEMENT_RANGE_BY_UNIT_TYPE[subUnit.unitType] ?? 1;
  let budget: number;
  if (subUnit.unitType === 'infantry' || subUnit.unitType === 'armor') {
    if (tacticalRes4CellIsUrbanOrRubble(battle, anchor)) {
      budget = Math.max(0, 1);
    } else if (subUnit.unitType === 'armor' && tacticalRes4CellIsForestClass(battle, anchor)) {
      const inf = MOVEMENT_RANGE_BY_UNIT_TYPE.infantry ?? 2;
      budget = Math.max(0, inf);
    } else {
      budget = Math.max(0, base);
    }
  } else {
    budget = Math.max(0, base);
  }
  if (budget === 0 && moveType !== 'air' && subUnit.unitType !== 'air') {
    return 1;
  }
  return tacticalWeatherMovementBudget({
    unitType: subUnit.unitType,
    printedBudget: budget,
    weather: battle.weather,
    tags: subUnit.weatherTags,
    enabled: battle.weatherBonusEnabled === true,
  });
}

/**
 * Lists res4 footprint cells where the attacker may order a **legal tactical ranged** shot (enemy or strikeable infra, range, mountain LOS, terrain cap).
 *
 * Contract: Excludes the attacker’s own `h3Index` cell from results; does not dedupe beyond `Set` ordering of iteration.
 * When to use: `buildPossibleUnitActionsMarkdown` when `tacticalBattle` is supplied for tactical AI briefings.
 * Expected outcome: Cells in `battle.res4ChildH3Indexes` with an enemy **or** strikeable infrastructure per `tacticalRes4HasStrikeableInfrastructure` when `res4FeatureRowsInFootprint` is supplied.
 * Exceptions: None; unknown `attackerSubUnitId` yields an empty list.
 */
export function collectTacticalLegalRangedTargetRes4Hexes(
  battle: TacticalBattleTerrainPick &
    Pick<TacticalBattleSnapshot, 'res4ChildH3Indexes' | 'subUnits' | 'res4IsSeaportByH3'>,
  attackerSubUnitId: string,
  res4FeatureRowsInFootprint?: ReadonlyArray<{
    h3Index: string;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
    isRubble: boolean;
  }>
): string[] {
  const u = battle.subUnits.find((s) => s.id === attackerSubUnitId);
  const baseline = RANGED_RANGE_BY_UNIT_TYPE[u?.unitType ?? ''] ?? 0;
  if (!u || baseline < 1) return [];
  const footprint = new Set(battle.res4ChildH3Indexes);
  const anchor = tacticalMovementTerrainAnchorH3(u, battle.subUnits);
  const out = new Set<string>();
  const rows = res4FeatureRowsInFootprint ?? [];
  for (const h3 of battle.res4ChildH3Indexes) {
    if (h3 === anchor) continue;
    const enemyHere = battle.subUnits.some((s) => s.h3Index === h3 && s.player !== u.player);
    const infraHere = rows.length > 0 && tacticalRes4HasStrikeableInfrastructure(battle, h3, rows);
    if (!enemyHere && !infraHere) continue;
    if (!tacticalRangedDirectFirePassesTerrainAndRange(battle, footprint, u.unitType, anchor, h3)) continue;
    out.add(h3);
  }
  return [...out];
}
