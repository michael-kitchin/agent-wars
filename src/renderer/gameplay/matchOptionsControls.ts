/**
 * DOM helpers for showing the Game Options controls as the in-match dialog.
 *
 * Purpose: The dialog reuses the new-game controls, so it saves them on open, fills them from the live match, locks the ones a match cannot change, and puts them back on close.
 * When to use: `matchOptionsDialog.ts` only. Nothing here calls IPC.
 * Expected outcome: Plain reads and writes of the controls inside `#new-game-options-popover`.
 * Exceptions: None. A missing control is skipped.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import type { MatchOptionsUpdate } from '../../shared/ipc/matchOptionsTypes';
import { aiOnlyBeatLimitToStored } from '../../shared/aiOnlyBeatLimit';
import { bonusLevelOf } from '../../shared/bonusLevel';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import { isHumanSeatId } from '../../shared/seatIds';
import { HUMAN_NICKNAME_DEFAULT, sideDisplayName } from '../../shared/sideNicknames';
import { techBonusLevelOf } from '../../shared/techBonusRules';
import { DEFAULT_VICTORY_RULE, TURN_LIMIT_OPTIONS } from '../../shared/victoryRules';
import { weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { readNewGameAiOnlyBeatLimit } from './newGameBeatLimitUi';
import { readNewGameOptionChoices } from './newGameOptionsUi';
import { readNewGameAiOnlyBattles, readNewGameSightCues, readNewGameVictory, renderNewGameVictory } from './newGameVictoryUi';

/**
 * Ids of the controls a running match cannot change.
 *
 * Purpose: Turning fog off deletes the explored-memory tables, turning it on leaves the map dark, no channel renames the human seat mid-match, and Auto-start AI only matters when a match starts.
 * When to use: `lockOptionControls`, which disables them in every case.
 * Expected outcome: Matches the ids in `static/index.html`.
 * Exceptions: None.
 */
const ALWAYS_LOCKED_CONTROL_IDS = ['new-game-human-nickname', 'new-game-fog-checkbox', 'new-game-auto-start-checkbox'] as const;

/**
 * Ids of the controls the dialog can change while the player plans a turn.
 *
 * Purpose: The same set the main process accepts in a `MatchOptionsUpdate`.
 * When to use: `lockOptionControls` when the dialog is editable.
 * Expected outcome: Matches the ids in `static/index.html`.
 * Exceptions: None.
 */
const EDITABLE_CONTROL_IDS = [
  'new-game-victory-select',
  'new-game-ai-only-battles-select',
  'new-game-sight-cues-checkbox',
  'new-game-origin-bonus-select',
  'new-game-tech-bonus-select',
  'new-game-terrain-bonus-select',
  'new-game-weather-bonus-select',
] as const;

/** Id of the victory rule select. */
const VICTORY_SELECT_ID = 'new-game-victory-select';

/** Id of the turn-limit select. */
const TURN_LIMIT_SELECT_ID = 'new-game-turn-limit-select';

/** Id of the AI-only battles select. */
const AI_ONLY_SELECT_ID = 'new-game-ai-only-battles-select';

/** Id of the beat-limit select. */
const BEAT_LIMIT_SELECT_ID = 'new-game-beat-limit-select';

/** Value of the city-hexes victory option. */
const CITY_HEXES_RULE = 'most_city_hexes_at_turn_limit';

/**
 * The tip Auto-start AI shows during a match.
 *
 * Purpose: A running match does not store Auto-start AI, so the tip points at the control that does the job.
 * When to use: `lockOptionControls`.
 * Expected outcome: One plain sentence.
 * Exceptions: None.
 */
const AUTO_START_MATCH_TOOLTIP = 'Use the Commanders Start/Stop button to turn planning on or off during a match.';

/**
 * What one control looked like before the dialog changed it.
 *
 * Purpose: The new-game screen must get back exactly what it had.
 * When to use: Built by `captureOptionControls`, read by `restoreOptionControls`.
 * Expected outcome: One entry per `select` or `input` in the popover.
 * Exceptions: None.
 */
