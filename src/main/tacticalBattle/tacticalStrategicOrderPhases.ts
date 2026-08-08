/**
 * Tactical snapshot mutations ordered like strategic ready resolution (no production): embark (when applicable),
 * air strike phase, ranged phase, then callers apply movement, ferry, cargo sync, and melee.
 */

import { cellToParent } from 'h3-js';
import type {
  AirStrikeAnimationMove,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  RangedAttackOrder,
} from '../../shared/ipcTypes';
import type { InfrastructureDestroyedEvent, RemovedUnitSnapshot } from '../../shared/ipc/readyTypes';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  tacticalMovementTerrainAnchorH3,
  tacticalRangedDirectFirePassesTerrainAndRange,
  tacticalRes4HasStrikeableInfrastructure,
} from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalRes4CellHasActiveTransportCorridor } from '../../shared/tacticalRes4TransportLink';
import { casualtyPriorityIndex, getAttack, getDefense, getRange } from '../combatConstants';
import { runRangedPhase } from '../combatResolution';
import {
  dedupeRangedResolutionShotLines,
  directShotLinesFromOrders,
  type RangedResolutionShotLine,
} from '../../shared/rangedResolutionShotLines';
import type { CombatUnit } from '../combatUnitTypes';
import { deleteStrategicParentUnitAndApplyTransportOutcome } from '../game-actions/sealift';
import { applyInfrastructureDestructionEffects } from '../game-actions/airStrikeResolution';
import {
  applyTacticalRangedRubbleToRes4Cell,
  type TacticalRangedRubbleApplyOptions,
} from '../game-actions/tacticalRangedInfrastructureRubble';
import { listRes4FeatureOverridesForGame } from '../gameDb';
import { refreshTacticalBattleRes4TerrainFromGameDb } from './computeTacticalBattleSnapshot';
import { tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';
import {
  tacticalFindSubUnitIndexById,
  tacticalGuardOpponentAirSubUnitForFerry,
  tacticalRes4FootprintContains,
} from './tacticalSnapshotGuards';

/**
 * Picks an `InfrastructureDestroyedEvent.targetType` label from DB override flags before a ranged rubble write.
 *
 * Purpose: Keeps tactical ranged infrastructure toasts aligned with air-strike `targetType` vocabulary when a cell mixes features.
 * When to use: Immediately before `applyTacticalRangedRubbleToRes4Cell` when emitting synthetic infra events.
 * Expected outcome: `airport` when the row had an airport; else `seaport` when a seaport flag; else `urban`.
 * Exceptions: None; missing rows default to `urban`.
 */
function tacticalRangedRubbleApplyOptsForHex(
  battle: Pick<
    TacticalBattleSnapshot,
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrainKind'
    | 'res4RoadSidesByH3'
    | 'res4RailSidesByH3'
    | 'res4IsRubbleByH3'
  >,
  hex: string
): TacticalRangedRubbleApplyOptions {
  const merged =
    (battle.res4TerrainKindByH3 && battle.res4TerrainKindByH3[hex]) ||
    battle.strategicHexTerrainKind ||
    'plains';
  return {
    mergedTerrainKindForInsert: String(merged),
    insertStrikeableTransportCorridor: tacticalRes4CellHasActiveTransportCorridor({
      cellH3: hex,
      roadSidesByH3: battle.res4RoadSidesByH3,
      railSidesByH3: battle.res4RailSidesByH3,
      rubbleByH3: battle.res4IsRubbleByH3,
    }),
  };
}

function tacticalRangedInfraEventTargetTypeBeforeRubble(
  res4H3: string,
  rows: ReadonlyArray<{ h3Index: string; isAirport: boolean; isSeaport: boolean; isUrban: boolean; isRubble: boolean }>
): 'urban' | 'airport' | 'seaport' {
  const row = rows.find((r) => r.h3Index === res4H3 && !r.isRubble);
  if (row?.isAirport) return 'airport';
  if (row?.isSeaport) return 'seaport';
  return 'urban';
}

/**
 * Deletes strategic parent units whose tactical sub-units were all eliminated during a tactical phase.
 *
 * Purpose: Removes a parent from SQLite only when no tactical sub-units of that parent remain on the snapshot.
 * When to use: After air+ranged or melee filters `subUnits`; compares subs before and after the phase.
 * Expected outcome: `deleteStrategicParentUnitAndApplyTransportOutcome` runs only for fully eliminated parents.
 * Exceptions: None.
 */
export function syncStrategicUnitsDbWhenTacticalParentsEliminated(
  subsBefore: readonly TacticalSubUnitSnapshot[],
  subsAfter: readonly TacticalSubUnitSnapshot[]
): void {
  const parentsAfter = new Set(subsAfter.map((u) => u.parentUnitId));
  const eliminatedParents = new Set<string>();
  for (const u of subsBefore) {
    if (!parentsAfter.has(u.parentUnitId)) eliminatedParents.add(u.parentUnitId);
  }
  if (eliminatedParents.size === 0) return;
  for (const pid of [...eliminatedParents].sort()) {
    deleteStrategicParentUnitAndApplyTransportOutcome(pid);
  }
  tacticalLogMutate('syncStrategicUnitsDbWhenTacticalParentsEliminated', {
    eliminatedParentCount: eliminatedParents.size,
  });
}

/**
 * Lists tactical sub-unit ids to remove for one casualty, including cargo embarked on that naval sub.
 *
 * Purpose: Keeps naval sub-unit loss aligned with sealift cargo without expanding to sibling sub-units.
 * When to use: `markTacticalSubUnitCasualty` when building the removal set for one strike victim.
 * Expected outcome: Victim id plus zero or more embarked land ids when the victim is naval.
 * Exceptions: None.
 */
function expandedRemovalIdsForVictim(subUnits: readonly TacticalSubUnitSnapshot[], victimId: string): string[] {
  const victim = subUnits.find((u) => u.id === victimId);
  const out = new Set<string>([victimId]);
  if (victim?.unitType === 'naval') {
    for (const u of subUnits) {
      if (u.embarkedOnSubUnitId === victimId) out.add(u.id);
    }
  }
  return [...out];
}

/**
 * Marks one tactical sub-unit (and land cargo embarked on that naval sub) for snapshot removal.
 *
 * Purpose: Enforces per-sub-unit tactical casualties without removing sibling sub-units of the same strategic parent.
 * When to use: Air strike and AA paths before `flushAirCasualties`; infra counterattacks pass empty killers to skip kill ledger rows.
 * Expected outcome: `toRemove` gains the victim id(s); kill ledger rows are added only when `killerSubUnitIds` is non-empty.
 * Exceptions: None.
 */
function markTacticalSubUnitCasualty(
  subUnits: readonly TacticalSubUnitSnapshot[],
  toRemove: Set<string>,
  victimSubUnitId: string,
  killerSubUnitIds: string[],
  killLedger: { victimId: string; killerIds: string[] }[]
): void {
  for (const id of expandedRemovalIdsForVictim(subUnits, victimSubUnitId)) {
    if (toRemove.has(id)) continue;
    toRemove.add(id);
    if (killerSubUnitIds.length > 0) {
      killLedger.push({ victimId: id, killerIds: killerSubUnitIds });
    }
  }
}

/**
 * Resolves one air-vs-`units` strike on a tactical snapshot using per-sub-unit casualty rules.
 *
 * Purpose: Keeps tactical air casualties and AA return fire aligned with strategic dice while only removing the struck sub-unit (plus cargo on that naval sub).
 * When to use: Inside `applyTacticalAirStrikeThenRangedPhaseOnBattle` for each `targetType === 'units'` order after the hit roll.
 * Expected outcome: Mutates `toRemove` and kill ledgers; strategic parent delete is deferred to `syncStrategicUnitsDbWhenTacticalParentsEliminated`.
 * Exceptions: None; skips silently when the attacker row is missing from `sub`.
 */
function resolveTacticalAirStrikeAgainstUnitsOnSubUnits(
  battle: TacticalBattleSnapshot,
  sub: TacticalSubUnitSnapshot[],
  attacker: TacticalSubUnitSnapshot,
  targetH3Index: string,
  rollD6: () => number,
  toRemove: Set<string>,
  killsByAirStrike: { victimId: string; killerIds: string[] }[],
  killsByReturnFire: { victimId: string; killerIds: string[] }[]
): void {
  const defenders = sub.filter((u) => u.h3Index === targetH3Index && u.player !== attacker.player);
  const eligibleForAa = defenders.filter(
    (d) =>
      (d.unitType !== 'infantry' && d.unitType !== 'armor') ||
      !tacticalEmbarkedLandExcludedFromRangedInput(battle, sub, d)
  );
  const attackHit = rollD6() <= getAttack('air');
  if (attackHit && defenders.length > 0) {
    const victim = [...defenders].sort(
      (a, b) =>
        getDefense(a.unitType) - getDefense(b.unitType) ||
        casualtyPriorityIndex(a.unitType) - casualtyPriorityIndex(b.unitType)
    )[0]!;
    markTacticalSubUnitCasualty(sub, toRemove, victim.id, [attacker.id], killsByAirStrike);
    tacticalLogMutate('resolveTacticalAirStrikeAgainstUnitsOnSubUnits ground target destroyed', {
      targetH3Index,
      victimSubUnitId: victim.id,
      victimParentUnitId: victim.parentUnitId,
      attackerSubUnitId: attacker.id,
    });
  }
  for (const defender of eligibleForAa) {
    if (toRemove.has(attacker.id)) break;
    if (toRemove.has(defender.id)) continue;
    if (getRange(defender.unitType) < 1) continue;
    if (rollD6() > getAttack(defender.unitType)) continue;
    markTacticalSubUnitCasualty(sub, toRemove, attacker.id, [defender.id], killsByReturnFire);
    tacticalLogMutate('resolveTacticalAirStrikeAgainstUnitsOnSubUnits attacker lost to AA', {
      targetH3Index,
      attackerSubUnitId: attacker.id,
      defenderSubUnitId: defender.id,
    });
    break;
  }
}

/**
 * Returns whether a land sub-unit should be excluded from ranged combat input like strategic embarked-at-sea infantry.
 *
 * Purpose: Mirrors `isEmbarkedLandUnitOnWater` using tactical terrain and sealift links instead of the strategic DB.
 * When to use: Building `CombatUnit[]` for `runRangedPhase` on a tactical snapshot.
 * Expected outcome: True only for infantry/armor embarked on a naval unit whose cell resolves to water terrain.
 * Exceptions: None.
 */
function tacticalEmbarkedLandExcludedFromRangedInput(
  battle: TacticalBattleSnapshot,
  subUnits: readonly TacticalSubUnitSnapshot[],
  u: TacticalSubUnitSnapshot
): boolean {
  if (u.unitType !== 'infantry' && u.unitType !== 'armor') return false;
  const emb = u.embarkedOnSubUnitId;
  if (!emb) return false;
  const naval = subUnits.find((x) => x.id === emb);
  if (!naval || naval.unitType !== 'naval') return false;
  const kind = battle.res4TerrainKindByH3?.[naval.h3Index] ?? battle.strategicHexTerrainKind ?? 'plains';
  return kind === 'water';
}

/**
 * Maps live tactical sub-units to `CombatUnit` rows for `runRangedPhase`, excluding land embarked on naval in water cells.
 *
 * Purpose: Keeps tactical ranged dice resolution aligned with strategic `rangedInputUnits` filtering.
 * When to use: Immediately before `runRangedPhase` inside `applyTacticalAirStrikeThenRangedPhaseOnBattle`.
 * Expected outcome: One row per eligible sub-unit with stable `displayOrder` tie-breaks.
 * Exceptions: None.
 */
function tacticalSubUnitsToRangedCombatUnits(battle: TacticalBattleSnapshot, subUnits: readonly TacticalSubUnitSnapshot[]): CombatUnit[] {
  return subUnits
    .filter((u) => !tacticalEmbarkedLandExcludedFromRangedInput(battle, subUnits, u))
    .map((u, i) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
      displayOrder: i,
    }));
}

