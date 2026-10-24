import type { NewGameCommanderInput } from '../../shared/ipc/ordersTypes';
import { commanderApiKey } from '../../shared/commanderSetupCopy';
import { DOCTRINE_CHOICE_DESCRIPTIONS, DOCTRINE_CHOICE_LABELS } from '../../shared/doctrineDescriptions';
import { listSelectableReasoningEfforts } from '../../shared/openRouterReasoningEffort';
import { DOCTRINE_CHOICES, type DoctrineChoice } from '../../shared/seatRoster';
import { apiKeyTooltipText, refreshModelsTooltipText } from '../chrome/controlTooltipText';
import {
  refreshOpenRouterModels,
  reportOpenRouterPopoverLine,
  setOpenRouterModelListListener,
} from './openRouterModelRefresh';
import { openRouterModelById } from './openRouterModelCatalog';
import { attachReasoningEffortSelect } from './reasoningEffortSelect';

/**
 * The commander fields the open popover rewrites as the player edits.
 *
 * Purpose: `NewGameCommanderInput` keeps its fields readonly, and this popover assigns them in place.
 * When to use: The draft inside `openCommanderPopover`.
 * Expected outcome: Each change is copied out through `onChange`.
 * Exceptions: None.
 */
type CommanderDraft = {
  -readonly [Key in keyof NewGameCommanderInput]: NewGameCommanderInput[Key];
};

/**
 * The copy control on a new-game commander popover.
 *
 * Purpose: The new-game screen pulls a commander from the last game or the previous opponent.
 * When to use: `CommanderPopoverRequest.copyButton`.
 * Expected outcome: Null during a match, so the popover draws no button.
 * Exceptions: None.
 */
export interface CommanderCopyButton {
  /**
   * The button text.
   *
   * Contract: The label from `copyButtonState`.
   * When to use: The button's text content.
   * Expected outcome: Shown as written, including a disabled "No previous game".
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Whether the button ignores clicks.
   *
   * Contract: True when there is no remembered match for the first AI row.
   * When to use: The button's disabled attribute.
   * Expected outcome: A disabled button does not call `onCopy`.
   * Exceptions: None.
   */
  readonly disabled: boolean;
  /**
   * Called when the player copies a commander onto this row.
   *
   * Contract: Runs only when the button is enabled.
   * When to use: The copy click.
   * Expected outcome: The caller stores the copied commander and may update the open fields.
   * Exceptions: None.
   */
  readonly onCopy: () => void;
}

/**
 * What the commander popover edits.
 *
 * Purpose: The new-game rows and a later commanders tab share one popover.
 * When to use: `openCommanderPopover`.
 * Expected outcome: `onChange` fires for the row that opened it. `copyButton` is drawn only when it is set.
 * Exceptions: None.
 */
export interface CommanderPopoverRequest {
  /**
   * The button the popover sits under.
   *
   * Contract: An element already in the document.
   * When to use: The commander summary button.
   * Expected outcome: The popover opens below it, and a second click on it closes the popover.
   * Exceptions: None.
   */
  readonly anchor: HTMLElement;
  /**
   * The heading, including the side's name.
   *
   * Contract: Plain text, such as "Opponent 1 commander".
   * When to use: Every open.
   * Expected outcome: Shown in the popover's header.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * The commander the controls start from.
   *
   * Contract: A `NewGameCommanderInput`.
   * When to use: The row that was clicked.
   * Expected outcome: The fields show this key, model, effort, and doctrine.
   * Exceptions: None.
   */
  readonly commander: NewGameCommanderInput;
  /**
   * The new-game copy button, or null during a match.
   *
   * Contract: Null draws no button.
   * When to use: The new-game screen passes the button. A match passes null.
   * Expected outcome: The button copies a commander onto the open row.
   * Exceptions: None.
   */
  readonly copyButton: CommanderCopyButton | null;
  /**
   * Called when this row's commander changes.
   *
   * Contract: Receives the commander the controls now show, including the key field's current trimmed value.
   * When to use: Model, reasoning, and doctrine changes, and a key blur or Enter that changed the trimmed value.
   * Expected outcome: The caller stores it on that row. The popover stays open.
   * Exceptions: None.
   */
  readonly onChange: (commander: NewGameCommanderInput) => void;
  /**
   * Called after the popover closes.
   *
   * Contract: Optional. Runs once, after the element is gone.
   * When to use: The caller is tracking which row is open.
   * Expected outcome: The caller forgets the open row.
   * Exceptions: None.
   */
  readonly onClose?: () => void;
}

