/**
 * Per-roll terrain cover lookups for combat resolution.
 *
 * Purpose: Answers "how much cover does a target here get against this shooter?" without touching the database, so combat code stays testable.
 * When to use: Build one lookup per combat phase from data the phase already holds, and pass it to the roll sites.
 * Expected outcome: Lookups return 0, 1, or 2 and never throw.
 * Exceptions: None.
 */
import type { TacticalBattleTerrainPick } from '../../shared/tacticalTerrainCombatModifiers';
import {
  tacticalCellTerrainCover,
  terrainCoverFor,
  type TerrainCover,
  type TerrainCoverShooter,
} from '../../shared/terrainCoverRules';
import type { HitThresholdUnit } from '../combatHitThresholds';
import { logDebug } from '../logger';

/**
 * Returns the cover a target position gives against one kind of shooter.
 *
 * Contract: `targetH3Index` is the hex or cell being fired at. Unknown positions give 0.
 * When to use: At every ranged roll at units and every air-strike roll at units.
 * Expected outcome: The cover value for that position and shooter.
 * Exceptions: None.
 */
export type TerrainCoverLookup = (targetH3Index: string, shooter: TerrainCoverShooter) => TerrainCover;

/**
 * Lookup that never gives cover.
 *
 * Purpose: Default for callers and tests that do not exercise cover.
 * When to use: Wherever a lookup is required but cover must not apply.
 * Expected outcome: Always 0.
 * Exceptions: None.
 */
export const noTerrainCover: TerrainCoverLookup = () => 0;

/**
 * One strategic hex row as cover reads it.
 *
 * Purpose: Matches both the pre-move hex rows the strategic pipeline loads and `GameStateSnapshot.hexes`, so neither caller needs a new query.
 * When to use: Input to `createStrategicTerrainCoverLookup`.
 * Expected outcome: A missing or null kind reads as open ground.
 * Exceptions: None.
 */
export type StrategicTerrainCoverHex = { readonly h3Index: string; readonly terrainKind?: string | null };

/**
 * Builds the strategic lookup, which reads each hex's dominant terrain kind.
 *
 * Purpose: Strategic ranged fire and air strikes on units.
 * When to use: Once per strategic turn resolution, from the hex rows loaded before movement.
 * Expected outcome: A closure over an `h3Index -> terrainKind` map built once. Strategic hexes never count as urban or rubble; a hex missing from the list gives 0.
 * Exceptions: None.
 */
export function createStrategicTerrainCoverLookup(hexes: ReadonlyArray<StrategicTerrainCoverHex>): TerrainCoverLookup {
  logDebug('terrainCoverLookup createStrategicTerrainCoverLookup', { hexes: hexes.length });
  const terrainKindByH3 = new Map(hexes.map((h) => [h.h3Index, h.terrainKind] as const));
  return (targetH3Index, shooter) => terrainCoverFor({ terrainKind: terrainKindByH3.get(targetH3Index) }, shooter);
}

/**
 * Builds the battle lookup, which reads each cell's terrain kind plus its urban and rubble flags.
 *
 * Purpose: Battle ranged fire at units.
 * When to use: Once per battle step, from the battle snapshot the ranged phase reads.
 * Expected outcome: A closure that delegates to `tacticalCellTerrainCover`.
 * Exceptions: None.
 */
export function createTacticalTerrainCoverLookup(
  battle: TacticalBattleTerrainPick & { readonly battleId?: string }
): TerrainCoverLookup {
  logDebug('terrainCoverLookup createTacticalTerrainCoverLookup', { battleId: battle.battleId });
  return (targetH3Index, shooter) => tacticalCellTerrainCover(battle, targetH3Index, shooter);
}

/**
 * Copies a unit with its target's cover set.
 *
 * Purpose: Lets the hit-threshold code read cover from the attacker without knowing about terrain.
 * When to use: On attacker rows just before a ranged or air-strike roll at units; never on defenders, return fire, anti-air, or melee rows.
 * Expected outcome: A shallow copy with `targetCover` set when `cover > 0`. When `cover` is 0, the copy has no `targetCover` key, so deep comparisons of uncovered units are unchanged.
 * Exceptions: None.
 */
export function withTargetCover<T extends HitThresholdUnit>(unit: T, cover: TerrainCover): T {
  if (cover > 0) return { ...unit, targetCover: cover };
  const copy = { ...unit };
  delete (copy as { targetCover?: TerrainCover }).targetCover;
  return copy;
}
