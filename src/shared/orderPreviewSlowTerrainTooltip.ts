/**
 * Copy and light terrain classification for transient “Slower: …” hover hints during valid march / ranged previews.
 *
 * Purpose: Keeps strategic march (main), tactical march (renderer), and tactical ranged cap messaging aligned on
 * title-case terrain labels without importing renderer or Electron main modules.
 * When to use: `humanMarchPreviewImpl`, `buildTacticalMarchHoverPreview`, and `publishHoverRoutePreview` only.
 * Expected outcome: Plain English labels suitable for `Slower: ${label}` (or `Using: Road/Rail` when infrastructure enables an otherwise impassable step); `null` when no slowdown applies.
 * Exceptions: None; invalid inputs yield `null`.
 */

import { latLngToCell } from 'h3-js';
import {
  effectiveRes4TerrainKindString,
  effectiveTacticalMovementPointBudgetForMarchLeg,
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
  tacticalRes4CellIsForestClass,
  tacticalRes4CellIsMountain,
} from './tacticalTerrainCombatModifiers';
import type { TacticalBattleTerrainPick } from './tacticalTerrainCombatModifiers';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from './tacticalRanges';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
} from './tacticalTerrainMovement';
import type { TacticalMovementCategory } from './tacticalTerrainMovement';

const STRATEGIC_H3_RESOLUTION = 1;

/**
 * Builds the full one-line hover string for terrain-throttled movement or ranged planning.
 *
 * Purpose: Centralizes the `Slower:` prefix so renderer tooltips stay consistent with product wording; uses `Using:` for
 * `Road/Rail` because that label denotes infrastructure that unlocks movement (e.g. armor across mountains), not merely a speed penalty.
 * When to use: Renderer after resolving a non-null display terrain title from march/ranged slow helpers.
 * Expected outcome: `Slower: Forest` for terrain buckets; `Using: Road/Rail` when the title is `Road/Rail` (spacing/case-insensitive) or was redundantly prefixed with `Slower:`; `Slower: Terrain` when empty after stripping.
 * Exceptions: None.
 */
export function formatSlowerHoverTooltipMessage(displayTerrainTitle: string): string {
  let t = displayTerrainTitle.trim();
  if (/^slower:\s*/i.test(t)) {
    t = t.replace(/^slower:\s*/i, '').trim();
  }
  if (!t) return 'Slower: Terrain';
  const compact = t.replace(/\s+/g, '').toLowerCase();
  if (compact === 'road/rail') return 'Using: Road/Rail';
  return `Slower: ${t}`;
}

/**
 * Maps a coarse terrain bucket to a short title-case UI label for the slower tooltip.
 *
 * Purpose: Normalizes internal buckets (`forests`, `mountains`, …) to user-facing words like `Forest`, `Mountain`.
 * When to use: After classifying a strategic or tactical cell into a slowing bucket.
 * Expected outcome: Single English word in title case; `null` when the bucket should not surface a slow hint.
 * Exceptions: None.
 */
export function displayTitleForSlowTerrainBucket(bucket: TacticalMovementCategory | 'urban' | 'rubble'): string | null {
  switch (bucket) {
    case 'forests':
      return 'Forest';
    case 'mountains':
      return 'Mountain';
    case 'wetlands':
      return 'Wetlands';
    case 'urban':
      return 'Urban';
    case 'rubble':
      return 'Rubble';
    default:
      return null;
  }
}

/**
 * Lists ordered res1 H3 indexes along a successful strategic route plan (deduping consecutive duplicates).
 *
 * Purpose: Lets slow-terrain classification inspect each entered cell using snapshot terrain maps.
 * When to use: Only with `PlanRouteOk.path` from `executePlanRouteWithSession` / hover preview caches.
 * Expected outcome: At least two indexes when the plan includes movement; skips coordinates that fail `latLngToCell`.
 * Exceptions: Malformed coordinates are skipped without throwing.
 */
