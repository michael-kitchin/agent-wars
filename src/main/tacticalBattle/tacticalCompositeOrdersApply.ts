/**
 * Applies validated opponent tactical orders onto a tactical battle snapshot in strategic ready order (no production):
 * embark, air strike + ranged, march, ferry, then embark cargo sync.
 */

import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder } from '../../shared/ipcTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { createCombatRng } from '../combatResolution';
import { getGameSeed } from '../gameDb';
import { tacticalLogQuery } from './tacticalLogging';
import { validateTacticalHumanEmbarkOrder } from './tacticalOpponentOrderValidation';
import { TacticalEmbarkValidationRejected } from './tacticalValidationResult';
import { tacticalSubUnitLayoutSeed32 } from './tacticalMeleeApply';
import { projectTacticalSnapshotAfterOpponentMovementOrders } from './tacticalMovementApply';
import {
  applyTacticalAirStrikeThenRangedPhaseOnBattle,
  applyTacticalEmbarkPhaseOnBattle,
  applyTacticalFerryPhaseOnBattle,
  tacticalBattleWithSyncedEmbarkCargo,
} from './tacticalStrategicOrderPhases';

/**
 * Returns a new tactical snapshot after applying opponent-only validated orders in strategic resolution order.
 *
 * Contract: Inputs are assumed already validated; invalid rows are ignored defensively when ids or hexes mismatch.
 * When to use: `applyValidatedOpponentTacticalOrders` after `requestOrdersFlow` tactical validation passes.
 * Expected outcome: Same sequencing as `executeReadyStrategicTurn` combat/move slices: embark, air+ranged, movement, ferry, cargo sync.
 * Exceptions: None; logs trace skips for inconsistent rows inside delegated helpers.
 */
export function projectTacticalSnapshotAfterValidatedOpponentOrders(
  battle: TacticalBattleSnapshot,
  opts: {
    movementOrders: readonly { unitId: string; toH3Index: string }[];
    rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
    airStrikes?: readonly AirStrikeOrder[];
    ferryOrders?: readonly FerryOrder[];
    embarkOrders?: readonly EmbarkOrder[];
  }
): TacticalBattleSnapshot {
  tacticalLogQuery('projectTacticalSnapshotAfterValidatedOpponentOrders', {
    battleId: battle.battleId,
    movementCount: opts.movementOrders.length,
    rangedCount: opts.rangedAttacks?.length ?? 0,
    airCount: opts.airStrikes?.length ?? 0,
    ferryCount: opts.ferryOrders?.length ?? 0,
    embarkCount: opts.embarkOrders?.length ?? 0,
  });
  const afterEmbark = applyTacticalEmbarkPhaseOnBattle(battle, opts.embarkOrders, 'opponent');
  const seed = (getGameSeed() + battle.strategicTurnNumber * 7919 + battle.tacticalTurnNumber * 104729) >>> 0;
  const next = createCombatRng(seed);
  const airRanged = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    afterEmbark,
    opts.airStrikes,
    opts.rangedAttacks,
    'opponent',
    next
  );
  const afterMove =
    opts.movementOrders.length > 0
      ? projectTacticalSnapshotAfterOpponentMovementOrders(airRanged.battle, opts.movementOrders)
      : airRanged.battle;
  const afterFerry = applyTacticalFerryPhaseOnBattle(afterMove, opts.ferryOrders, 'opponent');
  return tacticalBattleWithSyncedEmbarkCargo(afterFerry.battle);
}

/**
 * Result of applying human tactical support orders: updated snapshot plus kill metadata for renderer turn summaries.
 *
 * Purpose: Lets `commitHumanTacticalDraftOrders` feed the same consolidated toast inputs as strategic `ReadyResult` without re-simulating combat in the renderer.
 * When to use: Return value from `projectTacticalSnapshotAfterValidatedHumanSupportOrders` only.
 * Expected outcome: `removedUnits` lists every sub-unit removed; `killsByDirectFire` / `killsByReturnFire` match `runRangedPhase`; `killsByAirStrike` covers air-vs-units and infrastructure-based removals.
 * Exceptions: None.
 */
export type TacticalHumanSupportProjectionResult = {
  battle: TacticalBattleSnapshot;
  killsByDirectFire: KillEdge[];
  killsByAirStrike: KillEdge[];
  killsByReturnFire: KillEdge[];
  removedUnits: RemovedUnitSnapshot[];
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
  airStrikeAttemptCount: number;
};

/**
 * Returns a new tactical snapshot after applying validated human support drafts in strategic order: air+ranged, optional human embark, ferry, cargo sync (no march; no melee).
 *
 * Purpose: Pure projection for IPC paths that apply support without a full Ready beat; mirrors strategic pre-move air+ranged (human embark is not in `executeReadyStrategicTurn` before strikes, so optional embark runs only after combat here).
 * When to use: `applyValidatedHumanTacticalSupportOrders` when only non-march drafts commit, or tests of support-only effects.
 * Expected outcome: Same air-vs-units and ranged dice contracts as strategic resolution; ferry after embark on the post-strike snapshot.
 * Exceptions: None; inconsistent rows are skipped defensively with trace logs inside helpers.
 */
export function projectTacticalSnapshotAfterValidatedHumanSupportOrders(
  battle: TacticalBattleSnapshot,
  opts: {
    rangedAttacks?: readonly { unitId: string; targetH3Index: string }[];
    airStrikes?: readonly AirStrikeOrder[];
    ferryOrders?: readonly FerryOrder[];
    embarkOrders?: readonly EmbarkOrder[];
  }
): TacticalHumanSupportProjectionResult {
  tacticalLogQuery('projectTacticalSnapshotAfterValidatedHumanSupportOrders', {
    battleId: battle.battleId,
    rangedCount: opts.rangedAttacks?.length ?? 0,
    airCount: opts.airStrikes?.length ?? 0,
    ferryCount: opts.ferryOrders?.length ?? 0,
    embarkCount: opts.embarkOrders?.length ?? 0,
  });
  const seed =
    (getGameSeed() +
      battle.strategicTurnNumber * 7919 +
      battle.tacticalTurnNumber * 104729 +
      tacticalSubUnitLayoutSeed32(battle.subUnits)) >>>
    0;
  const next = createCombatRng(seed);
  const acc = applyTacticalAirStrikeThenRangedPhaseOnBattle(
    battle,
    opts.airStrikes,
    opts.rangedAttacks,
    'human',
    next
  );
  for (const e of opts.embarkOrders ?? []) {
    const v = validateTacticalHumanEmbarkOrder(e, acc.battle.subUnits, acc.battle.enclosingStrategicH3Index);
    if (!v.valid) {
      throw new TacticalEmbarkValidationRejected(v.reason);
    }
  }
  const afterEmbark = applyTacticalEmbarkPhaseOnBattle(acc.battle, opts.embarkOrders, 'human');
  const afterFerry = applyTacticalFerryPhaseOnBattle(afterEmbark, opts.ferryOrders, 'human');
  const outBattle = tacticalBattleWithSyncedEmbarkCargo(afterFerry.battle);
  return {
    battle: outBattle,
    killsByDirectFire: acc.killsByDirectFire,
    killsByAirStrike: acc.killsByAirStrike,
    killsByReturnFire: acc.killsByReturnFire,
    removedUnits: [...acc.removedUnits, ...afterFerry.removedUnits],
    infrastructureDestroyedEvents: acc.infrastructureDestroyedEvents,
    airStrikeAttemptCount: acc.airStrikeAttemptCount,
  };
}
