import { gridDistance } from 'h3-js';
import type {
  AirStrikeOrder,
  FerryOrder,
  GameStateSnapshot,
  RangedAttackOrder,
} from '../shared/ipcTypes';

function formatDistanceLabelForPlannedAttack(state: GameStateSnapshot | null, unitId: string, targetH3Index: string): string {
  if (!state) return '?h';
  const attacker = state.units.find((u) => u.id === unitId);
  if (!attacker) return '?h';
  try {
    return `${Math.max(0, gridDistance(attacker.h3Index, targetH3Index))}h`;
  } catch {
    return '?h';
  }
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
  if (!state) return `${order.destinationH3Index} (ferry)`;
  const unit = state.units.find((u) => u.id === order.unitId);
  if (!unit) return `${order.destinationH3Index} (ferry)`;
  let ferryDistance = 0;
  try {
    ferryDistance = gridDistance(unit.h3Index, order.destinationH3Index);
  } catch {
    return `${order.destinationH3Index} (ferry)`;
  }
  return `${Math.max(0, ferryDistance)}h (ferry)`;
}
