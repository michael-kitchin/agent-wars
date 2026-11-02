/**
 * Which AI-versus-AI battle a match may offer while nobody is playing.
 *
 * Purpose: The new-game control and the stored match setting share one list.
 * When to use: Starting a match, and reading `ai_only_battles` back.
 * Expected outcome: Helpers do not read the database. Callers pass the string they already have.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { hashStringToUint32 } from './stableHash';

/**
 * The four choices for an observed match.
 *
 * Purpose: One id is stored for the match. The control labels them Balanced, Unbalanced, Random, and None.
 * When to use: The new-game select and both parsers.
 * Expected outcome: `balanced`, `unbalanced`, `random`, or `none`.
 * Exceptions: None.
 */
export const AI_ONLY_BATTLE_MODES = ['balanced', 'unbalanced', 'random', 'none'] as const;

/**
 * A stored AI-only battle choice.
 *
 * Purpose: Narrows a config string to one of `AI_ONLY_BATTLE_MODES`.
 * When to use: The snapshot and the new-game payload after parsing.
 * Expected outcome: One of the four mode ids.
 * Exceptions: None.
 */
export type AiOnlyBattleMode = (typeof AI_ONLY_BATTLE_MODES)[number];

/**
 * Choice stored when a new game does not name one.
 *
 * Purpose: A fresh match offers the closest battle.
 * When to use: `aiOnlyBattlesForRequest` and the new-game select.
 * Expected outcome: `balanced`.
 * Exceptions: None.
 */
export const DEFAULT_AI_ONLY_BATTLES: AiOnlyBattleMode = 'balanced';

/**
 * Choice used when a saved match has no row.
 *
 * Purpose: An old save keeps today's observe behavior and does not start a battle.
 * When to use: `aiOnlyBattlesFromStored`.
 * Expected outcome: `none`.
 * Exceptions: None.
 */
export const STORED_AI_ONLY_BATTLES_WHEN_MISSING: AiOnlyBattleMode = 'none';

/**
 * Labels for the new-game control.
 *
 * Purpose: The stored id stays lowercase. The control says Balanced, Unbalanced, Random, or None.
 * When to use: Filling `#new-game-ai-only-battles-select`.
 * Expected outcome: Those four labels, in mode order.
 * Exceptions: None.
 */
export const AI_ONLY_BATTLE_LABELS: Readonly<Record<AiOnlyBattleMode, string>> = {
  balanced: 'Balanced',
  unbalanced: 'Unbalanced',
  random: 'Random',
  none: 'None',
};

/**
 * Whether a string is one of the four modes.
 *
 * Purpose: An unlisted request or a damaged row must not be stored as itself.
 * When to use: Both parsers.
 * Expected outcome: True only for the four ids.
 * Exceptions: None.
 */
function isAiOnlyBattleMode(value: unknown): value is AiOnlyBattleMode {
  return (AI_ONLY_BATTLE_MODES as readonly unknown[]).includes(value);
}

/**
 * The mode to store when a match starts.
 *
 * Purpose: A new game defaults to Balanced. An unknown string does too.
 * When to use: `resetGameForNewMatch`, before the row is written.
 * Expected outcome: The named mode, or `balanced` when the value is omitted or not one of the four.
 * Exceptions: None.
 */
export function aiOnlyBattlesForRequest(value: unknown): AiOnlyBattleMode {
  return isAiOnlyBattleMode(value) ? value : DEFAULT_AI_ONLY_BATTLES;
}

/**
 * The mode stored on a match that is already running.
 *
 * Purpose: A missing row is an old save. It must not start fighting.
 * When to use: Reading `ai_only_battles` from `game_config`.
 * Expected outcome: The named mode, or `none` when the row is missing or not one of the four.
 * Exceptions: None.
 */
export function aiOnlyBattlesFromStored(value: unknown): AiOnlyBattleMode {
  return isAiOnlyBattleMode(value) ? value : STORED_AI_ONLY_BATTLES_WHEN_MISSING;
}

/**
 * One side's tactical sub-unit count on a contested hex.
 *
 * Purpose: Battle choice compares these counts. It does not read parent rows itself.
 * When to use: A row passed to `selectAiOnlyBattle`.
 * Expected outcome: `ownerId` names the side. `subUnitCount` is that side's weight.
 * Exceptions: None.
 */
