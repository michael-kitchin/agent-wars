import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type {
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  MovementOrder,
  RangedAttackOrder,
} from '../../shared/ipcTypes';
import { gameDbOps } from './dbConnection';
import {
  addAiLossEventsSinceConsultation as addAiLossEventsSinceConsultationFromModule,
  addOpponentCombatParticipants as addOpponentCombatParticipantsFromModule,
  clearAiLossEventsSinceConsultation as clearAiLossEventsSinceConsultationFromModule,
  clearAiPendingOrders as clearAiPendingOrdersFromModule,
  clearOpponentCombatSinceConsultation as clearOpponentCombatSinceConsultationFromModule,
  getAiLastConsultationTurn as getAiLastConsultationTurnFromModule,
  getAiLossEventsSinceConsultation as getAiLossEventsSinceConsultationFromModule,
  getAiPendingOrders as getAiPendingOrdersFromModule,
  getAndClearAiToolLimitExceededLastTurn as getAndClearAiToolLimitExceededLastTurnFromModule,
  getOpponentUnitsInCombatSinceConsultation as getOpponentUnitsInCombatSinceConsultationFromModule,
  setAiLastConsultationTurn as setAiLastConsultationTurnFromModule,
  setAiPendingOrders as setAiPendingOrdersFromModule,
  setAiToolLimitExceededLastTurn as setAiToolLimitExceededLastTurnFromModule,
  type AiLossEventSinceConsultation,
} from './aiState';
import {
  clearTacticalTurnNotes as clearTacticalTurnNotesFromModule,
  getRecentTurnNotes as getRecentTurnNotesFromModule,
  upsertTurnLossNote as upsertTurnLossNoteFromModule,
  upsertTurnStrategyNote as upsertTurnStrategyNoteFromModule,
  type TurnConsultationNoteTexts,
  type TurnNoteRow,
  type TurnNotesScope,
} from './turnNotesHistory';

/**
 * Defines the `setAiToolLimitExceededLastTurn` function shape (export function setAiToolLimitExceededLastTurn(): void).

 * Purpose: Supports maintainability by documenting why `setAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiToolLimitExceededLastTurn(): void {
  setAiToolLimitExceededLastTurnFromModule(gameDbOps);
}

/**
 * Defines the `getAndClearAiToolLimitExceededLastTurn` function shape (export function getAndClearAiToolLimitExceededLastTurn(): boolean).

 * Purpose: Supports maintainability by documenting why `getAndClearAiToolLimitExceededLastTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAndClearAiToolLimitExceededLastTurn(): boolean {
  return getAndClearAiToolLimitExceededLastTurnFromModule(gameDbOps);
}

/**
 * Defines the `getAiLastConsultationTurn` function shape (export function getAiLastConsultationTurn(): number).

 * Purpose: Supports maintainability by documenting why `getAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLastConsultationTurn(): number {
  return getAiLastConsultationTurnFromModule(gameDbOps);
}

/**
 * Defines the `setAiLastConsultationTurn` function shape (export function setAiLastConsultationTurn(turn: number): void).

 * Purpose: Supports maintainability by documenting why `setAiLastConsultationTurn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiLastConsultationTurn(turn: number): void {
  setAiLastConsultationTurnFromModule(gameDbOps, turn);
}

/**
 * Defines the `getOpponentUnitsInCombatSinceConsultation` function shape (export function getOpponentUnitsInCombatSinceConsultation(): string[]).

 * Purpose: Supports maintainability by documenting why `getOpponentUnitsInCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getOpponentUnitsInCombatSinceConsultation(): string[] {
  return getOpponentUnitsInCombatSinceConsultationFromModule(gameDbOps);
}

/**
 * Defines the `addOpponentCombatParticipants` function shape (export function addOpponentCombatParticipants(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `addOpponentCombatParticipants` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addOpponentCombatParticipants(unitIds: string[]): void {
  addOpponentCombatParticipantsFromModule(gameDbOps, unitIds);
}

/**
 * Defines the `clearOpponentCombatSinceConsultation` function shape (export function clearOpponentCombatSinceConsultation(): void).

 * Purpose: Supports maintainability by documenting why `clearOpponentCombatSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearOpponentCombatSinceConsultation(): void {
  clearOpponentCombatSinceConsultationFromModule(gameDbOps);
}

/**
 * Defines the `addAiLossEventsSinceConsultation` function shape (export function addAiLossEventsSinceConsultation( playerId: string, turnNumber: number, removedUnits: { id: string; player: string }[], kills: { vic).

 * Purpose: Supports maintainability by documenting why `addAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addAiLossEventsSinceConsultation(
  playerId: string,
  turnNumber: number,
  removedUnits: { id: string; player: string }[],
  kills: KillEdge[],
  killsByDirectFire?: KillEdge[],
  killsByReturnFire?: KillEdge[]
): void {
  addAiLossEventsSinceConsultationFromModule(
    gameDbOps,
    playerId,
    turnNumber,
    removedUnits,
    kills,
    killsByDirectFire,
    killsByReturnFire
  );
}

/**
 * Defines the `getAiLossEventsSinceConsultation` function shape (export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[]).

 * Purpose: Supports maintainability by documenting why `getAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiLossEventsSinceConsultation(playerId: string): AiLossEventSinceConsultation[] {
  return getAiLossEventsSinceConsultationFromModule(gameDbOps, playerId);
}

/**
 * Defines the `clearAiLossEventsSinceConsultation` function shape (export function clearAiLossEventsSinceConsultation(playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiLossEventsSinceConsultation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiLossEventsSinceConsultation(playerId: string): void {
  clearAiLossEventsSinceConsultationFromModule(gameDbOps, playerId);
}

/**
 * Defines the `getAiPendingOrders` function shape (export function getAiPendingOrders(playerId: string): { movementOrders: MovementOrder[]; rangedOrders: RangedAttackOrder[]; airStrikeOrders: AirStrikeO).

 * Purpose: Supports maintainability by documenting why `getAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAiPendingOrders(playerId: string): {
  movementOrders: MovementOrder[];
  rangedOrders: RangedAttackOrder[];
  airStrikeOrders: AirStrikeOrder[];
  ferryOrders: FerryOrder[];
  embarkOrders: EmbarkOrder[];
} | null {
  return getAiPendingOrdersFromModule(gameDbOps, playerId);
}

/**
 * Defines the `setAiPendingOrders` function shape (export function setAiPendingOrders( playerId: string, movementOrders: MovementOrder[], rangedOrders: RangedAttackOrder[], airStrikeOrders: AirStrike).

 * Purpose: Supports maintainability by documenting why `setAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setAiPendingOrders(
  playerId: string,
  movementOrders: MovementOrder[],
  rangedOrders: RangedAttackOrder[],
  airStrikeOrders: AirStrikeOrder[] = [],
  ferryOrders: FerryOrder[] = [],
  embarkOrders: EmbarkOrder[] = []
): void {
  setAiPendingOrdersFromModule(
    gameDbOps,
    playerId,
    movementOrders,
    rangedOrders,
    airStrikeOrders,
    ferryOrders,
    embarkOrders
  );
}

/**
 * Defines the `clearAiPendingOrders` function shape (export function clearAiPendingOrders(playerId: string): void).

 * Purpose: Supports maintainability by documenting why `clearAiPendingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearAiPendingOrders(playerId: string): void {
  clearAiPendingOrdersFromModule(gameDbOps, playerId);
}

/**
 * Persists AI strategy and message text for one strategic turn or tactical beat.
 *
 * Purpose: Public facade over `turnNotesHistory.upsertTurnStrategyNote` for OpenRouter consultation capture.
 * When to use: After successful AI order planning in `requestOrdersFlow`.
 * Expected outcome: Row upserted in `turn_notes_history` without disturbing loss JSON on the same row.
 * Exceptions: None; underlying module logs errors without throwing.
 */
