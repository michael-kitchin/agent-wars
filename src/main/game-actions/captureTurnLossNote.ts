/**
 * Captures full-resolution loss summaries into `turn_notes_history` on the main process.
 */

import type { RemovedUnitSnapshot } from '../../shared/ipcTypes';
import {
  buildTurnLossSummary,
  airStrikeAttackerLossUnitIdsFromMoves,
  type KillEdge,
} from '../../shared/lossSummaryFromResolution';
import { serializePlayerLossSummary } from '../../shared/lossSummary';
import {
  buildUnitDisplayNameLookup,
  fallbackDisplayNameFromUnitId,
  type UnitDisplayIdentity,
} from '../../shared/unitDisplayNames';
import { upsertTurnLossNote, type TurnNotesScope } from '../gameDb';
import { logDebug } from '../logger';

/**
 * Arguments for persisting one turn/beat loss note from a resolution payload (no fog filtering).
 */
export interface CaptureTurnLossNoteArgs {
  /**
   * Strategic or tactical scope for the persisted row.
   *
   * Contract: `'strategic'` uses empty `battleId`; `'tactical'` uses active battle id.
   * When to use: Strategic finalize and tactical beat commit.
   * Expected outcome: Row keyed by `(scope, battle_id, turn_number)`.
   * Exceptions: None.
   */
  scope: TurnNotesScope;
  /**
   * Tactical battle id; use empty string for strategic turns.
   *
   * Contract: Must match consultation and prompt `battleId` for tactical scope.
   * When to use: Tactical beat loss capture only.
   * Expected outcome: Isolates tactical note history per battle.
   * Exceptions: None.
   */
  battleId: string;
  /**
   * Turn or beat number whose resolution produced these losses.
   *
   * Contract: Strategic turn number or tactical beat number just resolved.
   * When to use: Written once per completed resolution.
   * Expected outcome: Aligns with strategy note row for the same beat/turn when both exist.
   * Exceptions: None.
   */
  turnNumber: number;
  /**
   * Aggregate kill edges when explicit melee edges are unavailable.
   *
   * Contract: Strategic Ready `kills` array.
   * When to use: Melee inference when `killsByMelee` is omitted.
   * Expected outcome: Unclassified kill victims map to melee after higher-precedence causes.
   * Exceptions: None.
   */
  kills?: readonly KillEdge[];
  /**
   * Direct-fire kill edges from ranged resolution.
   *
   * Contract: Same shape as Ready/tactical playback kill metadata.
   * When to use: Always when ranged combat occurred.
   * Expected outcome: Victims classified as ranged unless air strike claims them first.
   * Exceptions: None.
   */
  killsByDirectFire?: readonly KillEdge[];
  /**
   * Return-fire kill edges from ranged resolution.
   *
   * Contract: Same shape as Ready/tactical playback kill metadata.
   * When to use: When return fire produced casualties.
   * Expected outcome: Victims classified as return fire unless already claimed.
   * Exceptions: None.
   */
  killsByReturnFire?: readonly KillEdge[];
  /**
   * Explicit melee kill edges (tactical playback).
   *
   * Contract: Preferred melee source on tactical beats.
   * When to use: Tactical commit when `killsByMelee` is populated.
   * Expected outcome: Victims classified as melee unless already claimed.
   * Exceptions: None.
   */
  killsByMelee?: readonly KillEdge[];
  /**
   * Air-strike kill edges.
   *
   * Contract: Unit victims from air-strike resolution.
   * When to use: When air strikes removed units with killer metadata.
   * Expected outcome: Highest-precedence cause for listed victims.
   * Exceptions: None.
   */
  killsByAirStrike?: readonly KillEdge[];
  /**
   * All removed unit snapshots from the resolution beat.
   *
   * Contract: Union of ranged, melee, transport, and other removals.
   * When to use: Required for complete loss partition and display metadata.
   * Expected outcome: Every removed unit appears in exactly one cause bucket.
   * Exceptions: None.
   */
  removedUnits: readonly RemovedUnitSnapshot[];
  /**
   * Air-strike-specific removed units without overlapping kill-edge classification.
   *
   * Contract: Strategic air phase removals; may overlap `removedUnits`.
   * When to use: Ensures air-strike victims classify even without kill edges.
   * Expected outcome: Unclaimed air-strike snapshots map to air strike bucket.
   * Exceptions: None.
   */
  airStrikeRemovedUnits?: readonly RemovedUnitSnapshot[];
  /**
   * Air-strike animation rows used to identify striker ids lost to counter-fire.
   *
   * Contract: Same shape as Ready `airStrikeMoves`; `returnsToBase === false` marks attacker losses.
   * When to use: Strategic finalize and tactical commit loss capture.
   * Expected outcome: Attacker losses classify as return fire in persisted turn notes.
   * Exceptions: None.
   */
  airStrikeMoves?: readonly { unitId: string; returnsToBase?: boolean }[];
  /**
   * Optional roster rows for strategic display-name lookup when snapshots omit names.
   *
   * Contract: Same shape as `killLabelUnits` / `buildKillLabelUnitRoster` output.
   * When to use: Strategic Ready finalize with roman/ordinal labels.
   * Expected outcome: `resolveDisplayName` uses lookup before id fallback.
   * Exceptions: None.
   */
  labelUnits?: readonly UnitDisplayIdentity[];
}