/**
 * Sorts tactical air strike orders like `resolveAirStrikePhase`: attacker res4 cell, then attacker unit id.
 *
 * Purpose: Preserves strategic strike sequencing when multiple aircraft act on one tactical turn.
 * When to use: Before iterating air strike rows in `applyTacticalAirStrikeThenRangedPhaseOnBattle`.
 * Expected outcome: New array reference; ties broken lexicographically by `unitId`.
 * Exceptions: None.
 */
export function sortTacticalAirStrikesForStrategicPhaseOrder(
  orders: readonly AirStrikeOrder[],
  subUnits: readonly TacticalSubUnitSnapshot[]
): AirStrikeOrder[] {
  const byId = new Map(subUnits.map((u) => [u.id, u] as const));
  return [...orders].sort((a, b) => {
    const aH = byId.get(a.unitId)?.h3Index ?? '';
    const bH = byId.get(b.unitId)?.h3Index ?? '';
    return aH.localeCompare(bH) || a.unitId.localeCompare(b.unitId);
  });
}

/**
 * Applies embark orders for one player onto a cloned tactical snapshot.
 *
 * Purpose: Mirrors `applyEmbarkOrdersForPlayer` placement: opponent embark runs before air in `executeReadyStrategicTurn`; human embark is not in that pipeline, so tactical applies optional human embark after air+ranged (support projection) or after movement (full Ready beat) via callers.
 * When to use: Opponent orders before air+ranged; human orders only from callers after strikes or after march, never immediately before air+ranged for human.
 * Expected outcome: `embarkedOnSubUnitId` set when rows match; cargo hexes synced to carriers.
 * Exceptions: None.
 */