export function strategicMarchPathH3IndicesFromPlan(plan: {
  path: ReadonlyArray<{ hexes: ReadonlyArray<[number, number]> }>;
}): string[] {
  const out: string[] = [];
  let prev = '';
  for (const seg of plan.path) {
    if (!Array.isArray(seg.hexes)) continue;
    for (const xy of seg.hexes) {
      if (!Array.isArray(xy) || xy.length < 2) continue;
      try {
        const h = latLngToCell(xy[0]!, xy[1]!, STRATEGIC_H3_RESOLUTION);
        if (h && h !== prev) {
          out.push(h);
          prev = h;
        }
      } catch {
        /* ignore bad coordinates */
      }
    }
  }
  return out;
}

/**
 * Picks the first march slow-down terrain label along a strategic res1 path for the given unit type.
 *
 * Purpose: Mirrors tactical “expensive enter” intuition using `tacticalEnterHexMovementCost` on normalized categories.
 * When to use: `computeHumanMarchPreviewForUnit` after a successful `PlanRouteOk` for land/naval march previews.
 * Expected outcome: `Urban` / `Forest` / … for the first entered cell that is slower than baseline plains for that type;
 * `null` when the path is empty or introduces no slower-than-plains enters.
 * Exceptions: None.
 */
export function pickStrategicMarchSlowTerrainDisplayTitle(
  unitType: string,
  pathH3: readonly string[],
  terrainKindByH3: ReadonlyMap<string, string>,
  terrainByH3: ReadonlyMap<string, string>
): string | null {
  if (pathH3.length < 2) return null;
  if (unitType === 'air') return null;
  for (let i = 1; i < pathH3.length; i++) {
    const h = pathH3[i]!;
    const kindRaw = terrainKindByH3.get(h) ?? 'plains';
    const kindLower = String(kindRaw).toLowerCase();
    const parentRaw = terrainByH3.get(h) ?? 'land';
    const parent = parentRaw === 'water' ? 'water' : 'land';
    if (kindLower.includes('urban')) {
      return 'Urban';
    }
    if (kindLower.includes('rubble')) {
      return 'Rubble';
    }
    const cat = normalizeDbTerrainKindToTacticalCategory(kindLower, parent);
    const cost = tacticalEnterHexMovementCost(unitType, cat);
    if (!Number.isFinite(cost) || cost <= 1) continue;
    const label = displayTitleForSlowTerrainBucket(cat);
    if (label) return label;
  }
  return null;
}

/**
 * Resolves tactical march “slow terrain” copy from anchor throttling and/or expensive cells along the res4 path.
 *
 * Purpose: Covers armor-in-forest, urban/rubble anchor MP=1, and multi-turn paths that traverse dense terrain.
 * When to use: `buildPreviewForSubUnit` after `planTacticalRes4March` succeeds with a concrete `pathToDestination`.
 * Expected outcome: Title-case terrain word or `null` when the leg is not terrain-limited for UI purposes.
 * Exceptions: None.
 */
