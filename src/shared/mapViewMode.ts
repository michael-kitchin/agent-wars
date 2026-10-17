/**
 * The map's layer choices in the minimap panel's map-mode tabs, each a toggle on its own: Weather shows or hides the
 * weather icons, Tech the tech tier icons, Control the borders that mark who controls each hex and the home-region
 * outlines, and Production the production labels on every world hex. Holding T is separate: while the key is down it
 * hides terrain fill and shows hex codes, the tech icons, and every production label.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the choices and their starting values the same way.
 * When to use: Where the renderer stores or reads the choices, and where it decides whether a chosen layer shows.
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
 * Whether Tech is on when the app opens.
 *
 * Purpose: The app opens with the tech icons hidden until T is held or Tech is turned on; the choice lasts until the
 *   app closes.
 * When to use: The initial value of the renderer's stored Tech choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_TECH_VIEW_CHOSEN = false;

/**
 * Whether Control is on when the app opens.
 *
 * Purpose: Who holds each hex is part of the normal map, so the control borders show until the player turns Control
 *   off; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Control choice.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_CONTROL_BORDERS_SHOWN = true;

/**
 * Whether Production is on when the app opens.
 *
 * Purpose: The app opens showing production only on the player's own hexes; the choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored Production choice.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const DEFAULT_PRODUCTION_DETAIL_CHOSEN = false;

/**
 * Decides whether a layer that holding T also shows is on screen: the tech icons, or production on every hex.
 *
 * Purpose: Holding T shows these layers everywhere, as before. Turning a layer's tab on keeps it on, but only on the
 *   world map: a battle and the new-game preview keep their normal view, and the choice applies again when they close.
 * When to use: For the Tech and Production layers. `tKeyHeld` is true while the player holds T, `layerChosen` while
 *   that layer's tab is on, `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the new-game or
 *   game-over overlay is open.
 * Expected outcome: True while T is held, or while the layer is chosen outside a battle and outside that overlay.
 * Exceptions: None.
 */
export function isMapLayerShown(input: {
  readonly tKeyHeld: boolean;
  readonly layerChosen: boolean;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.layerChosen && !input.inBattle && !input.newGameOverlayOpen;
}
