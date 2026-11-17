/**
 * Replay's follow-units camera.
 *
 * Purpose: While the replay panel's follow-units toggle is on, each step replay shows fits the camera to that step's visible units, with the same fit the automatic watch uses. Only the gate differs.
 * When to use: After a replay step is on screen, and when the toggle changes.
 * Expected outcome: The camera moves only while the toggle and replay are both on.
 * Exceptions: None. A failed fit is logged in `unitFrameCamera.ts`.
 */

import { rendererSharedState as S } from '../core/state';
import { tacticalBattleAreaFrameBox } from '../map/tacticalMapView';
import { fitBattleUnitsNow, fitStrategicUnitsNow } from '../map/unitFrameCamera';
import { replayActive } from './replayState';

/**
 * Fits the camera to the units of the step on screen when follow-units is on.
 *
 * Purpose: One call per shown step: Step back, Step forward, the turn field, the slider's previews and release, and each played step.
 * When to use: After the step is presented, and for a played step after its animation ends. Never inside `presentReplayStep`, so no step is framed twice.
 * Expected outcome: Nothing unless `S.replayFollowUnits` and replay are both on. Over a replayed beat (`S.tacticalBattleSnapshot` set), the camera fits the beat's sub-units inside the battle area. Otherwise it fits every unit in the replayed snapshot, which is already filtered to the replay's view. No units, or no battle area, leaves the camera where it is.
 * Exceptions: None.
 */
export function frameReplayStepIfFollowing(): void {
  if (!S.replayFollowUnits || !replayActive()) return;
  const battle = S.tacticalBattleSnapshot;
  if (battle) {
    const limit = tacticalBattleAreaFrameBox(battle.tacticalChildH3Indexes);
    if (!limit) return;
    fitBattleUnitsNow(battle.subUnits.map((unit) => unit.h3Index).filter((index) => index.length > 0), limit);
    return;
  }
  const units = S.gameState?.units ?? [];
  fitStrategicUnitsNow(units.map((unit) => unit.h3Index).filter((index) => index.length > 0));
}

/**
 * Turns follow-units on or off.
 *
 * Purpose: The replay panel's toggle. Turning it on fits the step already on screen at once.
 * When to use: On a click on `#replay-follow-units`.
 * Expected outcome: `S.replayFollowUnits` is `on`. When `on` is true and replay is on, the camera fits the step on screen. Turning it off leaves the camera where it is.
 * Exceptions: None.
 */
export function setReplayFollowUnits(on: boolean): void {
  S.replayFollowUnits = on;
  if (on) frameReplayStepIfFollowing();
}
