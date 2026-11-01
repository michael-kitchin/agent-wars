import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import type { ReadyHandlerDeps } from './readyHandlerTypes';
import type { announceResolutionTurnUpdate } from './readyResolutionAnnouncements';

/**
 * The inputs and toast callbacks a held strategic update needs when it is shown later.
 *
 * Purpose: The launch turn's popup is built again after the battle, with the destroyed units attached.
 * When to use: `stashHeldBattleTurnUpdate` and `takeHeldBattleTurnUpdate`.
 * Expected outcome: The same arguments `announceResolutionTurnUpdate` received, plus the parents attached since.
 * Exceptions: None.
 */
export interface HeldBattleTurnUpdate {
  /**
   * Identity of this waiting update.
   *
   * Contract: Unique for this renderer session. Attaching parents does not change it.
   * When to use: Compare the value from before a Ready with the value after it.
   * Expected outcome: A Ready that stashes a different update leaves this id on the update that was already waiting.
   * Exceptions: None.
   */
  readonly id: number;
  /**
   * Arguments to pass back to `announceResolutionTurnUpdate`.
   *
   * Contract: `holdForBattle` is false. `usePendingBattleParents` is false.
   * When to use: When the hold is shown.
   * Expected outcome: The launch turn's losses, visibility, and report tag.
   * Exceptions: None.
   */
  readonly inputs: Parameters<typeof announceResolutionTurnUpdate>[0];
  /**
   * Toast, log, and unknown-battle callbacks captured with the inputs.
   *
   * Contract: The same object the launch turn passed.
   * When to use: When the hold is shown.
   * Expected outcome: The Reports entry uses the launch turn's tag.
   * Exceptions: None.
   */
  readonly deps: Parameters<typeof announceResolutionTurnUpdate>[1];
  /**
   * Strategic units the battle removed, attached after the hold was stashed.
   *
   * Contract: Empty until the battle ends. Ids are not repeated.
   * When to use: `attachDestroyedBattleParents` and the show path.
   * Expected outcome: The parents for this hold only.
   * Exceptions: None.
   */
  destroyedParents: DestroyedBattleParent[];
}

/**
 * The update for the battle that is open now.
 *
 * Purpose: One launch turn waits. A following turn that also opens a battle waits behind it.
 * When to use: Stash, attach, and take.
 * Expected outcome: Null when nothing is waiting.
 * Exceptions: None.
 */
let held: HeldBattleTurnUpdate | null = null;

/**
 * A second update stashed while the first is still waiting.
 *
 * Purpose: The first is shown after its battle. The second stays held for the battle it opened.
 * When to use: `stashHeldBattleTurnUpdate` when `held` is already set.
 * Expected outcome: Null unless two battles are opened before the first popup is shown.
 * Exceptions: None.
 */
let queued: HeldBattleTurnUpdate | null = null;

/**
 * Destroyed units waiting for the next strategic update that is not already held.
 *
 * Purpose: A battle opened from the map has no launch-turn popup. Its units go on the next strategic update only.
 * When to use: `attachDestroyedBattleParents` when `held` is null, and the next strategic announce.
 * Expected outcome: Null after it is taken. A later turn does not see it.
 * Exceptions: None.
 */
let pending: DestroyedBattleParent[] | null = null;

/**
 * The next id to give a stashed update.
 *
 * Purpose: A Ready that follows a battle can stash a second update, and the two must stay distinct.
 * When to use: `stashHeldBattleTurnUpdate`.
 * Expected outcome: Each stash takes the current value, then the value increases by one.
 * Exceptions: None.
 */
let nextHoldId = 1;

/**
 * Stores a launch turn's update until its battle ends.
 *
 * Purpose: The popup is not shown while the battle is still ahead.
 * When to use: From `announceResolutionTurnUpdate` when the turn opens a battle.
 * Expected outcome: The first stash waits. A second stash waits behind it. `destroyedParents` starts as `parents`.
 * Exceptions: None.
 */
export function stashHeldBattleTurnUpdate(
  inputs: HeldBattleTurnUpdate['inputs'],
  deps: HeldBattleTurnUpdate['deps'],
  parents: readonly DestroyedBattleParent[]
): void {
  const record: HeldBattleTurnUpdate = { id: nextHoldId, inputs, deps, destroyedParents: [...parents] };
  nextHoldId += 1;
  if (held) queued = record;
  else held = record;
  console.debug('[agent-wars] stashHeldBattleTurnUpdate', {
    queued: held !== record,
    parentCount: record.destroyedParents.length,
  });
}

/**
 * Adds the units a battle removed to the waiting update, or to the next strategic update.
 *
 * Purpose: The launch-turn popup and a map-opened battle share this handoff.
 * When to use: After a battle ends and before the Ready that follows it.
 * Expected outcome: A waiting update gains each new id once. Units already waiting for the next strategic update stay, and these are added. An empty list changes nothing. The next strategic announce that asks for pending parents receives the whole list once.
 * Exceptions: None.
 */
