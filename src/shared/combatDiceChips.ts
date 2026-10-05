/**
 * Pure model for resolution-playback dice chips: grouping recorded rolls into compact rows, chip timing, and fog filtering.
 *
 * Purpose: Keeps every chip rule testable outside the renderer so the canvas drawing stays thin.
 * When to use: From the renderer's chip drawing and from the resolution playback builders.
 * Expected outcome: Plain data; no DOM, canvas, or logging.
 * Exceptions: None.
 */
import type { CombatDicePlaybackFields, CombatDiceRoll, CombatDiceRollKind } from './ipc/combatDiceTypes';
import type { ResolutionPlaybackPhase } from './resolutionPlaybackPhase';

/**
 * Most lines one chip may draw, counting the "+N more" line.
 *
 * Purpose: Keeps chips small enough not to bury neighboring tokens.
 * When to use: `buildCombatDiceChips` when trimming rows.
 * Expected outcome: A chip never draws more than this many lines.
 * Exceptions: None.
 */
export const COMBAT_DICE_CHIP_MAX_LINES = 4;

/**
 * Most rolls in one row that are shown as individual faces.
 *
 * Purpose: Larger groups switch to a compact `hits/rolls` tally.
 * When to use: `buildCombatDiceChips` when deciding whether a row keeps its faces.
 * Expected outcome: Rows with more rolls than this have empty `faces`.
 * Exceptions: None.
 */
export const COMBAT_DICE_ROW_MAX_FACES = 3;

/**
 * Fade-in time at the start of a phase's chip window.
 *
 * Purpose: Chips appear smoothly with the lightning beat instead of popping in.
 * When to use: `combatDiceChipOpacity`.
 * Expected outcome: Opacity ramps from 0 to 1 over this many milliseconds.
 * Exceptions: None.
 */
export const COMBAT_DICE_FADE_IN_MS = 150;

/**
 * Fade-out time at the end of a phase's chip window.
 *
 * Purpose: Chips leave smoothly before the next stage starts.
 * When to use: `combatDiceChipOpacity`.
 * Expected outcome: Opacity ramps from 1 to 0 over the last this many milliseconds.
 * Exceptions: None.
 */
export const COMBAT_DICE_FADE_OUT_MS = 250;

/**
 * Short label at the start of each chip row.
 *
 * Purpose: Tells attack rolls from defense, return fire, and anti-air at a glance.
 * When to use: `CombatDiceChipRow.tag`.
 * Expected outcome: `ATK`, `DEF`, `RET`, or `AA`.
 * Exceptions: None.
 */
export type CombatDiceChipTag = 'ATK' | 'DEF' | 'RET' | 'AA';

/**
 * Resolution phases that roll dice.
 *
 * Purpose: Names the three per-phase roll arrays and their playback windows.
 * When to use: `combatDiceWindowForPhase` and renderer loops over phases.
 * Expected outcome: One value per `CombatDicePlaybackFields` array.
 * Exceptions: None.
 */
export type CombatDicePlaybackPhaseKey = 'airStrike' | 'ranged' | 'melee';

/**
 * Row tag for each roll kind.
 *
 * Purpose: Single mapping from combat roll kinds to chip labels.
 * When to use: Building chip rows.
 * Expected outcome: Attacker kinds map to `ATK`; infrastructure counter-fire shares `AA` with unit anti-air.
 * Exceptions: None.
 */
const TAG_BY_KIND: Readonly<Record<CombatDiceRollKind, CombatDiceChipTag>> = Object.freeze({
  airStrike: 'ATK',
  ranged: 'ATK',
  meleeAttack: 'ATK',
  meleeDefense: 'DEF',
  returnFire: 'RET',
  antiAir: 'AA',
  infrastructureCounterFire: 'AA',
});

/**
 * Row order by roll kind: the side that started the fight first.
 *
 * Purpose: Chips read top-down as attack, then response.
 * When to use: Sorting rows within a chip.
 * Expected outcome: Earlier kinds sort first.
 * Exceptions: None.
 */
const KIND_ORDER: readonly CombatDiceRollKind[] = [
  'airStrike',
  'ranged',
  'meleeAttack',
  'returnFire',
  'meleeDefense',
  'antiAir',
  'infrastructureCounterFire',
];

/**
 * Row order by player; `null` (infrastructure) and unknown players sort last.
 *
 * Purpose: Stable row order when both sides roll the same kind.
 * When to use: Sorting rows within a chip.
 * Expected outcome: Human rows before opponent rows.
 * Exceptions: None.
 */
const PLAYER_ORDER: readonly string[] = ['human', 'opponent'];

