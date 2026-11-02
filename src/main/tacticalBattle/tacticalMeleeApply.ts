/**
 * Tactical tactical melee resolution after movement and support orders commit on a tactical turn.
 */

import { createCombatRng, runMeleePhase } from '../combatResolution';
import type { CombatUnit } from '../combatUnitTypes';
import { getGameSeed } from '../gameDb';
import { withOriginHitBonus } from '../originBonus/originHitBonusLookup';
import { withTechHitBonus } from '../techBonus/techHitBonusLookup';
import { buildTechHitBonusLookupFromDb } from '../techBonus/techHitBonusLookupDb';
import { buildTacticalOriginHitBonusLookupFromDb } from '../originBonus/originHitBonusLookupDb';
import type { CombatDiceRoll } from '../../shared/ipc/combatDiceTypes';
import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import { removedUnitSnapshot } from '../../shared/lossFlagFacts';
import { hashStringToUint32 } from '../../shared/stableHash';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import { syncStrategicUnitsDbWhenTacticalParentsEliminated } from './tacticalStrategicOrderPhases';

/**
 * Hashes tactical sub-unit id/hex pairs into a 32-bit seed fragment for combat RNG continuity.
 *
 * Purpose: Shared by melee-only and full tactical turn pipelines so air/ranged/melee draws chain from one `createCombatRng` seed.
 * When to use: Mix into `getGameSeed()` when constructing tactical commit PRNG streams.
 * Expected outcome: Deterministic unsigned integer for a given multiset of `id:h3Index` pairs.
 * Exceptions: None.
 */
export function tacticalSubUnitLayoutSeed32(subUnits: readonly { id: string; h3Index: string }[]): number {
  return hashStringToUint32(
    [...subUnits]
      .map((u) => `${u.id}:${u.h3Index}`)
      .sort()
      .join('|')
  );
}

/**
 * Mixes the match seed and the tactical turn into one combat-generator seed.
 *
 * Purpose: Air, ranged, and melee in one beat draw from the same stream.
 * When to use: Where a tactical beat builds `createCombatRng`. Omit `layoutSubUnits` when that beat has no layout term.
 * Expected outcome: An unsigned 32-bit seed. Omitting `layoutSubUnits` adds nothing. An empty array adds the hash of the empty string, 2166136261, so a caller without a layout term must omit the field.
 * Exceptions: None.
 */
export function tacticalCombatSeed(args: {
  readonly gameSeed: number;
  readonly strategicTurnNumber: number;
  readonly tacticalTurnNumber: number;
  readonly layoutSubUnits?: readonly { id: string; h3Index: string }[];
}): number {
  tacticalLogQuery('tacticalCombatSeed', { hasLayout: args.layoutSubUnits !== undefined });
  const layout = args.layoutSubUnits === undefined ? 0 : tacticalSubUnitLayoutSeed32(args.layoutSubUnits);
  return (args.gameSeed + args.strategicTurnNumber * 7919 + args.tacticalTurnNumber * 104729 + layout) >>> 0;
}

/**
 * Maps tactical sub-units to the combat-resolution shape so `runMeleePhase` can reuse strategic dice and casualty rules.
 *
 * Purpose: Single adapter between snapshot rows and melee phase input without mutating the snapshot.
 * When to use: Immediately before `runMeleePhase` inside `applyTacticalMeleeAfterSupportOrders`.
 * Expected outcome: One `CombatUnit` per live sub-unit; `displayOrder` is a stable tie-break index only.
 * Exceptions: None.
 */
function tacticalSubUnitsAsCombatUnits(subUnits: readonly TacticalSubUnitSnapshot[]): CombatUnit[] {
  return subUnits.map((u, i) => ({
    id: u.id,
    player: u.player,
    unitType: u.unitType,
    h3Index: u.h3Index,
    displayOrder: i,
  }));
}