export function attachDestroyedBattleParents(parents: readonly DestroyedBattleParent[]): void {
  console.debug('[agent-wars] attachDestroyedBattleParents', {
    parentCount: parents.length,
    held: held != null,
    pending: pending != null,
  });
  if (parents.length === 0) return;
  if (held) {
    appendDestroyedParents(held.destroyedParents, parents);
    return;
  }
  if (!pending) pending = [];
  appendDestroyedParents(pending, parents);
}

/**
 * Adds parents whose ids are not already in `target`.
 *
 * Purpose: A second battle must not erase units the next popup has not listed yet, and one id must not be listed twice.
 * When to use: `attachDestroyedBattleParents`.
 * Expected outcome: New ids are appended in order. An id already present is skipped.
 * Exceptions: None.
 */
function appendDestroyedParents(
  target: DestroyedBattleParent[],
  parents: readonly DestroyedBattleParent[]
): void {
  const seen = new Set(target.map((unit) => unit.id));
  for (const parent of parents) {
    if (seen.has(parent.id)) continue;
    seen.add(parent.id);
    target.push(parent);
  }
}

/**
 * True when a map-opened battle left units for the next strategic update.
 *
 * Purpose: That update has to be built even when the turn has nothing else to animate.
 * When to use: Strategic Ready, before deciding whether to announce.
 * Expected outcome: True only until those units are taken.
 * Exceptions: None.
 */
export function hasPendingDestroyedBattleParents(): boolean {
  const waiting = pending != null && pending.length > 0;
  console.debug('[agent-wars] hasPendingDestroyedBattleParents', { waiting });
  return waiting;
}

/**
 * Returns the map-opened battle's units and forgets them.
 *
 * Purpose: Only the next strategic update lists them.
 * When to use: `announceResolutionTurnUpdate` when it is not replaying a hold.
 * Expected outcome: The stored list, or an empty list when there was none. A second call is empty.
 * Exceptions: None.
 */
export function takePendingDestroyedBattleParents(): DestroyedBattleParent[] {
  const taken = pending ?? [];
  pending = null;
  console.debug('[agent-wars] takePendingDestroyedBattleParents', { parentCount: taken.length });
  return taken;
}

/**
 * The id of the update that is waiting to be shown.
 *
 * Purpose: The Ready that follows a battle may stash the next battle's update. That newer update has to keep waiting.
 * When to use: Immediately before that Ready, and again before showing. Show only when both calls return the same id.
 * Expected outcome: The waiting update's id, or null when nothing is waiting. Attaching parents does not change the id.
 * Exceptions: None.
 */
export function waitingHeldBattleTurnUpdateId(): number | null {
  const id = held?.id ?? null;
  console.debug('[agent-wars] waitingHeldBattleTurnUpdateId', { id });
  return id;
}

/**
 * Returns the waiting update and promotes a queued one.
 *
 * Purpose: Showing the hold clears it. A battle opened by the following turn stays held.
 * When to use: When the hold is shown, with or without the battle sentence.
 * Expected outcome: The oldest waiting update, or null. `queued` becomes the waiting update.
 * Exceptions: None.
 */
export function takeHeldBattleTurnUpdate(): HeldBattleTurnUpdate | null {
  const current = held;
  held = queued;
  queued = null;
  console.debug('[agent-wars] takeHeldBattleTurnUpdate', {
    found: current != null,
    promoted: held != null,
  });
  return current;
}

/**
 * Forgets a waiting update and any units saved for a later turn.
 *
 * Purpose: A match that ends, or a new match, must not show the previous battle's popup.
 * When to use: When the player ends the match from the knocked-out dialog, and when a new match loads.
 * Expected outcome: Nothing is waiting and nothing is pending.
 * Exceptions: None.
 */
export function dropHeldBattleTurnUpdate(): void {
  console.debug('[agent-wars] dropHeldBattleTurnUpdate', {
    held: held != null,
    queued: queued != null,
    pending: pending != null,
  });
  held = null;
  queued = null;
  pending = null;
}

/**
 * The callbacks `announceResolutionTurnUpdate` needs.
 *
 * Purpose: Names the dependency slice the hold stores, so a change to that function stays in one place.
 * When to use: The `deps` field of `HeldBattleTurnUpdate`.
 * Expected outcome: Toast, log, and the unknown-battle sentence.
 * Exceptions: None.
 */
export type HeldBattleTurnUpdateDeps = Pick<
  ReadyHandlerDeps,
  'showMapToast' | 'appendOpenRouterLog' | 'formatUnknownBattleAnnouncement'
>;