export interface AiOnlyBattleSide {
  /**
   * The side that owns the counted parents.
   *
   * Contract: Compared with `localeCompare` when two counts tie.
   * When to use: Picking which two sides a hex scores.
   * Expected outcome: A seat id.
   * Exceptions: None.
   */
  readonly ownerId: string;
  /**
   * That side's tactical sub-unit weight on the hex.
   *
   * Contract: Zero is allowed. A larger count of zero makes the ratio zero.
   * When to use: The ratio and the absolute gap.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly subUnitCount: number;
}

/**
 * One contested hex the choice may pick.
 *
 * Purpose: The caller already decided which hexes are candidates.
 * When to use: `selectAiOnlyBattle`.
 * Expected outcome: `h3Index` is the strategic hex. `sides` are the owners on it.
 * Exceptions: None.
 */
export interface AiOnlyBattleRow {
  /**
   * The strategic hex.
   *
   * Contract: Returned when this row wins. Ties break on `localeCompare` of this id.
   * When to use: The result of the choice.
   * Expected outcome: The hex id the caller supplied.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The sides on that hex.
   *
   * Contract: Two sides are the usual row. More than two are scored on one pair.
   * When to use: Balanced uses the two largest. Unbalanced uses the least-equal pair.
   * Expected outcome: One entry per owner the caller counted.
   * Exceptions: A row with fewer than two sides is skipped.
   */
  readonly sides: readonly AiOnlyBattleSide[];
}

/**
 * What the caller already knows when it asks for a hex.
 *
 * Purpose: The choice stays pure. The caller passes the mode, the match seed, the turn, and the rows.
 * When to use: `selectAiOnlyBattle`.
 * Expected outcome: `seed` is the stored `game_seed`, not a combat draw.
 * Exceptions: None.
 */
export interface SelectAiOnlyBattleArgs {
  /**
   * Balanced, Unbalanced, Random, or None.
   *
   * Contract: None returns null.
   * When to use: The match's stored choice.
   * Expected outcome: One of `AI_ONLY_BATTLE_MODES`.
   * Exceptions: None.
   */
  readonly mode: AiOnlyBattleMode;
  /**
   * The stored match seed.
   *
   * Contract: Random hashes this with the turn and the hex ids. It does not draw combat dice.
   * When to use: Random only. The other modes ignore it.
   * Expected outcome: The `game_seed` row.
   * Exceptions: None.
   */
  readonly seed: number;
  /**
   * The strategic turn being resolved.
   *
   * Contract: Included in the Random hash so two turns can pick different hexes.
   * When to use: Random only.
   * Expected outcome: The turn number already in the ready pipeline.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The contested hexes that can be fought.
   *
   * Contract: An empty list returns null.
   * When to use: After the caller has counted each side.
   * Expected outcome: One row per candidate hex.
   * Exceptions: None.
   */
  readonly rows: readonly AiOnlyBattleRow[];
}

/**
 * How close two counts are, and how far apart they are.
 *
 * Purpose: Balanced wants the ratio nearest 1. Unbalanced wants the ratio farthest from 1. A tie uses the gap.
 * When to use: Scoring one pair.
 * Expected outcome: `ratio` is the smaller count divided by the larger, or 0 when the larger is 0. `gap` is the absolute difference.
 * Exceptions: None.
 */
interface PairScore {
  /**
   * The smaller count divided by the larger.
   *
   * Contract: 0 when the larger count is 0. Otherwise between 0 and 1.
   * When to use: Balanced picks the ratio nearest 1. Unbalanced picks the ratio farthest from 1.
   * Expected outcome: A number from 0 through 1.
   * Exceptions: None.
   */
  readonly ratio: number;
  /**
   * The absolute difference between the two counts.
   *
   * Contract: Used only when two pairs have the same ratio.
   * When to use: Breaking a ratio tie before the hex id.
   * Expected outcome: A non-negative number.
   * Exceptions: None.
   */
  readonly gap: number;
  /**
   * The two owner ids, in locale order, joined so a pair has one key.
   *
   * Contract: Order does not depend on which side was listed first.
   * When to use: Telling two pairs apart when ratio and gap also match.
   * Expected outcome: A stable string for that pair of owners.
   * Exceptions: None.
   */
  readonly ownerKey: string;
}

/**
 * The ratio and gap of two counts.
 *
 * Purpose: Both modes score a pair the same way and then sort in opposite directions.
 * When to use: After the pair of sides has been chosen.
 * Expected outcome: A larger count of 0 scores ratio 0. The owner key is the two ids in `localeCompare` order.
 * Exceptions: None.
 */
function scorePair(left: AiOnlyBattleSide, right: AiOnlyBattleSide): PairScore {
  const larger = Math.max(left.subUnitCount, right.subUnitCount);
  const smaller = Math.min(left.subUnitCount, right.subUnitCount);
  const owners = [left.ownerId, right.ownerId].sort((a, b) => a.localeCompare(b));
  return {
    ratio: larger === 0 ? 0 : smaller / larger,
    gap: Math.abs(left.subUnitCount - right.subUnitCount),
    ownerKey: `${owners[0]}\u0000${owners[1]}`,
  };
}

/**
 * The two sides Balanced scores.
 *
 * Purpose: More than two sides still compare only the two largest counts.
 * When to use: Balanced.
 * Expected outcome: The higher count first. An equal count breaks to the lower owner id.
 * Exceptions: None. The caller has already required two sides.
 */
function twoLargest(sides: readonly AiOnlyBattleSide[]): readonly [AiOnlyBattleSide, AiOnlyBattleSide] {
  const ordered = [...sides].sort((left, right) => {
    if (right.subUnitCount !== left.subUnitCount) return right.subUnitCount - left.subUnitCount;
    return left.ownerId.localeCompare(right.ownerId);
  });
  return [ordered[0]!, ordered[1]!];
}

/**
 * The pair Unbalanced scores.
 *
 * Purpose: More than two sides still compare only the least-equal pair.
 * When to use: Unbalanced.
 * Expected outcome: The lowest ratio, then the smaller gap, then the lower owner-id pair.
 * Exceptions: None. The caller has already required two sides.
 */
function leastEqualPair(sides: readonly AiOnlyBattleSide[]): PairScore {
  let best: PairScore | null = null;
  for (let leftIndex = 0; leftIndex < sides.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sides.length; rightIndex += 1) {
      const score = scorePair(sides[leftIndex]!, sides[rightIndex]!);
      if (
        best === null
        || score.ratio < best.ratio
        || (score.ratio === best.ratio && score.gap < best.gap)
        || (score.ratio === best.ratio && score.gap === best.gap && score.ownerKey.localeCompare(best.ownerKey) < 0)
      ) {
        best = score;
      }
    }
  }
  return best!;
}

