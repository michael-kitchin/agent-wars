/**
 * Pure builders for hex-to-hex ranged resolution shot lines (direct fire + return-fire attempts).
 *
 * Purpose: Lets `runRangedPhase` and renderer fog filtering share one edge contract without Electron or DB.
 * When to use: Combat resolution emit and optional UI filtering of playback lines.
 * Expected outcome: Deduped `{ fromH3Index, toH3Index, lineStyle }` rows; empty input yields empty output.
 */

import {
  canDefenderReturnFireAtAttackerHex,
  type ReturnFireEligibilityContext,
} from './returnFireEligibility';

/**
 * Stroke family matching planned support order lines (`rangePerimeterStaticLineStyle`).
 *
 * Purpose: Lets resolution connectors use ranged vs air-strike dash/color without a second IPC channel.
 * When to use: On each `RangedResolutionShotLine`; omit treated as `'ranged'`.
 * Expected outcome: `'ranged'` or `'airStrike'`.
 * Exceptions: None.
 */
export type RangedResolutionShotLineStyle = 'ranged' | 'airStrike';

/**
 * One attacker→target or defender→attacker hex connector for resolution lightning playback.
 *
 * Purpose: IPC/anim payload row drawn with planned ranged or air-strike stroke style.
 * When to use: Elements of `rangedResolutionShotLines` on Ready / tactical commit / anim state.
 * Expected outcome: Both indexes are H3 cells at fire time; duplicates collapse by directed pair with ranged preferred.
 * Exceptions: None.
 */
export type RangedResolutionShotLine = {
  fromH3Index: string;
  toH3Index: string;
  /**
   * Planned-line stroke family for this connector.
   *
   * Purpose: Ground direct/return fire uses `'ranged'`; air-only return fire uses `'airStrike'`.
   * When to use: Set by builders; renderer defaults missing values to `'ranged'`.
   * Expected outcome: Matches `rangePerimeterStaticLineStyle` mode.
   * Exceptions: None.
   */
  lineStyle?: RangedResolutionShotLineStyle;
};

/**
 * Stable key for deduplicating shot-line pairs (geometry only; style merged separately).
 *
 * Purpose: Collapse identical hex pairs from overlapping orders and multi-defender return fire.
 * When to use: Inside `dedupeRangedResolutionShotLines` only.
 * Expected outcome: `from|to` string unique per directed pair.
 * Exceptions: None.
 */
function shotLineKey(line: Pick<RangedResolutionShotLine, 'fromH3Index' | 'toH3Index'>): string {
  return `${line.fromH3Index}|${line.toH3Index}`;
}

/**
 * Resolves effective stroke style for a shot line (missing ⇒ ranged).
 *
 * Purpose: Single default for builders, dedupe, and the renderer.
 * When to use: When reading `lineStyle` from IPC/anim rows.
 * Expected outcome: `'ranged'` or `'airStrike'`.
 * Exceptions: None.
 */
export function resolutionShotLineStyle(line: Pick<RangedResolutionShotLine, 'lineStyle'>): RangedResolutionShotLineStyle {
  return line.lineStyle === 'airStrike' ? 'airStrike' : 'ranged';
}

/**
 * Prefers ranged stroke when the same directed pair appears with both styles.
 *
 * Purpose: Mixed air+ground return fire on one edge draws as planned ranged (product rule).
 * When to use: Inside dedupe when replacing an existing row.
 * Expected outcome: `'ranged'` if either side is ranged; else `'airStrike'`.
 * Exceptions: None.
 */
function preferRangedShotLineStyle(
  a: RangedResolutionShotLineStyle,
  b: RangedResolutionShotLineStyle
): RangedResolutionShotLineStyle {
  return a === 'ranged' || b === 'ranged' ? 'ranged' : 'airStrike';
}

/**
 * Collapses duplicate directed hex pairs while preserving first-seen order and preferring ranged style.
 *
 * Purpose: Orders and return-fire eligibility can emit the same pair more than once.
 * When to use: After concatenating direct and return-fire line lists.
 * Expected outcome: Unique `fromH3Index`→`toH3Index` rows; mixed styles become `'ranged'`.
 * Exceptions: None.
 */
