/**
 * Normalizes combat resolution payloads into per-player, per-cause loss summaries.
 */

import type { RemovedUnitSnapshot } from './ipc/readyTypes';
import {
  emptyTurnLossSummary,
  type LostUnit,
  type LostUnitType,
  type PlayerLossSummary,
  type TurnLossSummary,
} from './lossSummary';

/** Minimal kill edge shape shared by strategic and tactical resolution payloads. */
export interface KillEdge {
  /**
   * Unit id destroyed in this kill edge.
   *
   * Contract: Matches a removed-unit snapshot id when resolution recorded a casualty.
   * When to use: Cause classification in `buildTurnLossSummary`.
   * Expected outcome: Used as map key for ranged/melee/return/air assignment.
   * Exceptions: None.
   */
  victimId: string;
  /**
   * Optional killer unit ids when resolution recorded explicit attribution.
   *
   * Contract: Present on tactical/strategic air-strike and ranged kill edges.
   * When to use: Distinguish air-strike counter-fire (attacker lost) from strike victims.
   * Expected outcome: Enables AA and return-fire classification for air victims.
   * Exceptions: None.
   */
  killerIds?: readonly string[];
}

/**
 * Arguments for building a {@link TurnLossSummary} from one resolution beat.
 *
 * Purpose: Decouples strategic `ReadyResult` and tactical playback from loss formatting.
 * When to use: Renderer popups (with fog filter) and main-process turn-note persistence (full record).
 * Expected outcome: Every removed unit appears in exactly one cause bucket for its player.
 * Exceptions: None.
 */
export interface BuildTurnLossSummaryArgs {
  /**
   * Aggregate kill edges (ranged + melee) when explicit melee edges are unavailable.
   *
   * Contract: Strategic Ready uses this for melee inference after direct/return classification.
   * When to use: Pass `ReadyResult.kills` or tactical kill slice without air edges.
   * Expected outcome: Remaining unclassified victims map to melee when `killsByMelee` is absent.
   * Exceptions: None.
   */
  kills?: readonly KillEdge[];
  /**
   * Ranged direct-fire kill edges.
   *
   * Contract: Defender casualties from attacker-initiated ranged fire.
   * When to use: Always pass when available from resolution output.
   * Expected outcome: Victims classified as `ranged` unless already air-strike classified.
   * Exceptions: None.
   */
  killsByDirectFire?: readonly KillEdge[];
  /**
   * Return-fire kill edges from ranged engagements.
   *
   * Contract: Attacker casualties from defender return fire.
   * When to use: Always pass when available from resolution output.
   * Expected outcome: Victims classified as `returnFire` unless already classified.
   * Exceptions: None.
   */
  killsByReturnFire?: readonly KillEdge[];
  /**
   * Explicit melee kill edges (tactical playback).
   *
   * Contract: Preferred melee source when present; overrides kill-tail inference.
   * When to use: Tactical commit playback; omit for strategic Ready.
   * Expected outcome: Victims classified as `melee` unless already classified.
   * Exceptions: None.
   */
  killsByMelee?: readonly KillEdge[];
  /**
   * Air-strike kill edges.
   *
   * Contract: Unit victims from air-strike resolution including AA outcomes with killer ids.
   * When to use: Tactical `killsByAirStrike`; strategic may rely on `airStrikeRemovedUnits` alone.
   * Expected outcome: Highest-precedence cause assignment for listed victims.
   * Exceptions: None.
   */
  killsByAirStrike?: readonly KillEdge[];
  /**
   * All removed unit snapshots from the resolution (ranged, melee, transport, base loss, etc.).
   *
   * Contract: Primary roster for victim metadata and catch-all `other` classification.
   * When to use: Always pass the merged removed-unit list from Ready or tactical playback.
   * Expected outcome: Unioned with `airStrikeRemovedUnits` for complete victim coverage.
   * Exceptions: None.
   */
  removedUnits?: readonly RemovedUnitSnapshot[];
  /**
   * Air-strike-specific removed units (may overlap ranged/melee lists strategically).
   *
   * Contract: Ensures air-strike victims without kill edges still classify as air strike.
   * When to use: Strategic Ready air phase; tactical toast adapter output.
   * Expected outcome: Victims added to air strike when not already classified.
   * Exceptions: None.
   */
  airStrikeRemovedUnits?: readonly RemovedUnitSnapshot[];
  /**
   * Unit ids of air strikers lost to counter-fire or AA (from `airStrikeMoves` where `returnsToBase` is false).
   *
   * Contract: Striker ids only; excludes enemy units destroyed by the strike.
   * When to use: Strategic Ready and tactical playback loss normalization.
   * Expected outcome: Classified as `returnFire`, not `airStrike`, in popup and turn notes.
   * Exceptions: None.
   */
  airStrikeAttackerLossUnitIds?: readonly string[];
  /**
   * Resolves a display label for a victim unit id.
   *
   * Contract: Returns a non-empty string for known ids; may fall back to raw id.
   * When to use: Required for every included victim when building `LostUnit` rows.
   * Expected outcome: Used in popup lists and prompt inline summaries.
   * Exceptions: None.
   */
  resolveDisplayName: (unitId: string) => string;
  /**
   * Resolves player and unit type for a victim id.
   *
   * Contract: Returns undefined when the id is unknown; unknown ids are skipped.
   * When to use: Required for player bucketing and grouped totals.
   * Expected outcome: `player === 'human'` maps to human summary; all others map to AI.
   * Exceptions: None.
   */
  resolveUnitMeta: (unitId: string) => { player: string; unitType: string } | undefined;
  /**
   * Optional fog filter for opponent victims in renderer popups.
   *
   * Contract: When provided, human victims always pass; opponent victims pass only when this returns true.
   * When to use: Renderer with `knownVictimIds`; omit on main for full prompt history.
   * Expected outcome: Defaults to including all victims when omitted.
   * Exceptions: None.
   */
  isVictimVisible?: (unitId: string, player: string) => boolean;
}

