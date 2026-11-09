/**
 * Victory rule and turn limit on the new-game screen.
 *
 * Purpose: Both maps offer Deathmatch and a city-hex turn limit. Deathmatch is the default.
 * When to use: `bindNewGameSides` and `renderNewGameSides`.
 * Expected outcome: The Rule select stays as the player left it until the overlay opens again.
 * Exceptions: None.
 */

import { AI_ONLY_BATTLE_MODES, DEFAULT_AI_ONLY_BATTLES, type AiOnlyBattleMode } from '../../shared/aiOnlyBattles';
import { bindNewGameBeatLimit, renderNewGameBeatLimit, resetNewGameBeatLimit } from './newGameBeatLimitUi';
import { DEFAULT_SIGHT_CUES } from '../../shared/sightCueSettings';
import {
  DEFAULT_TURN_LIMIT,
  DEFAULT_VICTORY_RULE,
  TURN_LIMIT_OPTIONS,
  UNLIMITED_TURN_LIMIT_LABEL,
  VICTORY_RULE_LABELS,
  type VictoryRule,
} from '../../shared/victoryRules';

/**
 * Last numeric limit the player picked, so Unlimited can restore it.
 *
 * Purpose: Switching back from Deathmatch must not lose 20, 40, or 50.
 * When to use: `renderNewGameVictory` and `resetNewGameVictory`.
 * Expected outcome: Starts at 30. A listed selection replaces it.
 * Exceptions: None.
 */
let rememberedTurnLimit = DEFAULT_TURN_LIMIT;

/**
 * Fills the Rule and turn-limit selects once.
 *
 * Purpose: Later side-row redraws must not put Deathmatch back.
 * When to use: Once from `bindNewGameSides`.
 * Expected outcome: Both rules, Deathmatch selected, and a disabled Unlimited turn limit.
 * Exceptions: None.
 */
export function bindNewGameVictory(): void {
  bindNewGameBeatLimit();
  const victory = document.getElementById('new-game-victory-select');
  if (victory instanceof HTMLSelectElement && victory.options.length === 0) {
    for (const rule of ['last_side_standing', 'most_city_hexes_at_turn_limit'] as const) {
      const option = document.createElement('option');
      option.value = rule;
      option.textContent = VICTORY_RULE_LABELS[rule];
      if (rule === DEFAULT_VICTORY_RULE) option.selected = true;
      victory.appendChild(option);
    }
    victory.addEventListener('change', () => {
      renderNewGameVictory();
    });
  }
  renderNewGameVictory();
}

/**
 * Shows Unlimited or the four turn limits for the rule already selected.
 *
 * Purpose: The turn-limit row stays visible on both maps.
 * When to use: After the Rule changes, and after the side rows render.
 * Expected outcome: Deathmatch disables the select and shows Unlimited. City hexes enables 20, 30, 40, and 50.
 *   A side-row redraw keeps the numeric limit the player picked.
 * Exceptions: None.
 */
export function renderNewGameVictory(): void {
  renderNewGameBeatLimit();
  const limit = document.getElementById('new-game-turn-limit-select');
  if (!(limit instanceof HTMLSelectElement)) return;
  const parsed = Number(limit.value);
  if ((TURN_LIMIT_OPTIONS as readonly number[]).includes(parsed)) rememberedTurnLimit = parsed;
  const rule = selectedVictoryRule();
  if (rule !== 'most_city_hexes_at_turn_limit') {
    limit.replaceChildren();
    const option = document.createElement('option');
    option.value = '';
    option.textContent = UNLIMITED_TURN_LIMIT_LABEL;
    option.selected = true;
    limit.appendChild(option);
    limit.disabled = true;
    return;
  }
  const selected = rememberedTurnLimit;
  limit.replaceChildren();
  for (const turns of TURN_LIMIT_OPTIONS) {
    const option = document.createElement('option');
    option.value = String(turns);
    option.textContent = `${turns} turns`;
    if (turns === selected) option.selected = true;
    limit.appendChild(option);
  }
  limit.value = String(selected);
  limit.disabled = false;
}

