/**
 * The initiative roll for head-on contact, kept off the combat RNG so combat dice never shift.
 */

import { headOnCellPair, type HeadOnHeldCellPicker } from '../shared/headOnContact';
import { hashStringToUint32 } from '../shared/stableHash';
import { logDebug, logTrace } from './logger';
import { createSeededRng } from './seededRng';

/**
 * Which resolution an initiative roll belongs to.
 *
 * Purpose: Two battles on one turn, or two beats of one battle, must roll independently of each other and of the strategic turn.
 * When to use: The second argument of `createHeadOnInitiativePicker`.
 * Expected outcome: A strategic scope names the turn. A tactical scope also names the battle and the beat.
 */
export type HeadOnInitiativeScope =
  | {
      /**
       * Marks this roll as part of a strategic turn.
       *
       * Contract: The literal `'strategic'`.
       * When to use: `executeReadyStrategicTurn`.
       * Expected outcome: The seed text starts with `strategic` and the turn number.
       * Exceptions: None.
       */
      readonly kind: 'strategic';
      /**
       * The strategic turn being resolved.
       *
       * Contract: `turn_state.turn_number` at the start of Ready.
       * When to use: Every strategic roll.
       * Expected outcome: The same turn always rolls the same cell for the same pair.
       * Exceptions: None.
       */
      readonly turnNumber: number;
    }
  | {
      /**
       * Marks this roll as part of one battle beat.
       *
       * Contract: The literal `'tactical'`.
       * When to use: Both tactical beat paths.
       * Expected outcome: The seed text starts with `tactical` and includes the battle id and the beat.
       * Exceptions: None.
       */
      readonly kind: 'tactical';
      /**
       * The strategic turn that contains this battle.
       *
       * Contract: `TacticalBattleSnapshot.strategicTurnNumber`.
       * When to use: Every battle roll.
       * Expected outcome: A later strategic turn rolls independently.
       * Exceptions: None.
       */
      readonly strategicTurnNumber: number;
      /**
       * The battle this beat belongs to.
       *
       * Contract: `TacticalBattleSnapshot.battleId`.
       * When to use: Every battle roll.
       * Expected outcome: Two battles on one turn do not share rolls.
       * Exceptions: None.
       */
      readonly battleId: string;
      /**
       * The beat being resolved, before it is incremented.
       *
       * Contract: `TacticalBattleSnapshot.tacticalTurnNumber` at the start of the beat.
       * When to use: Every battle roll.
       * Expected outcome: The next beat rolls independently.
       * Exceptions: None.
       */
      readonly tacticalTurnNumber: number;
    };

/**
 * Turns a scope into the stable middle of the seed text.
 *
 * Purpose: Strategic and tactical rolls must not collide, and two beats must not collide.
 * When to use: Inside `createHeadOnInitiativePicker`, once per picker.
 * Expected outcome: `strategic|{turn}` or `tactical|{strategicTurn}|{battleId}|{beat}`.
 * Exceptions: None.
 */
function headOnScopeSeedText(scope: HeadOnInitiativeScope): string {
  return scope.kind === 'strategic'
    ? `strategic|${scope.turnNumber}`
    : `tactical|${scope.strategicTurnNumber}|${scope.battleId}|${scope.tacticalTurnNumber}`;
}

/**
 * Builds a symmetric, reproducible 50/50 choice between two cells.
 *
 * Purpose: The side that holds its cell must be decided without drawing from the combat die stream.
 * When to use: Once per turn or beat. The strategic caller passes `getGameSeed()` and the turn number. A battle passes its own fields.
 * Expected outcome: The same seed, scope, and cells always give the same cell, in either argument order. It draws nothing from any other stream.
 * Exceptions: None.
 */
export function createHeadOnInitiativePicker(gameSeed: number, scope: HeadOnInitiativeScope): HeadOnHeldCellPicker {
  logDebug('createHeadOnInitiativePicker', { gameSeed, scope });
  const scopeText = headOnScopeSeedText(scope);
  return (cellA, cellB) => {
    const [lowCell, highCell] = headOnCellPair(cellA, cellB);
    const roll = createSeededRng(hashStringToUint32(`${gameSeed}|${scopeText}|headOn|${lowCell}|${highCell}`))();
    const heldCell = roll < 0.5 ? lowCell : highCell;
    logTrace('headOnInitiative pick', { scopeText, lowCell, highCell, heldCell });
    return heldCell;
  };
}
