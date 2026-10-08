import type { MapExtentBox } from '../../shared/mapExtent';
import type { NewGameMapPreviewRequest } from '../../shared/newGameMapPreviewTypes';
import { applyLoadedMapExtent } from '../map/mapExtent';
import {
  noteNewGameMapPreviewRequest,
  repaintNewGameMapPreview,
  resetNewGameMapPreviewZoom,
  storeNewGameMapPreview,
} from '../map/newGameMapPreviewRendering';
import { getSelectedScenarioRegions } from './newGameRegionUi';

/**
 * One dialog reading that can be sent to the preview builder.
 *
 * Purpose: The tab and the combos decide both the IPC body and the map id used to drop a stale grid.
 * When to use: `refreshNewGameMapPreview`.
 * Expected outcome: Global always has a request. Regional is absent until the region and both sides have values.
 * Exceptions: None.
 */
interface PreviewDialogRequest {
  /**
   * Map id currently chosen.
   *
   * Contract: `global` or a regional pack id.
   * When to use: `noteNewGameMapPreviewRequest`.
   * Expected outcome: Matches `request` for that tab.
   * Exceptions: None.
   */
  readonly gameMapId: string;
  /**
   * IPC body for that choice.
   *
   * Contract: A `NewGameMapPreviewRequest`.
   * When to use: `gameApi.newGameMapPreview`.
   * Expected outcome: The builder returns a payload for `gameMapId`.
   * Exceptions: None.
   */
  readonly request: NewGameMapPreviewRequest;
}

/**
 * Latest preview request started from the dialog.
 *
 * Purpose: A slower response for an earlier combo change must not replace a newer one.
 * When to use: `refreshNewGameMapPreview`.
 * Expected outcome: Incremented once per refresh. A response whose number is older is ignored.
 * Exceptions: None.
 */
let requestSerial = 0;

/**
 * Extent last framed for this opening of the dialog.
 *
 * Purpose: A home change must move the highlight without snapping the camera back to the fit.
 * When to use: `refreshNewGameMapPreview`. Cleared by `resetNewGameMapPreviewFrame` when the dialog opens.
 * Expected outcome: Null until the first successful fit of this opening. Equal keys skip the fit.
 * Exceptions: None.
 */
let framedExtentKey: string | null = null;

/**
 * True after Start has claimed the camera and before that attempt ends or the dialog opens again.
 *
 * Purpose: Start fits the match while the overlay is still open. A preview reply in that gap must not replace those bounds.
 * When to use: `refreshNewGameMapPreview` before it stores or fits. Set by `holdNewGameMapPreviewCamera`.
 * Expected outcome: Preview replies keep the match camera until the attempt fails or the dialog opens again.
 * Exceptions: None.
 */
let mapCameraHeldForStart = false;

/**
 * Identifies the Start attempt that currently holds the camera.
 *
 * Purpose: A failed earlier click must not release a later Start that is still running.
 * When to use: `holdNewGameMapPreviewCamera` and `releaseNewGameMapPreviewCamera`.
 * Expected outcome: Incremented once per Start click. A release for an older number does nothing.
 * Exceptions: None.
 */
let mapCameraHoldSerial = 0;

/**
 * Forgets the last framed extent so the next preview fits the camera again.
 *
 * Purpose: Opening the dialog must frame its map even when that map was already framed last time.
 * When to use: When the overlay goes from hidden to shown, before the preview request.
 * Expected outcome: The next successful preview fits. Later home changes on that same extent do not. A Start hold from the previous opening is cleared.
 * Exceptions: None.
 */
export function resetNewGameMapPreviewFrame(): void {
  framedExtentKey = null;
  mapCameraHeldForStart = false;
  resetNewGameMapPreviewZoom();
}

/**
 * Stops preview replies from moving the camera while Start is fitting the match.
 *
 * Purpose: The overlay stays open until Start finishes, and the match fit happens before that.
 * When to use: At the beginning of a Start click, before `newGame` is awaited.
 * Expected outcome: The returned serial releases this hold. Preview refreshes until then do not store or fit.
 * Exceptions: None.
 */
export function holdNewGameMapPreviewCamera(): number {
  mapCameraHeldForStart = true;
  mapCameraHoldSerial += 1;
  return mapCameraHoldSerial;
}

