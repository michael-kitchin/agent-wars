/**
 * Checks and stores the options a player changes during a match.
 *
 * Purpose: The Game Options dialog may change the win rule, AI-only battles, sight cues, and the bonuses while the player plans a turn. The rows it writes are the ones a new match writes, so every reader picks the change up from the next turn's resolution.
 * When to use: `game:setMatchOptions`, after the handler has checked that the match is planning.
 * Expected outcome: A refused request names its reason and writes nothing. An accepted one is written in one transaction.
 * Exceptions: `writeMatchOptions` rethrows a database error after rolling back.
 */

import { AI_ONLY_BATTLE_MODES } from '../../shared/aiOnlyBattles';
import { AI_ONLY_BEAT_LIMIT_CONFIG_KEY, AI_ONLY_BEAT_LIMIT_OPTIONS, aiOnlyBeatLimitToStored } from '../../shared/aiOnlyBeatLimit';
import { BONUS_LEVELS, type BonusLevel } from '../../shared/bonusLevel';
import type { MatchOptionsUpdate } from '../../shared/ipc/matchOptionsTypes';
import { originBonusSettingsFromLevels } from '../../shared/originBonusRules';
import { SIGHT_CUE_SEEN_UNITS_CONFIG_KEY, SIGHT_CUES_CONFIG_KEY } from '../../shared/sightCueSettings';
import { TURN_LIMIT_OPTIONS, VICTORY_RULES, victorySettingsForRequest } from '../../shared/victoryRules';
import { logDebug, logError, logInfo } from '../logger';
import { gameDbOps } from './dbConnection';
import { readAiOnlyBattles, readAiOnlyBeatLimit, readSightCuesEnabled, readVictorySettings } from './gameConfigKv';
import { deleteGameConfigRow, upsertGameConfigValue } from './gameConfigRows';
import { persistOriginBonusSettings, readPersistedOriginBonusSettings } from './originBonusConfig';

/**
 * The validator's answer.
 *
 * Purpose: The handler writes only a checked request, and returns the reason otherwise.
 * When to use: The result of `validateMatchOptionsUpdate`.
 * Expected outcome: The cleaned request, or a plain sentence saying what is wrong.
 * Exceptions: None.
 */
export type MatchOptionsValidation =
  | { readonly ok: true; readonly update: MatchOptionsUpdate }
  | { readonly ok: false; readonly reason: string };

/**
 * The four bonus fields of the request.
 *
 * Purpose: The validator checks each one against the same level list.
 * When to use: `validateMatchOptionsUpdate`.
 * Expected outcome: The bonus field names of `MatchOptionsUpdate`.
 * Exceptions: None.
 */
const BONUS_FIELDS = ['originBonusLevel', 'techBonusLevel', 'terrainBonusLevel', 'weatherBonusLevel'] as const;

/**
 * Whether a value is one of a fixed list.
 *
 * Purpose: Every option is a closed set, and an unlisted value must be refused rather than replaced by a default.
 * When to use: The validator's field checks.
 * Expected outcome: True only when `list` contains `value`.
 * Exceptions: None.
 */
function isListed<T>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value);
}

/**
 * Checks the win rule and the turn limit against the current turn.
 *
 * Purpose: The match ends after the turn that reaches the limit resolves, so a limit equal to the current turn ends it after this turn. A limit before the current turn has already passed.
 * When to use: `validateMatchOptionsUpdate`.
 * Expected outcome: The stored rule and limit, Deathmatch with a null limit, or a reason.
 * Exceptions: None.
 */
function validateVictory(
  record: Readonly<Record<string, unknown>>,
  currentTurn: number
): { readonly victoryRule: MatchOptionsUpdate['victoryRule']; readonly turnLimit: number | null } | string {
  const { victoryRule, turnLimit } = record;
  if (!isListed(VICTORY_RULES, victoryRule)) return 'The victory rule is not one of the offered rules.';
  if (victoryRule !== 'most_city_hexes_at_turn_limit') return { victoryRule, turnLimit: null };
  if (!isListed(TURN_LIMIT_OPTIONS, turnLimit)) return 'The turn limit is not one of the offered limits.';
  if (turnLimit < currentTurn) return `The turn limit cannot be earlier than the current turn, ${currentTurn}.`;
  const victory = victorySettingsForRequest(victoryRule, turnLimit);
  return { victoryRule: victory.rule, turnLimit: victory.turnLimit };
}

/**
 * Checks a request to change the match's options.
 *
 * Purpose: The renderer's request is untrusted, so every field is checked against the lists a new match uses before anything is written.
 * When to use: Before `writeMatchOptions`, with the live match's turn number.
 * Expected outcome: The cleaned request (Deathmatch carries a null limit), or `{ ok: false, reason }` naming the first bad field. Pure: reads and writes nothing.
 * Exceptions: None.
 */
