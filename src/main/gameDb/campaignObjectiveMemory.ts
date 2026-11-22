/**
 * An AI side keeps its campaign target, staging hex, and phase between consults and across a save and load.
 *
 * Purpose: The next consult continues the same campaign instead of picking a new city every turn.
 * When to use: Read and replaced once per strategic consult. A new match deletes the row.
 * Expected outcome: Seat id to objective. A missing row is an empty map.
 * Exceptions: A parse error is logged and treated as an empty memory. A database error from the write propagates.
 */

import { CAMPAIGN_APPROACHES, CAMPAIGN_PHASES, CAMPAIGN_SOURCES, type CampaignObjective } from '../../shared/campaignTypes';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key for campaign objectives.
 *
 * Purpose: One row holds every AI seat's current campaign.
 * When to use: Reading, writing, and deleting that row.
 * Expected outcome: The string `campaign_objectives`.
 * Exceptions: None.
 */
export const CAMPAIGN_OBJECTIVES_CONFIG_KEY = 'campaign_objectives';

/**
 * Parses one stored objective.
 *
 * Purpose: A bad seat entry is dropped without dropping the other seats.
 * When to use: While reading the campaign row.
 * Expected outcome: The objective, or null when a field is missing or the wrong type. An empty staging string is rejected. The approach, lift launch turn, lift cancel turn, and skip fields are optional, and an invalid one rejects the entry. A row from before those fields existed reads back without them.
 * Exceptions: None.
 */
function parseCampaignObjective(value: unknown): CampaignObjective | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const { targetH3, stagingH3, phase, source, chosenTurn } = row;
  if (typeof targetH3 !== 'string' || targetH3.length === 0) return null;
  if (stagingH3 !== null && (typeof stagingH3 !== 'string' || stagingH3.length === 0)) return null;
  if (typeof phase !== 'string' || !(CAMPAIGN_PHASES as readonly string[]).includes(phase)) return null;
  if (typeof source !== 'string' || !(CAMPAIGN_SOURCES as readonly string[]).includes(source)) return null;
  if (typeof chosenTurn !== 'number' || !Number.isInteger(chosenTurn)) return null;
  const { approach, liftLaunchedTurn, liftCancelledTurn, skippedTargetH3, skippedTurn } = row;
  if (approach !== undefined && (typeof approach !== 'string' || !(CAMPAIGN_APPROACHES as readonly string[]).includes(approach))) return null;
  if (liftLaunchedTurn !== undefined && (typeof liftLaunchedTurn !== 'number' || !Number.isInteger(liftLaunchedTurn))) return null;
  if (liftCancelledTurn !== undefined && (typeof liftCancelledTurn !== 'number' || !Number.isInteger(liftCancelledTurn))) return null;
  if ((skippedTargetH3 === undefined) !== (skippedTurn === undefined)) return null;
  if (skippedTargetH3 !== undefined && (typeof skippedTargetH3 !== 'string' || skippedTargetH3.length === 0)) return null;
  if (skippedTurn !== undefined && (typeof skippedTurn !== 'number' || !Number.isInteger(skippedTurn))) return null;
  return {
    targetH3,
    stagingH3: stagingH3 as string | null,
    phase: phase as CampaignObjective['phase'],
    source: source as CampaignObjective['source'],
    chosenTurn,
    ...(approach !== undefined ? { approach: approach as CampaignObjective['approach'] } : {}),
    ...(liftLaunchedTurn !== undefined ? { liftLaunchedTurn: liftLaunchedTurn as number } : {}),
    ...(liftCancelledTurn !== undefined ? { liftCancelledTurn: liftCancelledTurn as number } : {}),
    ...(skippedTargetH3 !== undefined ? { skippedTargetH3: skippedTargetH3 as string, skippedTurn: skippedTurn as number } : {}),
  };
}