/**
 * Whether `candidate` should replace `best` for this mode.
 *
 * Purpose: Balanced wants the higher ratio. Unbalanced wants the lower ratio. Both then want the smaller gap and the lower hex id.
 * When to use: Walking the scored rows.
 * Expected outcome: True when the candidate is the better battle.
 * Exceptions: None.
 */
function candidateWins(
  mode: 'balanced' | 'unbalanced',
  candidate: { readonly ratio: number; readonly gap: number; readonly h3Index: string },
  best: { readonly ratio: number; readonly gap: number; readonly h3Index: string }
): boolean {
  if (candidate.ratio !== best.ratio) {
    return mode === 'balanced' ? candidate.ratio > best.ratio : candidate.ratio < best.ratio;
  }
  if (candidate.gap !== best.gap) return candidate.gap < best.gap;
  return candidate.h3Index.localeCompare(best.h3Index) < 0;
}

/**
 * The strategic hex to fight, or null when no battle is offered.
 *
 * Purpose: One pure choice for Balanced, Unbalanced, Random, and None.
 * When to use: The ready pipeline, after it has counted each candidate hex.
 * Expected outcome: None and an empty list return null. Balanced returns the hex whose scored pair is closest to equal.
 *   Unbalanced returns the least equal. Random returns a stable hex for the same seed, turn, and hex ids.
 * Exceptions: None.
 */
export function selectAiOnlyBattle(args: SelectAiOnlyBattleArgs): string | null {
  if (args.mode === 'none' || args.rows.length === 0) return null;
  const rows = args.rows.filter((row) => row.sides.length >= 2);
  if (rows.length === 0) return null;
  if (args.mode === 'random') {
    const hexIds = rows.map((row) => row.h3Index).sort((left, right) => left.localeCompare(right));
    const hash = hashStringToUint32(`${args.seed >>> 0}|${args.turnNumber}|${hexIds.join(',')}`);
    return hexIds[(hash >>> 0) % hexIds.length] ?? null;
  }
  let best: { readonly ratio: number; readonly gap: number; readonly h3Index: string } | null = null;
  for (const row of rows) {
    const score = args.mode === 'balanced'
      ? scorePair(...twoLargest(row.sides))
      : leastEqualPair(row.sides);
    const candidate = { ratio: score.ratio, gap: score.gap, h3Index: row.h3Index };
    if (best === null || candidateWins(args.mode, candidate, best)) best = candidate;
  }
  return best?.h3Index ?? null;
}