export function pickTacticalMarchSlowTerrainDisplayTitle(args: {
  battle: TacticalBattleSnapshot;
  subUnit: TacticalSubUnitSnapshot;
  moveType: string;
  pathH3: readonly string[];
}): string | null {
  const { battle, subUnit, moveType, pathH3 } = args;
  if (pathH3.length < 2) return null;
  if (moveType === 'air' || moveType === 'naval') return null;

  const baseLine = MOVEMENT_RANGE_BY_UNIT_TYPE[moveType] ?? MOVEMENT_RANGE_BY_UNIT_TYPE[subUnit.unitType] ?? 1;
  const eff = effectiveTacticalMovementPointBudgetForMarchLeg(battle, subUnit, battle.subUnits, moveType);
  if (eff < baseLine) {
    const anchor = tacticalMovementTerrainAnchorH3(subUnit, battle.subUnits);
    if (battle.res4IsRubbleByH3?.[anchor]) return 'Rubble';
    if (battle.res4IsUrbanByH3?.[anchor]) return 'Urban';
    if (subUnit.unitType === 'armor' && tacticalRes4CellIsForestClass(battle, anchor)) {
      return 'Forest';
    }
  }

  const terrainForTransport = buildTacticalTerrainKindResolverFromSnapshot(battle);
  for (let i = 1; i < pathH3.length; i++) {
    const prev = pathH3[i - 1]!;
    const h = pathH3[i]!;
    if (battle.res4IsRubbleByH3?.[h]) return 'Rubble';
    if (battle.res4IsUrbanByH3?.[h]) return 'Urban';
    const rawKind = effectiveRes4TerrainKindString(battle, h);
    const parent = battle.strategicHexTerrain ?? 'land';
    const cat = normalizeDbTerrainKindToTacticalCategory(String(rawKind).toLowerCase(), parent);
    const cost = tacticalEnterHexMovementCost(moveType, cat);
    const plainsCost = tacticalEnterHexMovementCost(moveType, 'plains');
    if (
      terrainForTransport.transportFromTo?.(prev, h) &&
      (cost > plainsCost || !Number.isFinite(cost))
    ) {
      return 'Road/Rail';
    }
    if (Number.isFinite(cost) && cost > 1) {
      const label = displayTitleForSlowTerrainBucket(cat);
      if (label) return label;
    }
    if (tacticalRes4CellIsForestClass(battle, h) && (subUnit.unitType === 'armor' || subUnit.unitType === 'infantry')) {
      return 'Forest';
    }
    if (subUnit.unitType === 'infantry' && tacticalRes4CellIsMountain(battle, h)) {
      return 'Mountain';
    }
  }
  return null;
}

/**
 * Resolves tactical ranged “slow terrain” when forest/urban/rubble caps range below the unit’s baseline.
 *
 * Purpose: Surfaces the attacker-anchor terrain that triggers the max-range-1 cap for infantry/armor.
 * When to use: Renderer ranged hover while a tactical battle snapshot is active and ranged validation succeeded.
 * Expected outcome: `Rubble` / `Urban` / `Forest` priority on the anchor cell, or `null` when the cap is inactive.
 * Exceptions: None.
 */
export function pickTacticalRangedSlowTerrainDisplayTitle(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'subUnits'>,
  unitType: string,
  attackerSubUnitId: string
): string | null {
  if (unitType !== 'infantry' && unitType !== 'armor') return null;
  const u = battle.subUnits.find((s) => s.id === attackerSubUnitId);
  if (!u) return null;
  const anchor = tacticalMovementTerrainAnchorH3(u, battle.subUnits);
  const baseline = RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0;
  const eff = effectiveTacticalRangedMaxRangeForAttacker(battle, unitType, anchor);
  if (eff >= baseline) return null;
  if (battle.res4IsRubbleByH3?.[anchor]) return 'Rubble';
  if (battle.res4IsUrbanByH3?.[anchor]) return 'Urban';
  if (tacticalRes4CellIsForestClass(battle, anchor)) return 'Forest';
  return null;
}

/**
 * Picks a ranged slow label for the first representative tactical sub-unit in ranged mode with an active cap.
 *
 * Purpose: Grouped selection may include multiple origins; the hover line uses one representative per origin—match that for copy.
 * When to use: `publishHoverRoutePreview` for tactical ranged after `validateGroupRangedTarget` succeeds.
 * Expected outcome: First non-null per-unit slow label, or `null` when no selected infantry/armor is capped.
 * Exceptions: None.
 */
export function pickFirstTacticalRangedSlowTerrainDisplayTitle(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'subUnits'>,
  previewUnitIds: readonly string[]
): string | null {
  for (const id of previewUnitIds) {
    const sub = battle.subUnits.find((s) => s.id === id);
    if (!sub || sub.player !== 'human') continue;
    const t = pickTacticalRangedSlowTerrainDisplayTitle(battle, sub.unitType, id);
    if (t) return t;
  }
  return null;
}