/**
 * The open popover, if any.
 *
 * Purpose: One popover is enough. A second open replaces it.
 * When to use: `openCommanderPopover` and `closeCommanderPopover`.
 * Expected outcome: Null while closed.
 * Exceptions: None.
 */
let popover: HTMLElement | null = null;

/**
 * The button the open popover is anchored to.
 *
 * Purpose: An outside click on that button is handled by the button, and scrolling moves the popover with it.
 * When to use: Placement and the outside-click test.
 * Expected outcome: Replaced by `reanchorCommanderPopover`.
 * Exceptions: None.
 */
let anchor: HTMLElement | null = null;

/**
 * Removes the document listeners for the open popover.
 *
 * Purpose: A closed popover must not keep receiving Escape and outside clicks.
 * When to use: `closeCommanderPopover`.
 * Expected outcome: Null while closed.
 * Exceptions: None.
 */
let detachListeners: (() => void) | null = null;

/**
 * Told when the open popover closes.
 *
 * Purpose: The caller clears its open-row mark.
 * When to use: Set by `openCommanderPopover`.
 * Expected outcome: Called once from `closeCommanderPopover`.
 * Exceptions: None.
 */
let notifyClosed: (() => void) | null = null;

/**
 * Writes a commander into the open popover without saving it again.
 *
 * Purpose: A copy click updates the row, and the open fields should show that commander.
 * When to use: Set while a popover is open.
 * Expected outcome: Null while closed.
 * Exceptions: None.
 */
let applyOpenDraft: ((commander: NewGameCommanderInput) => void) | null = null;

/**
 * Opens the commander popover under `request.anchor`.
 *
 * Purpose: One place edits a side's key, model, reasoning effort, and doctrine.
 * When to use: A click on a commander summary button.
 * Expected outcome: Any popover already open closes first. Choosing a model also saves it as the app-wide model.
 * Exceptions: None. A missing model list still opens, with the empty model option.
 */
export function openCommanderPopover(request: CommanderPopoverRequest): void {
  closeCommanderPopover();
  anchor = request.anchor;
  notifyClosed = request.onClose ?? null;
  const draft: CommanderDraft = {
    modelId: request.commander.modelId,
    reasoningEffort: request.commander.reasoningEffort,
    doctrineChoice: request.commander.doctrineChoice,
    apiKey: commanderApiKey(request.commander),
  };
  const root = document.createElement('div');
  root.className = 'commander-popover';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', request.title);
  root.append(popoverHeader(request.title), popoverFields(draft, request));
  document.body.appendChild(root);
  popover = root;
  placeCommanderPopover();
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeCommanderPopover();
  };
  const onPointer = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover?.contains(target) || anchor?.contains(target)) return;
    closeCommanderPopover();
  };
  const onScroll = (): void => placeCommanderPopover();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  detachListeners = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  };
}

/**
 * Closes the commander popover.
 *
 * Purpose: Escape, an outside click, the close button, and a second click on the same row share one exit.
 * When to use: Those actions, and before opening a different row.
 * Expected outcome: The popover is gone. `onClose` runs when one was set.
 * Exceptions: None.
 */
export function closeCommanderPopover(): void {
  detachListeners?.();
  detachListeners = null;
  popover?.remove();
  popover = null;
  anchor = null;
  applyOpenDraft = null;
  setOpenRouterModelListListener(null);
  const closed = notifyClosed;
  notifyClosed = null;
  closed?.();
}

/**
 * Points the open popover at a replacement button.
 *
 * Purpose: Rebuilding the side rows replaces the button the popover was opened from.
 * When to use: After that rebuild, while the same row is still open.
 * Expected outcome: The popover stays open under the new button.
 * Exceptions: None. A call while closed does nothing.
 */
export function reanchorCommanderPopover(next: HTMLElement): void {
  if (!popover) return;
  anchor = next;
  placeCommanderPopover();
}

/**
 * Reports whether the popover is open.
 *
 * Purpose: A second click on the same row closes it instead of opening another.
 * When to use: The commander button's click.
 * Expected outcome: True after `openCommanderPopover` until `closeCommanderPopover`.
 * Exceptions: None.
 */
export function commanderPopoverIsOpen(): boolean {
  return popover != null;
}

/**
 * Shows a commander in the open popover without reporting a change.
 *
 * Purpose: Copying onto the open row should fill the fields the player is looking at.
 * When to use: After the caller has stored the copied commander.
 * Expected outcome: The open fields match `commander`. A call while closed does nothing and does not call `onChange`.
 * Exceptions: None.
 */