interface ControlMemo {
  /**
   * The control itself.
   *
   * Contract: A `select` or `input` inside `#new-game-options-popover`.
   * When to use: Restoring its state.
   * Expected outcome: The same element the page keeps.
   * Exceptions: None.
   */
  readonly element: HTMLSelectElement | HTMLInputElement;
  /**
   * Its value.
   *
   * Contract: The `value` property when captured.
   * When to use: Restoring a select or the nickname.
   * Expected outcome: A string, possibly empty.
   * Exceptions: None.
   */
  readonly value: string;
  /**
   * Whether a checkbox was checked.
   *
   * Contract: False for a select.
   * When to use: Restoring a checkbox.
   * Expected outcome: The `checked` property when captured.
   * Exceptions: None.
   */
  readonly checked: boolean;
  /**
   * Whether the control was disabled.
   *
   * Contract: The `disabled` property when captured.
   * When to use: Restoring every control.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * Its control tip, or null when it had none.
   *
   * Contract: The `data-control-tooltip` attribute when captured.
   * When to use: Restoring Auto-start AI's tip, and any other the dialog changes.
   * Expected outcome: A sentence or null.
   * Exceptions: None.
   */
  readonly tooltip: string | null;
  /**
   * Values of a select's options that were disabled.
   *
   * Contract: Empty for an input.
   * When to use: Restoring the victory rule's and the turn limit's options.
   * Expected outcome: Option values.
   * Exceptions: None.
   */
  readonly disabledOptionValues: readonly string[];
}

/**
 * The saved state of every Game Options control.
 *
 * Contract: Opaque to callers. Pass it back to `restoreOptionControls`.
 * When to use: Captured when the dialog opens, restored when it closes.
 * Expected outcome: See `ControlMemo`.
 * Exceptions: None.
 */
export interface OptionControlsMemo {
  /**
   * One entry per control.
   *
   * Contract: In document order.
   * When to use: `restoreOptionControls`.
   * Expected outcome: Every `select` and `input` in the popover.
   * Exceptions: None.
   */
  readonly controls: readonly ControlMemo[];
}

/**
 * Every `select` and `input` in the Game Options popover.
 *
 * Purpose: Capture, restore, and the read-only lock walk the same list.
 * When to use: Inside this module.
 * Expected outcome: The controls in document order, or an empty list when the popover is missing.
 * Exceptions: None.
 */
function popoverControls(): (HTMLSelectElement | HTMLInputElement)[] {
  const popover = document.getElementById('new-game-options-popover');
  return popover ? Array.from(popover.querySelectorAll<HTMLSelectElement | HTMLInputElement>('select, input')) : [];
}

/**
 * Looks up one select by id.
 *
 * Purpose: Keeps the element check in one place.
 * When to use: Inside this module.
 * Expected outcome: The select, or null when the page lacks it.
 * Exceptions: None.
 */
function selectById(id: string): HTMLSelectElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLSelectElement ? element : null;
}

/**
 * Looks up one input by id.
 *
 * Purpose: Keeps the element check in one place.
 * When to use: Inside this module.
 * Expected outcome: The input, or null when the page lacks it.
 * Exceptions: None.
 */
function inputById(id: string): HTMLInputElement | null {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
}

/**
 * Sets one select's value when the select exists.
 *
 * Purpose: Filling from the match touches many selects the same way.
 * When to use: `fillOptionControlsFromMatch`.
 * Expected outcome: The select shows `value`, or no option when `value` is not listed.
 * Exceptions: None.
 */
function setSelectValue(id: string, value: string): void {
  const select = selectById(id);
  if (select) select.value = value;
}

/**
 * Sets one checkbox when it exists.
 *
 * Purpose: Filling from the match touches three checkboxes the same way.
 * When to use: `fillOptionControlsFromMatch`.
 * Expected outcome: The box shows `checked`.
 * Exceptions: None.
 */
function setChecked(id: string, checked: boolean): void {
  const box = inputById(id);
  if (box) box.checked = checked;
}

