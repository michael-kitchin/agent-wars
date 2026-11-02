/**
 * The doctrine and provider lists in the commander popover.
 *
 * Purpose: Those two lists, and the doctrine description, stay out of the popover assembler.
 * When to use: `popoverFields` in `commanderPopover.ts`.
 * Expected outcome: Each list is a labeled pair. Doctrine also fills the right half of its row with the description.
 * Exceptions: None.
 */

import { DOCTRINE_CHOICE_DESCRIPTIONS, DOCTRINE_CHOICE_LABELS } from '../../shared/doctrineDescriptions';
import { PROVIDER_SORT_CHOICES, PROVIDER_SORT_LABELS, type ProviderSortChoice } from '../../shared/openRouterProviderSort';
import { DOCTRINE_CHOICES, type DoctrineChoice } from '../../shared/seatRoster';
import { choicePair, POPOVER_CONTROL_IDS } from './commanderPopoverLabels';

/**
 * One labeled list and a way to select a value after the list is built.
 *
 * Purpose: Reasoning, doctrine, and provider share the same list shape.
 * When to use: The result of `choiceSelect`.
 * Expected outcome: `pair` is the label and the list. `show` selects a value.
 * Exceptions: None.
 */
interface ChoiceControl<T extends string> {
  /**
   * The label and the list.
   *
   * Contract: A `.commander-popover-choice` row.
   * When to use: Appending the control to a popover row.
   * Expected outcome: The label points at the list.
   * Exceptions: None.
   */
  readonly pair: HTMLElement;
  /**
   * Selects one of the list's values.
   *
   * Contract: `next` is one of the options that were passed in.
   * When to use: After a copy replaces the open draft.
   * Expected outcome: The list shows `next`.
   * Exceptions: None.
   */
  readonly show: (next: T) => void;
}

/**
 * Builds a labeled list of string choices.
 *
 * Purpose: Doctrine and provider use one list builder.
 * When to use: `doctrineChoiceControl` and `providerChoiceControl`.
 * Expected outcome: One option per entry, `selected` chosen, and `onChange` called with the new value.
 * Exceptions: None.
 */
export function choiceSelect<T extends string>(input: {
  readonly id: string;
  readonly label: string;
  readonly options: readonly T[];
  readonly optionLabel: (choice: T) => string;
  readonly selected: T;
  readonly onChange: (choice: T) => void;
}): ChoiceControl<T> {
  const select = document.createElement('select');
  select.id = input.id;
  select.setAttribute('aria-label', input.label);
  for (const choice of input.options) select.appendChild(new Option(input.optionLabel(choice), choice));
  select.value = input.selected;
  select.addEventListener('change', () => {
    input.onChange(select.value as T);
  });
  return {
    pair: choicePair(input.id, input.label, select),
    show: (next) => {
      select.value = next;
    },
  };
}

/**
 * The doctrine list and the description that sits beside it.
 *
 * Purpose: Doctrine takes the left half of its row. The description fills the right half, and the row lines their tops up.
 * When to use: The row under Reasoning and Provider.
 * Expected outcome: A `.commander-popover-doctrine-row`. `show` selects the choice and writes its description.
 *   A change calls `onChange` with the choice.
 * Exceptions: None.
 */
export function doctrineChoiceControl(input: {
  readonly selected: DoctrineChoice;
  readonly onChange: (choice: DoctrineChoice) => void;
}): { readonly row: HTMLElement; readonly show: (next: DoctrineChoice) => void } {
  const description = document.createElement('p');
  description.className = 'commander-popover-doctrine';
  const control = choiceSelect({
    id: POPOVER_CONTROL_IDS.doctrine,
    label: 'Doctrine',
    options: DOCTRINE_CHOICES,
    optionLabel: (choice) => DOCTRINE_CHOICE_LABELS[choice],
    selected: input.selected,
    onChange: (choice) => {
      description.textContent = DOCTRINE_CHOICE_DESCRIPTIONS[choice];
      input.onChange(choice);
    },
  });
  const show = (next: DoctrineChoice): void => {
    control.show(next);
    description.textContent = DOCTRINE_CHOICE_DESCRIPTIONS[next];
  };
  show(input.selected);
  const row = document.createElement('div');
  row.className = 'commander-popover-doctrine-row';
  row.append(control.pair, description);
  return { row, show };
}

/**
 * The provider list.
 *
 * Purpose: The player chooses how OpenRouter picks a host for this commander.
 * When to use: The right half of the Reasoning row.
 * Expected outcome: The four provider labels, with `selected` chosen. A change calls `onChange`.
 * Exceptions: None.
 */
export function providerChoiceControl(input: {
  readonly selected: ProviderSortChoice;
  readonly onChange: (choice: ProviderSortChoice) => void;
}): ChoiceControl<ProviderSortChoice> {
  return choiceSelect({
    id: POPOVER_CONTROL_IDS.provider,
    label: 'Provider',
    options: PROVIDER_SORT_CHOICES,
    optionLabel: (choice) => PROVIDER_SORT_LABELS[choice],
    selected: input.selected,
    onChange: input.onChange,
  });
}
