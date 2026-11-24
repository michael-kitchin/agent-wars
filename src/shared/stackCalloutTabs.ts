/**
 * Tab labels and the tab-choice rule for the stack callout.
 *
 * Purpose: The stack callout splits unit selection and ship or air cargo into Select and Transport tabs, the way the build popup splits Build and Hire.
 * When to use: `src/renderer/map/stackCalloutTabs.ts`, and tests of the remembered choice.
 * Expected outcome: Stable labels and a pure rule for which tab shows.
 * Exceptions: None.
 */

/**
 * Label of the tab that lists the hex's units with their selection controls.
 *
 * Purpose: One source for the tab text and its documentation.
 * When to use: The first tab of a stack callout that shows tabs.
 * Expected outcome: `Select`.
 * Exceptions: None.
 */
export const SELECT_TAB_LABEL = 'Select';

/**
 * Label of the tab that holds the ship and air unit cargo slots.
 *
 * Purpose: One source for the tab text and its documentation.
 * When to use: The second tab of a stack callout that shows tabs.
 * Expected outcome: `Transport`.
 * Exceptions: None.
 */
export const TRANSPORT_TAB_LABEL = 'Transport';

/**
 * One of the stack callout's tabs.
 *
 * Purpose: Names the tab the callout shows.
 * When to use: `nextStackCalloutTab` and the renderer's tab state.
 * Expected outcome: `select` or `transport`.
 * Exceptions: None.
 */
export type StackCalloutTab = 'select' | 'transport';

/**
 * Decides which tab an opening or refreshed stack callout shows.
 *
 * Purpose: The choice is remembered for the hex it was made on, like the build popup's Build and Hire choice. Another hex starts on Select.
 * When to use: Each time the Transport section is mounted on the callout.
 * Expected outcome: `remembered.tab` when `remembered.h3Index` is `h3Index`, otherwise `select`.
 * Exceptions: None.
 */
export function nextStackCalloutTab(args: {
  /**
   * The hex and tab of the last choice.
   *
   * Contract: `h3Index` is null before any callout has shown tabs.
   * When to use: The renderer's stored tab state.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly remembered: { readonly h3Index: string | null; readonly tab: StackCalloutTab };
  /**
   * The hex the callout now shows.
   *
   * Contract: An H3 index, strategic or tactical.
   * When to use: The callout's `data-h3-index`.
   * Expected outcome: Compared with `remembered.h3Index`.
   * Exceptions: None.
   */
  readonly h3Index: string;
}): StackCalloutTab {
  return args.remembered.h3Index === args.h3Index ? args.remembered.tab : 'select';
}