export function replaceOpenCommanderDraft(commander: NewGameCommanderInput): void {
  applyOpenDraft?.(commander);
}

/**
 * The popover's title row.
 *
 * Purpose: The side's name and the close button stay together.
 * When to use: `openCommanderPopover`.
 * Expected outcome: A heading and a close button.
 * Exceptions: None.
 */
function popoverHeader(title: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'commander-popover-header';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'commander-popover-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => closeCommanderPopover());
  header.append(heading, close);
  return header;
}

/**
 * Key, model, reasoning, doctrine, and the optional copy button.
 *
 * Purpose: The controls write one commander object the caller stores.
 * When to use: `openCommanderPopover`.
 * Expected outcome: A model, reasoning, or doctrine change calls `onChange` with the key field's current value. The key calls `onChange` on blur and Enter only when its trimmed value changed. A model change also updates the app-wide model.
 * Exceptions: None.
 */
function popoverFields(draft: CommanderDraft, request: CommanderPopoverRequest): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'commander-popover-fields';
  const keyInput = document.createElement('input');
  keyInput.type = 'password';
  keyInput.autocomplete = 'off';
  keyInput.setAttribute('aria-label', 'API key');
  keyInput.value = commanderApiKey(draft);
  keyInput.setAttribute('data-control-tooltip', apiKeyTooltipText);
  const model = document.createElement('select');
  model.setAttribute('aria-label', 'Model');
  copyModelOptions(model, draft.modelId);
  const modelControls = document.createElement('span');
  modelControls.className = 'commander-popover-model-controls';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'openrouter-refresh-btn';
  refresh.setAttribute('aria-label', 'Refresh model list');
  refresh.setAttribute('data-control-tooltip', refreshModelsTooltipText);
  modelControls.append(model, refresh);
  const reasoningRow = document.createElement('label');
  reasoningRow.className = 'commander-popover-field';
  reasoningRow.textContent = 'Reasoning';
  const reasoning = document.createElement('select');
  reasoning.setAttribute('aria-label', 'Reasoning');
  reasoningRow.appendChild(reasoning);
  const current = (): NewGameCommanderInput => {
    draft.apiKey = keyInput.value.trim();
    return { ...draft };
  };
  const reasoningSelect = attachReasoningEffortSelect({
    select: reasoning,
    onEffortChange: (effort) => {
      draft.reasoningEffort = effort ? effort : null;
      request.onChange(current());
    },
  });
  const showReasoning = (): void => {
    const modelId = draft.modelId ?? '';
    const record = modelId ? openRouterModelById(modelId) : undefined;
    reasoningSelect.showForModel(record, draft.reasoningEffort ?? '');
    const efforts = listSelectableReasoningEfforts(record);
    reasoningRow.hidden = efforts.length === 0;
    const modelKnown = modelId.length > 0 && record != null;
    if (!modelId || (modelKnown && efforts.length === 0)) draft.reasoningEffort = null;
  };
  model.addEventListener('change', () => {
    draft.modelId = model.value ? model.value : null;
    draft.reasoningEffort = null;
    saveAppWideModel(draft.modelId);
    showReasoning();
    request.onChange(current());
  });
  showReasoning();
  const emitKeyIfChanged = (): void => {
    const next = keyInput.value.trim();
    if (next === (draft.apiKey ?? '')) return;
    draft.apiKey = next;
    request.onChange({ ...draft });
  };
  keyInput.addEventListener('blur', emitKeyIfChanged);
  keyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') emitKeyIfChanged();
  });
  refresh.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) {
      reportOpenRouterPopoverLine('No API key set.', true);
      return;
    }
    draft.apiKey = key;
    request.onChange({ ...draft });
    void refreshOpenRouterModels(key);
  });
  setOpenRouterModelListListener(() => {
    copyModelOptions(model, draft.modelId);
    showReasoning();
  });
  const doctrine = doctrineField(draft, request, current);
  applyOpenDraft = (commander) => {
    draft.modelId = commander.modelId;
    draft.reasoningEffort = commander.reasoningEffort;
    draft.doctrineChoice = commander.doctrineChoice;
    draft.apiKey = commanderApiKey(commander);
    keyInput.value = draft.apiKey ?? '';
    copyModelOptions(model, draft.modelId);
    showReasoning();
    doctrine.show();
  };
  const copy = copyButton(request.copyButton);
  fields.append(labeledField('API key', keyInput), labeledField('Model', modelControls), reasoningRow, doctrine.root);
  if (copy) fields.append(copy);
  return fields;
}

