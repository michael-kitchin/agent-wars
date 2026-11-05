/**
 * IPC for the Kill, Hurt, and Loss chances on a legal ranged target.
 *
 * Purpose: The renderer already chose the attackers and the defenders it can see. This handler loads the
 * match the estimator needs and does not add occupants the renderer did not send.
 * When to use: From `registerIpcHandlers`, beside the ranged-target validator.
 * Expected outcome: Rounded percents and the counted defender ids, or null when the payload, the battle,
 * or the estimate cannot be used.
 * Exceptions: None. A thrown load or estimate is logged and returned as null.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import { getGameState } from '../gameDb';
import { logDebug, logError } from '../logger';
import { buildLatLngCoordinateMap } from '../mapData';
import { getActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { buildTacticalAiPlanState } from '../tacticalBattle/buildTacticalAiPlanState';
import { previewRangedTargetOdds, type RangedTargetOdds } from '../tools/rangedTargetOdds';

/**
 * Arguments the renderer sends for one ranged target.
 *
 * Purpose: The handler rejects anything that is not two string arrays and a target cell.
 * When to use: Only inside this module, after the payload has been read.
 * Expected outcome: `inBattle` is true only when the renderer says a battle is open.
 * Exceptions: None.
 */
interface RangedTargetOddsIpcArgs {
  /**
   * Unit ids the ranged validator accepted.
   *
   * Contract: Every entry is a string. The handler does not add shooters the renderer omitted.
   * When to use: The payload of `game:previewRangedTargetOdds`.
   * Expected outcome: Passed through as the attacker list.
   * Exceptions: None.
   */
  readonly attackerIds: readonly string[];
  /**
   * Defender ids the renderer can see on the target.
   *
   * Contract: Every entry is a string. Occupants the renderer omitted stay out of the estimate.
   * When to use: The same payload.
   * Expected outcome: Rejected ids are dropped before the estimate.
   * Exceptions: None.
   */
  readonly defenderIds: readonly string[];
  /**
   * Cell the shot is aimed at.
   *
   * Contract: A non-empty h3. A battle target is the battle cell.
   * When to use: The same payload.
   * Expected outcome: Looked up in the coordinate map for that match.
   * Exceptions: None.
   */
  readonly targetH3: string;
  /**
   * Whether the renderer has a battle open.
   *
   * Contract: True only when the renderer says a battle is open.
   * When to use: The same payload.
   * Expected outcome: The handler requires an active battle snapshot when this is true.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
}

/**
 * Reads the ranged-odds payload.
 *
 * Purpose: A malformed invoke returns null instead of estimating the wrong cell.
 * When to use: At the start of `previewRangedTargetOddsForIpc`.
 * Expected outcome: The two id lists, the target, and whether the renderer is in a battle, or null.
 * Exceptions: None.
 */
function parseRangedTargetOddsPayload(payload: unknown): RangedTargetOddsIpcArgs | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as {
    attackerIds?: unknown;
    defenderIds?: unknown;
    targetH3?: unknown;
    inBattle?: unknown;
  };
  if (!isStringList(raw.attackerIds) || !isStringList(raw.defenderIds)) return null;
  if (typeof raw.targetH3 !== 'string' || raw.targetH3.length === 0) return null;
  return {
    attackerIds: raw.attackerIds,
    defenderIds: raw.defenderIds,
    targetH3: raw.targetH3,
    inBattle: raw.inBattle === true,
  };
}

/**
 * Reports whether a value is a list of strings.
 *
 * Purpose: Attacker and defender ids are forwarded only when every entry is a string.
 * When to use: `parseRangedTargetOddsPayload`.
 * Expected outcome: True for an array of strings, including an empty array.
 * Exceptions: None.
 */
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Loads the match and estimates one ranged target.
 *
 * Purpose: Keeps the database and the active battle out of `previewRangedTargetOdds`.
 * When to use: The `game:previewRangedTargetOdds` handler.
 * Expected outcome: The preview result, or null when the payload is unreadable, the renderer is in a
 * battle the main process does not have, or the estimate throws.
 * Exceptions: None. Failures are logged and returned as null.
 */
export function previewRangedTargetOddsForIpc(payload: unknown): RangedTargetOdds | null {
  logDebug('rangedTargetOddsIpc previewRangedTargetOddsForIpc');
  try {
    const parsed = parseRangedTargetOddsPayload(payload);
    if (!parsed) {
      logDebug('rangedTargetOddsIpc previewRangedTargetOddsForIpc unreadable payload');
      return null;
    }
    const battle = getActiveTacticalBattleSnapshotRef();
    if (parsed.inBattle && !battle) {
      logDebug('rangedTargetOddsIpc previewRangedTargetOddsForIpc has no battle', { targetH3: parsed.targetH3 });
      return null;
    }
    const strategic = getGameState();
    const state = parsed.inBattle && battle ? buildTacticalAiPlanState(strategic, battle) : strategic;
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(state.hexes.map((hex) => hex.h3Index));
    return previewRangedTargetOdds({
      attackerIds: parsed.attackerIds,
      defenderIds: parsed.defenderIds,
      targetH3: parsed.targetH3,
      state,
      latLngByH3,
      resolveToH3,
      ...(parsed.inBattle && battle ? { tacticalBattle: battle } : {}),
    });
  } catch (err) {
    logError('rangedTargetOddsIpc previewRangedTargetOddsForIpc failed', err);
    return null;
  }
}

/**
 * Registers `game:previewRangedTargetOdds`.
 *
 * Purpose: The ranged hover asks for Kill, Hurt, and Loss without a second channel name in the entry file.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: The channel returns `previewRangedTargetOddsForIpc`.
 * Exceptions: None.
 */
export function registerRangedTargetOddsIpcHandler(ipcMain: IpcMain): void {
  logDebug('rangedTargetOddsIpc registerRangedTargetOddsIpcHandler');
  ipcMain.handle(IPC_GAME.previewRangedTargetOdds, (_event, payload: unknown) => previewRangedTargetOddsForIpc(payload));
}