/**
 * Saves every Game Options control.
 *
 * Purpose: The new-game screen keeps its own choices after the in-match dialog closes.
 * When to use: When the dialog opens, before `fillOptionControlsFromMatch`.
 * Expected outcome: Each control's value, checked flag, disabled flag, tip, and disabled options.
 * Exceptions: None.
 */
export function captureOptionControls(): OptionControlsMemo {
  return {
    controls: popoverControls().map((element) => ({
      element,
      value: element.value,
      checked: element instanceof HTMLInputElement ? element.checked : false,
      disabled: element.disabled,
      tooltip: element.getAttribute('data-control-tooltip'),
      disabledOptionValues: element instanceof HTMLSelectElement
        ? Array.from(element.options).filter((option) => option.disabled).map((option) => option.value)
        : [],
    })),
  };
}

/**
 * Puts the saved controls back.
 *
 * Purpose: Edits made in match mode must never reach a new match's setup.
 * When to use: When the dialog closes, on every path.
 * Expected outcome: The victory rule and AI-only battles values come back first, then `renderNewGameVictory` rebuilds the turn-limit and beat-limit options for them, then every control's value, checked flag, disabled flag, tip, and disabled options come back.
 * Exceptions: None.
 */
export function restoreOptionControls(memo: OptionControlsMemo): void {
  const drivers = new Set<string>([VICTORY_SELECT_ID, AI_ONLY_SELECT_ID]);
  for (const control of memo.controls) {
    if (drivers.has(control.element.id)) control.element.value = control.value;
  }
  renderNewGameVictory();
  for (const control of memo.controls) {
    const { element } = control;
    if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = control.checked;
    else element.value = control.value;
    element.disabled = control.disabled;
    if (control.tooltip === null) element.removeAttribute('data-control-tooltip');
    else element.setAttribute('data-control-tooltip', control.tooltip);
    if (element instanceof HTMLSelectElement) {
      for (const option of Array.from(element.options)) option.disabled = control.disabledOptionValues.includes(option.value);
    }
  }
}

/**
 * Fills the controls with the live match's settings.
 *
 * Purpose: The dialog always shows the settings in force, including the locked ones.
 * When to use: When the dialog opens, after `captureOptionControls`, with a snapshot read from the main process.
 * Expected outcome: The rule and AI-only values are set and the limit selects are rebuilt for them, then the turn limit, beat limit (missing is Unlimited), Sight cues (missing is on), the four bonus levels, Fog of war, the human seat's name, and Auto-start AI (`runButtonOn`) follow.
 * Exceptions: None.
 */
export function fillOptionControlsFromMatch(live: GameStateSnapshot, runButtonOn: boolean): void {
  setSelectValue(VICTORY_SELECT_ID, live.victory?.rule ?? DEFAULT_VICTORY_RULE);
  setSelectValue(AI_ONLY_SELECT_ID, live.aiOnlyBattles ?? 'none');
  renderNewGameVictory();
  const turnLimit = live.victory?.turnLimit;
  setSelectValue(TURN_LIMIT_SELECT_ID, turnLimit == null ? '' : String(turnLimit));
  setSelectValue(BEAT_LIMIT_SELECT_ID, aiOnlyBeatLimitToStored(live.aiOnlyBeatLimit ?? null));
  setChecked('new-game-sight-cues-checkbox', live.sightCues !== false);
  setSelectValue('new-game-origin-bonus-select', bonusLevelOf(live.originBonusEnabled, live.originBonusLevel));
  setSelectValue('new-game-terrain-bonus-select', bonusLevelOf(live.terrainBonusEnabled, live.terrainBonusLevel));
  setSelectValue('new-game-weather-bonus-select', weatherBonusLevelOf(live));
  setSelectValue('new-game-tech-bonus-select', techBonusLevelOf(originBonusSettingsFromSnapshot(live)));
  setChecked('new-game-fog-checkbox', live.fogOfWarEnabled !== false);
  setChecked('new-game-auto-start-checkbox', runButtonOn);
  const nickname = inputById('new-game-human-nickname');
  const human = live.seats?.find((seat) => isHumanSeatId(seat.seatId));
  if (nickname) nickname.value = human ? sideDisplayName(human) : HUMAN_NICKNAME_DEFAULT;
}

