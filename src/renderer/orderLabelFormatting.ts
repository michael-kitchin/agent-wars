import { gridDisk, gridDistance } from 'h3-js';
import type {
  AirStrikeOrder,
  FerryOrder,
  GameStateSnapshot,
  RangedAttackOrder,
} from '../shared/ipcTypes';

function computeGridDistanceForLabel(originH3: string, targetH3: string): number | null {
  try {
    return Math.max(0, gridDistance(originH3, targetH3));
  } catch {
    // gridDistance may throw for some valid far-apart pairs; probe by rings as a label-only fallback.
    for (let radius = 0; radius <= 12; radius++) {
      try {
        const ring = gridDisk(originH3, radius);
        if (ring.includes(targetH3)) return radius;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function formatDistanceLabelForPlannedAttack(state: GameStateSnapshot | null, unitId: string, targetH3Index: string): string {
  if (!state) return '?h';
  const attacker = state.units.find((u) => u.id === unitId);
  if (!attacker) return '?h';
  const distance = computeGridDistanceForLabel(attacker.h3Index, targetH3Index);
  return distance == null ? '?h' : `${distance}h`;
}

export function formatPendingRangedAttackSidebarLabel(
  state: GameStateSnapshot | null,
  order: RangedAttackOrder
): string {
  return formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index);
}

export function formatPendingAirStrikeSidebarLabel(
  state: GameStateSnapshot | null,
  order: AirStrikeOrder
): string {
  const targetTypeLabel =
    order.targetType === 'units'
      ? 'units'
      : order.targetType === 'urban'
        ? 'urban'
        : order.targetType === 'airport'
          ? 'airport'
          : 'seaport';
  return `${formatDistanceLabelForPlannedAttack(state, order.unitId, order.targetH3Index)} (${targetTypeLabel})`;
}

export function formatPendingFerryOrderSidebarLabel(
  state: GameStateSnapshot | null,
  order: FerryOrder
): string {
  if (!state) return '?h (ferry)';
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return '?h (ferry)';
  const ferryDistance = computeGridDistanceForLabel(unit.h3Index, order.destinationH3Index);
  return `${ferryDistance == null ? '?' : ferryDistance}h (ferry)`;
}
