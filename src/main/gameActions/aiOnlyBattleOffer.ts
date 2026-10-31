/**
 * Picks the one AI-only battle an observed match may fight this turn.
 *
 * Purpose: Ready still resolves every other melee on the world map. This choice does not change a human who is playing.
 * When to use: The ready pipeline when nobody is playing and the stored choice is not None.
 * Expected outcome: At most one hex stays eligible. No hex means the turn does not pause.
 * Exceptions: None. A hex that cannot be placed is left ineligible.
 */

import { selectAiOnlyBattle, type AiOnlyBattleMode } from '../../shared/aiOnlyBattles';
import type { CombatUnit } from '../combatUnitTypes';
import type { MeleeCandidateRow } from '../../shared/ipc/meleeInterceptTypes';
import { isAiSeatId } from '../../shared/seatIds';
import { isSeatActive, type SeatRecord } from '../../shared/seatRoster';
import { tacticalSubUnitCountForOwner } from '../../shared/tacticalSubUnitCounts';
import { logDebug } from '../logger';
import { buildMeleeInterceptCandidateRows, filterMeleeCandidateHexesWithTacticalEntry, type MeleePartySeat } from './meleeInterceptCandidates';

/**
 * What the ready pipeline already has when it asks for one battle.
 *
 * Purpose: The choice stays next to the melee rows instead of growing the pipeline file.
 * When to use: `buildAiOnlyBattleOffer`.
 * Expected outcome: Hexes are the raw contested list, not a fog filter.
 * Exceptions: None.
 */
export interface AiOnlyBattleOfferArgs {
  /**
   * Contested strategic hexes before fog.
   *
   * Contract: Every hex melee would consider, including ones the watched seat cannot see.
   * When to use: The list from `listMeleeCandidateHexes`.
   * Expected outcome: The offer may pick a hex outside that seat's view.
   * Exceptions: None.
   */
  readonly hexes: readonly string[];
  /**
   * Units still on the map after movement and fire.
   *
   * Contract: `player`, `unitType`, and `h3Index` are enough to weigh a side.
   * When to use: The combat units the melee phase would have used.
   * Expected outcome: Counts use the tactical weight of each parent.
   * Exceptions: None.
   */
  readonly units: readonly CombatUnit[];
  /**
   * Seat order for the party rows.
   *
   * Contract: The same seats `buildMeleeInterceptCandidateRows` uses.
   * When to use: Building the dialog rows.
   * Expected outcome: Two AI parties stay in seat order.
   * Exceptions: None.
   */
  readonly partySeats: readonly MeleePartySeat[];
  /**
   * The roster, including knocked-out seats.
   *
   * Contract: A seat with `outTurn` set is not a live candidate.
   * When to use: Checking that both owners are still playing.
   * Expected outcome: A knocked-out seat keeps the hex on the world map.
   * Exceptions: None.
   */
  readonly roster: readonly Pick<SeatRecord, 'seatId' | 'outTurn'>[];
  /**
   * The stored choice.
   *
   * Contract: None yields no chosen hex.
   * When to use: `readAiOnlyBattles`.
   * Expected outcome: Balanced, Unbalanced, Random, or None.
   * Exceptions: None.
   */
  readonly mode: AiOnlyBattleMode;
  /**
   * The stored match seed.
   *
   * Contract: `getGameSeed()`, not a combat draw.
   * When to use: Random only.
   * Expected outcome: The same seed picks the same hex for the same turn and hex list.
   * Exceptions: None.
   */
  readonly seed: number;
  /**
   * The strategic turn being resolved.
   *
   * Contract: The turn number already in the ready pipeline.
   * When to use: Random only.
   * Expected outcome: A different turn can pick a different hex.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * Builds the dialog rows and the one hex that may be fought.
 *
 * Purpose: The builder's own eligibility stays human-plus-one. This pass marks only the chosen two-AI hex.
 * When to use: While observing, when the stored choice is not None.
 * Expected outcome: `chosenH3Index` is null when nothing can be placed. Other rows stay ineligible.
 * Exceptions: None.
 */
export function buildAiOnlyBattleOffer(args: AiOnlyBattleOfferArgs): {
  readonly candidates: MeleeCandidateRow[];
  readonly chosenH3Index: string | null;
} {
  const built = buildMeleeInterceptCandidateRows(args.hexes, args.units, args.partySeats);
  const twoAi = built.filter((row) => twoActiveAiParties(row, args.roster));
  const placeable = new Set(filterMeleeCandidateHexesWithTacticalEntry(
    twoAi.map((row) => row.h3Index),
    { allowDuringStrategicResolution: true },
  ));
  const rows = twoAi.filter((row) => placeable.has(row.h3Index)).map((row) => ({
    h3Index: row.h3Index,
    sides: row.parties.map((party) => ({
      ownerId: party.ownerId,
      subUnitCount: tacticalSubUnitCountForOwner(
        args.units.filter((unit) => unit.h3Index === row.h3Index),
        party.ownerId,
      ),
    })),
  }));
  const chosenH3Index = selectAiOnlyBattle({
    mode: args.mode,
    seed: args.seed,
    turnNumber: args.turnNumber,
    rows,
  });
  logDebug('buildAiOnlyBattleOffer', { mode: args.mode, chosenH3Index, candidateCount: rows.length });
  return {
    chosenH3Index,
    candidates: built.map((row) => ({ ...row, tacticalEligible: row.h3Index === chosenH3Index })),
  };
}

/**
 * True when the row is exactly two AI seats that are both still in the match.
 *
 * Purpose: A human, Neutral, a knocked-out seat, or a third side stays on the world map.
 * When to use: Before the placement probe.
 * Expected outcome: False unless both parties are active AI seats.
 * Exceptions: None.
 */
function twoActiveAiParties(row: MeleeCandidateRow, roster: readonly Pick<SeatRecord, 'seatId' | 'outTurn'>[]): boolean {
  if (row.parties.length !== 2) return false;
  return row.parties.every((party) => {
    if (!isAiSeatId(party.ownerId)) return false;
    const seat = roster.find((candidate) => candidate.seatId === party.ownerId);
    return seat != null && isSeatActive(seat);
  });
}