/**
 * Normalizes raw unit type strings into loss-summary bucket types.
 *
 * Purpose: Rejects unknown unit types before they reach formatters.
 * When to use: When resolving victim metadata during `buildTurnLossSummary`.
 * Expected outcome: One of the four build unit types or null when unsupported.
 * Exceptions: None.
 */
function normalizeUnitType(raw: string): LostUnitType | null {
  if (raw === 'naval' || raw === 'air' || raw === 'armor' || raw === 'infantry') return raw;
  return null;
}

/**
 * Indexes removed-unit snapshots by unit id for metadata lookup during classification.
 *
 * Purpose: Avoids repeated linear scans when classifying many victims.
 * When to use: At the start of `buildTurnLossSummary`.
 * Expected outcome: Map keyed by snapshot id with last-write-wins on duplicates.
 * Exceptions: None.
 */
function snapshotById(snapshots: readonly RemovedUnitSnapshot[]): Map<string, RemovedUnitSnapshot> {
  const map = new Map<string, RemovedUnitSnapshot>();
  for (const s of snapshots) map.set(s.id, s);
  return map;
}

/**
 * Merges standard and air-strike removed snapshots into one deduplicated victim roster.
 *
 * Purpose: Ensures catch-all `other` classification sees every removed unit once.
 * When to use: Before iterating unclaimed victims in `buildTurnLossSummary`.
 * Expected outcome: Unique snapshots with air-strike rows overriding duplicates by id.
 * Exceptions: None.
 */
function allRemovedSnapshots(args: BuildTurnLossSummaryArgs): RemovedUnitSnapshot[] {
  const byId = new Map<string, RemovedUnitSnapshot>();
  for (const s of args.removedUnits ?? []) byId.set(s.id, s);
  for (const s of args.airStrikeRemovedUnits ?? []) byId.set(s.id, s);
  return [...byId.values()];
}

/**
 * Resolves one victim into a {@link LostUnit} row honoring fog visibility and display metadata.
 *
 * Purpose: Centralizes victim inclusion rules and display-name selection.
 * When to use: For each classified victim id during summary construction.
 * Expected outcome: `LostUnit` when visible and typed; null when filtered or unknown.
 * Exceptions: None.
 */
