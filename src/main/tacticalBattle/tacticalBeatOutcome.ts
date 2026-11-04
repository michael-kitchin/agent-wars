/**
 * What one resolved tactical beat produced.
 *
 * Purpose: Playback and loss notes are built once from the same air, ranged, ferry, and melee results.
 * When to use: The success path of a human beat and of an AI-only beat.
 * Expected outcome: The stored battle plus the phase results the commit turns into playback.
 */

import type { AirDropAnimationMove, AirStrikeAnimationMove } from '../../shared/ipcTypes';
import type { CombatDiceRoll } from '../../shared/ipc/combatDiceTypes';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { applyTacticalMeleeAfterSupportOrders } from './tacticalMeleeApply';

/**
 * The resolved battle and every phase result a commit needs for playback.
 *
 * Purpose: One shape for a human beat and an AI-only beat so the playback builder does not care which path produced it.
 * When to use: The success branch of `applyHumanTacticalDraftBeatInStrategicOrder` and `applyAiOnlyTacticalBeat`.
 * Expected outcome: `battle` is the snapshot stored after the beat. The other fields are the phase results from that beat.
 * Exceptions: None. A failed beat does not produce this object.
 */
export interface TacticalBeatOutcome {
  /**
   * The snapshot stored after this beat, including the next turn number and any end reason.
   *
   * Contract: The active session's snapshot when the beat succeeds.
   * When to use: The commit result's `tacticalBattle`.
   * Expected outcome: Sub-units reflect movement, fire, ferry, and melee.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot;
  /**
   * The snapshot after both seats' marches and before embark and ferry.
   *
   * Contract: Positions used to draw march playback. Ferry has not moved air units yet.
   * When to use: March `to` cells in playback.
   * Expected outcome: March destinations are on this snapshot. Ferry removals are not.
   * Exceptions: None.
   */
  readonly battleAfterMovementBeforeFerry: TacticalBattleSnapshot;
  /**
   * Ranged kills from this beat, one edge per removed sub-unit.
   *
   * Contract: The same list the air-and-ranged phase returned.
   * When to use: Direct-fire playback and the loss note.
   * Expected outcome: Empty when ranged fire removed nothing.
   * Exceptions: None.
   */
  readonly killsByDirectFire: KillEdge[];
  /**
   * Air-strike kills from this beat.
   *
   * Contract: The same list the air phase returned.
   * When to use: Air-strike playback and the loss note.
   * Expected outcome: Empty when no air strike removed a sub-unit.
   * Exceptions: None.
   */
  readonly killsByAirStrike: KillEdge[];
  /**
   * Return-fire kills from this beat, including anti-air.
   *
   * Contract: The same list the air-and-ranged phase returned.
   * When to use: Return-fire playback and the loss note.
   * Expected outcome: Empty when nothing shot back.
   * Exceptions: None.
   */
  readonly killsByReturnFire: KillEdge[];
  /**
   * Sub-units removed by air, ranged fire, and ferry.
   *
   * Contract: Melee removals stay on `meleePack`. Ferry removals from both seats are included.
   * When to use: Ranged-removal playback and the loss note.
   * Expected outcome: One snapshot per removed sub-unit.
   * Exceptions: None.
   */
  readonly removedUnits: RemovedUnitSnapshot[];
  /**
   * Infrastructure the beat destroyed.
   *
   * Contract: The events the air-and-ranged phase recorded.
   * When to use: Infrastructure reconcile and playback.
   * Expected outcome: Empty when no city, airport, or port was destroyed.
   * Exceptions: None.
   */
  readonly infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
  /**
   * How many air strikes were attempted.
   *
   * Contract: A count, including strikes that missed.
   * When to use: Air-strike playback. Omitted from playback when zero.
   * Expected outcome: Zero when neither draft struck.
   * Exceptions: None.
   */
  readonly airStrikeAttemptCount: number;
  /**
   * Air-strike animation moves.
   *
   * Contract: The outbound and return legs the air phase recorded.
   * When to use: Air-strike playback.
   * Expected outcome: Empty when there was no strike.
   * Exceptions: None.
   */
  readonly airStrikePlaybackMoves: AirStrikeAnimationMove[];
  /**
   * Air-drop animation rows.
   *
   * Contract: Present when a drop resolved this beat. Missing means none.
   * When to use: Playback assembly.
   * Expected outcome: The air unit returns when it survived. The infantry id is set only when it landed.
   * Exceptions: None.
   */
  readonly airDropPlaybackMoves?: readonly AirDropAnimationMove[];
  /**
   * Cells an air strike targeted.
   *
   * Contract: One cell per strike target the air phase recorded.
   * When to use: Air-strike hex playback.
   * Expected outcome: Empty when there was no strike.
   * Exceptions: None.
   */
  readonly airStrikePlaybackStrikeHexes: string[];
  /**
   * Cells where an air strike caused a casualty.
   *
   * Contract: A subset of the strike cells.
   * When to use: Air-strike casualty playback.
   * Expected outcome: Empty when every strike missed.
   * Exceptions: None.
   */
  readonly airStrikePlaybackCasualtyHexes: string[];
  /**
   * Sub-units removed during the air phase, before ranged removals.
   *
   * Contract: The air phase's own removal list, not the later ranged or ferry removals.
   * When to use: Air-strike removal playback.
   * Expected outcome: Empty when air removed nothing.
   * Exceptions: None.
   */
  readonly airStrikePlaybackRemovedUnits: RemovedUnitSnapshot[];
  /**
   * Hex-to-hex shot lines for direct fire and return fire.
   *
   * Contract: The lines the ranged phase recorded.
   * When to use: Lightning playback.
   * Expected outcome: Empty when nothing fired.
   * Exceptions: None.
   */
  readonly rangedResolutionShotLines: RangedResolutionShotLine[];
  /**
   * Air-strike dice, in roll order.
   *
   * Contract: The rolls the air phase recorded.
   * When to use: Dice-chip playback.
   * Expected outcome: Empty when there was no air roll.
   * Exceptions: None.
   */
  readonly airStrikeDiceRolls: CombatDiceRoll[];
  /**
   * Ranged dice, in roll order.
   *
   * Contract: The rolls the ranged phase recorded.
   * When to use: Dice-chip playback.
   * Expected outcome: Empty when there was no ranged roll.
   * Exceptions: None.
   */
  readonly rangedDiceRolls: CombatDiceRoll[];
  /**
   * The melee pass, with `battle` set to the snapshot stored after the beat.
   *
   * Contract: Kill, hex, and dice fields come from `applyTacticalMeleeAfterSupportOrders`.
   * When to use: Melee playback and the melee portion of the loss note.
   * Expected outcome: `meleeCombatHexes` lists contested cells. `meleeDiceRolls` lists the dice.
   * Exceptions: None.
   */
  readonly meleePack: ReturnType<typeof applyTacticalMeleeAfterSupportOrders>;
}
