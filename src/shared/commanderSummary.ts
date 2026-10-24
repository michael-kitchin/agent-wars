import { DOCTRINE_CHOICE_LABELS } from './doctrineDescriptions';
import { modelNameFromOptionLabel, NO_MODEL_LABEL } from './commanderPlanningStatus';
import { capitalizeReasoningEffortName } from './openRouterReasoningEffort';
import type { Doctrine, DoctrineChoice } from './seatRoster';

/**
 * The fields a commander summary is built from.
 *
 * Purpose: The new-game row and the popover share one sentence.
 * When to use: `formatCommanderSummary`.
 * Expected outcome: A missing model label means standing orders only.
 * Exceptions: None.
 */
export interface CommanderSummaryInput {
  /**
   * Model name, or null when none is chosen.
   *
   * Contract: Null or blank means no model. A name may still include a provider prefix or an option suffix.
   * When to use: The selected option's text, or null.
   * Expected outcome: The summary uses the name after the provider prefix.
   * Exceptions: None.
   */
  readonly modelLabel: string | null;
  /**
   * Saved reasoning effort, or null when the model default applies.
   *
   * Contract: A gateway effort id, or null or blank when the summary should omit it.
   * When to use: The row's commander.
   * Expected outcome: Shown capitalized, and only when set.
   * Exceptions: None.
   */
  readonly reasoningEffort: string | null;
  /**
   * Doctrine the human picked.
   *
   * Contract: One of `DoctrineChoice`.
   * When to use: The row's commander.
   * Expected outcome: The summary ends with that choice's label.
   * Exceptions: None.
   */
  readonly doctrineChoice: DoctrineChoice;
  /**
   * The doctrine Random drew, once the match is over.
   *
   * Contract: One of `Doctrine`, or null while the draw is hidden.
   * When to use: A finished match whose choice was Random.
   * Expected outcome: The doctrine segment names the draw.
   * Exceptions: None.
   */
  readonly revealedDoctrine?: Doctrine | null;
}

/**
 * One sentence for a commander's model, effort, and doctrine.
 *
 * Purpose: The row button and later commander cards use the same wording.
 * When to use: Whenever a commander is shown as one line.
 * Expected outcome: "No model · standing orders only" when no model is set. Otherwise the model name, the effort when one is set, and the doctrine. Random names a revealed draw.
 * Exceptions: None.
 */
export function formatCommanderSummary(input: CommanderSummaryInput): string {
  const modelName = displayModelName(input.modelLabel);
  if (!modelName) return 'No model · standing orders only';
  const parts = [modelName];
  const effort = input.reasoningEffort?.trim();
  if (effort) parts.push(capitalizeReasoningEffortName(effort));
  parts.push(doctrineSegment(input.doctrineChoice, input.revealedDoctrine));
  return parts.join(' · ');
}

/**
 * The model name with the provider prefix and the option suffix removed.
 *
 * Purpose: Option labels carry a provider and a price suffix the summary does not.
 * When to use: `formatCommanderSummary`.
 * Expected outcome: Empty when no model is set. Otherwise the name after ": ".
 * Exceptions: None.
 */
function displayModelName(modelLabel: string | null): string {
  if (!modelLabel?.trim()) return '';
  const withoutSuffix = modelNameFromOptionLabel(modelLabel);
  if (withoutSuffix === NO_MODEL_LABEL) return '';
  const colon = withoutSuffix.indexOf(': ');
  return (colon >= 0 ? withoutSuffix.slice(colon + 2) : withoutSuffix).trim();
}

/**
 * The doctrine words at the end of the summary.
 *
 * Purpose: Random stays "Random" until a finished match reveals the draw.
 * When to use: `formatCommanderSummary`.
 * Expected outcome: "Random, drew Cautious" when a draw is given. Otherwise the choice's label.
 * Exceptions: None.
 */
function doctrineSegment(choice: DoctrineChoice, revealed: Doctrine | null | undefined): string {
  if (choice === 'random' && revealed) return `Random, drew ${DOCTRINE_CHOICE_LABELS[revealed]}`;
  return DOCTRINE_CHOICE_LABELS[choice];
}