export function applyTacticalEmbarkPhaseOnBattle(
  battle: TacticalBattleSnapshot,
  embarkOrders: readonly EmbarkOrder[] | undefined,
  player: 'human' | 'opponent'
): TacticalBattleSnapshot {
  if (!embarkOrders?.length) return battle;
  let sub = battle.subUnits.map((u) => ({ ...u }));
  const syncCargoToNavalHex = (): void => {
    const idTo = new Map(sub.map((u) => [u.id, u] as const));
    sub = sub.map((u) => {
      const e = u.embarkedOnSubUnitId;
      if (!e) return u;
      const n = idTo.get(e);
      return n && n.unitType === 'naval' ? { ...u, h3Index: n.h3Index } : u;
    });
  };
  for (const e of embarkOrders) {
    const li = tacticalFindSubUnitIndexById(sub, e.unitId);
    if (li < 0) continue;
    const land = sub[li]!;
    if (land.player !== player) continue;
    sub[li] = { ...land, embarkedOnSubUnitId: e.navalUnitId };
  }
  syncCargoToNavalHex();
  tacticalLogMutate('applyTacticalEmbarkPhaseOnBattle', { battleId: battle.battleId, player, count: embarkOrders.length });
  return { ...battle, subUnits: sub };
}

/**
 * Aggregated air-strike and ranged phase outputs for one tactical snapshot clone before movement.
 *
 * Purpose: Lets `commitHumanTacticalDraftOrders` and support-only projections return kill edges, removals, and infra events without recomputing.
 * When to use: Return type of `applyTacticalAirStrikeThenRangedPhaseOnBattle` only.
 * Expected outcome: `battle` reflects casualties; parallel arrays describe what to toast or persist.
 * Exceptions: None.
 */
