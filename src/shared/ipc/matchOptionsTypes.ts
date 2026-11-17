/**
 * Request and result shapes for changing a running match's options.
 *
 * Purpose: The Game Options dialog can change some options while the player plans a turn, and the main process checks and stores them.
 * When to use: `game:setMatchOptions` in the preload bridge, `GameApi`, and the main-process handler.
 * Expected outcome: Plain data types. This module has no runtime code.
 * Exceptions: None.
 */

import type { AiOnlyBattleMode } from '../aiOnlyBattles';
import type { BonusLevel } from '../bonusLevel';
import type { VictoryRule } from '../victoryRules';

/**
 * Every option the player may change during a match.
 *
 * Purpose: One request carries the whole editable set, so the main process writes it in one transaction.
 * When to use: The renderer builds it from the Game Options controls when the player presses Apply.
 * Expected outcome: The main process validates it, then stores each value as a `game_config` row.
 * Exceptions: None.
 */
export interface MatchOptionsUpdate {
  /**
   * The win rule from the next turn's resolution on.
   *
   * Contract: One of `VICTORY_RULES`. City hexes needs a turn limit not earlier than the current turn.
   * When to use: The Victory rule select.
   * Expected outcome: Stored as `game_config.victory_rule`.
   * Exceptions: None.
   */
  readonly victoryRule: VictoryRule;
  /**
   * The turn the city-hexes rule ends the match on.
   *
   * Contract: One of `TURN_LIMIT_OPTIONS` and at least the current turn when the rule is city hexes. Ignored for Deathmatch.
   * When to use: The Turn limit select.
   * Expected outcome: Stored as `game_config.turn_limit`; Deathmatch deletes the row.
   * Exceptions: None.
   */
  readonly turnLimit: number | null;
  /**
   * Which AI-only battles the match may offer while it is observed.
   *
   * Contract: One of `AI_ONLY_BATTLE_MODES`.
   * When to use: The AI-only battles select.
   * Expected outcome: Stored as `game_config.ai_only_battles`.
   * Exceptions: None.
   */
  readonly aiOnlyBattles: AiOnlyBattleMode;
  /**
   * The most beats one AI-only battle may run.
   *
   * Contract: Null is Unlimited. Otherwise one of `AI_ONLY_BEAT_LIMIT_OPTIONS`.
   * When to use: The Beat limit select.
   * Expected outcome: Stored as `game_config.ai_only_beat_limit` through `aiOnlyBeatLimitToStored`.
   * Exceptions: None.
   */
  readonly aiOnlyBeatLimit: number | null;
  /**
   * Whether observed playback opens with the AI commanders' sight lines.
   *
   * Contract: A boolean. Turning it back on forgets which units each AI side saw last, so the next cues start fresh.
   * When to use: The Sight cues checkbox.
   * Expected outcome: Stored as `game_config.sight_cues`, `'1'` or `'0'`.
   * Exceptions: None.
   */
  readonly sightCues: boolean;
  /**
   * How strong the origin bonus is.
   *
   * Contract: One of `BONUS_LEVELS`; `'off'` turns the bonus off.
   * When to use: The Origin bonus select.
   * Expected outcome: Stored as the origin flag and level rows.
   * Exceptions: None.
   */
  readonly originBonusLevel: BonusLevel;
  /**
   * How strong the tech bonus is.
   *
   * Contract: One of `BONUS_LEVELS`; `'off'` turns the bonus off.
   * When to use: The Tech bonus select.
   * Expected outcome: Stored as the tech flag and level rows.
   * Exceptions: None.
   */
  readonly techBonusLevel: BonusLevel;
  /**
   * How strong the terrain bonus is.
   *
   * Contract: One of `BONUS_LEVELS`; `'off'` turns the bonus off.
   * When to use: The Terrain bonus select.
   * Expected outcome: Stored as the terrain flag and level rows.
   * Exceptions: None.
   */
  readonly terrainBonusLevel: BonusLevel;
  /**
   * How strong the weather bonus is.
   *
   * Contract: One of `BONUS_LEVELS`; `'off'` turns the bonus off. The start month and the weather calendar do not change.
   * When to use: The Weather bonus select.
   * Expected outcome: Stored as the weather flag and level rows.
   * Exceptions: None.
   */
  readonly weatherBonusLevel: BonusLevel;
}

/**
 * The answer to a request to change the match's options.
 *
 * Purpose: The dialog closes on success and shows the reason otherwise.
 * When to use: The result of `game:setMatchOptions`.
 * Expected outcome: `{ ok: true }` when every value was stored, or `{ ok: false, reason }` with a plain sentence when nothing was stored. The renderer re-reads the match state itself.
 * Exceptions: None.
 */
export type MatchOptionsResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };
