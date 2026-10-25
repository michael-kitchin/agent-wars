/**
 * The word that sets every popover label's width.
 *
 * Purpose: The API key field, the model list, and the reasoning list share a left edge only while every label is this wide and the Reasoning label shows this word.
 * When to use: The invisible sizer in `fieldLabel`, and the visible Reasoning label.
 * Expected outcome: The characters "Reasoning".
 * Exceptions: None.
 */
export const popoverLabelWidthText = 'Reasoning';

/**
 * Ids of the popover controls.
 *
 * Purpose: Each visible label points at its control with `for`. One popover is open at a time, so these ids are unique.
 * When to use: Building the commander popover fields.
 * Expected outcome: Match the `id` attributes written onto the controls.
 * Exceptions: None.
 */
export const POPOVER_CONTROL_IDS = {
  apiKey: 'commander-popover-api-key',
  model: 'commander-popover-model',
  reasoning: 'commander-popover-reasoning',
  doctrine: 'commander-popover-doctrine',
} as const;

/**
 * A label whose text is right-aligned in a column as wide as the word Reasoning.
 *
 * Purpose: Every popover label uses that width, so the API key field, the model list, and the reasoning list share one left edge.
 * When to use: Each labeled control in the commander popover.
 * Expected outcome: A label whose `for` is `id`. An invisible sizer of `popoverLabelWidthText` sets the width, and `text` sits on top of it, right-aligned.
 * Exceptions: None.
 */
export function fieldLabel(id: string, text: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'commander-popover-label';
  label.htmlFor = id;
  const sizer = document.createElement('span');
  sizer.className = 'commander-popover-label-sizer';
  sizer.setAttribute('aria-hidden', 'true');
  sizer.textContent = popoverLabelWidthText;
  const shown = document.createElement('span');
  shown.textContent = text;
  label.append(sizer, shown);
  return label;
}

/**
 * One reasoning or doctrine pair: the label and its list.
 *
 * Purpose: The two pairs share one line and the same label width and list width.
 * When to use: The reasoning and doctrine rows of the commander popover.
 * Expected outcome: A grid row whose label points at `control`.
 * Exceptions: None.
 */
export function choicePair(id: string, text: string, control: HTMLElement): HTMLElement {
  const pair = document.createElement('div');
  pair.className = 'commander-popover-choice';
  pair.append(fieldLabel(id, text), control);
  return pair;
}