/**
 * Row order by unit type; unknown types sort last.
 *
 * Purpose: Stable row order within one side, matching the usual unit listing order.
 * When to use: Sorting rows within a chip.
 * Expected outcome: Infantry, armor, naval, then air.
 * Exceptions: None.
 */
const UNIT_TYPE_ORDER: readonly string[] = ['infantry', 'armor', 'naval', 'air'];

/**
 * One line of a dice chip: all rolls of one kind, side, unit type, and hit number at one anchor.
 *
 * Purpose: Collapses a stack's identical rolls into one compact line.
 * When to use: Produced by `buildCombatDiceChips`; drawn by the renderer.
 * Expected outcome: `faces` holds every face (ascending) when `rollCount <= COMBAT_DICE_ROW_MAX_FACES`, and is empty
 *   otherwise, meaning the row is shown as a `hitCount/rollCount` tally.
 * Exceptions: None.
 */
export interface CombatDiceChipRow {
  /**
   * Label drawn first on the line.
   *
   * Contract: Derived from `kind`.
   * When to use: Row label.
   * Expected outcome: `ATK`, `DEF`, `RET`, or `AA`.
   * Exceptions: None.
   */
  readonly tag: CombatDiceChipTag;
  /**
   * Roll kind shared by every roll in the row.
   *
   * Contract: Same as the grouped rolls' `kind`.
   * When to use: Styling decisions that depend on the exact kind.
   * Expected outcome: One `CombatDiceRollKind`.
   * Exceptions: None.
   */
  readonly kind: CombatDiceRollKind;
  /**
   * Player that rolled.
   *
   * Contract: `null` only for infrastructure counter-fire.
   * When to use: Mini-token color.
   * Expected outcome: Same as the grouped rolls' `player`.
   * Exceptions: None.
   */
  readonly player: string | null;
  /**
   * Unit type that rolled.
   *
   * Contract: `null` only for infrastructure counter-fire.
   * When to use: Mini-token glyph.
   * Expected outcome: Same as the grouped rolls' `unitType`.
   * Exceptions: None.
   */
  readonly unitType: string | null;
  /**
   * Infrastructure that fired back.
   *
   * Contract: Present only for infrastructure counter-fire rows.
   * When to use: Label in place of a mini token.
   * Expected outcome: `urban`, `airport`, or `seaport`.
   * Exceptions: None.
   */
  readonly infrastructureType?: CombatDiceRoll['infrastructureType'];
  /**
   * Hit number every roll in the row was compared with.
   *
   * Contract: A roll hit when its face is at or below this value.
   * When to use: Drawn as `≤threshold` at the end of the line.
   * Expected outcome: Same for every grouped roll.
   * Exceptions: None.
   */
  readonly threshold: number;
  /**
   * Number of rolls in the row.
   *
   * Contract: At least 1.
   * When to use: Tally denominator.
   * Expected outcome: Count of grouped rolls.
   * Exceptions: None.
   */
  readonly rollCount: number;
  /**
   * Number of rolls in the row that hit.
   *
   * Contract: From 0 to `rollCount`.
   * When to use: Tally numerator.
   * Expected outcome: Count of grouped rolls with `face <= threshold`.
   * Exceptions: None.
   */
  readonly hitCount: number;
  /**
   * Individual faces, ascending, or empty for a tally row.
   *
   * Contract: Non-empty only when `rollCount <= COMBAT_DICE_ROW_MAX_FACES`.
   * When to use: Drawing faces in hit or miss colors.
   * Expected outcome: Sorted copy of the grouped faces.
   * Exceptions: None.
   */
  readonly faces: readonly number[];
}

/**
 * All rows drawn under one anchor's token for one phase.
 *
 * Purpose: The unit the renderer positions and fades.
 * When to use: Produced by `buildCombatDiceChips`.
 * Expected outcome: At most `COMBAT_DICE_CHIP_MAX_LINES` lines including the "+N more" line.
 * Exceptions: None.
 */
export interface CombatDiceChip {
  /**
   * Hex or cell whose token the chip hangs from.
   *
   * Contract: The rolls' shared `anchorH3Index`.
   * When to use: Positioning the chip.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly anchorH3Index: string;
  /**
   * Rows to draw, in display order.
   *
   * Contract: Never empty; trimmed to leave room for the "+N more" line when rows are hidden.
   * When to use: Drawing the chip body.
   * Expected outcome: Sorted by kind, player, unit type, then threshold (highest first).
   * Exceptions: None.
   */
  readonly rows: readonly CombatDiceChipRow[];
  /**
   * Rows left out to keep the chip small.
   *
   * Contract: 0 when every row fits.
   * When to use: Drawing a final "+N more" line when positive.
   * Expected outcome: Count of omitted rows.
   * Exceptions: None.
   */
  readonly hiddenRowCount: number;
}

