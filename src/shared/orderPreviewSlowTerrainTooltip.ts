/**
 * Copy and light terrain classification for transient “Slower: …” hover hints during valid tactical marches.
 *
 * Purpose: Keeps tactical march preview labels aligned without importing renderer or Electron main modules.
 * When to use: `buildTacticalMarchHoverPreview` and the order-effects tooltip. Strategic marches do not use these labels.
 * Expected outcome: Structured `OrderPreviewTerrainImpact` for IPC plus HTML fragments with bold section labels; `null` when no slowdown applies.
 * Exceptions: None; invalid inputs yield `null` or empty collections.
 */

import { formatTransportIconsHtml, transportLineSpecified } from './featureIconHtml';
import { formatTerrainNameListHtml } from './terrainSwatchHtml';
import {
  effectiveTacticalTerrainKindString,
  effectiveTacticalMovementPointBudgetForMarchLeg,
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
  tacticalCellIsForestClass,
  tacticalCellIsMountain,
} from './tacticalTerrainCombatModifiers';
import type { TacticalBattleTerrainPick } from './tacticalTerrainCombatModifiers';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from './tacticalBattleTypes';
import { MOVEMENT_RANGE_BY_UNIT_TYPE, RANGED_RANGE_BY_UNIT_TYPE } from './tacticalRanges';
import { landInfantryArmorEnterCost } from './tacticalLandMarchContinuity';
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
import { classifyTacticalMarchStep, type TacticalMarchStepContext } from './tacticalMarchStepCost';
import { terrainBonusMarchCategoryForMover } from './terrainBonusMarch';
import { TOOLTIP_SECTION_GAP_HTML } from './tooltipSectionGap';

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
 * Expected outcome: At most one of `blocked` vs `slower` wins in the formatter. A road, a rail, or an unspecified line adds a Using line with those icons.
 * Exceptions: None; omit fields or pass empty arrays when not applicable.
 */
export type OrderPreviewImpactHtmlInput = {
  readonly blocked?: readonly string[];
  readonly slower?: readonly string[];
  readonly roadRail?: boolean;
  /**
   * The march used a road.
   *
   * Contract: Optional. When true, the Using line shows the road icon. Omitted on older payloads.
   * When to use: With `rail` beside `roadRail`.
   * Expected outcome: A road-only line when `rail` is not also true.
   * Exceptions: None.
   */
  readonly road?: boolean;
  /**
   * The march used a rail.
   *
   * Contract: Optional. When true, the Using line shows the rail icon.
   * When to use: With `road` beside `roadRail`.
   * Expected outcome: A rail icon. Both icons when this and `road` are true, or when only `roadRail` is set.
   * Exceptions: None.
   */
  readonly rail?: boolean;
};

/**
 * Builds safe HTML for order-preview terrain/transport impact (bold `Blocked:` / `Slower:` / `Using:` labels only).
 *
 * Purpose: Unifies blocked vs slower HTML with hex tooltip vertical rhythm via `TOOLTIP_SECTION_GAP_HTML`.
 * When to use: `resolveOrderSlowerTooltipHtml` and tests that assert escaped tooltip markup.
 * Expected outcome: At most one terrain line (`Blocked` wins over `Slower`); an optional Using line with the road icon, the rail icon, or both; `null` if nothing applies.
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
  const using = formatTransportIconsHtml(args);
  if (using) {
    const usingLine = `<strong>Using:</strong> ${using}`;
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
  marchImpact: {
    slower: readonly string[];
    roadRail: boolean;
    road?: boolean;
    rail?: boolean;
  } | null;
}): string | null {
  if (args.hasBlockedMessage) return null;
  if (args.supportTargeting === 'ranged' || args.supportTargeting === 'air') return null;
  if (!args.validForAll || !args.tacticalBattleActive) return null;
  const imp = args.marchImpact;
  if (!imp || (imp.slower.length === 0 && !transportLineSpecified(imp))) return null;
  return formatOrderPreviewImpactHtml({
    slower: [...imp.slower],
    roadRail: imp.roadRail,
    road: imp.road,
    rail: imp.rail,
  });
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

export type TacticalMarchTerrainImpact = {
  readonly slower: string[];
  readonly roadRail: boolean;
  /**
   * A step used the line rate on a road cell.
   *
   * Contract: Optional. Set only when that cell had a road and no rail.
   * When to use: The Using line. Omitted when the line kind is unknown.
   * Expected outcome: The road icon.
   * Exceptions: None.
   */
  readonly road?: boolean;
  /**
   * A step used the line rate on a rail cell.
   *
   * Contract: Optional. Rail wins when the same cell also has a road.
   * When to use: The Using line.
   * Expected outcome: The rail icon. A path can set both flags.
   * Exceptions: None.
   */
  readonly rail?: boolean;
};

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

/**
 * Names the birth terrain of each terrain-bonus stop along a battle march path.
 *
 * Purpose: A stop spends the rest of the beat, so the march tooltip lists that terrain on its `Slower:` line beside
 * weather and costly terrain.
 * When to use: Both branches of `collectTacticalMarchTerrainImpact`.
 * Expected outcome: Distinct terrain labels such as Mountain or Wetlands, empty when the battle's terrain bonus is off,
 * the mover has no stop category, or no step on the path is a stop. Road and rail steps are never stops.
 * Exceptions: None.
 */