export type TacticalAirRangedPhaseAccum = {
  battle: TacticalBattleSnapshot;
  killsByDirectFire: { victimId: string; killerIds: string[] }[];
  killsByAirStrike: { victimId: string; killerIds: string[] }[];
  killsByReturnFire: { victimId: string; killerIds: string[] }[];
  removedUnits: RemovedUnitSnapshot[];
  infrastructureDestroyedEvents: InfrastructureDestroyedEvent[];
  airStrikeAttemptCount: number;
  /**
   * Air-strike animation rows for tactical resolution playback (mirrors strategic `resolveAirStrikePhase.strikeMoves`).
   *
   * Purpose: Feeds `TacticalCommitResolutionPlayback.airStrikeMoves` and renderer outbound/return glide construction.
   * When to use: Read by `commitHumanTacticalDraftOrders` when assembling `tacticalResolutionPlayback`.
   * Expected outcome: One entry per `airStrikeAttemptCount` increment that recorded a glide segment; may be empty when no strikes ran.
   * Exceptions: None.
   */
  airStrikePlaybackMoves: AirStrikeAnimationMove[];
  /**
   * Target hexes for air combat lightning during playback (mirrors strategic `strikeHexes`).
   *
   * Purpose: Maps to `TacticalCommitResolutionPlayback.airStrikeHexes` separate from ranged combat hexes.
   * When to use: Same assembly path as `airStrikePlaybackMoves`.
   * Expected outcome: De-duplicated res4 target references for strikes that entered the animation pipeline.
   * Exceptions: None.
   */
  airStrikePlaybackStrikeHexes: string[];
  /**
   * Hexes where air phase removals occurred, for casualty pulse timing (mirrors strategic `casualtyHexes` from air only).
   *
   * Purpose: Feeds `TacticalCommitResolutionPlayback.airStrikeCasualtyHexes`.
   * When to use: Populated from `flushAirCasualties` during the air loop and final flush.
   * Expected outcome: May be a superset of cells that also appear in other removal lists; renderer de-dupes visually.
   * Exceptions: None.
   */
  airStrikePlaybackCasualtyHexes: string[];
  /**
   * Hex-to-hex ranged connectors for resolution lightning (direct fire + return-fire attempts).
   *
   * Purpose: Feeds `TacticalCommitResolutionPlayback.rangedResolutionShotLines` with the same contract as strategic Ready.
   * When to use: Read by `commitHumanTacticalDraftOrders` when assembling playback.
   * Expected outcome: Deduped pairs covering all submitted ranged orders this phase plus return-fire eligibility edges; empty when none.
   * Exceptions: None.
   */
  rangedResolutionShotLines: RangedResolutionShotLine[];
};

/**
 * Whether tactical air+ranged resolution filters orders to one player or merges both like strategic Ready.
 */
export type TacticalAirRangedResolutionScope = 'singlePlayer' | 'mergedHumanThenOpponent';

