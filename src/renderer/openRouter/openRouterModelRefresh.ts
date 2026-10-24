/**
 * Hooks the commander popover uses to load models and write one activity line.
 *
 * Purpose: The popover must not import the OpenRouter controls or the activity log, because those import the popover.
 * When to use: The controls install the hooks at startup. The popover calls them.
 * Expected outcome: A call before the hook is installed does nothing. The key is not logged.
 * Exceptions: None.
 */

/**
 * Loads the shared model list for one key.
 *
 * Purpose: The controls own the fetch. The popover only asks for it.
 * When to use: Set from `initOpenRouterUI` once the OpenRouter API is present.
 * Expected outcome: Null until that init runs.
 * Exceptions: None.
 */
let refreshModels: ((key: string) => Promise<void>) | null = null;

/**
 * Refills the open popover after the shared model list changes.
 *
 * Purpose: The popover owns its model select. The controls only say the list changed.
 * When to use: Set while a popover is open. Cleared when it closes.
 * Expected outcome: Null while no popover is open.
 * Exceptions: None.
 */
let onModelListUpdated: (() => void) | null = null;

/**
 * Writes one line to the AI activity log.
 *
 * Purpose: The popover reports an empty key without importing the log.
 * When to use: Set from `initOpenRouterUI`.
 * Expected outcome: Null until that init runs.
 * Exceptions: None.
 */
let reportLine: ((line: string, isError: boolean) => void) | null = null;

/**
 * Installs the model-list fetch.
 *
 * Purpose: Startup and every commander popover share one catalog.
 * When to use: `initOpenRouterUI`, after the OpenRouter API is present.
 * Expected outcome: Later `refreshOpenRouterModels` calls `refresh`. The key is not logged.
 * Exceptions: None.
 */
export function setOpenRouterModelRefresh(refresh: (key: string) => Promise<void>): void {
  refreshModels = refresh;
}

/**
 * Refreshes the shared model list with one key.
 *
 * Purpose: The commander popover reloads the catalog the hidden model select stores.
 * When to use: When the caller has a non-empty key. An empty key should be reported by the caller instead.
 * Expected outcome: `#openrouter-model` shows the fetched models. A failure is written to the activity log. The key is not logged.
 * Exceptions: None. A call before the controls are ready resolves without fetching.
 */
export function refreshOpenRouterModels(key: string): Promise<void> {
  return refreshModels?.(key) ?? Promise.resolve();
}

/**
 * Registers the open popover's model-list refresh.
 *
 * Purpose: A fetch that finishes while a popover is open can refill that popover's model select.
 * When to use: When the popover opens, and with null when it closes.
 * Expected outcome: The next catalog load calls `listener`. A null listener is not called.
 * Exceptions: None.
 */
export function setOpenRouterModelListListener(listener: (() => void) | null): void {
  onModelListUpdated = listener;
}

/**
 * Tells the open popover that the shared model list was replaced.
 *
 * Purpose: The popover copies the hidden model select after a fetch.
 * When to use: At the end of a model-list load, including a failed one.
 * Expected outcome: The open popover's model select matches the hidden select. Nothing happens while no popover is open.
 * Exceptions: None.
 */
export function notifyOpenRouterModelListUpdated(): void {
  onModelListUpdated?.();
}

/**
 * Installs the activity-log writer the popover uses.
 *
 * Purpose: An empty refresh key is reported in the log without a cycle through the log module.
 * When to use: `initOpenRouterUI`, including when the OpenRouter API is missing.
 * Expected outcome: Later `reportOpenRouterPopoverLine` calls `report`.
 * Exceptions: None.
 */
export function setOpenRouterPopoverLog(report: (line: string, isError: boolean) => void): void {
  reportLine = report;
}

/**
 * Writes one popover line to the AI activity log.
 *
 * Purpose: The empty-key refresh says that no API key is set.
 * When to use: When the popover's refresh is clicked with an empty key.
 * Expected outcome: The line is appended when the hook is installed. The key is not logged.
 * Exceptions: None. A call before init does nothing.
 */
export function reportOpenRouterPopoverLine(line: string, isError: boolean): void {
  reportLine?.(line, isError);
}