/**
 * Returns the camera to the dialog after the Start attempt that holds it has failed.
 *
 * Purpose: A failed start leaves the overlay open, so the preview has to frame the dialog's map again.
 * When to use: The Start click's failure path, with the serial from `holdNewGameMapPreviewCamera`.
 * Expected outcome: True when this attempt still holds the camera. The framed extent is forgotten so the next preview fits. False when a newer Start replaced this one.
 * Exceptions: None.
 */
export function releaseNewGameMapPreviewCamera(holdSerial: number): boolean {
  if (holdSerial !== mapCameraHoldSerial) return false;
  mapCameraHeldForStart = false;
  framedExtentKey = null;
  return true;
}

/**
 * Loads the preview for the tab and homes currently shown.
 *
 * Purpose: Opening the dialog, changing a tab, or changing a home area must frame that map and paint its grid.
 * When to use: After those controls settle. Month and weather-bonus changes call `repaintNewGameMapPreview` instead.
 * Expected outcome: The camera fits when the extent changes or the dialog has just opened. A home change on the same extent only repaints. A regional choice with a missing id paints nothing and does not call IPC. A failure logs and leaves a same-map payload in place. A response that arrives after the dialog closes, or while Start holds the camera, does not move the match.
 * Exceptions: None. IPC failures are logged.
 */
export async function refreshNewGameMapPreview(): Promise<void> {
  if (mapCameraHeldForStart) return;
  const serial = ++requestSerial;
  const built = readPreviewDialogRequest();
  if (!built) {
    noteNewGameMapPreviewRequest('');
    return;
  }
  noteNewGameMapPreviewRequest(built.gameMapId);
  const load = window.gameApi?.newGameMapPreview;
  if (!load) {
    console.error('new game map preview failed: gameApi.newGameMapPreview is missing');
    return;
  }
  try {
    const preview = await load(built.request);
    if (serial !== requestSerial || !newGameOverlayOpen() || mapCameraHeldForStart) return;
    if (!storeNewGameMapPreview(preview)) return;
    const key = extentKey(preview.extent);
    if (key !== framedExtentKey && applyLoadedMapExtent(preview.extent, true)) framedExtentKey = key;
    repaintNewGameMapPreview();
  } catch (err) {
    if (serial !== requestSerial) return;
    console.error('new game map preview failed', err);
  }
}

/**
 * Reads the tab and the home combos.
 *
 * Purpose: Setting a combo's index does not fire `change`, so the refresh reads the values itself.
 * When to use: The start of `refreshNewGameMapPreview`.
 * Expected outcome: A global request, a regional request, or null when a regional id is missing.
 * Exceptions: None.
 */
function readPreviewDialogRequest(): PreviewDialogRequest | null {
  const regional = document.getElementById('new-game-tab-regional')?.getAttribute('aria-selected') === 'true';
  if (!regional) {
    const homes = getSelectedScenarioRegions();
    return {
      gameMapId: 'global',
      request: {
        scope: 'global',
        humanHomeRegion: homes.humanHomeRegion,
        aiHomeRegion: homes.aiHomeRegion,
      },
    };
  }
  const gameMapId = selectValue('new-game-region-select');
  const humanSideGroupId = selectValue('new-game-human-side-select');
  const aiSideGroupId = selectValue('new-game-ai-side-select');
  if (!gameMapId || !humanSideGroupId || !aiSideGroupId) return null;
  return {
    gameMapId,
    request: { scope: 'regional', gameMapId, humanSideGroupId, aiSideGroupId },
  };
}

/**
 * Reads one select's current value.
 *
 * Purpose: The regional preview uses the region combo and the two side combos.
 * When to use: `readPreviewDialogRequest`.
 * Expected outcome: The value, or an empty string when the control is missing.
 * Exceptions: None.
 */
function selectValue(id: string): string {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  return select?.value ?? '';
}

/**
 * Reports whether the new-game overlay is showing.
 *
 * Purpose: A preview that finishes after Start must not frame the map the match just took.
 * When to use: Before storing a preview or fitting its extent.
 * Expected outcome: True while `#game-over-overlay` is visible.
 * Exceptions: None.
 */
function newGameOverlayOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}

/**
 * Builds a stable key for one preview extent.
 *
 * Purpose: Home changes reuse the same box, so the camera can stay where the player left it.
 * When to use: Comparing the payload extent with `framedExtentKey`.
 * Expected outcome: `'world'`, or the box edges and reference longitude.
 * Exceptions: None.
 */
function extentKey(extent: 'world' | MapExtentBox): string {
  if (extent === 'world') return 'world';
  return [extent.south, extent.west, extent.north, extent.east, extent.referenceLng].join(',');
}
