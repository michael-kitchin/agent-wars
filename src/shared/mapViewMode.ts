/**
 * The map views the mode tabs offer. Weather is the map as it always looked; Tech keeps the view that holding T
 * shows: no terrain fill, with hex codes and tech icons.
 *
 * Purpose: The mode tabs, the drawing code, and the tests name the views the same way.
 * When to use: Where the renderer stores or reads the chosen view.
 * Expected outcome: `'weather'` or `'tech'`.
 * Exceptions: None.
 */
export type MapViewMode = 'weather' | 'tech';

/**
 * The view a session starts with.
 *
 * Purpose: The app opens on the normal map; the player's choice lasts until the app closes.
 * When to use: The initial value of the renderer's stored view.
 * Expected outcome: `'weather'`.
 * Exceptions: None.
 */
export const DEFAULT_MAP_VIEW_MODE: MapViewMode = 'weather';

/**
 * Decides whether the map shows its inspection view: no terrain fill, and on the world map the hex codes and tech icons.
 *
 * Purpose: Holding T shows that view everywhere, as before. Choosing Tech in the mode tabs keeps it on, but only on
 *   the world map: a battle and the new-game preview keep their normal view, and Tech applies again when they close.
 * When to use: Wherever the renderer used to ask whether T is held. `tKeyHeld` is true while the player holds T,
 *   `inBattle` while a tactical battle is open, and `newGameOverlayOpen` while the new-game or game-over overlay is open.
 * Expected outcome: True while T is held, or while Tech is chosen outside a battle and outside the new-game or game-over overlay.
 * Exceptions: None.
 */
export function isTerrainInspectionShown(input: {
  readonly tKeyHeld: boolean;
  readonly mapViewMode: MapViewMode;
  readonly inBattle: boolean;
  readonly newGameOverlayOpen: boolean;
}): boolean {
  if (input.tKeyHeld) return true;
  return input.mapViewMode === 'tech' && !input.inBattle && !input.newGameOverlayOpen;
}