function resolveLostUnit(
  victimId: string,
  snapshots: Map<string, RemovedUnitSnapshot>,
  args: BuildTurnLossSummaryArgs
): LostUnit | null {
  const snap = snapshots.get(victimId);
  const meta = args.resolveUnitMeta(victimId) ?? (snap ? { player: snap.player, unitType: snap.unitType } : undefined);
  if (!meta) return null;
  const unitType = normalizeUnitType(meta.unitType);
  if (!unitType) return null;
  const player = meta.player;
  const visible =
    player === 'human' ||
    !args.isVictimVisible ||
    args.isVictimVisible(victimId, player);
  if (!visible) return null;
  const displayName =
    snap?.displayName && snap.displayName.length > 0
      ? snap.displayName
      : args.resolveDisplayName(victimId);
  return { unitType, displayName, unitId: victimId };
}

/**
 * Selects the human or AI player bucket for a victim row.
 *
 * Purpose: Maps raw player strings to the two-sided `TurnLossSummary` shape.
 * When to use: When pushing a classified victim into the summary.
 * Expected outcome: Human player uses `summary.human`; all others use `summary.ai`.
 * Exceptions: None.
 */
function bucketForPlayer(summary: TurnLossSummary, player: string): PlayerLossSummary {
  return player === 'human' ? summary.human : summary.ai;
}

/**
 * Appends one classified victim into the correct player cause bucket.
 *
 * Purpose: Keeps bucket mutation in one place during summary construction.
 * When to use: After cause and visibility are resolved for a victim id.
 * Expected outcome: One new `LostUnit` row in the specified cause array.
 * Exceptions: None.
 */
function pushToBucket(
  summary: TurnLossSummary,
  player: string,
  bucket: keyof PlayerLossSummary,
  unit: LostUnit
): void {
  bucketForPlayer(summary, player)[bucket].push(unit);
}

/**
 * Returns unit ids for air strikers that did not return to base after their strike animation row.
 *
 * Purpose: Identifies attacker counter-fire/AA losses without kill-edge metadata (strategic infra counter).
 * When to use: Before `buildTurnLossSummary` from Ready-shaped payloads with `airStrikeMoves`.
 * Expected outcome: Ids where `returnsToBase === false`; empty when moves absent.
 * Exceptions: None.
 */
export function airStrikeAttackerLossUnitIdsFromMoves(
  moves: readonly { unitId: string; returnsToBase?: boolean }[] | undefined
): readonly string[] {
  if (!moves || moves.length === 0) return [];
  return moves.filter((m) => m.returnsToBase === false).map((m) => m.unitId);
}

/**
 * Classifies one air-strike kill edge as strike victim vs attacker lost to counter-fire/AA.
 *
 * Purpose: Routes friendly air lost while striking into the return-fire bucket for popup copy.
 * When to use: While assigning `killsByAirStrike` victims in `buildTurnLossSummary`.
 * Expected outcome: `returnFire` when the victim is the striker lost to defenders; otherwise `airStrike`.
 * Exceptions: None.
 */
function classifyAirStrikeKillCause(
  edge: KillEdge,
  args: BuildTurnLossSummaryArgs
): keyof PlayerLossSummary {
  const victimMeta = args.resolveUnitMeta(edge.victimId);
  if (victimMeta?.unitType !== 'air') return 'airStrike';
  const killerId = edge.killerIds?.[0];
  if (!killerId) return 'returnFire';
  const killerMeta = args.resolveUnitMeta(killerId);
  if (killerMeta && killerMeta.player !== victimMeta.player) return 'returnFire';
  return 'airStrike';
}

/**
 * Resolves the loss cause for one air-strike removed snapshot not yet classified via kill edges.
 *
 * Purpose: Handles strategic removals and infra counterattacks without kill ledger rows.
 * When to use: Final sweep over `airStrikeRemovedUnits` in `buildTurnLossSummary`.
 * Expected outcome: Attacker losses map to `returnFire`; enemy strike victims map to `airStrike`.
 * Exceptions: None.
 */
