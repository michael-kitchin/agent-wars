/**
 * Closes the beat-limit notice after a short wait.
 *
 * Purpose: An observer who is auto-advancing sees the reason, then the battle ends without a click.
 * When to use: After the timed notice opens, and whenever that overlay closes another way.
 * Expected outcome: One timer. Canceling when none is scheduled does nothing.
 * Exceptions: None.
 */

import { AI_ONLY_BEAT_LIMIT_NOTICE_MS, aiOnlyTimedNoticeStillCloses } from '../../shared/aiOnlyBeatLimit';
import { rendererSharedState as S } from '../core/state';

/**
 * The pending close, or null when the notice is not counting down.
 *
 * Purpose: Ok, a new match, and a second schedule must not leave an old timer running.
 * When to use: `scheduleAiOnlyResultAutoClose` and `cancelAiOnlyResultAutoClose`.
 * Expected outcome: A timeout handle, or null.
 * Exceptions: None.
 */
let aiOnlyResultAutoCloseHandle: ReturnType<typeof setTimeout> | null = null;

/**
 * Starts the wait that closes the beat-limit notice.
 *
 * Purpose: The notice stays up for `AI_ONLY_BEAT_LIMIT_NOTICE_MS`, then ends the battle when auto-advance is still on.
 * When to use: After the timed notice opens.
 * Expected outcome: Any earlier timer is canceled. When this one fires, a missing sentence or an unticked checkbox leaves the dialog for Ok. Otherwise `onElapsed` runs.
 * Exceptions: None.
 */
export function scheduleAiOnlyResultAutoClose(onElapsed: () => void): void {
  cancelAiOnlyResultAutoClose();
  aiOnlyResultAutoCloseHandle = setTimeout(() => {
    aiOnlyResultAutoCloseHandle = null;
    if (!aiOnlyTimedNoticeStillCloses(S.aiOnlyBattleResultSentence, S.autoAdvance)) return;
    onElapsed();
  }, AI_ONLY_BEAT_LIMIT_NOTICE_MS);
}

/**
 * Stops a pending close.
 *
 * Purpose: Ok, a failed path that still closes the overlay, and a new match must not close a later dialog.
 * When to use: Before leaving the battle from Ok, and as the first step of closing the overlay.
 * Expected outcome: No timer remains. A call with nothing scheduled returns.
 * Exceptions: None.
 */
export function cancelAiOnlyResultAutoClose(): void {
  if (aiOnlyResultAutoCloseHandle == null) return;
  clearTimeout(aiOnlyResultAutoCloseHandle);
  aiOnlyResultAutoCloseHandle = null;
}
