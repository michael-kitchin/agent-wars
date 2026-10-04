/**
 * Copy and light terrain classification for transient “Slower: …” hover hints during valid tactical marches.
 *
 * Purpose: Keeps tactical march preview labels aligned without importing renderer or Electron main modules.
 * When to use: `humanMarchPreviewResolve`, `buildTacticalMarchHoverPreview`, and the order-effects tooltip.
 * Expected outcome: Structured `OrderPreviewTerrainImpact` for IPC plus HTML fragments with bold section labels; `null` when no slowdown applies.
 * Exceptions: None; invalid inputs yield `null` or empty collections.
 */

import { latLngToCell } from 'h3-js';
import { formatTerrainNameListHtml } from './terrainSwatchHtml';
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
import { landInfantryArmorEnterCost } from './tacticalRes4LandMarchContinuity';
import {
  formatWeatherLabel,
  tacticalWeatherOpenGroundCost,
  weatherBonusLevelOf,
  weatherSlowsMovement,
} from './weatherBonusRules';
import {
  buildTacticalTerrainKindResolverFromSnapshot,
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
} from './tacticalTerrainMovement';
import type { TacticalMovementCategory } from './tacticalTerrainMovement';
import { TOOLTIP_SECTION_GAP_HTML } from './tooltipSectionGap';
import { STRATEGIC_H3_RESOLUTION } from './h3Resolutions';

/** Stable ordering for multi-terrain comma lists in order-preview HTML (lower sorts earlier). */
const SLOW_TERRAIN_LABEL_SORT_PRIORITY: Readonly<Record<string, number>> = {
  Urban: 0,
  Rubble: 1,
  Forest: 2,
  Coastal: 3,
  Mountain: 4,
  Wetlands: 5,
  Desert: 6,
  Arctic: 7,
  Snow: 8,
  Rain: 9,
  Heat: 10,
};

/**
 * Escapes plain text for insertion into order-preview tooltip HTML (defense-in-depth for GIS-derived tokens).
 *
 * Purpose: Prevents attribute/text injection when labels are joined into `innerHTML` fragments.
 * When to use: `formatOrderPreviewImpactHtml` and blocking-tooltip HTML wrappers for suffix tokens.
 * Expected outcome: HTML-safe ASCII; `&` `<` `>` `"` entity-encoded.
 * Exceptions: None.
 */
