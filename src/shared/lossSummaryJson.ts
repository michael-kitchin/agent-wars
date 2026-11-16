/**
 * JSON read and write for the per-player loss summaries stored in turn notes.
 */

import { isBuildUnitType } from './ipc/productionTypes';
import type { LossAttribution, LossKillerUnit } from './lossAttributionTypes';
import {
  emptyPlayerLossSummary,
  type LostUnit,
  type LostUnitType,
  type PlayerLossSummary,
} from './lossSummary';

/**
 * Reads the optional attribution of one stored unit.
 *
 * Purpose: Rows written before attribution existed have none, and a damaged one must not cost the unit its place in the note.
 * When to use: `parsePlayerLossSummaryJson`, once per stored unit.
 * Expected outcome: An attribution when `ownerId` is a non-empty string, with each other field cleaned. Otherwise undefined.
 * Exceptions: None.
 */
function parseLossAttribution(raw: unknown): LossAttribution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  if (typeof row.ownerId !== 'string' || row.ownerId.length === 0) return undefined;
  const lossH3Index = typeof row.lossH3Index === 'string' && row.lossH3Index.length > 0 ? row.lossH3Index : null;
  const responsibleOwnerIds = Array.isArray(row.responsibleOwnerIds)
    ? row.responsibleOwnerIds.filter((id): id is string => typeof id === 'string')
    : null;
  const killerUnits: LossKillerUnit[] = [];
  if (Array.isArray(row.killerUnits)) {
    for (const killer of row.killerUnits as unknown[]) {
      if (!killer || typeof killer !== 'object') continue;
      const { unitId, unitType } = killer as Record<string, unknown>;
      if (typeof unitId !== 'string' || unitId.length === 0) continue;
      if (typeof unitType !== 'string' || !isBuildUnitType(unitType)) continue;
      killerUnits.push({ unitId, unitType });
    }
  }
  return { ownerId: row.ownerId, lossH3Index, responsibleOwnerIds, killerUnits };
}

/**
 * Reads one cause bucket from a parsed loss JSON object.
 *
 * Purpose: Keeps only units that have a display name and a unit type, and carries their id and attribution.
 * When to use: `parsePlayerLossSummaryJson`, once per cause key.
 * Expected outcome: A fresh list. A missing or non-array bucket is an empty list.
 * Exceptions: None.
 */
function readBucket(parsed: Partial<Record<keyof PlayerLossSummary, unknown>>, key: keyof PlayerLossSummary): LostUnit[] {
  const arr = parsed[key];
  if (!Array.isArray(arr)) return [];
  const units: LostUnit[] = [];
  for (const item of arr as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.displayName !== 'string' || typeof row.unitType !== 'string') continue;
    const attribution = parseLossAttribution(row.attribution);
    units.push({
      displayName: row.displayName,
      unitType: row.unitType as LostUnitType,
      ...(typeof row.unitId === 'string' ? { unitId: row.unitId } : {}),
      ...(attribution ? { attribution } : {}),
    });
  }
  return units;
}

/**
 * Parses a JSON blob into a {@link PlayerLossSummary}, tolerating partial or invalid data.
 *
 * Purpose: Hydrates persisted turn-note loss columns from SQLite.
 * When to use: `buildRecentTurnNotesSection` when reading `own_loss_json` and `enemy_loss_json`.
 * Expected outcome: Returns empty buckets for null or invalid JSON; preserves valid units only, with their attribution when it is valid.
 * Exceptions: None.
 */
export function parsePlayerLossSummaryJson(raw: string | null | undefined): PlayerLossSummary {
  if (!raw) return emptyPlayerLossSummary();
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof PlayerLossSummary, unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return emptyPlayerLossSummary();
    return {
      ranged: readBucket(parsed, 'ranged'),
      melee: readBucket(parsed, 'melee'),
      returnFire: readBucket(parsed, 'returnFire'),
      airStrike: readBucket(parsed, 'airStrike'),
      missileStrike: readBucket(parsed, 'missileStrike'),
      other: readBucket(parsed, 'other'),
    };
  } catch {
    return emptyPlayerLossSummary();
  }
}

/**
 * Serializes a {@link PlayerLossSummary} for persistence in turn notes.
 *
 * Purpose: Writes loss buckets to SQLite JSON columns.
 * When to use: `upsertTurnLossNote` after `buildTurnLossSummary`.
 * Expected outcome: Stable JSON string with all six bucket keys present. A unit's attribution is written when it has one.
 * Exceptions: None.
 */
export function serializePlayerLossSummary(summary: PlayerLossSummary): string {
  return JSON.stringify(summary);
}
