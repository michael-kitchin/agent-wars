/**
 * Shared minimal snapshots for post-resolution / post-beat consultation predicate tests.
 *
 * Purpose: Avoid copy-pasting `TacticalBattleSnapshot` and `GameStateSnapshot` scaffolding across gate tests (and tactical tests when shapes match).
 * When to use: `afterResolutionConsultationGates.test.ts` and any test that needs the same minimal battle or empty-roster state.
 * Expected outcome: Structurally valid enough for TypeScript and the predicates under test.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../../gameDb';
import type { TacticalBattleSnapshot } from '../../../shared/tacticalBattleTypes';

/**
 * Builds a minimal tactical battle snapshot for idle / kill-attribution tests (only `subUnits` matter to the helpers).
 *
 * Purpose: Single factory for gate-style tactical predicate cases with fixed res4 geometry.
 * When to use: Tests that only need `subUnits` populated on an otherwise static grid.
 * Expected outcome: Cast-safe `TacticalBattleSnapshot` with placeholder ids and one res4 child cell.
 * Exceptions: None.
 */
export function minimalTacticalBattle(subUnits: TacticalBattleSnapshot['subUnits']): TacticalBattleSnapshot {
  return {
    battleId: 'gate-test',
    enclosingRes1H3Index: '81193ffffffffff',
    res4ChildH3Indexes: ['81283fffffffffff'],
    strategicTurnNumber: 1,
    tacticalTurnNumber: 1,
    subUnits,
  };
}

/**
 * Returns a minimal planning-phase snapshot with no human roster rows (strategic human kill-edge prefix fallback tests).
 *
 * Purpose: Opponent-perspective state where `units` is empty so `human-` killer id prefix rules apply.
 * When to use: `humanHadStrategicResolutionObservableActions` tests that need masked rosters.
 * Expected outcome: Empty `hexes` and `units` with turn 1 planning phase.
 * Exceptions: None.
 */
export function emptyOpponentState(): GameStateSnapshot {
  return {
    turnNumber: 1,
    phase: 'planning',
    hexes: [],
    units: [],
    pendingOrders: [],
  };
}
