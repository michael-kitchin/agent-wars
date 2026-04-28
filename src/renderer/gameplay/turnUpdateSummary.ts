import { ALL_BUILD_UNIT_TYPES } from '../../shared/ipc/productionTypes';
import type { BuildUnitType, ReadyResult } from '../../shared/ipcTypes';

/**
 * Documents the `Kill` type alias (type Kill).

 * Purpose: Supports maintainability by documenting why `Kill` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type Kill = { /**
 * Specifies the contract for the `victimId` member (victimId: string;).

 * Contract: Describes stable behavior for callers of `victimId` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
victimId: string; /**
 * Specifies the contract for the `killerIds` member (killerIds: string[]).

 * Contract: Describes stable behavior for callers of `killerIds` in this codebase.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
killerIds: string[] };

/**
 * Defines the `formatCountLabel` function shape (function formatCountLabel(value: number, singular: string, plural: string): string).

 * Purpose: Supports maintainability by documenting why `formatCountLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatCountLabel(value: number, singular: string, plural: string): string {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural}`;
}

/**
 * Documents the `TurnUpdateSummaryArgs` interface as a named contract surface (interface TurnUpdateSummaryArgs).

 * Purpose: Supports maintainability by documenting why `TurnUpdateSummaryArgs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface TurnUpdateSummaryArgs {
    /**
   * Specifies the contract for the `readyResult` member (readyResult: ReadyResult;).

   * Contract: Describes stable behavior for callers of `readyResult` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
readyResult: ReadyResult;
    /**
   * Specifies the contract for the `knownDirectFire` member (knownDirectFire: Kill[];).

   * Contract: Describes stable behavior for callers of `knownDirectFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
knownDirectFire: Kill[];
    /**
   * Specifies the contract for the `knownReturnFire` member (knownReturnFire: Kill[];).

   * Contract: Describes stable behavior for callers of `knownReturnFire` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
knownReturnFire: Kill[];
    /**
   * Specifies the contract for the `knownMeleeKills` member (knownMeleeKills: Kill[];).

   * Contract: Describes stable behavior for callers of `knownMeleeKills` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
knownMeleeKills: Kill[];
    /**
   * Specifies the contract for the `formatKillLine` member (formatKillLine: (kill: Kill) => string;).

   * Contract: Describes stable behavior for callers of `formatKillLine` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatKillLine: (kill: Kill) => string;
    /**
   * Specifies the contract for the `formatUnitName` member (formatUnitName: (unitId: string) => string;).

   * Contract: Describes stable behavior for callers of `formatUnitName` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatUnitName: (unitId: string) => string;
}

/**
 * Defines the `formatDeployedUnitsLine` function shape (function formatDeployedUnitsLine().

 * Purpose: Supports maintainability by documenting why `formatDeployedUnitsLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `formatDeploymentCapReachedLine` function shape (function formatDeploymentCapReachedLine().

 * Purpose: Supports maintainability by documenting why `formatDeploymentCapReachedLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatDeploymentCapReachedLine(
  cappedTypes: BuildUnitType[] | undefined,
  player: 'human' | 'opponent'
): string | null {
  if (player !== 'human') return null;
  if (!cappedTypes || cappedTypes.length === 0) return null;
  const ordered = ALL_BUILD_UNIT_TYPES.filter((unitType) => cappedTypes.includes(unitType));
  if (ordered.length === 0) return null;
  if (ordered.length === 1) return `Maximum human ${ordered[0]} units deployed.`;
  if (ordered.length === 2) return `Maximum human ${ordered[0]} and ${ordered[1]} units deployed.`;
  if (ordered.length === 3) return `Maximum human ${ordered[0]}, ${ordered[1]}, and ${ordered[2]} units deployed.`;
  return `Maximum human ${ordered[0]}, ${ordered[1]}, ${ordered[2]}, and ${ordered[3]} units deployed.`;
}

/**
 * Defines the `formatAirStrikeOutcomeLine` function shape (function formatAirStrikeOutcomeLine(readyResult: ReadyResult, formatUnitName: (unitId: string) => string): string | null).

 * Purpose: Supports maintainability by documenting why `formatAirStrikeOutcomeLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatAirStrikeOutcomeLine(readyResult: ReadyResult, formatUnitName: (unitId: string) => string): string | null {
  const attempts = readyResult.airStrikeAttemptCount ?? 0;
  if (attempts <= 0) return null;
  const destroyedByFeature = { urban: 0, airport: 0, seaport: 0 };
  for (const event of readyResult.infrastructureDestroyedEvents ?? []) {
    const rubbleCells = event.changedRubbleCount ?? 0;
    if (event.targetType === 'urban') destroyedByFeature.urban += rubbleCells;
    else if (event.targetType === 'airport') destroyedByFeature.airport += rubbleCells;
    else if (event.targetType === 'seaport') destroyedByFeature.seaport += rubbleCells;
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

/**
 * Defines the `buildTurnUpdateBullets` function shape (export function buildTurnUpdateBullets(args: TurnUpdateSummaryArgs): string[]).

 * Purpose: Supports maintainability by documenting why `buildTurnUpdateBullets` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