/**
 * Reads every seat's stored campaign.
 *
 * Purpose: Consults and the ready check share the row written last time.
 * When to use: Once per strategic consult, and after resolution.
 * Expected outcome: Seat id to objective. Invalid entries are dropped. A missing row, which is what a save from before this row existed has, is an empty map.
 * Exceptions: None. A parse error is logged and returns an empty map.
 */
export function readCampaignObjectives(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, CampaignObjective> {
  logTrace('readCampaignObjectives');
  const objectives = new Map<string, CampaignObjective>();
  const raw = selectGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY);
  if (raw == null) return objectives;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readCampaignObjectives: stored value is not an object', { rawLength: raw.length });
      return objectives;
    }
    for (const [seatId, value] of Object.entries(parsed)) {
      const objective = parseCampaignObjective(value);
      if (objective) objectives.set(seatId, objective);
      else logDebug('readCampaignObjectives: dropped invalid entry', { seatId });
    }
    return objectives;
  } catch (err) {
    logError('readCampaignObjectives: could not parse stored value', { rawLength: raw.length }, err);
    return objectives;
  }
}

/**
 * Replaces one seat's stored campaign.
 *
 * Purpose: The objective survives until the next consult, including across a save and load.
 * When to use: Once per strategic consult, and when the commander overrides the target.
 * Expected outcome: The row with this seat's entry replaced, or removed when `objective` is null. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
export function writeCampaignObjectiveForSeat(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  objective: CampaignObjective | null
): void {
  const all = readCampaignObjectives(ops);
  if (objective === null) all.delete(seatId);
  else all.set(seatId, objective);
  const record: Record<string, CampaignObjective> = {};
  for (const key of [...all.keys()].sort()) record[key] = all.get(key)!;
  logDebug('writeCampaignObjectiveForSeat', { seatId, cleared: objective === null, seatCount: all.size });
  upsertGameConfigValue(ops, CAMPAIGN_OBJECTIVES_CONFIG_KEY, JSON.stringify(record));
}

/**
 * Records the turn a campaign lift launched for one seat's target.
 *
 * Purpose: The expiry rule counts the wait for a lift from this turn, so a target that keeps launching lifts is not dropped.
 * When to use: When the engine stores a new campaign lift for the seat.
 * Expected outcome: The seat's stored objective gains `liftLaunchedTurn`. Other seats and fields are unchanged. Nothing is written when the seat has no objective.
 * Exceptions: Propagates a database error.
 */
export function writeCampaignLiftLaunchedTurn(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  turnNumber: number
): void {
  logDebug('writeCampaignLiftLaunchedTurn', { seatId, turnNumber });
  const objective = readCampaignObjectives(ops).get(seatId);
  if (objective === undefined) return;
  writeCampaignObjectiveForSeat(ops, seatId, { ...objective, liftLaunchedTurn: turnNumber });
}

/**
 * Records the turn the commander cancelled a campaign lift for one seat's target.
 *
 * Purpose: The lift launch waits `CAMPAIGN_LIFT_CANCEL_COOLDOWN_TURNS` turns after a cancel, so the engine does not relaunch the lift the commander just stopped.
 * When to use: When a commander cancel removes a campaign lift. Pass the cancelled lift's objective as `targetH3`.
 * Expected outcome: The seat's stored objective gains `liftCancelledTurn` when its target is `targetH3`. Other seats and fields are unchanged. Nothing is written when the seat has no objective or its target is another city, so a cancel never holds off lifts for a target chosen after it.
 * Exceptions: Propagates a database error.
 */
export function writeCampaignLiftCancelledTurn(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  turnNumber: number,
  targetH3: string
): void {
  logDebug('writeCampaignLiftCancelledTurn', { seatId, turnNumber, targetH3 });
  const objective = readCampaignObjectives(ops).get(seatId);
  if (objective === undefined || objective.targetH3 !== targetH3) return;
  writeCampaignObjectiveForSeat(ops, seatId, { ...objective, liftCancelledTurn: turnNumber });
}