export function escapeHtmlForOrderPreviewTooltip(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sorts distinct slow-terrain UI labels for stable comma-list rendering.
 *
 * Purpose: Matches product expectation that multi-hex previews list terrains in a predictable order (not path order).
 * When to use: After collecting union labels for tactical march paths or envelope merge.
 * Expected outcome: Known labels follow `SLOW_TERRAIN_LABEL_SORT_PRIORITY`; unknown labels sort last then `localeCompare`.
 * Exceptions: None; mutates no inputs.
 */
export function sortSlowTerrainLabels(labels: readonly string[]): string[] {
  return [...labels].sort((a, b) => {
    const pa = SLOW_TERRAIN_LABEL_SORT_PRIORITY[a] ?? 100;
    const pb = SLOW_TERRAIN_LABEL_SORT_PRIORITY[b] ?? 100;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

/**
 * Input for `formatOrderPreviewImpactHtml` (terrain tokens are escaped; booleans select fixed markup lines).
 *
 * Purpose: Keeps HTML builder arguments explicit and renderer-call sites self-documenting.
 * When to use: Only when assembling `#order-slower-tooltip` / related order-preview HTML.
 * Expected outcome: At most one of `blocked` vs `slower` wins in the formatter; `roadRail` adds `Using: Road/Rail` after the terrain line when present.
 * Exceptions: None; omit fields or pass empty arrays when not applicable.
 */
export type OrderPreviewImpactHtmlInput = {
  readonly blocked?: readonly string[];
  readonly slower?: readonly string[];
  readonly roadRail?: boolean;
};

/**
 * Builds safe HTML for order-preview terrain/transport impact (bold `Blocked:` / `Slower:` / `Using:` labels only).
 *
 * Purpose: Unifies blocked vs slower HTML with hex tooltip vertical rhythm via `TOOLTIP_SECTION_GAP_HTML`.
 * When to use: `resolveOrderSlowerTooltipHtml` and tests that assert escaped tooltip markup.
 * Expected outcome: At most one terrain line (`Blocked` wins over `Slower`); optional second line `Using: Road/Rail`; `null` if nothing applies.
 * Exceptions: None; empty arrays treated as absent.
 */
export function formatOrderPreviewImpactHtml(args: OrderPreviewImpactHtmlInput): string | null {
  const blocked = (args.blocked ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  const slower = (args.slower ?? []).map((s) => s.trim()).filter((s) => s.length > 0);
  const terrainLine =
    blocked.length > 0
      ? `<strong>Blocked:</strong> ${formatTerrainNameListHtml(blocked.join(', '))}`
      : slower.length > 0
        ? `<strong>Slower:</strong> ${formatTerrainNameListHtml(slower.join(', '))}`
        : null;
  let out = terrainLine;
  if (args.roadRail) {
    const usingLine = `<strong>Using:</strong> Road/Rail`;
    out = out ? `${out}${TOOLTIP_SECTION_GAP_HTML}${usingLine}` : usingLine;
  }
  return out;
}

/**
 * Decides `#order-slower-tooltip` HTML for the current hover, or `null` to hide it.
 *
 * Purpose: One omit rule so ranged/air planning and strategic marches never show Slower/Using hints.
 * When to use: `publishHoverRoutePreview` after the blocked-message resolve.
 * Expected outcome: HTML only for a valid tactical march with slower terrain or road/rail; `null` when blocked, support-targeting, strategic, or no impact.
 * Exceptions: None.
 */
export function resolveOrderSlowerTooltipHtml(args: {
  hasBlockedMessage: boolean;
  supportTargeting?: 'ranged' | 'air';
  validForAll: boolean;
  tacticalBattleActive: boolean;
  marchImpact: { slower: readonly string[]; roadRail: boolean } | null;
}): string | null {
  if (args.hasBlockedMessage) return null;
  if (args.supportTargeting === 'ranged' || args.supportTargeting === 'air') return null;
  if (!args.validForAll || !args.tacticalBattleActive) return null;
  const imp = args.marchImpact;
  if (!imp || (imp.slower.length === 0 && !imp.roadRail)) return null;
  return formatOrderPreviewImpactHtml({ slower: [...imp.slower], roadRail: imp.roadRail });
}

/**
 * Builds the legacy one-line hover string for terrain-throttled movement (plain text).
 *
 * Purpose: Backward-compatible helper for callers that still expect `Slower: …` / `Using: Road/Rail` without HTML.
 * When to use: Non-renderer tests or transitional string consumers only; prefer `formatOrderPreviewImpactHtml` in UI.
 * Expected outcome: Same strings as the pre-HTML rollout for single-token titles.
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
 * Expected outcome: Single English word or short title-case label; `null` for buckets that never throttle movement
 * (`plains`, `water`) under §12.4.
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
    case 'coastal':
      return 'Coastal';
    case 'desert':
      return 'Desert';
    case 'arctic':
      return 'Arctic';
    case 'urban':
      return 'Urban';
    case 'rubble':
      return 'Rubble';
    case 'plains':
    case 'water':
      return null;
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
 * Collects every distinct slowing terrain label along a strategic res1 path (first-seen path order).
 *
 * Purpose: Feeds grouped HTML tooltips and `OrderPreviewTerrainImpact` without stopping at the first slow hex.
 * When to use: `humanMarchPreviewResolve` after `PlanRouteOk`; combine with `sortSlowTerrainLabels` for display lists.
 * Expected outcome: Title-case terrain tokens in traversal order, de-duplicated.
 * Exceptions: None.
 */
export function collectStrategicMarchSlowTerrainLabels(
  unitType: string,
  pathH3: readonly string[],
  terrainKindByH3: ReadonlyMap<string, string>,
  terrainByH3: ReadonlyMap<string, string>
): string[] {
  if (pathH3.length < 2) return [];
  if (unitType === 'air') return [];
  const order: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < pathH3.length; i++) {
    const h = pathH3[i]!;
    const kindRaw = terrainKindByH3.get(h) ?? 'plains';
    const kindLower = String(kindRaw).toLowerCase();
    const parentRaw = terrainByH3.get(h) ?? 'land';
    const parent = parentRaw === 'water' ? 'water' : 'land';
    let label: string | null = null;
    if (kindLower.includes('urban')) {
      label = 'Urban';
    } else if (kindLower.includes('rubble')) {
      label = 'Rubble';
    } else {
      const cat = normalizeDbTerrainKindToTacticalCategory(kindLower, parent);
      const cost = tacticalEnterHexMovementCost(unitType, cat);
      if (!Number.isFinite(cost) || cost <= 1) continue;
      label = displayTitleForSlowTerrainBucket(cat);
    }
    if (label && !seen.has(label)) {
      seen.add(label);
      order.push(label);
    }
  }
  return order;
}

/**
 * Picks the first march slow-down terrain label along a strategic res1 path for the given unit type.
 *
 * Purpose: Backward-compatible single-token surface for callers/tests expecting first-hit semantics.
 * When to use: Legacy call sites; prefer `collectStrategicMarchSlowTerrainLabels` for IPC.
 * Expected outcome: First label in path order from the collector, or `null`.
 * Exceptions: None.
 */
export function pickStrategicMarchSlowTerrainDisplayTitle(
  unitType: string,
  pathH3: readonly string[],
  terrainKindByH3: ReadonlyMap<string, string>,
  terrainByH3: ReadonlyMap<string, string>
): string | null {
  const labels = collectStrategicMarchSlowTerrainLabels(unitType, pathH3, terrainKindByH3, terrainByH3);
  return labels.length > 0 ? labels[0]! : null;
}

export type TacticalMarchTerrainImpact = {
  readonly slower: string[];
  readonly roadRail: boolean;
};

/**
 * Collects tactical march slow terrain labels along `pathH3` plus whether any step uses road/rail transport over costly terrain.
 *
 * Purpose: Replaces “first only” `pickTacticalMarchSlowTerrainDisplayTitle` with a union suitable for HTML tooltips.
 * When to use: `buildTacticalMarchHoverPreview` / `buildPreviewForSubUnit` after `planTacticalRes4March` succeeds.
 * Expected outcome: Anchor throttle labels (when `eff < baseline`) plus per-hex path labels. `roadRail` is true when a step's actual enter cost is the road or rail rate and the off-road cost would have been higher, including when only the destination cell has the line.
 * Exceptions: None; air/naval and trivial paths yield empty `slower` and `roadRail: false`.
 */
/**
 * Names the battle's weather when that weather, not the anchor terrain, cut this leg's budget.
 *
 * Purpose: A plains armor unit in snow is slower even though plains has no terrain label.
 * When to use: The anchor check in `collectTacticalMarchTerrainImpact`.
 * Expected outcome: `Snow`, `Rain`, or `Heat` when `weatherSlowsMovement` says that weather slows this move type at the battle's level; otherwise null.
 * Exceptions: None.
 */
function weatherBudgetSlowLabel(
  battle: TacticalBattleSnapshot,
  subUnit: TacticalSubUnitSnapshot,
  moveType: string
): string | null {
  const slowed = weatherSlowsMovement({
    unitType: moveType,
    weather: battle.weather,
    tags: subUnit.weatherTags,
    level: weatherBonusLevelOf(battle),
  });
  return slowed ? formatWeatherLabel(battle.weather) : null;
}

export function collectTacticalMarchTerrainImpact(args: {
  battle: TacticalBattleSnapshot;
  subUnit: TacticalSubUnitSnapshot;
  moveType: string;
  pathH3: readonly string[];
}): TacticalMarchTerrainImpact {
  const { battle, subUnit, moveType, pathH3 } = args;
  if (pathH3.length < 2 || moveType === 'air') {
    return { slower: [], roadRail: false };
  }
  if (moveType === 'naval') {
    const label = weatherBudgetSlowLabel(battle, subUnit, moveType);
    return { slower: label ? [label] : [], roadRail: false };
  }

  const slowerOrder: string[] = [];
  const seen = new Set<string>();
  const push = (lab: string) => {
    if (!seen.has(lab)) {
      seen.add(lab);
      slowerOrder.push(lab);
    }
  };
  let roadRail = false;

  const baseLine = MOVEMENT_RANGE_BY_UNIT_TYPE[moveType] ?? MOVEMENT_RANGE_BY_UNIT_TYPE[subUnit.unitType] ?? 1;
  const eff = effectiveTacticalMovementPointBudgetForMarchLeg(battle, subUnit, battle.subUnits, moveType);
  if (eff < baseLine) {
    const anchor = tacticalMovementTerrainAnchorH3(subUnit, battle.subUnits);
    if (battle.res4IsRubbleByH3?.[anchor]) push('Rubble');
    else if (battle.res4IsUrbanByH3?.[anchor]) push('Urban');
    else if (subUnit.unitType === 'armor' && tacticalRes4CellIsForestClass(battle, anchor)) push('Forest');
    const weatherLabel = weatherBudgetSlowLabel(battle, subUnit, moveType);
    if (weatherLabel) push(weatherLabel);
  }

  const terrainForTransport = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprint = new Set(battle.res4ChildH3Indexes);
  const marchGoalH3 = pathH3[pathH3.length - 1]!;
  for (let i = 1; i < pathH3.length; i++) {
    const prev = pathH3[i - 1]!;
    const h = pathH3[i]!;
    if (battle.res4IsRubbleByH3?.[h]) {
      push('Rubble');
      continue;
    }
    if (battle.res4IsUrbanByH3?.[h]) {
      push('Urban');
      continue;
    }
    const rawKind = effectiveRes4TerrainKindString(battle, h);
    const parent = battle.strategicHexTerrain ?? 'land';
    const cat = normalizeDbTerrainKindToTacticalCategory(String(rawKind).toLowerCase(), parent);
    const cost = tacticalEnterHexMovementCost(moveType, cat);
    const plainsCost = tacticalEnterHexMovementCost(moveType, 'plains');
    const stepCost = landInfantryArmorEnterCost({
      toH3: h,
      unitTypeForMovement: moveType,
      terrain: terrainForTransport,
      fromH3: prev,
      prevOfFrom: i >= 2 ? pathH3[i - 2]! : null,
      marchGoalH3,
      res4Set: footprint,
      weatherEnabled: battle.weatherBonusEnabled === true,
      weather: battle.weather,
      weatherTags: subUnit.weatherTags,
    });
    const usedLineRate = Number.isFinite(stepCost) && stepCost < 1;
    if (usedLineRate && (cost > plainsCost || !Number.isFinite(cost))) {
      roadRail = true;
      continue;
    }
    if (Number.isFinite(cost) && cost > 1) {
      const label = displayTitleForSlowTerrainBucket(cat);
      if (label) {
        push(label);
        continue;
      }
    }
    const openGround = tacticalWeatherOpenGroundCost({
      unitType: moveType,
      category: cat,
      baseCost: Number.isFinite(cost) ? cost : 1,
      weather: battle.weather,
      tags: subUnit.weatherTags,
      enabled: battle.weatherBonusEnabled === true,
    });
    if (!usedLineRate && Number.isFinite(cost) && openGround > cost && (battle.weather === 'snow' || battle.weather === 'rain')) {
      push(formatWeatherLabel(battle.weather));
    }
    if (tacticalRes4CellIsForestClass(battle, h) && (subUnit.unitType === 'armor' || subUnit.unitType === 'infantry')) {
      push('Forest');
      continue;
    }
    if (subUnit.unitType === 'infantry' && tacticalRes4CellIsMountain(battle, h)) {
      push('Mountain');
    }
  }
  return { slower: slowerOrder, roadRail };
}

/**
 * Resolves tactical march “slow terrain” copy from anchor throttling and/or expensive cells along the res4 path.
 *
 * Purpose: Backward-compatible first-label return matching pre-union behavior (including `Road/Rail` alone).
 * When to use: Callers that still expect `string | null` only.
 * Expected outcome: Same as historical `pickTacticalMarchSlowTerrainDisplayTitle` for tested scenarios.
 * Exceptions: None.
 */
export function pickTacticalMarchSlowTerrainDisplayTitle(args: {
  battle: TacticalBattleSnapshot;
  subUnit: TacticalSubUnitSnapshot;
  moveType: string;
  pathH3: readonly string[];
}): string | null {
  const { slower, roadRail } = collectTacticalMarchTerrainImpact(args);
  if (slower.length > 0) return slower[0]!;
  if (roadRail) return 'Road/Rail';
  return null;
}

/**
 * Resolves tactical ranged “slow terrain” when forest/urban/rubble caps range below the unit’s baseline.
 *
 * Purpose: Surfaces the attacker-anchor terrain that triggers the max-range-1 cap for infantry/armor.
 * When to use: `collectTacticalRangedSlowTerrainLabels`, which the order-effects tooltip uses for a battle shot.
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
 * Collects ranged slow terrain labels across selected human infantry/armor (union, stable preview-unit order).
 *
 * Purpose: Grouped ranged hover can list every throttling terrain type present among origins, not only the first unit.
 * When to use: The order-effects tooltip for a battle ranged attack, and tests of that cap.
 * Expected outcome: Distinct labels in `previewUnitIds` traversal order.
 * Exceptions: None.
 */
export function collectTacticalRangedSlowTerrainLabels(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'subUnits'>,
  previewUnitIds: readonly string[]
): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const id of previewUnitIds) {
    const sub = battle.subUnits.find((s) => s.id === id);
    if (!sub || sub.player !== 'human') continue;
    const t = pickTacticalRangedSlowTerrainDisplayTitle(battle, sub.unitType, id);
    if (t && !seen.has(t)) {
      seen.add(t);
      order.push(t);
    }
  }
  return order;
}

/**
 * Picks a ranged slow label for the first representative tactical sub-unit in ranged mode with an active cap.
 *
 * Purpose: Backward-compatible first-non-null helper aligned with legacy hover copy.
 * When to use: Callers/tests expecting a single string.
 * Expected outcome: First label from `collectTacticalRangedSlowTerrainLabels`, or `null`.
 * Exceptions: None.
 */
export function pickFirstTacticalRangedSlowTerrainDisplayTitle(
  battle: TacticalBattleTerrainPick & Pick<TacticalBattleSnapshot, 'subUnits'>,
  previewUnitIds: readonly string[]
): string | null {
  const labels = collectTacticalRangedSlowTerrainLabels(battle, previewUnitIds);
  return labels.length > 0 ? labels[0]! : null;
}