/**
 * Applies tactical air strikes (units + infrastructure in one sorted pass) then ranged combat via `runRangedPhase`.
 *
 * Purpose: Matches strategic `executeReadyStrategicTurn` ordering: full air strike phase, then ranged, before movement.
 * When to use: After opponent embark on the same snapshot clone; use `mergedHumanThenOpponent` when concatenating human-then-opponent air and ranged lists like strategic `allAirStrikes` / `allRanged`.
 * Expected outcome: Snapshot reflects air and ranged casualties; kill buckets match strategic toast semantics.
 * Exceptions: None; consumes `next` draws for air infra rolls and ranged/melee downstream callers must continue the same PRNG.
 */
export function applyTacticalAirStrikeThenRangedPhaseOnBattle(
  battle: TacticalBattleSnapshot,
  airStrikes: readonly AirStrikeOrder[] | undefined,
  rangedAttacks: readonly { unitId: string; targetH3Index: string }[] | undefined,
  rangedPlayer: 'human' | 'opponent',
  next: () => number,
  resolutionScope: TacticalAirRangedResolutionScope = 'singlePlayer'
): TacticalAirRangedPhaseAccum {
  tacticalLogQuery('applyTacticalAirStrikeThenRangedPhaseOnBattle', {
    battleId: battle.battleId,
    airCount: airStrikes?.length ?? 0,
    rangedCount: rangedAttacks?.length ?? 0,
    rangedPlayer,
    resolutionScope,
  });
  let sub = battle.subUnits.map((u) => ({ ...u }));
  const infrastructureDestroyedEvents: InfrastructureDestroyedEvent[] = [];
  const killsByDirectFire: { victimId: string; killerIds: string[] }[] = [];
  const killsByAirStrike: { victimId: string; killerIds: string[] }[] = [];
  const killsByReturnFire: { victimId: string; killerIds: string[] }[] = [];
  const removedUnits: RemovedUnitSnapshot[] = [];
  const removedUnitIdsLogged = new Set<string>();
  let airStrikeAttemptCount = 0;
  const toRemove = new Set<string>();
  const strikeMoves: AirStrikeAnimationMove[] = [];
  const strikeHexesSet = new Set<string>();
  const airStrikeCasualtyHexSet = new Set<string>();
  const flushAirCasualties = (): void => {
    if (toRemove.size === 0) return;
    for (const id of toRemove) {
      if (removedUnitIdsLogged.has(id)) continue;
      const row = sub.find((u) => u.id === id);
      if (row) {
        removedUnitIdsLogged.add(id);
        removedUnits.push({
          id: row.id,
          player: row.player,
          unitType: row.unitType,
          h3Index: row.h3Index,
          displayName: row.displayName,
        });
        airStrikeCasualtyHexSet.add(row.h3Index);
      }
    }
    sub = sub.filter((u) => !toRemove.has(u.id));
    toRemove.clear();
  };
  const sortedAir = sortTacticalAirStrikesForStrategicPhaseOrder(airStrikes ?? [], sub);
  const airPlayerOk = (attacker: TacticalSubUnitSnapshot): boolean =>
    resolutionScope === 'mergedHumanThenOpponent' || attacker.player === rangedPlayer;
  for (const s of sortedAir) {
    if (toRemove.has(s.unitId)) continue;
    const attacker = sub.find((u) => u.id === s.unitId);
    if (!attacker || !airPlayerOk(attacker)) continue;
    if (s.targetType === 'units') {
      airStrikeAttemptCount += 1;
      strikeHexesSet.add(s.targetH3Index);
      const fromH3Index = attacker.h3Index;
      const rollD6Strike = (): number => Math.floor(next() * 6) + 1;
      resolveTacticalAirStrikeAgainstUnitsOnSubUnits(
        battle,
        sub,
        attacker,
        s.targetH3Index,
        rollD6Strike,
        toRemove,
        killsByAirStrike,
        killsByReturnFire
      );
      flushAirCasualties();
      strikeMoves.push({
        unitId: attacker.id,
        player: attacker.player,
        unitType: attacker.unitType,
        fromH3Index,
        targetH3Index: s.targetH3Index,
        returnsToBase: sub.some((u) => u.id === s.unitId),
      });
      continue;
    }
    if (attacker.unitType !== 'air') continue;
    airStrikeAttemptCount += 1;
    strikeHexesSet.add(s.targetH3Index);
    const fromH3Index = attacker.h3Index;
    const rollD6 = (): number => Math.floor(next() * 6) + 1;
    const parent = cellToParent(s.targetH3Index, 1);
    if (parent !== battle.enclosingRes1H3Index) {
      strikeMoves.push({
        unitId: attacker.id,
        player: attacker.player,
        unitType: attacker.unitType,
        fromH3Index,
        targetH3Index: s.targetH3Index,
        returnsToBase: true,
      });
      continue;
    }
    if (rollD6() > getAttack('air')) {
      strikeMoves.push({
        unitId: attacker.id,
        player: attacker.player,
        unitType: attacker.unitType,
        fromH3Index,
        targetH3Index: s.targetH3Index,
        returnsToBase: true,
      });
      continue;
    }
    const destruction = applyInfrastructureDestructionEffects(parent, s.targetType, next, {
      tacticalUrbanStrikeTargetRes4H3: s.targetType === 'urban' ? s.targetH3Index : undefined,
    });
    if (destruction.changedRubbleCount > 0 || destruction.destroyedAirUnits.length > 0) {
      infrastructureDestroyedEvents.push({
        h3Index: parent,
        targetType: s.targetType,
        changedRubbleCount: destruction.changedRubbleCount,
        destroyedAirUnitsCount: destruction.destroyedAirUnits.length,
      });
    }
    for (const row of destruction.destroyedAirUnits) {
      for (const su of sub) {
        if (su.parentUnitId !== row.id) continue;
        if (toRemove.has(su.id)) continue;
        toRemove.add(su.id);
        killsByAirStrike.push({ victimId: su.id, killerIds: [attacker.id] });
      }
    }
    const counterThreshold = s.targetType === 'airport' ? 2 : 1;
    if (rollD6() <= counterThreshold) {
      markTacticalSubUnitCasualty(sub, toRemove, attacker.id, [], killsByAirStrike);
    }
    flushAirCasualties();
    strikeMoves.push({
      unitId: attacker.id,
      player: attacker.player,
      unitType: attacker.unitType,
      fromH3Index,
      targetH3Index: s.targetH3Index,
      returnsToBase: sub.some((u) => u.id === s.unitId),
    });
  }
  flushAirCasualties();
  let workBattle: TacticalBattleSnapshot = { ...battle, subUnits: sub };
  const footprint = new Set(workBattle.res4ChildH3Indexes);
  const rangedPlayerFiltered = (rangedAttacks ?? []).filter((r) => {
    const a = workBattle.subUnits.find((u) => u.id === r.unitId);
    if (!a) return false;
    if (resolutionScope === 'mergedHumanThenOpponent') return true;
    return a.player === rangedPlayer;
  });
  let rangedTerrainStripped = 0;
  const rangedOrders: RangedAttackOrder[] = [];
  for (const r of rangedPlayerFiltered) {
    const a = workBattle.subUnits.find((u) => u.id === r.unitId);
    if (!a) continue;
    const anchor = tacticalMovementTerrainAnchorH3(a, workBattle.subUnits);
    if (!tacticalRangedDirectFirePassesTerrainAndRange(workBattle, footprint, a.unitType, anchor, r.targetH3Index)) {
      rangedTerrainStripped += 1;
      continue;
    }
    rangedOrders.push({ unitId: r.unitId, targetH3Index: r.targetH3Index });
  }
  if (rangedTerrainStripped > 0) {
    tacticalLogQuery('applyTacticalAirStrikeThenRangedPhaseOnBattle stripped invalid tactical ranged orders', {
      battleId: battle.battleId,
      rangedTerrainStripped,
      rangedPlayer,
    });
  }
  let res4RowsForBattle: Array<{
    h3Index: string;
    parentH3Index: string;
    isUrban: boolean;
    isAirport: boolean;
    isSeaport: boolean;
    isRubble: boolean;
  }>;
  try {
    res4RowsForBattle = listRes4FeatureOverridesForGame().filter(
      (r) => r.parentH3Index === workBattle.enclosingRes1H3Index && footprint.has(r.h3Index)
    );
  } catch {
    res4RowsForBattle = [];
  }

  const hexHasEnemyForPlayer = (attackerPlayer: string, hex: string): boolean =>
    workBattle.subUnits.some((u) => u.h3Index === hex && u.player !== attackerPlayer);

  const rangedOrdersCombat: RangedAttackOrder[] = [];
  const rangedOrdersInfraOnly: RangedAttackOrder[] = [];
  for (const o of rangedOrders) {
    const atk = workBattle.subUnits.find((u) => u.id === o.unitId);
    if (!atk) continue;
    if (hexHasEnemyForPlayer(atk.player, o.targetH3Index)) {
      rangedOrdersCombat.push(o);
    } else if (tacticalRes4HasStrikeableInfrastructure(workBattle, o.targetH3Index, res4RowsForBattle)) {
      rangedOrdersInfraOnly.push(o);
    }
  }

  const unitByIdForShotLines = new Map(
    workBattle.subUnits.map((u) => [u.id, { h3Index: u.h3Index }] as const)
  );
  let rangedResolutionShotLines = dedupeRangedResolutionShotLines(
    directShotLinesFromOrders(rangedOrders, unitByIdForShotLines)
  );

  let rangedTerrainMutated = false;
  if (rangedOrdersCombat.length > 0) {
    const subBeforeRanged = workBattle.subUnits.map((u) => ({ ...u }));
    const byIdBefore = new Map(subBeforeRanged.map((u) => [u.id, u] as const));
    const rangedInput = tacticalSubUnitsToRangedCombatUnits(workBattle, workBattle.subUnits);
    const rangedResult = runRangedPhase(rangedInput, workBattle.res4ChildH3Indexes, rangedOrdersCombat, next);
    rangedResolutionShotLines = dedupeRangedResolutionShotLines([
      ...rangedResolutionShotLines,
      ...(rangedResult.rangedResolutionShotLines ?? []),
    ]);
    const removedSet = new Set(rangedResult.removedUnitIds);
    const byId = new Map(workBattle.subUnits.map((u) => [u.id, u] as const));
    for (const id of rangedResult.removedUnitIds) {
      const row = byId.get(id);
      if (row) {
        removedUnits.push({
          id: row.id,
          player: row.player,
          unitType: row.unitType,
          h3Index: row.h3Index,
          displayName: row.displayName,
        });
      }
    }
    for (const k of rangedResult.killsByDirectFire ?? []) {
      killsByDirectFire.push(k);
    }
    for (const k of rangedResult.killsByReturnFire ?? []) {
      killsByReturnFire.push(k);
    }
    workBattle = {
      ...workBattle,
      subUnits: workBattle.subUnits.filter((u) => !removedSet.has(u.id)),
    };

    const defenderHexesWithKill = new Set<string>();
    for (const k of rangedResult.killsByDirectFire ?? []) {
      const pre = byIdBefore.get(k.victimId);
      if (pre) defenderHexesWithKill.add(pre.h3Index);
    }
    const rubbledFromCombat = new Set<string>();
    for (const hex of defenderHexesWithKill) {
      if (!footprint.has(hex) || rubbledFromCombat.has(hex)) continue;
      if (!tacticalRes4HasStrikeableInfrastructure(workBattle, hex, res4RowsForBattle)) continue;
      const targetType = tacticalRangedInfraEventTargetTypeBeforeRubble(hex, res4RowsForBattle);
      const { changed, destroyedAirUnitsCount } = applyTacticalRangedRubbleToRes4Cell(
        hex,
        workBattle.enclosingRes1H3Index,
        tacticalRangedRubbleApplyOptsForHex(workBattle, hex)
      );
      if (changed) {
        rubbledFromCombat.add(hex);
        rangedTerrainMutated = true;
        infrastructureDestroyedEvents.push({
          h3Index: workBattle.enclosingRes1H3Index,
          targetType,
          changedRubbleCount: 1,
          destroyedAirUnitsCount,
        });
      }
    }
  }

  if (rangedOrdersInfraOnly.length > 0) {
    try {
      res4RowsForBattle = listRes4FeatureOverridesForGame().filter(
        (r) => r.parentH3Index === workBattle.enclosingRes1H3Index && footprint.has(r.h3Index)
      );
    } catch {
      /* keep previous rows */
    }
    const rollRangedInfraStrikeD6 = (): number => Math.floor(next() * 6) + 1;
    const rubbledInfraHexes = new Set<string>();
    for (const o of rangedOrdersInfraOnly) {
      const atk = workBattle.subUnits.find((u) => u.id === o.unitId);
      if (!atk) continue;
      if (rollRangedInfraStrikeD6() > getAttack(atk.unitType)) continue;
      const hex = o.targetH3Index;
      if (rubbledInfraHexes.has(hex)) continue;
      if (!tacticalRes4HasStrikeableInfrastructure(workBattle, hex, res4RowsForBattle)) continue;
      const targetType = tacticalRangedInfraEventTargetTypeBeforeRubble(hex, res4RowsForBattle);
      const { changed, destroyedAirUnitsCount } = applyTacticalRangedRubbleToRes4Cell(
        hex,
        workBattle.enclosingRes1H3Index,
        tacticalRangedRubbleApplyOptsForHex(workBattle, hex)
      );
      if (changed) {
        rubbledInfraHexes.add(hex);
        rangedTerrainMutated = true;
        infrastructureDestroyedEvents.push({
          h3Index: workBattle.enclosingRes1H3Index,
          targetType,
          changedRubbleCount: 1,
          destroyedAirUnitsCount,
        });
      }
    }
  }

  if (infrastructureDestroyedEvents.length > 0 || rangedTerrainMutated) {
    workBattle = refreshTacticalBattleRes4TerrainFromGameDb(workBattle);
  }
  tacticalLogMutate('applyTacticalAirStrikeThenRangedPhaseOnBattle complete', {
    battleId: battle.battleId,
    airAttempts: airStrikeAttemptCount,
    playbackStrikeMoveCount: strikeMoves.length,
    strikeHexPlaybackCount: strikeHexesSet.size,
    airCasualtyHexPlaybackCount: airStrikeCasualtyHexSet.size,
    rangedOrderCount: rangedOrders.length,
    removedCount: removedUnits.length,
    shotLineCount: rangedResolutionShotLines.length,
  });
  syncStrategicUnitsDbWhenTacticalParentsEliminated(battle.subUnits, workBattle.subUnits);
  return {
    battle: workBattle,
    killsByDirectFire,
    killsByAirStrike,
    killsByReturnFire,
    removedUnits,
    infrastructureDestroyedEvents,
    airStrikeAttemptCount,
    airStrikePlaybackMoves: strikeMoves,
    airStrikePlaybackStrikeHexes: [...strikeHexesSet],
    airStrikePlaybackCasualtyHexes: [...airStrikeCasualtyHexSet],
    rangedResolutionShotLines,
  };
}

