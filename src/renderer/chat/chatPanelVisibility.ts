/**
 * Shows and hides the chat panel from match, playback, and map-toast state.
 *
 * Purpose: The panel leaves the corner while a turn update or an error toast is using it, while playback is running, and while turns start on their own.
 * When to use: After the map toast shows or hides, after resolution playback starts or ends, and after the panel redraws.
 * Expected outcome: `#chat-panel`'s `hidden` attribute matches `chatPanelShouldShow`, including while automatic turns are on. The text field blurs when the panel hides under it.
 * Exceptions: None. A missing panel is skipped. This module does not import the panel or the toast helpers.
 */

import { chatPanelShouldShow } from '../../shared/chatPanelState';
import { rendererSharedState as S } from '../core/state';
import { layoutMapChrome } from '../map/mapChromeLayout';
import { replayActive } from '../replay/replayState';

/**
 * Sets the panel's `hidden` attribute from the match, playback, the map toast, and automatic turns.
 *
 * Purpose: Playback, the update toast, and a staging-failure toast each take the corner.
 * When to use: At the end of `showMapToast` and `hideMapToast`, after each resolution-playback assignment, and at the end of `renderChatPanel`.
 * Expected outcome: The panel is shown only when a match is loaded, playback is idle, `#map-toast` has the class `hidden`, and the auto-advance checkbox is off. A field that had focus is blurred when the panel hides. `layoutMapChrome` runs after the attribute changes.
 * Exceptions: None. A missing panel is skipped.
 */
export function syncChatPanelVisibility(): void {
  const panel = document.getElementById('chat-panel');
  if (!(panel instanceof HTMLElement)) return;
  const toast = document.getElementById('map-toast');
  const show = chatPanelShouldShow({
    matchLoaded: (S.gameState?.seats?.length ?? 0) > 0,
    playbackRunning: S.resolutionMoveAnimation != null,
    mapToastShowing: toast != null && !toast.classList.contains('hidden'),
    autoAdvance: S.autoAdvance,
    replayActive: replayActive(),
  });
  const field = document.getElementById('chat-panel-input');
  if (!show && field instanceof HTMLElement && document.activeElement === field) field.blur();
  if (show) panel.removeAttribute('hidden');
  else panel.setAttribute('hidden', '');
  layoutMapChrome();
}