/**
 * Enables the controls a match can change, and disables the rest.
 *
 * Purpose: Nickname, Fog of war, and Auto-start AI never change mid-match, and a turn limit cannot be earlier than the current turn (a limit equal to it ends the match after this turn).
 * When to use: After filling the controls, and again after the victory rule or AI-only battles changes, since their own listeners rebuild the limit options.
 * Expected outcome: The three locked controls are disabled, and Auto-start AI's tip points at the Commanders button. Read-only disables every control. Editable enables the others, disables each turn limit before `currentTurn`, disables the city-hexes rule when no limit is left, moves a disabled limit choice to the first enabled one, and keeps the turn limit off for Deathmatch and the beat limit off for None.
 * Exceptions: None.
 */
export function lockOptionControls(editable: boolean, currentTurn: number): void {
  for (const id of ALWAYS_LOCKED_CONTROL_IDS) {
    const control = inputById(id);
    if (control) control.disabled = true;
  }
  inputById('new-game-auto-start-checkbox')?.setAttribute('data-control-tooltip', AUTO_START_MATCH_TOOLTIP);
  if (!editable) {
    for (const control of popoverControls()) control.disabled = true;
    return;
  }
  for (const id of EDITABLE_CONTROL_IDS) {
    const control = document.getElementById(id);
    if (control instanceof HTMLSelectElement || control instanceof HTMLInputElement) control.disabled = false;
  }
  const victory = selectById(VICTORY_SELECT_ID);
  const openLimits = TURN_LIMIT_OPTIONS.filter((turns) => turns >= currentTurn);
  const cityOption = victory ? Array.from(victory.options).find((option) => option.value === CITY_HEXES_RULE) : undefined;
  if (cityOption) cityOption.disabled = openLimits.length === 0;
  const limit = selectById(TURN_LIMIT_SELECT_ID);
  if (limit) lockTurnLimit(limit, victory?.value === CITY_HEXES_RULE, currentTurn);
  const beatLimit = selectById(BEAT_LIMIT_SELECT_ID);
  if (beatLimit) beatLimit.disabled = selectById(AI_ONLY_SELECT_ID)?.value === 'none';
}

/**
 * Locks the turn-limit select for the chosen rule.
 *
 * Purpose: A city-hexes match can only end on this turn or one still to come. Deathmatch shows Unlimited, disabled.
 * When to use: `lockOptionControls` when the dialog is editable.
 * Expected outcome: For city hexes, each limit before `currentTurn` is disabled, and a disabled choice moves to the first enabled limit. Otherwise the select is disabled.
 * Exceptions: None.
 */
function lockTurnLimit(limit: HTMLSelectElement, cityHexes: boolean, currentTurn: number): void {
  limit.disabled = !cityHexes;
  if (!cityHexes) return;
  const options = Array.from(limit.options);
  for (const option of options) option.disabled = !(Number(option.value) >= currentTurn);
  if (limit.selectedOptions[0]?.disabled !== false) {
    const firstOpen = options.find((option) => !option.disabled);
    if (firstOpen) limit.value = firstOpen.value;
  }
}

/**
 * Reads the editable controls as one update.
 *
 * Purpose: Apply sends the whole editable set in one request.
 * When to use: Apply, after `lockOptionControls` made sure the choices are allowed.
 * Expected outcome: The values the new-game readers return. Deathmatch sends a null turn limit.
 * Exceptions: None.
 */
export function readMatchOptionsUpdate(): MatchOptionsUpdate {
  const { victoryRule, turnLimit } = readNewGameVictory();
  const { originBonusLevel, techBonusLevel, terrainBonusLevel, weatherBonusLevel } = readNewGameOptionChoices();
  return {
    victoryRule,
    turnLimit: victoryRule === CITY_HEXES_RULE ? turnLimit : null,
    aiOnlyBattles: readNewGameAiOnlyBattles(),
    aiOnlyBeatLimit: readNewGameAiOnlyBeatLimit(),
    sightCues: readNewGameSightCues(),
    originBonusLevel,
    techBonusLevel,
    terrainBonusLevel,
    weatherBonusLevel,
  };
}
