/**
 * The map's two view choices in the minimap panel's map-mode tabs, each a toggle on its own: Weather shows or hides
 * the weather icons on the world map, and Tech turns on the view that holding T shows: no terrain fill, with hex codes
 * and tech icons.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the choices and their starting values the same way.
 * When to use: Where the renderer stores or reads the choices, and where it decides whether the inspection view is on.
 * Expected outcome: Plain constants and one pure function.
 * Exceptions: None.
 */

/**
 * Whether weather icons show when the app opens.
 *
 * Purpose: The map shows each hex's weather until the player turns Weather off; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Weather choice.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_WEATHER_ICONS_SHOWN = true;

/**
 * Whether the Tech view is on when the app opens.
 *
 * Purpose: The app opens on the normal map; the player's choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Tech choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_TECH_VIEW_CHOSEN = false;

/**
 * Decides whether the map shows its inspection view: no terrain fill, and on the world map the hex codes and tech icons.
 *
 * Purpose: Holding T shows that view everywhere, as before. Turning Tech on keeps it on, but only on the world map: a
 *   battle and the new-game preview keep their normal view, and Tech applies again when they close. Weather does not
 *   take part: its icons follow their own toggle in either view.
 * When to use: Wherever the renderer used to ask whether T is held. `tKeyHeld` is true while the player holds T,
 *   `techViewChosen` while Tech is on, `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the
 *   new-game or game-over overlay is open.
 * Expected outcome: True while T is held, or while Tech is on outside a battle and outside the new-game or game-over
 *   overlay.
 * Exceptions: None.
 */
export function isTerrainInspectionShown(input: {
  readonly tKeyHeld: boolean;
  readonly techViewChosen: boolean;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.techViewChosen && !input.inBattle && !input.newGameOverlayOpen;
}
