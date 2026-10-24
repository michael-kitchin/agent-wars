import type { NewGameCommanderInput } from '../../shared/ipc/ordersTypes';
import { DOCTRINE_CHOICE_DESCRIPTIONS, DOCTRINE_CHOICE_LABELS } from '../../shared/doctrineDescriptions';
import { listSelectableReasoningEfforts } from '../../shared/openRouterReasoningEffort';
import { DOCTRINE_CHOICES, type DoctrineChoice } from '../../shared/seatRoster';
import { openRouterModelById } from './openRouterModelCatalog';
import { attachReasoningEffortSelect } from './reasoningEffortSelect';

/**
 * What the commander popover edits.
 *
 * Purpose: The new-game rows and a later commanders tab share one popover.
 * When to use: `openCommanderPopover`.
 * Expected outcome: `onChange` fires for the row that opened it. `onApplyAll` copies that commander.
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
   * Expected outcome: The selects show this model, effort, and doctrine.
   * Exceptions: None.
   */
  readonly commander: NewGameCommanderInput;
  /**
   * The apply-all button's label.
   *
   * Contract: "Use for every opponent" or "Use for every side".
   * When to use: Observe uses the side wording.
   * Expected outcome: The button shows this text.
   * Exceptions: None.
   */
  readonly applyAllLabel: string;
  /**
   * Called when this row's commander changes.
   *
   * Contract: Receives the commander the controls now show.
   * When to use: Model, reasoning, and doctrine changes.
   * Expected outcome: The caller stores it on that row.
   * Exceptions: None.
   */
  readonly onChange: (commander: NewGameCommanderInput) => void;
  /**
   * Called when every AI row should use this commander.
   *
   * Contract: Receives the commander the controls now show.
   * When to use: The apply-all button.
   * Expected outcome: The caller copies it onto every AI row.
   * Exceptions: None.
   */
  readonly onApplyAll: (commander: NewGameCommanderInput) => void;
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
 * Opens the commander popover under `request.anchor`.
 *
 * Purpose: One place edits a side's model, reasoning effort, and doctrine.
 * When to use: A click on a commander summary button.
 * Expected outcome: Any popover already open closes first. Choosing a model also saves it as the app-wide model.
 * Exceptions: None. A missing model list still opens, with the empty model option.
 */
export function openCommanderPopover(request: CommanderPopoverRequest): void {
  closeCommanderPopover();
  anchor = request.anchor;
  notifyClosed = request.onClose ?? null;
  const draft: {
    modelId: string | null;
    reasoningEffort: string | null;
    doctrineChoice: DoctrineChoice;
  } = {
    modelId: request.commander.modelId,
    reasoningEffort: request.commander.reasoningEffort,
    doctrineChoice: request.commander.doctrineChoice,
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
 * Model, reasoning, doctrine, and apply-all.
 *
 * Purpose: The controls write one commander object the caller stores.
 * When to use: `openCommanderPopover`.
 * Expected outcome: Each change calls `onChange`. Apply-all calls `onApplyAll`. A model change also updates the app-wide model.
 * Exceptions: None.
 */
function popoverFields(
  draft: { modelId: string | null; reasoningEffort: string | null; doctrineChoice: DoctrineChoice },
  request: CommanderPopoverRequest
): HTMLElement {
  const fields = document.createElement('div');
  fields.className = 'commander-popover-fields';
  const model = document.createElement('select');
  model.setAttribute('aria-label', 'Model');
  copyModelOptions(model, draft.modelId);
  const reasoningRow = document.createElement('label');
  reasoningRow.className = 'commander-popover-field';
  reasoningRow.textContent = 'Reasoning';
  const reasoning = document.createElement('select');
  reasoning.setAttribute('aria-label', 'Reasoning');
  reasoningRow.appendChild(reasoning);
  const reasoningSelect = attachReasoningEffortSelect({
    select: reasoning,
    onEffortChange: (effort) => {
      draft.reasoningEffort = effort ? effort : null;
      request.onChange({ ...draft });
    },
  });
  const showReasoning = (): void => {
    const record = openRouterModelById(draft.modelId ?? '');
    reasoningSelect.showForModel(record, draft.reasoningEffort ?? '');
    const hidden = listSelectableReasoningEfforts(record).length === 0;
    reasoningRow.hidden = hidden;
    if (hidden) draft.reasoningEffort = null;
  };
  model.addEventListener('change', () => {
    draft.modelId = model.value ? model.value : null;
    draft.reasoningEffort = null;
    saveAppWideModel(draft.modelId);
    showReasoning();
    request.onChange({ ...draft });
  });
  showReasoning();
  const doctrine = doctrineField(draft, request);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'commander-popover-apply';
  apply.textContent = request.applyAllLabel;
  apply.addEventListener('click', () => request.onApplyAll({ ...draft }));
  fields.append(labeledField('Model', model), reasoningRow, doctrine, apply);
  return fields;
}

/**
 * Copies the options of the app-wide model select (`#openrouter-model`).
 *
 * Purpose: The popover offers the same list, including the empty choice.
 * When to use: When the popover opens.
 * Expected outcome: The row's model is selected when that option exists.
 * Exceptions: None. A missing app-wide select leaves one empty option.
 */
function copyModelOptions(select: HTMLSelectElement, modelId: string | null): void {
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
 * Expected outcome: A change stores the choice and calls `onChange`.
 * Exceptions: None.
 */
function doctrineField(
  draft: { modelId: string | null; reasoningEffort: string | null; doctrineChoice: DoctrineChoice },
  request: CommanderPopoverRequest
): HTMLElement {
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
    description.textContent = DOCTRINE_CHOICE_DESCRIPTIONS[draft.doctrineChoice];
  };
  select.addEventListener('change', () => {
    draft.doctrineChoice = select.value as DoctrineChoice;
    show();
    request.onChange({ ...draft });
  });
  show();
  wrap.append(labeledField('Doctrine', select), description);
  return wrap;
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