function causeForAirStrikeRemovedUnit(
  snap: RemovedUnitSnapshot,
  args: BuildTurnLossSummaryArgs
): keyof PlayerLossSummary {
  const edge = (args.killsByAirStrike ?? []).find((e) => e.victimId === snap.id);
  if (edge) return classifyAirStrikeKillCause(edge, args);
  if (args.airStrikeAttackerLossUnitIds?.includes(snap.id)) return 'returnFire';
  return 'airStrike';
}

/**
 * Builds human and AI loss summaries from one combat resolution payload.
 *
 * Purpose: Single normalizer for popup display and persisted turn-note loss JSON.
 * When to use: After strategic Ready finalize, tactical beat commit, and renderer toast assembly.
 * Expected outcome: Complete partition of removed units into five causes per player; fog may hide opponent victims in renderer.
 * Exceptions: None.
 */
export function buildTurnLossSummary(args: BuildTurnLossSummaryArgs): TurnLossSummary {
  const summary = emptyTurnLossSummary();
  const snapshots = snapshotById(allRemovedSnapshots(args));
  const victimToCause = new Map<string, keyof PlayerLossSummary>();

  const assignFromEdges = (edges: readonly KillEdge[] | undefined, cause: keyof PlayerLossSummary): void => {
    for (const edge of edges ?? []) {
      if (!victimToCause.has(edge.victimId)) victimToCause.set(edge.victimId, cause);
    }
  };

  for (const edge of args.killsByAirStrike ?? []) {
    if (!victimToCause.has(edge.victimId)) {
      victimToCause.set(edge.victimId, classifyAirStrikeKillCause(edge, args));
    }
  }
  assignFromEdges(args.killsByDirectFire, 'ranged');
  assignFromEdges(args.killsByReturnFire, 'returnFire');
  if (args.killsByMelee && args.killsByMelee.length > 0) {
    assignFromEdges(args.killsByMelee, 'melee');
  } else {
    assignFromEdges(args.kills, 'melee');
  }

  for (const snap of args.airStrikeRemovedUnits ?? []) {
    if (!victimToCause.has(snap.id)) {
      victimToCause.set(snap.id, causeForAirStrikeRemovedUnit(snap, args));
    }
  }

  const claimed = new Set<string>();

  const addVictim = (victimId: string, cause: keyof PlayerLossSummary): void => {
    if (claimed.has(victimId)) return;
    const unit = resolveLostUnit(victimId, snapshots, args);
    if (!unit) return;
    const meta = args.resolveUnitMeta(victimId) ?? snapshots.get(victimId);
    const player = meta?.player ?? 'opponent';
    pushToBucket(summary, player, cause, unit);
    claimed.add(victimId);
  };

  for (const [victimId, cause] of victimToCause) {
    addVictim(victimId, cause);
  }

  for (const snap of allRemovedSnapshots(args)) {
    if (claimed.has(snap.id)) continue;
    addVictim(snap.id, 'other');
  }

  return summary;
}

/**
 * Builds a {@link TurnLossSummary} from a strategic or tactical Ready-shaped payload.
 *
 * Purpose: Convenience wrapper for callers that already have `ReadyResult` kill arrays and removed snapshots.
 * When to use: Renderer `readyHandler` and main finalize paths.
 * Expected outcome: Delegates to `buildTurnLossSummary` with standard field mapping.
 * Exceptions: None.
 */
export function buildTurnLossSummaryFromReadyShape(args: {
  kills?: readonly KillEdge[];
  killsByDirectFire?: readonly KillEdge[];
  killsByReturnFire?: readonly KillEdge[];
  killsByMelee?: readonly KillEdge[];
  killsByAirStrike?: readonly KillEdge[];
  removedUnits?: readonly RemovedUnitSnapshot[];
  airStrikeRemovedUnits?: readonly RemovedUnitSnapshot[];
  airStrikeAttackerLossUnitIds?: readonly string[];
  resolveDisplayName: (unitId: string) => string;
  resolveUnitMeta: (unitId: string) => { player: string; unitType: string } | undefined;
  isVictimVisible?: (unitId: string, player: string) => boolean;
}): TurnLossSummary {
  return buildTurnLossSummary(args);
}
