import type { BuildUnitType, ReadyResult } from '../../shared/ipcTypes';

type Kill = { victimId: string; killerIds: string[] };

function formatCountLabel(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

interface TurnUpdateSummaryArgs {
  readyResult: ReadyResult;
  knownDirectFire: Kill[];
  knownReturnFire: Kill[];
  knownMeleeKills: Kill[];
  formatKillLine: (kill: Kill) => string;
  formatUnitName: (unitId: string) => string;
}

function formatDeployedUnitsLine(
  deployed: { armor?: number; infantry?: number; naval?: number; air?: number } | undefined
): string | null {
  if (!deployed) return null;
  const parts: string[] = [];
  if ((deployed.armor ?? 0) > 0) parts.push(`${deployed.armor!.toLocaleString()} armor`);
  if ((deployed.infantry ?? 0) > 0) parts.push(`${deployed.infantry!.toLocaleString()} infantry`);
  if ((deployed.naval ?? 0) > 0) parts.push(`${deployed.naval!.toLocaleString()} naval`);
  if ((deployed.air ?? 0) > 0) parts.push(`${deployed.air!.toLocaleString()} air`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return `${parts[0]} units deployed`;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]} units deployed`;
  if (parts.length === 3) return `${parts[0]}, ${parts[1]}, and ${parts[2]} units deployed`;
  return `${parts[0]}, ${parts[1]}, ${parts[2]}, and ${parts[3]} units deployed`;
}

function formatDeploymentCapReachedLine(
  cappedTypes: BuildUnitType[] | undefined,
  player: 'human' | 'opponent'
): string | null {
  if (player !== 'human') return null;
  if (!cappedTypes || cappedTypes.length === 0) return null;
  const ordered = (['infantry', 'armor', 'naval', 'air'] as const).filter((unitType) => cappedTypes.includes(unitType));
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return `Maximum human ${ordered[0]} units deployed.`;
  if (ordered.length === 2) return `Maximum human ${ordered[0]} and ${ordered[1]} units deployed.`;
  if (ordered.length === 3) return `Maximum human ${ordered[0]}, ${ordered[1]}, and ${ordered[2]} units deployed.`;
  return `Maximum human ${ordered[0]}, ${ordered[1]}, ${ordered[2]}, and ${ordered[3]} units deployed.`;
}

function formatAirStrikeOutcomeLine(readyResult: ReadyResult, formatUnitName: (unitId: string) => string): string | null {
  const attempts = readyResult.airStrikeAttemptCount ?? 0;
  if (attempts <= 0) return null;
  const destroyedByFeature = { urban: 0, airport: 0, seaport: 0 };
  for (const event of readyResult.infrastructureDestroyedEvents ?? []) {
    destroyedByFeature[event.targetType] += 1;
  }

  const destroyedUnitsByType = { infantry: 0, armor: 0, naval: 0, air: 0 };
  const airLossUnitIds: string[] = [];
  for (const removed of readyResult.airStrikeRemovedUnits ?? []) {
    if (removed.player === 'human' && removed.unitType === 'air') {
      airLossUnitIds.push(removed.id);
      continue;
    }
    if (removed.unitType === 'infantry') destroyedUnitsByType.infantry += 1;
    else if (removed.unitType === 'armor') destroyedUnitsByType.armor += 1;
    else if (removed.unitType === 'naval') destroyedUnitsByType.naval += 1;
    else if (removed.unitType === 'air') destroyedUnitsByType.air += 1;
  }

  const destroyedParts: string[] = [];
  if (destroyedByFeature.urban > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.urban, 'urban hex', 'urban hexes'));
  if (destroyedByFeature.airport > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.airport, 'airport', 'airports'));
  if (destroyedByFeature.seaport > 0) destroyedParts.push(formatCountLabel(destroyedByFeature.seaport, 'seaport', 'seaports'));
  if (destroyedUnitsByType.infantry > 0) destroyedParts.push(formatCountLabel(destroyedUnitsByType.infantry, 'infantry unit', 'infantry units'));
  if (destroyedUnitsByType.armor > 0) destroyedParts.push(formatCountLabel(destroyedUnitsByType.armor, 'armor unit', 'armor units'));
  if (destroyedUnitsByType.naval > 0) destroyedParts.push(formatCountLabel(destroyedUnitsByType.naval, 'naval unit', 'naval units'));
  if (destroyedUnitsByType.air > 0) destroyedParts.push(formatCountLabel(destroyedUnitsByType.air, 'air unit', 'air units'));

  const uniqueAirLossUnitIds = [...new Set(airLossUnitIds)];
  const lossesPart =
    uniqueAirLossUnitIds.length > 0
      ? `; air losses ${uniqueAirLossUnitIds.map((unitId) => formatUnitName(unitId)).join(', ')}`
      : '';

  const destroyedPart = destroyedParts.length > 0 ? `destroyed ${destroyedParts.join(', ')}` : 'destroyed nothing';
  return `• Air strikes: ${attempts.toLocaleString()} attempted; ${destroyedPart}${lossesPart}`;
}

export function buildTurnUpdateBullets(args: TurnUpdateSummaryArgs): string[] {
  const { readyResult, knownDirectFire, knownReturnFire, knownMeleeKills, formatKillLine, formatUnitName } = args;
  const bullets: string[] = [];
  const deployedLine = formatDeployedUnitsLine(readyResult.deployedUnitsByType);
  if (deployedLine) bullets.push(deployedLine);
  const deploymentCapLine = formatDeploymentCapReachedLine(readyResult.humanDeploymentCapReachedUnitTypes, 'human');
  if (deploymentCapLine) bullets.push(deploymentCapLine);
  const airStrikeOutcomeLine = formatAirStrikeOutcomeLine(readyResult, formatUnitName);
  if (airStrikeOutcomeLine) bullets.push(airStrikeOutcomeLine);
  if ((readyResult.humanHexesLostCount ?? 0) > 0) {
    bullets.push(`${readyResult.humanHexesLostCount!.toLocaleString()} hexes lost to opponent`);
  }
  if (knownDirectFire.length > 0) bullets.push(`• Direct fire: ${knownDirectFire.map(formatKillLine).join('; ')}`);
  if (knownReturnFire.length > 0) bullets.push(`• Return fire: ${knownReturnFire.map(formatKillLine).join('; ')}`);
  if (knownMeleeKills.length > 0) bullets.push(knownMeleeKills.map(formatKillLine).join('\n'));
  return bullets;
}