export function dedupeRangedResolutionShotLines(
  lines: readonly RangedResolutionShotLine[]
): RangedResolutionShotLine[] {
  const seen = new Map<string, number>();
  const out: RangedResolutionShotLine[] = [];
  for (const line of lines) {
    const key = shotLineKey(line);
    const style = resolutionShotLineStyle(line);
    const existingIdx = seen.get(key);
    if (existingIdx === undefined) {
      seen.set(key, out.length);
      out.push({
        fromH3Index: line.fromH3Index,
        toH3Index: line.toH3Index,
        lineStyle: style,
      });
      continue;
    }
    const prev = out[existingIdx]!;
    const merged = preferRangedShotLineStyle(resolutionShotLineStyle(prev), style);
    out[existingIdx] = {
      fromH3Index: prev.fromH3Index,
      toH3Index: prev.toH3Index,
      lineStyle: merged,
    };
  }
  return out;
}

/**
 * Builds direct-fire shot lines from submitted ranged orders (always planned-ranged style).
 *
 * Purpose: Every order that beat (including misses / empty targets) gets a connector when the shooter hex is known.
 * When to use: `runRangedPhase` and tactical playback merge for infra-only orders not passed into combat.
 * Expected outcome: One ranged-style line per order whose `unitId` exists in `unitById`; skipped when unit missing.
 * Exceptions: None.
 */
export function directShotLinesFromOrders(
  orders: readonly { unitId: string; targetH3Index: string }[],
  unitById: ReadonlyMap<string, { h3Index: string }>
): RangedResolutionShotLine[] {
  const out: RangedResolutionShotLine[] = [];
  for (const order of orders) {
    const unit = unitById.get(order.unitId);
    if (!unit) continue;
    out.push({ fromH3Index: unit.h3Index, toH3Index: order.targetH3Index, lineStyle: 'ranged' });
  }
  return out;
}

/**
 * Builds return-fire shot lines for one engagement using the same eligibility as combat resolution.
 *
 * Purpose: Show defender→attacker connectors for every return-fire attempt (including misses), not only kills.
 * When to use: Inside `runRangedPhase` for each engagement that runs with return fire enabled.
 * Expected outcome: Unique pairs from `defenderHex` to each hittable attacker hex; `'airStrike'` only when every
 * eligible defender for that edge is air; otherwise `'ranged'` (including mixed air+ground).
 * Exceptions: None; same-hex pairs are omitted from connectors (dice may still allow stacked return fire).
 */
export function returnFireShotLinesForEngagement(args: {
  defenderHex: string;
  attackerHexes: readonly string[];
  defenderUnits: readonly { unitType: string; h3Index?: string }[];
  /**
   * Theater / airport / tactical terrain context shared with `resolveOneRangedEngagement`.
   *
   * Purpose: Keeps shot lines and dice on one planning-parity predicate.
   * When to use: Always pass the same bag used for the engagement’s return-fire rolls.
   * Expected outcome: Lines only for eligible reverse shots.
   * Exceptions: None.
   */
  returnFireContext: ReturnFireEligibilityContext;
}): RangedResolutionShotLine[] {
  const { defenderHex, attackerHexes, defenderUnits, returnFireContext } = args;
  if (attackerHexes.length === 0 || defenderUnits.length === 0) return [];
  const out: RangedResolutionShotLine[] = [];
  for (const attackerHex of attackerHexes) {
    if (attackerHex === defenderHex) continue;
    let groundEligible = false;
    let airEligible = false;
    for (const u of defenderUnits) {
      const defender = { unitType: u.unitType, h3Index: u.h3Index ?? defenderHex };
      if (!canDefenderReturnFireAtAttackerHex(defender, attackerHex, returnFireContext)) continue;
      if (u.unitType === 'air') airEligible = true;
      else groundEligible = true;
    }
    if (!groundEligible && !airEligible) continue;
    out.push({
      fromH3Index: defenderHex,
      toH3Index: attackerHex,
      lineStyle: groundEligible ? 'ranged' : 'airStrike',
    });
  }
  return out;
}

/**
 * Keeps only shot lines whose both endpoints are in the visible hex set.
 *
 * Purpose: Strategic fog must not reveal connectors touching a hidden hex.
 * When to use: Renderer filtering before drawing resolution lightning.
 * Expected outcome: All lines when `visibleHexes` is null/undefined (tactical full-visibility path);
 * otherwise only pairs with both endpoints visible (style preserved).
 * Exceptions: None.
 */
export function filterShotLinesByVisibleEndpoints(
  lines: readonly RangedResolutionShotLine[],
  visibleHexes: ReadonlySet<string> | null | undefined
): RangedResolutionShotLine[] {
  if (!visibleHexes) return [...lines];
  return lines.filter(
    (line) => visibleHexes.has(line.fromH3Index) && visibleHexes.has(line.toH3Index)
  );
}