export function upsertTurnStrategyNote(
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  texts: TurnConsultationNoteTexts
): void {
  upsertTurnStrategyNoteFromModule(gameDbOps, scope, battleId, turnNumber, texts);
}

/**
 * Persists serialized human/AI loss summaries for one strategic turn or tactical beat.
 *
 * Purpose: Public facade over `turnNotesHistory.upsertTurnLossNote` for resolution finalize paths.
 * When to use: Strategic Ready finalize and tactical beat commit on main process.
 * Expected outcome: Row upserted in `turn_notes_history` without disturbing strategy text on the same row.
 * Exceptions: None; underlying module logs errors without throwing.
 */
export function upsertTurnLossNote(
  scope: TurnNotesScope,
  battleId: string,
  turnNumber: number,
  humanLossJson: string,
  aiLossJson: string
): void {
  upsertTurnLossNoteFromModule(gameDbOps, scope, battleId, turnNumber, humanLossJson, aiLossJson);
}

/**
 * Reads recent turn/beat notes before the current planning turn for prompt injection.
 *
 * Purpose: Public facade over `turnNotesHistory.getRecentTurnNotes`.
 * When to use: `buildRecentTurnNotesSection` when assembling AI system prompts.
 * Expected outcome: Up to three prior rows in ascending turn order.
 * Exceptions: None; returns empty array when DB unavailable.
 */
export function getRecentTurnNotes(
  scope: TurnNotesScope,
  battleId: string,
  beforeTurnNumber: number,
  limit = 3
): TurnNoteRow[] {
  return getRecentTurnNotesFromModule(gameDbOps, scope, battleId, beforeTurnNumber, limit);
}

/**
 * Clears persisted tactical turn-note history when starting or resetting tactical battles.
 *
 * Purpose: Public facade over `turnNotesHistory.clearTacticalTurnNotes`.
 * When to use: `startTacticalBattleForEnclosingStrategicHex` before recording notes for the new battle.
 * Expected outcome: Tactical rows removed; strategic history preserved.
 * Exceptions: None; underlying module logs errors without throwing.
 */
export function clearTacticalTurnNotes(battleId?: string): void {
  clearTacticalTurnNotesFromModule(gameDbOps, battleId);
}