/**
 * The AI-only battle choice Start should send.
 *
 * Purpose: The select is the only place the player sets this. A missing control still starts Balanced.
 * When to use: `readNewGameSeatsStart`.
 * Expected outcome: One of the four modes. Anything else is Balanced.
 * Exceptions: None.
 */
export function readNewGameAiOnlyBattles(): AiOnlyBattleMode {
  const select = document.getElementById('new-game-ai-only-battles-select');
  const value = select instanceof HTMLSelectElement ? select.value : '';
  return (AI_ONLY_BATTLE_MODES as readonly string[]).includes(value) ? (value as AiOnlyBattleMode) : DEFAULT_AI_ONLY_BATTLES;
}

/**
 * Whether Start should store Sight cues on.
 *
 * Purpose: The checkbox is the only place the player sets this. A missing control still starts on.
 * When to use: `readNewGameSeatsStart`.
 * Expected outcome: The checkbox's `checked` value, or `DEFAULT_SIGHT_CUES` when the control is missing.
 * Exceptions: None.
 */
export function readNewGameSightCues(): boolean {
  const box = document.getElementById('new-game-sight-cues-checkbox');
  return box instanceof HTMLInputElement ? box.checked : DEFAULT_SIGHT_CUES;
}

/**
 * The rule and limit Start should send.
 *
 * Purpose: Deathmatch still sends the remembered number. The main process ignores it.
 * When to use: `readNewGameSeatsStart`.
 * Expected outcome: City hexes returns the selected listed limit, or 30 when the value is not listed.
 * Exceptions: None.
 */
export function readNewGameVictory(): { readonly victoryRule: VictoryRule; readonly turnLimit: number } {
  const victoryRule = selectedVictoryRule();
  if (victoryRule !== 'most_city_hexes_at_turn_limit') {
    return { victoryRule, turnLimit: rememberedTurnLimit };
  }
  const limit = document.getElementById('new-game-turn-limit-select');
  const parsed = limit instanceof HTMLSelectElement ? Number(limit.value) : Number.NaN;
  const turnLimit = (TURN_LIMIT_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_TURN_LIMIT;
  return { victoryRule, turnLimit };
}

/**
 * Puts Deathmatch and a 30-turn memory back.
 *
 * Purpose: Opening the overlay starts from the default rule.
 * When to use: `refreshNewGameSides({ reset: true })` only.
 * Expected outcome: The Rule select is Deathmatch, the turn-limit select is Unlimited, AI-only battles is Balanced, Beat limit is 30, and Sight cues is checked.
 * Exceptions: None.
 */
export function resetNewGameVictory(): void {
  rememberedTurnLimit = DEFAULT_TURN_LIMIT;
  const victory = document.getElementById('new-game-victory-select');
  if (victory instanceof HTMLSelectElement) victory.value = DEFAULT_VICTORY_RULE;
  const aiOnly = document.getElementById('new-game-ai-only-battles-select');
  if (aiOnly instanceof HTMLSelectElement) aiOnly.value = DEFAULT_AI_ONLY_BATTLES;
  const sightCues = document.getElementById('new-game-sight-cues-checkbox');
  if (sightCues instanceof HTMLInputElement) sightCues.checked = DEFAULT_SIGHT_CUES;
  resetNewGameBeatLimit();
  renderNewGameVictory();
}

/**
 * The rule currently chosen, or Deathmatch when the select is missing.
 *
 * Purpose: A missing control must not start a city-hex match by accident.
 * When to use: `renderNewGameVictory` and `readNewGameVictory`.
 * Expected outcome: `most_city_hexes_at_turn_limit` only when that option is selected.
 * Exceptions: None.
 */
function selectedVictoryRule(): VictoryRule {
  const victory = document.getElementById('new-game-victory-select');
  if (victory instanceof HTMLSelectElement && victory.value === 'most_city_hexes_at_turn_limit') {
    return 'most_city_hexes_at_turn_limit';
  }
  return DEFAULT_VICTORY_RULE;
}
