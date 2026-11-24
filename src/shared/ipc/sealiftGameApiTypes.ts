import type { TacticalBattleSnapshot } from '../tacticalBattleTypes';
import type { SealiftSlotEdit, SealiftSlotEditResult, SealiftStackState } from './sealiftTypes';

/**
 * The reply to a tactical slot edit.
 *
 * Purpose: A tactical edit also returns the battle snapshot to redraw.
 * When to use: The result of `updateTacticalSealiftSlot`.
 * Expected outcome: A `SealiftSlotEditResult` plus `tacticalBattle` on success.
 * Exceptions: None.
 */
export type TacticalSealiftSlotEditResult = SealiftSlotEditResult & { tacticalBattle?: TacticalBattleSnapshot };

/**
 * The sealift part of the renderer bridge, kept beside its types.
 *
 * Purpose: Declares the stack popup's sealift reads and slot edits that `GameApi` extends.
 * When to use: `GameApi` and `sealiftPreloadApi` only.
 * Expected outcome: The preload and the renderer agree on each call's payload and result.
 * Exceptions: None.
 */
export interface SealiftGameApi {
    /**
   * Specifies the contract for the `getSealiftStackState` member (getSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;).

   * Contract: Describes stable behavior for callers of `getSealiftStackState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;
    /**
   * Specifies the contract for the `getTacticalSealiftStackState` member (getTacticalSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;).

   * Contract: Describes stable behavior for callers of `getTacticalSealiftStackState` in this codebase.
   * When to use: Tactical stack callout when human sealift assignments are expressed with tactical sub-unit ids.
   * Expected outcome: Same `SealiftStackState` shape as `getSealiftStackState`, or an empty section when no tactical session applies to the hex.
   * Exceptions: None beyond normal IPC failure modes.
   */
getTacticalSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;
  /**
   * Applies one sealift slot change to the active tactical snapshot and the parent-level transport rows (sub-unit ids).
   *
   * Contract: Takes one `SealiftSlotEdit`. The reply is a `TacticalSealiftSlotEditResult`.
   * When to use: Tactical stack sealift controls while a tactical battle is active; strategic `updateSealiftSlot` stays blocked in that mode.
   * Expected outcome: Same shape as `updateSealiftSlot` plus `tacticalBattle` on success for renderer redraw.
   * Exceptions: None beyond normal IPC failure modes.
   */
  updateTacticalSealiftSlot: (payload: SealiftSlotEdit) => Promise<TacticalSealiftSlotEditResult>;
  /**
   * Applies one strategic sealift slot change.
   *
   * Contract: Takes one `SealiftSlotEdit`. The reply is a `SealiftSlotEditResult`.
   * When to use: The stack popup's embark and debark controls outside a tactical battle.
   * Expected outcome: The new stack state on success, or a refusal reason.
   * Exceptions: None beyond normal IPC failure modes.
   */
  updateSealiftSlot: (payload: SealiftSlotEdit) => Promise<SealiftSlotEditResult>;
}