/**
 * Fog filter for playback dice.
 *
 * Purpose: Drops rolls the player is not allowed to see.
 * When to use: `pickPlaybackDiceRolls` on strategic playback; tactical battles pass none.
 * Expected outcome: A roll is kept only when its anchor was visible before or after the turn and is not unknown, so
 *   a stack that dies on a hex that then leaves vision still shows its dice.
 * Exceptions: None.
 */
export interface CombatDiceVisibility {
  /**
   * Hexes the player could see when Ready was clicked.
   *
   * Contract: Rolls anchored here are kept unless the hex is unknown.
   * When to use: Always, with the renderer's visible hex set for the state captured before the turn resolved.
   * Expected outcome: Membership test only.
   * Exceptions: None.
   */
  readonly visibleHexesBeforeTurn: ReadonlySet<string>;
  /**
   * Hexes the player can see after the turn.
   *
   * Contract: Rolls anchored here are kept unless the hex is unknown.
   * When to use: Always, with the renderer's visible hex set for the reloaded state.
   * Expected outcome: Membership test only.
   * Exceptions: None.
   */
  readonly visibleHexesAfterTurn: ReadonlySet<string>;
  /**
   * Hexes drawn as unknown combat or casualty markers.
   *
   * Contract: Rolls anchored here are dropped even when the hex is visible.
   * When to use: Always, with the unknown combat and casualty hexes.
   * Expected outcome: Membership test only.
   * Exceptions: None.
   */
  readonly unknownHexes: ReadonlySet<string>;
}

/**
 * Tells whether one roll hit.
 *
 * Purpose: Single hit rule for chip rows and drawing.
 * When to use: Anywhere a recorded roll is shown as hit or miss.
 * Expected outcome: True when `face <= threshold`, matching combat resolution.
 * Exceptions: None.
 */
export function isCombatDiceHit(roll: Pick<CombatDiceRoll, 'face' | 'threshold'>): boolean {
  return roll.face <= roll.threshold;
}

/**
 * Returns a value's position in an order list, with unlisted values last.
 *
 * Purpose: Shared comparator step for player and unit-type ordering.
 * When to use: Row sorting in this module.
 * Expected outcome: The index in `order`, or `order.length` for `null` and unlisted values.
 * Exceptions: None.
 */
function orderIndex(order: readonly string[], value: string | null): number {
  const index = value === null ? -1 : order.indexOf(value);
  return index < 0 ? order.length : index;
}

/**
 * Compares two chip rows for display order.
 *
 * Purpose: Attack rows before responses; then human before opponent; then unit type; then the easier hit number first.
 * When to use: Sorting rows within one chip.
 * Expected outcome: Negative, zero, or positive like `Array.prototype.sort` comparators.
 * Exceptions: None.
 */
function compareRows(a: CombatDiceChipRow, b: CombatDiceChipRow): number {
  return (
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    orderIndex(PLAYER_ORDER, a.player) - orderIndex(PLAYER_ORDER, b.player) ||
    orderIndex(UNIT_TYPE_ORDER, a.unitType) - orderIndex(UNIT_TYPE_ORDER, b.unitType) ||
    b.threshold - a.threshold
  );
}

/**
 * Builds one chip row from rolls that share kind, side, unit type, infrastructure, and hit number.
 *
 * Purpose: Turns a roll group into faces or a tally.
 * When to use: `buildCombatDiceChips` once per group.
 * Expected outcome: A row whose counts describe `group`; `group` must be non-empty.
 * Exceptions: None.
 */
function buildRow(group: readonly CombatDiceRoll[]): CombatDiceChipRow {
  const first = group[0]!;
  const faces = group.length <= COMBAT_DICE_ROW_MAX_FACES ? group.map((r) => r.face).sort((a, b) => a - b) : [];
  return {
    tag: TAG_BY_KIND[first.kind],
    kind: first.kind,
    player: first.player,
    unitType: first.unitType,
    ...(first.infrastructureType ? { infrastructureType: first.infrastructureType } : {}),
    threshold: first.threshold,
    rollCount: group.length,
    hitCount: group.filter(isCombatDiceHit).length,
    faces,
  };
}

/**
 * Groups one phase's rolls into chips, one per anchor.
 *
 * Purpose: Compact display of every die a phase rolled, hung from the stacks that rolled them.
 * When to use: Once per phase roll array; callers may memoize because the result depends only on `rolls`.
 * Expected outcome: Chips in order of each anchor's first roll. Rows group rolls by kind, player, unit type,
 *   infrastructure type, and threshold. When a chip has more rows than `COMBAT_DICE_CHIP_MAX_LINES`, it keeps the
 *   first `COMBAT_DICE_CHIP_MAX_LINES - 1` rows and counts the rest in `hiddenRowCount`.
 * Exceptions: None. An empty input gives an empty list.
 */