/**
 * The copy button, or null when this popover has none.
 *
 * Purpose: A match does not copy commanders. A new game does.
 * When to use: `popoverFields`.
 * Expected outcome: Null when `copyButton` is null. Otherwise a button that calls `onCopy` unless it is disabled.
 * Exceptions: None.
 */
function copyButton(button: CommanderCopyButton | null): HTMLButtonElement | null {
  if (!button) return null;
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'commander-popover-apply';
  apply.textContent = button.label;
  apply.disabled = button.disabled;
  apply.addEventListener('click', () => {
    if (apply.disabled) return;
    button.onCopy();
  });
  return apply;
}

/**
 * Copies the options of the app-wide model select (`#openrouter-model`).
 *
 * Purpose: The popover offers the same list, including the empty choice.
 * When to use: When the popover opens.
 * Expected outcome: The previous options are replaced. The row's model is selected when that option exists.
 * Exceptions: None. A missing app-wide select leaves one empty option.
 */
function copyModelOptions(select: HTMLSelectElement, modelId: string | null): void {
  select.replaceChildren();
  const source = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  if (!source) {
    select.appendChild(new Option('— Select model —', ''));
    return;
  }
  for (const option of source.options) select.appendChild(new Option(option.text, option.value));
  if (modelId && ![...select.options].some((option) => option.value === modelId)) {
    select.appendChild(new Option(modelId, modelId));
  }
  select.value = modelId ?? '';
}

/**
 * The doctrine select and its description.
 *
 * Purpose: The description follows the choice.
 * When to use: `popoverFields`.
 * Expected outcome: A change stores the choice and calls `onChange` with the current key. `show` refreshes the description after a copy.
 * Exceptions: None.
 */
function doctrineField(
  draft: CommanderDraft,
  request: CommanderPopoverRequest,
  current: () => NewGameCommanderInput
): { root: HTMLElement; show: () => void } {
  const wrap = document.createElement('div');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Doctrine');
  for (const choice of DOCTRINE_CHOICES) {
    select.appendChild(new Option(DOCTRINE_CHOICE_LABELS[choice], choice));
  }
  select.value = draft.doctrineChoice;
  const description = document.createElement('p');
  description.className = 'commander-popover-doctrine';
  const show = (): void => {
    select.value = draft.doctrineChoice;
    description.textContent = DOCTRINE_CHOICE_DESCRIPTIONS[draft.doctrineChoice];
  };
  select.addEventListener('change', () => {
    draft.doctrineChoice = select.value as DoctrineChoice;
    show();
    request.onChange(current());
  });
  show();
  wrap.append(labeledField('Doctrine', select), description);
  return { root: wrap, show };
}

/**
 * A label with its control beside it.
 *
 * Purpose: Model, reasoning, and doctrine share one row shape.
 * When to use: `popoverFields` and `doctrineField`.
 * Expected outcome: A label element containing the text and the control.
 * Exceptions: None.
 */
function labeledField(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'commander-popover-field';
  label.append(document.createTextNode(text), control);
  return label;
}

/**
 * Saves the chosen model as the app-wide model.
 *
 * Purpose: The next match's new sides start from the model the player just picked.
 * When to use: A model change in the popover.
 * Expected outcome: The app-wide model select changes when the id differs, which saves it. An empty choice clears it.
 * Exceptions: None. A missing select still calls `setSelectedModel`.
 */
function saveAppWideModel(modelId: string | null): void {
  const select = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const next = modelId ?? '';
  if (!select) {
    void window.gameApi?.openRouter?.setSelectedModel(next);
    return;
  }
  if (select.value === next) return;
  select.value = next;
  select.dispatchEvent(new Event('change'));
}

/**
 * Puts the popover under its anchor, inside the window.
 *
 * Purpose: A row near the bottom of the screen must not lose the popover off the window.
 * When to use: On open, on scroll, and after the anchor is replaced.
 * Expected outcome: The popover sits below the anchor, or above it when there is no room below.
 * Exceptions: None.
 */
function placeCommanderPopover(): void {
  if (!popover || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.left = `${Math.max(8, rect.left)}px`;
  const box = popover.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) popover.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
  if (box.bottom > window.innerHeight - 8) popover.style.top = `${Math.max(8, rect.top - box.height - 6)}px`;
}
