/**
 * Whether names and borders follow the preview or the loaded match.
 *
 * Purpose: One reader for the label pass and the border layers, so a battle under the new-game screen does not choose their view.
 * When to use: The preview module writes the latch. The label pass and the border reader call `mapAnnotationsUseDetailView`.
 * Expected outcome: An open overlay uses the preview latch. A closed overlay reads the match flag, and that read can change the flag.
 * Exceptions: None.
 */

import { annotationViewIsDetail } from '../../shared/mapLabelRules';
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';
import { shouldRenderTacticalHexes } from './terrainView';

/**
 * Whether the preview is zoomed far enough that one of its strategic hexes fills the view.
 *
 * Purpose: Weather and tech icons hide at that zoom, and names and borders use the same latch. The loaded match's zoom flag must stay untouched.
 * When to use: `mapAnnotationsUseDetailView` and the preview zoom test. Cleared when the dialog opens and when it switches maps.
 * Expected outcome: Stays on until the sample hex falls to the hide threshold, then stays off until the show threshold.
 * Exceptions: None.
 */
let previewAtDetailZoom = false;

/**
 * Reads the preview's detail latch.
 *
 * Purpose: The preview zoom test and the annotation reader share this value.
 * When to use: When applying the preview hysteresis, and when deciding the annotation view.
 * Expected outcome: True while the preview is at detail zoom.
 * Exceptions: None.
 */
export function isNewGameMapPreviewAtDetailZoom(): boolean {
  return previewAtDetailZoom;
}

/**
 * Sets the preview's detail latch.
 *
 * Purpose: The preview owns the hysteresis. Callers outside that test only clear it.
 * When to use: When the preview hex crosses a threshold, when the dialog opens, and when it switches maps.
 * Expected outcome: Later reads return `atDetailZoom`.
 * Exceptions: None.
 */
export function setNewGameMapPreviewAtDetailZoom(atDetailZoom: boolean): void {
  previewAtDetailZoom = atDetailZoom;
}

/**
 * Whether names and borders use the detail view for this frame.
 *
 * Purpose: The overlay follows its own preview. A closed overlay follows the match, and that read can change the match flag.
 * When to use: Once per label frame, and as the border layer's tactical reader.
 * Expected outcome: The preview latch while the new-game or game-over overlay is open. Otherwise the match's detail flag.
 * Exceptions: None. The match flag is not read while the overlay is open.
 */
export function mapAnnotationsUseDetailView(): boolean {
  return annotationViewIsDetail({
    overlayOpen: isNewGameOverlayOpen(),
    previewAtDetailZoom,
    readMatchDetailView: shouldRenderTacticalHexes,
  });
}