export function buildCombatDiceChips(rolls: readonly CombatDiceRoll[]): CombatDiceChip[] {
  const groupsByAnchor = new Map<string, Map<string, CombatDiceRoll[]>>();
  for (const roll of rolls) {
    const groups = groupsByAnchor.get(roll.anchorH3Index) ?? new Map<string, CombatDiceRoll[]>();
    groupsByAnchor.set(roll.anchorH3Index, groups);
    const key = [roll.kind, roll.player, roll.unitType, roll.infrastructureType, roll.threshold].join('|');
    groups.set(key, [...(groups.get(key) ?? []), roll]);
  }
  return [...groupsByAnchor].map(([anchorH3Index, groups]) => {
    const rows = [...groups.values()].map(buildRow).sort(compareRows);
    if (rows.length <= COMBAT_DICE_CHIP_MAX_LINES) return { anchorH3Index, rows, hiddenRowCount: 0 };
    const visibleRows = rows.slice(0, COMBAT_DICE_CHIP_MAX_LINES - 1);
    return { anchorH3Index, rows: visibleRows, hiddenRowCount: rows.length - visibleRows.length };
  });
}

/**
 * Returns the playback time window in which one phase's chips are shown.
 *
 * Purpose: Chips stay up from the phase's lightning beat through its casualty beat without changing the timeline.
 * When to use: Each frame, with the phase from `getResolutionPlaybackPhase`.
 * Expected outcome: Air strike: combat start to return start. Ranged: combat start to movement start. Melee: combat
 *   start to the end of playback. The window is empty when that phase has no beats.
 * Exceptions: None.
 */
export function combatDiceWindowForPhase(
  phase: ResolutionPlaybackPhase,
  which: CombatDicePlaybackPhaseKey
): { readonly startMs: number; readonly endMs: number } {
  if (which === 'airStrike') return { startMs: phase.airStrikeCombatStart, endMs: phase.airStrikeReturnStart };
  if (which === 'ranged') return { startMs: phase.rangedCombatStart, endMs: phase.movementStart };
  return { startMs: phase.meleeCombatStart, endMs: phase.totalMs };
}

/**
 * Returns chip opacity at one moment of a chip window.
 *
 * Purpose: Fades chips in and out at the window edges.
 * When to use: Each frame, per phase, with that phase's window.
 * Expected outcome: 0 outside `[startMs, endMs)` and for an empty window; otherwise the smaller of a linear ramp up
 *   over `COMBAT_DICE_FADE_IN_MS` and a linear ramp down over the last `COMBAT_DICE_FADE_OUT_MS`, capped at 1.
 * Exceptions: None.
 */
export function combatDiceChipOpacity(elapsedMs: number, startMs: number, endMs: number): number {
  if (!(endMs > startMs) || elapsedMs < startMs || elapsedMs >= endMs) return 0;
  const fadeIn = (elapsedMs - startMs) / COMBAT_DICE_FADE_IN_MS;
  const fadeOut = (endMs - elapsedMs) / COMBAT_DICE_FADE_OUT_MS;
  return Math.min(1, fadeIn, fadeOut);
}

/**
 * Copies the dice fields of a resolution payload, optionally dropping rolls hidden by fog.
 *
 * Purpose: One place for the fog rule and the omit-when-empty rule when playback state is built.
 * When to use: When building `S.resolutionMoveAnimation` from a strategic Ready result (with `visibility`) or a
 *   tactical commit (without it, because tactical battles are fully visible).
 * Expected outcome: New arrays containing only kept rolls, in original order; each array is omitted when empty.
 * Exceptions: None.
 */
export function pickPlaybackDiceRolls(
  source: CombatDicePlaybackFields,
  visibility?: CombatDiceVisibility
): CombatDicePlaybackFields {
  const keep = (roll: CombatDiceRoll): boolean =>
    !visibility ||
    ((visibility.visibleHexesBeforeTurn.has(roll.anchorH3Index) || visibility.visibleHexesAfterTurn.has(roll.anchorH3Index)) &&
      !visibility.unknownHexes.has(roll.anchorH3Index));
  const airStrikeDiceRolls = (source.airStrikeDiceRolls ?? []).filter(keep);
  const rangedDiceRolls = (source.rangedDiceRolls ?? []).filter(keep);
  const meleeDiceRolls = (source.meleeDiceRolls ?? []).filter(keep);
  return {
    ...(airStrikeDiceRolls.length > 0 ? { airStrikeDiceRolls } : {}),
    ...(rangedDiceRolls.length > 0 ? { rangedDiceRolls } : {}),
    ...(meleeDiceRolls.length > 0 ? { meleeDiceRolls } : {}),
  };
}