/**
 * Builds and persists human/AI loss JSON for one resolved turn or beat (full record, no fog).
 *
 * Purpose: Shared write path for strategic finalize and tactical beat commit.
 * When to use: Immediately after combat resolution produces removed units and kill edges.
 * Expected outcome: `turn_notes_history` row updated via `upsertTurnLossNote`.
 * Exceptions: None; underlying DB helpers log errors without throwing.
 */
export function captureTurnLossNoteFromResolution(args: CaptureTurnLossNoteArgs): void {
  const {
    scope,
    battleId,
    turnNumber,
    kills,
    killsByDirectFire,
    killsByReturnFire,
    killsByMelee,
    killsByAirStrike,
    removedUnits,
    airStrikeRemovedUnits,
    labelUnits,
    airStrikeMoves,
  } = args;
  logDebug('captureTurnLossNoteFromResolution', {
    scope,
    battleId,
    turnNumber,
    removedCount: removedUnits.length,
    airStrikeRemovedCount: airStrikeRemovedUnits?.length ?? 0,
  });
  const metaMap = new Map<string, { player: string; unitType: string }>();
  for (const u of removedUnits) metaMap.set(u.id, { player: u.player, unitType: u.unitType });
  for (const u of airStrikeRemovedUnits ?? []) metaMap.set(u.id, { player: u.player, unitType: u.unitType });
  const roster: readonly UnitDisplayIdentity[] =
    labelUnits ??
    removedUnits.map((u) => ({
      id: u.id,
      unitType: u.unitType,
      displayOrder: u.displayOrder,
    }));
  const displayLookup = buildUnitDisplayNameLookup(roster);
  const summary = buildTurnLossSummary({
    kills,
    killsByDirectFire,
    killsByReturnFire,
    killsByMelee,
    killsByAirStrike,
    removedUnits,
    airStrikeRemovedUnits,
    airStrikeAttackerLossUnitIds: airStrikeAttackerLossUnitIdsFromMoves(airStrikeMoves),
    resolveDisplayName: (id) => {
      const snap = removedUnits.find((u) => u.id === id) ?? airStrikeRemovedUnits?.find((u) => u.id === id);
      if (snap?.displayName) return snap.displayName;
      return displayLookup.get(id) ?? fallbackDisplayNameFromUnitId(id);
    },
    resolveUnitMeta: (id) => metaMap.get(id),
  });
  upsertTurnLossNote(
    scope,
    battleId,
    turnNumber,
    serializePlayerLossSummary(summary.human),
    serializePlayerLossSummary(summary.ai)
  );
}