/**
 * Applies air ferry repositioning for one player after movement, mirroring strategic ferry-after-move.
 *
 * Purpose: Keeps tactical ferry phase aligned with `readyStrategicResolutionPipeline` post-move ferry handling.
 * When to use: After `projectTacticalSnapshotAfterHumanMovementOrders` / opponent movement on the same beat.
 * Expected outcome: Air sub-units jump to legal res4 destinations; invalid rows are skipped with trace logs.
 * Exceptions: None.
 */
export function applyTacticalFerryPhaseOnBattle(
  battle: TacticalBattleSnapshot,
  ferryOrders: readonly FerryOrder[] | undefined,
  player: 'human' | 'opponent'
): TacticalBattleSnapshot {
  if (!ferryOrders?.length) return battle;
  let sub = battle.subUnits.map((u) => ({ ...u }));
  const res4Set = new Set(battle.res4ChildH3Indexes);
  const syncCargoToNavalHex = (): void => {
    const idTo = new Map(sub.map((u) => [u.id, u] as const));
    sub = sub.map((u) => {
      const e = u.embarkedOnSubUnitId;
      if (!e) return u;
      const n = idTo.get(e);
      return n && n.unitType === 'naval' ? { ...u, h3Index: n.h3Index } : u;
    });
  };
  for (const f of ferryOrders) {
    const fi = tacticalFindSubUnitIndexById(sub, f.unitId);
    if (fi < 0) continue;
    const air = sub[fi]!;
    if (air.player !== player || air.unitType !== 'air') continue;
    if (player === 'opponent' && !tacticalGuardOpponentAirSubUnitForFerry(sub, fi)) continue;
    if (!tacticalRes4FootprintContains(res4Set, f.destinationH3Index)) continue;
    sub[fi] = { ...air, h3Index: f.destinationH3Index };
  }
  syncCargoToNavalHex();
  tacticalLogMutate('applyTacticalFerryPhaseOnBattle', { battleId: battle.battleId, player, count: ferryOrders.length });
  return { ...battle, subUnits: sub };
}

/**
 * Re-syncs embarked land tactical rows to their naval carrier cells after ferry or embark edits.
 *
 * Purpose: Matches the tail `syncEmbarkedLandUnitPositionsWithNaval` adjustment in strategic movement resolution.
 * When to use: After ferry phase on a tactical snapshot before melee.
 * Expected outcome: Every `embarkedOnSubUnitId` land unit shares its carrier `h3Index`.
 * Exceptions: None.
 */
export function tacticalBattleWithSyncedEmbarkCargo(battle: TacticalBattleSnapshot): TacticalBattleSnapshot {
  const sub = battle.subUnits.map((u) => ({ ...u }));
  const idToUnit = new Map(sub.map((u) => [u.id, u] as const));
  for (let i = 0; i < sub.length; i++) {
    const u = sub[i]!;
    const embark = u.embarkedOnSubUnitId;
    if (!embark) continue;
    const naval = idToUnit.get(embark);
    if (naval && naval.unitType === 'naval') {
      sub[i] = { ...u, h3Index: naval.h3Index };
    }
  }
  return { ...battle, subUnits: sub };
}
