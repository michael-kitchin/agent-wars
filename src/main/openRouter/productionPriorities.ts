/**
 * One suggested city each for a missile, a naval unit, and credits.
 *
 * Purpose: The production briefing names a city and a reason instead of telling the commander only to queue something.
 * When to use: From `buildProductionBriefing`, after paused queues.
 * Expected outcome: Zero to three lines, in the order missile, naval, credits. A line is absent when its condition fails.
 * Exceptions: None. A missing hex resolution skips that builder.
 */

import { cellToLatLng } from 'h3-js';
import { CREDITS_QUEUE_ITEM } from '../../shared/creditsRules';
import type { PostureSettings } from '../../shared/postureTypes';
import { buildQueueItemCostFor } from '../../shared/gameRules';
import { GAME_SIZE_MULTIPLIER, getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import type { BuildQueueItemType } from '../productionRules';
import type { GameStateSnapshot } from '../gameDb';
import { missileReachSet } from '../gameActions/missileReach';
import { logDebug } from '../logger';
import { getPlayerUnitCountsByType } from '../productionCaps';
import { countNeighborTerrain } from '../tools/hexNeighborTerrain';
import { enemyInfrastructureHexes } from './briefingSectionsMissiles';
import { selectNextQueueEntry } from './productionAttention';
import type { ControlledHexQueueSnapshot, ProductionQueueEntrySnapshot } from './productionQueueSnapshotTypes';

/**
 * Naval count at or above this share of the cap no longer needs a priority line.
 *
 * Purpose: Ships are for operations and fire support. Filling the whole cap is not the goal.
 * When to use: Compare with `Math.ceil(caps.naval * NAVAL_PRIORITY_CAP_SHARE)`.
 * Expected outcome: Half the naval cap.
 * Exceptions: None.
 */
export const NAVAL_PRIORITY_CAP_SHARE = 0.5;

/**
 * Smallest city, in urban cells on the Small map, that should queue credits.
 *
 * Purpose: Twelve credits a turn sustains about four infantry mercenaries on the Small size.
 * When to use: Multiply by `GAME_SIZE_MULTIPLIER` for the match size.
 * Expected outcome: 12 on Small, 24 on Medium, 36 on Large.
 * Exceptions: None.
 */
export const CREDITS_CITY_MIN_URBAN_PER_SIZE = 12;

/**
 * Turns of the credits city's income above which the treasury needs no priority line.
 *
 * Purpose: A full treasury should not be told to keep queueing credits.
 * When to use: Compare the treasury with `minUrban * CREDITS_TREASURY_CEILING_TURNS`.
 * Expected outcome: Ten turns.
 * Exceptions: None.
 */
export const CREDITS_TREASURY_CEILING_TURNS = 10;

/**
 * A controlled hex that can still queue one item type.
 *
 * Purpose: Missile, naval, and credits selection share the pause, urban, and resolution checks.
 * When to use: Inside `buildProductionPriorityLines` only.
 * Expected outcome: Null when the row is paused, has no urban cells, does not list the type, or does not resolve to an H3 index.
 * Exceptions: None.
 */
function builderFor(
  row: ControlledHexQueueSnapshot,
  itemType: string,
  resolveToH3: (lat: number, lng: number) => string | undefined
): { readonly h3: string; readonly ll: [number, number]; readonly urban: number } | null {
  if (row.buildPaused === true) return null;
  if (Array.isArray(row.pausedReasons) && row.pausedReasons.length > 0) return null;
  if (!Array.isArray(row.hex) || row.hex.length < 2) return null;
  const lat = Number(row.hex[0]);
  const lng = Number(row.hex[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const urban = Number(row.urbanHexCount ?? 0);
  if (!(urban > 0)) return null;
  const available = Array.isArray(row.availableUnitTypes) ? row.availableUnitTypes.map((value) => String(value)) : [];
  if (!available.includes(itemType)) return null;
  const h3 = resolveToH3(lat, lng);
  if (!h3) return null;
  return { h3, ll: [lat, lng], urban };
}

/**
 * True when this row's queue already holds the item.
 *
 * Purpose: A posture that keeps asking for missiles still skips the city that already has one queued.
 * When to use: The missile loop, and `typeIsQueued`.
 * Expected outcome: True when any entry's unit type equals `itemType`.
 * Exceptions: None.
 */
function rowQueuesItem(row: ControlledHexQueueSnapshot, itemType: string): boolean {
  const entries = Array.isArray(row.entries) ? row.entries : [];
  return entries.some((entry) => String((entry as ProductionQueueEntrySnapshot).unitType ?? '') === itemType);
}

/**
 * True when any queue entry is that item.
 *
 * Purpose: A type already queued anywhere does not need a priority line.
 * When to use: Missile and naval conditions. The missile condition is skipped when the posture asks for another city.
 * Expected outcome: True when any row's entries include the type.
 * Exceptions: None.
 */
function typeIsQueued(queues: readonly ControlledHexQueueSnapshot[], itemType: string): boolean {
  return queues.some((row) => rowQueuesItem(row, itemType));
}

/**
 * Turns to finish one item on this hex.
 *
 * Purpose: The priority names the city that finishes sooner.
 * When to use: After `builderFor` accepts the row. Stored points count only when the queue is empty or the next entry is this type.
 * Expected outcome: At least 1. Null when the urban count is 0.
 * Exceptions: `buildQueueItemCostFor` throws when `itemType` is not a build-queue item. Callers pass missile, naval, or credits.
 */
function buildTurns(row: ControlledHexQueueSnapshot, itemType: BuildQueueItemType, urban: number): number | null {
  if (urban <= 0) return null;
  const entries = Array.isArray(row.entries) ? (row.entries as ProductionQueueEntrySnapshot[]) : [];
  const next = selectNextQueueEntry(entries);
  const usesStored = entries.length === 0 || String(next?.unitType ?? '') === itemType;
  const stored = usesStored ? Number(row.storedPoints ?? 0) : 0;
  const cost = buildQueueItemCostFor(itemType);
  return Math.max(1, Math.ceil(Math.max(0, cost - (Number.isFinite(stored) ? stored : 0)) / urban));
}

/**
 * "1 turn" or "N turns".
 *
 * Purpose: The priority sentences stay grammatical.
 * When to use: After `buildTurns`.
 * Expected outcome: The singular only for 1.
 * Exceptions: None.
 */
function turnsWord(turns: number): string {
  return turns === 1 ? '1 turn' : `${turns} turns`;
}

/**
 * Home-region name of the seat that controls a hex, or the seat id.
 *
 * Purpose: The missile line names whose city would be hit.
 * When to use: The chosen missile target.
 * Expected outcome: `homeRegion` when the roster has it, otherwise the controller id.
 * Exceptions: None.
 */
function ownerName(state: GameStateSnapshot, h3Index: string): string {
  const controller = (state.strategicControl ?? []).find((row) => row.h3Index === h3Index)?.controllerPlayerId ?? '';
  return state.seats?.find((seat) => seat.seatId === controller)?.homeRegion ?? controller;
}

/**
 * Priority lines for this seat's controlled queues.
 *
 * Purpose: The commander is told which city should build a missile, a ship, or credits, and why.
 * When to use: Once per production briefing, with the same queues the table will show.
 * Expected outcome: Missile, then naval, then credits. Each line is omitted when its condition fails. Labels come from `formatHexLabel`. Absent `settings` uses the same shares and floors as before.
 * Exceptions: None.
 */
export function buildProductionPriorityLines(args: {
  readonly state: GameStateSnapshot;
  readonly ownSeat: string;
  readonly queues: readonly ControlledHexQueueSnapshot[];
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
  readonly formatHexLabel: (ll: [number, number]) => string;
  /**
   * The seat's posture settings.
   *
   * Contract: Absent means the naval share, credits floor, and missile gate this function used before postures.
   * When to use: The production briefing passes the seat's row. Tests omit it.
   * Expected outcome: Naval share, credits city size, and whether a queued missile still leaves one line.
   * Exceptions: None.
   */
  readonly settings?: PostureSettings;
}): string[] {
  const counts = getPlayerUnitCountsByType(args.state.units, args.ownSeat);
  const caps = getMaxUnitsPerType(parseGameSize(args.state.gameSize));
  const enemies = enemyInfrastructureHexes(args.state, args.ownSeat);
  const lines: string[] = [];
  const missileEveryCity = args.settings?.missilePriorityEveryCity === true;
  if (counts.missile < caps.missile && (missileEveryCity || !typeIsQueued(args.queues, 'missile'))) {
    let best: {
      readonly urban: number;
      readonly turns: number;
      readonly builderH3: string;
      readonly targetH3: string;
      readonly builderLabel: string;
      readonly targetLabel: string;
      readonly owner: string;
    } | null = null;
    for (const row of args.queues) {
      if (missileEveryCity && rowQueuesItem(row, 'missile')) continue;
      const builder = builderFor(row, 'missile', args.resolveToH3);
      if (!builder) continue;
      const turns = buildTurns(row, 'missile', builder.urban);
      if (turns == null) continue;
      const reach = missileReachSet(builder.h3);
      for (const target of enemies) {
        if (!(target.urbanHexCount > 0) || !reach.has(target.h3Index)) continue;
        const candidate = {
          urban: target.urbanHexCount,
          turns,
          builderH3: builder.h3,
          targetH3: target.h3Index,
          builderLabel: args.formatHexLabel(builder.ll),
          targetLabel: args.formatHexLabel(cellToLatLng(target.h3Index) as [number, number]),
          owner: ownerName(args.state, target.h3Index),
        };
        const closerTarget = best != null && candidate.targetH3 < best.targetH3;
        const better =
          best == null ||
          candidate.urban > best.urban ||
          (candidate.urban === best.urban && candidate.turns < best.turns) ||
          (candidate.urban === best.urban && candidate.turns === best.turns && candidate.builderH3 < best.builderH3) ||
          (candidate.urban === best.urban &&
            candidate.turns === best.turns &&
            candidate.builderH3 === best.builderH3 &&
            closerTarget);
        if (better) best = candidate;
      }
    }
    if (best) {
      const cells = best.urban === 1 ? 'city cell' : 'city cells';
      lines.push(`- Missile: ${best.builderLabel} can build one in ${turnsWord(best.turns)} and reaches ${best.targetLabel}, a ${best.owner} city with ${best.urban} ${cells}.`);
    }
  }
  const navalShare = args.settings?.navalPriorityCapShare ?? NAVAL_PRIORITY_CAP_SHARE;
  const navalCeiling = Math.ceil(caps.naval * navalShare);
  if (counts.naval < navalCeiling && !typeIsQueued(args.queues, 'naval')) {
    const hexSet = new Set(args.state.hexes.map((hex) => hex.h3Index));
    const terrainByH3 = new Map(args.state.hexes.map((hex) => [hex.h3Index, hex.terrain]));
    const coastal = enemies.filter((row) => {
      if (!(row.urbanHexCount > 0)) return false;
      return countNeighborTerrain({ hexH3: row.h3Index, hexSet, terrainByH3, passableFor: 'land' }).adjacentWater > 0;
    }).length;
    let bestNaval: { readonly turns: number; readonly h3: string; readonly label: string } | null = null;
    if (coastal > 0) {
      for (const row of args.queues) {
        const builder = builderFor(row, 'naval', args.resolveToH3);
        if (!builder) continue;
        const turns = buildTurns(row, 'naval', builder.urban);
        if (turns == null) continue;
        const candidate = { turns, h3: builder.h3, label: args.formatHexLabel(builder.ll) };
        if (bestNaval == null || candidate.turns < bestNaval.turns || (candidate.turns === bestNaval.turns && candidate.h3 < bestNaval.h3)) {
          bestNaval = candidate;
        }
      }
    }
    if (bestNaval) {
      const coast = coastal === 1 ? '1 enemy city is on the coast' : `${coastal} enemy cities are on the coast`;
      lines.push(`- Naval: ${bestNaval.label} can build one in ${turnsWord(bestNaval.turns)}. ${coast}, where a ship can shell them and land ground units.`);
    }
  }
  const economy = args.state.mercenaryEconomy;
  const urbanFactor = args.settings?.creditsCityUrbanFactor ?? 1;
  const minUrban = CREDITS_CITY_MIN_URBAN_PER_SIZE * GAME_SIZE_MULTIPLIER[parseGameSize(args.state.gameSize)] * urbanFactor;
  const creditsNext = args.queues.some((row) => {
    const entries = Array.isArray(row.entries) ? (row.entries as ProductionQueueEntrySnapshot[]) : [];
    const next = selectNextQueueEntry(entries);
    return next != null && String(next.unitType ?? '') === CREDITS_QUEUE_ITEM;
  });
  if (economy != null && !creditsNext && economy.credits < minUrban * CREDITS_TREASURY_CEILING_TURNS) {
    let bestCredits: { readonly urban: number; readonly h3: string; readonly label: string } | null = null;
    for (const row of args.queues) {
      const builder = builderFor(row, CREDITS_QUEUE_ITEM, args.resolveToH3);
      if (!builder || builder.urban < minUrban) continue;
      const candidate = { urban: builder.urban, h3: builder.h3, label: args.formatHexLabel(builder.ll) };
      if (
        bestCredits == null ||
        candidate.urban < bestCredits.urban ||
        (candidate.urban === bestCredits.urban && candidate.h3 < bestCredits.h3)
      ) {
        bestCredits = candidate;
      }
    }
    if (bestCredits) lines.push(`- Credits: no city is producing credits. Queue credits in ${bestCredits.label}.`);
  }
  logDebug('productionPriorities buildProductionPriorityLines', { ownSeat: args.ownSeat, lineCount: lines.length });
  return lines;
}