export function validateMatchOptionsUpdate(update: unknown, currentTurn: number): MatchOptionsValidation {
  logDebug('matchOptionsWrite validateMatchOptionsUpdate', { update, currentTurn });
  if (typeof update !== 'object' || update === null) return { ok: false, reason: 'The settings request is empty.' };
  const record = update as Readonly<Record<string, unknown>>;
  const victory = validateVictory(record, currentTurn);
  if (typeof victory === 'string') return { ok: false, reason: victory };
  const { aiOnlyBattles, aiOnlyBeatLimit, sightCues } = record;
  if (!isListed(AI_ONLY_BATTLE_MODES, aiOnlyBattles)) return { ok: false, reason: 'The AI-only battles choice is not one of the offered choices.' };
  if (aiOnlyBeatLimit !== null && !isListed(AI_ONLY_BEAT_LIMIT_OPTIONS, aiOnlyBeatLimit)) {
    return { ok: false, reason: 'The beat limit is not one of the offered limits.' };
  }
  if (typeof sightCues !== 'boolean') return { ok: false, reason: 'The sight cues choice must be on or off.' };
  const badBonus = BONUS_FIELDS.find((field) => !isListed<BonusLevel>(BONUS_LEVELS, record[field]));
  if (badBonus) return { ok: false, reason: 'A bonus level is not one of the offered levels.' };
  const levels = Object.fromEntries(BONUS_FIELDS.map((field) => [field, record[field]])) as Pick<MatchOptionsUpdate, (typeof BONUS_FIELDS)[number]>;
  return { ok: true, update: { ...victory, aiOnlyBattles, aiOnlyBeatLimit, sightCues, ...levels } };
}

/**
 * Stores a checked request in the live match.
 *
 * Purpose: Writes the same `game_config` rows `resetGameForNewMatch` writes, so the change travels with saves and recordings and every reader sees it.
 * When to use: After `validateMatchOptionsUpdate` accepted the request and the match is planning.
 * Expected outcome: One transaction writes the win rule (Deathmatch deletes `turn_limit`), the AI-only rows, `sight_cues`, and the bonus rows with the start month kept. Turning sight cues back on deletes the seen-units memory.
 * Exceptions: Rolls back and rethrows a database error.
 */
export function writeMatchOptions(update: MatchOptionsUpdate): void {
  logDebug('matchOptionsWrite writeMatchOptions', { ...update });
  const { run } = gameDbOps;
  const before = readPersistedOriginBonusSettings(gameDbOps);
  const sightCuesBefore = readSightCuesEnabled(gameDbOps);
  const optionsBefore = {
    victory: readVictorySettings(gameDbOps),
    aiOnlyBattles: readAiOnlyBattles(gameDbOps),
    aiOnlyBeatLimit: readAiOnlyBeatLimit(gameDbOps),
    sightCues: sightCuesBefore,
  };
  const bonusSettings = originBonusSettingsFromLevels({
    origin: update.originBonusLevel,
    terrain: update.terrainBonusLevel,
    weather: update.weatherBonusLevel,
    tech: update.techBonusLevel,
    startMonth: before.startMonth,
  });
  const victory = victorySettingsForRequest(update.victoryRule, update.turnLimit ?? undefined);
  let began = false;
  try {
    run('BEGIN');
    began = true;
    upsertGameConfigValue({ run }, 'victory_rule', victory.rule);
    if (victory.turnLimit === null) {
      run("DELETE FROM game_config WHERE key = 'turn_limit'");
    } else {
      upsertGameConfigValue({ run }, 'turn_limit', String(victory.turnLimit));
    }
    upsertGameConfigValue({ run }, 'ai_only_battles', update.aiOnlyBattles);
    upsertGameConfigValue({ run }, AI_ONLY_BEAT_LIMIT_CONFIG_KEY, aiOnlyBeatLimitToStored(update.aiOnlyBeatLimit));
    upsertGameConfigValue({ run }, SIGHT_CUES_CONFIG_KEY, update.sightCues ? '1' : '0');
    persistOriginBonusSettings({ run }, bonusSettings);
    if (!sightCuesBefore && update.sightCues) deleteGameConfigRow({ run }, SIGHT_CUE_SEEN_UNITS_CONFIG_KEY);
    run('COMMIT');
  } catch (err) {
    if (began) {
      try {
        run('ROLLBACK');
      } catch (rollbackErr) {
        logError('matchOptionsWrite writeMatchOptions: rollback failed', rollbackErr);
      }
    }
    logError('matchOptionsWrite writeMatchOptions: failed', err);
    throw err;
  }
  logInfo('matchOptions write', {
    before: { ...optionsBefore, ...before },
    after: { victory, aiOnlyBattles: update.aiOnlyBattles, aiOnlyBeatLimit: update.aiOnlyBeatLimit, sightCues: update.sightCues, ...bonusSettings },
  });
}
