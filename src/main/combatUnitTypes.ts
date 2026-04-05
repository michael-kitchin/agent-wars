/**
 * Shared minimal unit snapshot shape for combat resolution and related phases (e.g. air strike removals).
 * Kept separate from combatResolution to avoid import cycles with gameActions / air strike modules.
 */

export interface CombatUnit {
  id: string;
  player: string;
  unitType: string;
  h3Index: string;
  displayOrder?: number;
}