/**
 * Runs one strategic-style melee pass over every tactical cell in the footprint after support projection.
 *
 * Purpose: Completes the tactical WEGO beat so co-located opposing sub-units fight with combat-die resolution instead of
 * persisting indefinitely without combat; kill lines and removal snapshots feed the same toast path as strategic Ready.
 * When to use: End of `applyHumanTacticalDraftBeatInStrategicOrder` / `commitHumanTacticalDraftOrders` after air+ranged, march, optional human embark, ferry, and cargo sync.
 * Expected outcome: Updated `battle.subUnits` with melee casualties removed; empty melee arrays when no contested tactical hexes.
 *   Each melee roll adds the roller's origin bonus at its cell, read from the persisted match flags and this `battle`.
 *   `meleeDiceRolls` lists every melee die in roll order, anchored on the contested cell, for playback.
 * Exceptions: None; delegates RNG to `createCombatRng` and melee logic to `runMeleePhase` when `combatNext` is omitted.
 */
export function applyTacticalMeleeAfterSupportOrders(
  battle: TacticalBattleSnapshot,
  combatNext?: () => number
): {
  battle: TacticalBattleSnapshot;
  killsByMelee: KillEdge[];
  meleeRemovedUnits: RemovedUnitSnapshot[];
  meleeCombatHexes: string[];
  meleeCasualtyHexes: string[];
  meleeDiceRolls: CombatDiceRoll[];
} {
  tacticalLogQuery('applyTacticalMeleeAfterSupportOrders', {
    battleId: battle.battleId,
    subCount: battle.subUnits.length,
    tacticalCellCount: battle.tacticalChildH3Indexes.length,
  });
  const combatUnits = withTechHitBonus(
    withOriginHitBonus(
      tacticalSubUnitsAsCombatUnits(battle.subUnits),
      buildTacticalOriginHitBonusLookupFromDb(battle)
    ),
    buildTechHitBonusLookupFromDb(battle.subUnits)
  );
  const next =
    combatNext ??
    createCombatRng(
      tacticalCombatSeed({
        gameSeed: getGameSeed(),
        strategicTurnNumber: battle.strategicTurnNumber,
        tacticalTurnNumber: battle.tacticalTurnNumber,
        layoutSubUnits: battle.subUnits,
      })
    );
  const meleeResult = runMeleePhase(combatUnits, battle.tacticalChildH3Indexes, next);
  const meleeDiceRolls = meleeResult.diceRolls ?? [];
  if (meleeResult.removedUnitIds.length === 0) {
    tacticalLogMutate('applyTacticalMeleeAfterSupportOrders no casualties', {
      battleId: battle.battleId,
      combatHexCount: meleeResult.combatHexes.length,
      diceRollCount: meleeDiceRolls.length,
    });
    return {
      battle,
      killsByMelee: [],
      meleeRemovedUnits: [],
      meleeCombatHexes: meleeResult.combatHexes,
      meleeCasualtyHexes: meleeResult.casualtyHexes,
      meleeDiceRolls,
    };
  }
  const removedSet = new Set(meleeResult.removedUnitIds);
  const byId = new Map(battle.subUnits.map((u) => [u.id, u] as const));
  const meleeRemovedUnits: RemovedUnitSnapshot[] = [];
  for (const id of meleeResult.removedUnitIds) {
    const row = byId.get(id);
    if (row) {
      meleeRemovedUnits.push(removedUnitSnapshot(row));
    }
  }
  const subUnits = battle.subUnits.filter((u) => !removedSet.has(u.id));
  syncStrategicUnitsDbWhenTacticalParentsEliminated(battle.subUnits, subUnits);
  tacticalLogMutate('applyTacticalMeleeAfterSupportOrders applied', {
    battleId: battle.battleId,
    removedCount: meleeRemovedUnits.length,
    combatHexCount: meleeResult.combatHexes.length,
    diceRollCount: meleeDiceRolls.length,
  });
  return {
    battle: { ...battle, subUnits },
    killsByMelee: meleeResult.kills.map((k) => ({ victimId: k.victimId, killerIds: k.killerIds })),
    meleeRemovedUnits,
    meleeCombatHexes: meleeResult.combatHexes,
    meleeCasualtyHexes: meleeResult.casualtyHexes,
    meleeDiceRolls,
  };
}
