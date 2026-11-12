/**
 * An AI side keeps its campaign target, staging hex, and phase between consults and across a save and load.
 *
 * Purpose: The next consult continues the same campaign instead of picking a new city every turn.
 * When to use: Read and replaced once per strategic consult. A new match deletes the row.
 * Expected outcome: Seat id to objective. A missing row is an empty map.
 * Exceptions: A parse error is logged and treated as an empty memory. A database error from the write propagates.
 */

import { CAMPAIGN_PHASES, CAMPAIGN_SOURCES, type CampaignObjective } from '../../shared/campaignTypes';
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
 * Expected outcome: The objective, or null when a field is missing or the wrong type. An empty staging string is rejected.
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
  return {
    targetH3,
    stagingH3: stagingH3 as string | null,
    phase: phase as CampaignObjective['phase'],
    source: source as CampaignObjective['source'],
    chosenTurn,
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