function terrainBonusStopLabelsAlongPath(args: {
  battle: TacticalBattleSnapshot;
  subUnit: TacticalSubUnitSnapshot;
  moveType: string;
  pathH3: readonly string[];
}): string[] {
  const { battle, subUnit, moveType, pathH3 } = args;
  const terrainBonusCategory = terrainBonusMarchCategoryForMover(battle, subUnit, moveType);
  if (terrainBonusCategory == null) return [];
  const label = displayTitleForSlowTerrainBucket(terrainBonusCategory);
  if (!label) return [];
  const ctx: TacticalMarchStepContext = {
    terrain: buildTacticalTerrainKindResolverFromSnapshot(battle),
    moveType,
    tacticalSet: new Set(battle.tacticalChildH3Indexes),
    marchStartH3: pathH3[0]!,
    marchGoalH3: pathH3[pathH3.length - 1]!,
    weatherEnabled: battle.weatherBonusEnabled === true,
    weather: battle.weather,
    weatherTags: subUnit.weatherTags,
    terrainBonusCategory,
  };
  const usesStop = pathH3.slice(1).some(
    (toH3, i) =>
      classifyTacticalMarchStep(ctx, { fromH3: pathH3[i]!, prevH3: i >= 1 ? pathH3[i - 1]! : null, toH3 }).kind ===
      'terrainBonusStop'
  );
  return usesStop ? [label] : [];
}

/**
 * Collects tactical march slow terrain labels along `pathH3` plus whether any step paid the road or rail rate.
 *
 * Purpose: Replaces the first-label helper with one result suitable for HTML tooltips.
 * When to use: After a battle march plan succeeds.
 * Expected outcome: Slow-terrain labels for the start cell's budget and for steps that did not pay the road or rail rate. The battle's weather is named for the budget only when its cap is below the start cell's terrain budget. A line-rate step sets `road` or `rail` and does not add that cell's terrain. A terrain-bonus stop adds its birth terrain, for naval as well. Air and trivial paths yield empty labels and `roadRail: false`.
 * Exceptions: None.
 */
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
    return { slower: [...(label ? [label] : []), ...terrainBonusStopLabelsAlongPath(args)], roadRail: false };
  }

  const slowerOrder: string[] = [];
  const seen = new Set<string>();
  let usedRoad = false;
  let usedRail = false;
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
    if (battle.tacticalIsRubbleByH3?.[anchor]) push('Rubble');
    else if (battle.tacticalIsUrbanByH3?.[anchor]) push('Urban');
    else if (subUnit.unitType === 'armor' && tacticalCellIsForestClass(battle, anchor)) push('Forest');
    const terrainOnly = effectiveTacticalMovementPointBudgetForMarchLeg(
      { ...battle, weatherBonusEnabled: false },
      subUnit,
      battle.subUnits,
      moveType
    );
    const weatherLabel = eff < terrainOnly ? weatherBudgetSlowLabel(battle, subUnit, moveType) : null;
    if (weatherLabel) push(weatherLabel);
  }

  const terrainForTransport = buildTacticalTerrainKindResolverFromSnapshot(battle);
  const footprint = new Set(battle.tacticalChildH3Indexes);
  const marchGoalH3 = pathH3[pathH3.length - 1]!;
  for (let i = 1; i < pathH3.length; i++) {
    const prev = pathH3[i - 1]!;
    const h = pathH3[i]!;
    if (battle.tacticalIsRubbleByH3?.[h]) {
      push('Rubble');
      continue;
    }
    const urban = battle.tacticalIsUrbanByH3?.[h] === true;
    const rawKind = effectiveTacticalTerrainKindString(battle, h);
    const parent = battle.strategicHexTerrain ?? 'land';
    const cat = normalizeDbTerrainKindToTacticalCategory(String(rawKind).toLowerCase(), parent);
    const cost = tacticalEnterHexMovementCost(moveType, cat);
    const stepCost = landInfantryArmorEnterCost({
      toH3: h,
      unitTypeForMovement: moveType,
      terrain: terrainForTransport,
      fromH3: prev,
      prevOfFrom: i >= 2 ? pathH3[i - 2]! : null,
      marchGoalH3,
      tacticalSet: footprint,
      weatherEnabled: battle.weatherBonusEnabled === true,
      weather: battle.weather,
      weatherTags: subUnit.weatherTags,
    });
    const usedLineRate = Number.isFinite(stepCost) && stepCost < 1;
    if (usedLineRate) {
      roadRail = true;
      const railSides = battle.tacticalRailSidesByH3?.[h];
      const roadSides = battle.tacticalRoadSidesByH3?.[h];
      if (railSides?.some((side) => side === true)) usedRail = true;
      else if (roadSides?.some((side) => side === true)) usedRoad = true;
      continue;
    }
    if (urban) {
      push('Urban');
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
    if (Number.isFinite(cost) && openGround > cost && (battle.weather === 'snow' || battle.weather === 'rain')) {
      push(formatWeatherLabel(battle.weather));
    }
    if (tacticalCellIsForestClass(battle, h) && (subUnit.unitType === 'armor' || subUnit.unitType === 'infantry')) {
      push('Forest');
      continue;
    }
    if (subUnit.unitType === 'infantry' && tacticalCellIsMountain(battle, h)) {
      push('Mountain');
    }
  }
  terrainBonusStopLabelsAlongPath(args).forEach(push);
  return {
    slower: slowerOrder,
    roadRail,
    ...(usedRoad ? { road: true as const } : {}),
    ...(usedRail ? { rail: true as const } : {}),
  };
}

/**
 * Resolves tactical march “slow terrain” copy from anchor throttling and/or expensive cells along the tactical path.
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
  if (battle.tacticalIsRubbleByH3?.[anchor]) return 'Rubble';
  if (battle.tacticalIsUrbanByH3?.[anchor]) return 'Urban';
  if (tacticalCellIsForestClass(battle, anchor)) return 'Forest';
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
