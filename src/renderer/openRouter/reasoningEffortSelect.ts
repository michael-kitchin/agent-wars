import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import {
  isReasoningEffortSelectable,
  listSelectableReasoningEfforts,
  resolveDefaultReasoningEffort,
  resolveRequestedReasoningEffort,
} from '../../shared/openRouterReasoningEffort';

/**
 * Handle for refreshing the Model-tab reasoning dropdown.
 *
 * Purpose: Lets the model controls rebuild the reasoning options whenever the selected model or saved effort changes.
 * When to use: Returned by `attachReasoningEffortSelect`; call `showForModel` after every model-list or selection change.
 * Expected outcome: The dropdown always reflects the given model's levels.
 * Exceptions: None.
 */
export interface ReasoningEffortSelectBinding {
  /**
   * Rebuilds the options for a model and selects the saved effort, or the model default.
   *
   * Contract: `persistedEffort` is `''` for "model default"; invalid efforts fall back to the default.
   * When to use: After models load, after the saved effort loads, and after the player switches models.
   * Expected outcome: Only the model's levels are offered, the default is marked "(default)", and the
   * dropdown is disabled when fewer than two levels exist.
   * Exceptions: None.
   */
  showForModel(model: OpenRouterModel | undefined, persistedEffort: string): void;
}

/**
 * Capitalizes the first letter of a reasoning option name.
 *
 * Purpose: Vendor effort ids arrive in lowercase; the dropdown shows them as names.
 * When to use: Formatting a dropdown option.
 * Expected outcome: `high` becomes `High`. An empty string stays empty.
 * Exceptions: None.
 */
function capitalizeReasoningOptionName(name: string): string {
  return name.length === 0 ? name : name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Formats one reasoning option label.
 *
 * Purpose: Keeps the option text consistent between the default and the other levels.
 * When to use: Inside `showForModel` when creating options.
 * Expected outcome: `High` or `High (default)`.
 * Exceptions: None.
 */
function formatReasoningEffortOptionLabel(effort: string, isDefault: boolean): string {
  const label = capitalizeReasoningOptionName(effort);
  return isDefault ? `${label} (default)` : label;
}

/**
 * Wires the reasoning dropdown and returns a binding that rebuilds it per model.
 *
 * Purpose: Keeps option building and the "(default) means no override" rule out of the larger model controls.
 * When to use: Once during Model-tab setup, when `#openrouter-reasoning-effort` exists.
 * Expected outcome: Player changes call `onEffortChange` with `''` for the default option, otherwise the chosen effort.
 * Exceptions: None.
 */
export function attachReasoningEffortSelect(args: {
  readonly select: HTMLSelectElement;
  readonly onEffortChange: (persistedEffort: string) => void;
}): ReasoningEffortSelectBinding {
  const { select, onEffortChange } = args;
  let currentDefault: string | null = null;

  select.addEventListener('change', () => {
    onEffortChange(select.value === currentDefault ? '' : select.value);
  });

  return {
    showForModel(model: OpenRouterModel | undefined, persistedEffort: string): void {
      const efforts = listSelectableReasoningEfforts(model);
      const defaultEffort = resolveDefaultReasoningEffort(model);
      currentDefault = defaultEffort;
      select.replaceChildren();
      if (efforts.length === 0 || defaultEffort === null) {
        select.appendChild(new Option(capitalizeReasoningOptionName('model default'), ''));
      }
      efforts.forEach((effort) => {
        select.appendChild(new Option(formatReasoningEffortOptionLabel(effort, effort === defaultEffort), effort));
      });
      select.value = resolveRequestedReasoningEffort(model, persistedEffort) ?? defaultEffort ?? '';
      select.disabled = !isReasoningEffortSelectable(model);
    },
  };
}
