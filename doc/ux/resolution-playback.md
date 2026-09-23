# Resolution Playback

The animation of a turn or a battle beat after it resolves.

## Purpose

Show movement and combat that just resolved, including battles the player cannot see.

## Availability

Runs in Resolution playback after strategic Ready or a tactical Ready commit, when that resolution has movement or combat to show. It ends when the animation finishes. Entering a tactical battle cancels a strategic playback that is still running. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

The player sees the following stages, skipping any stage the resolution does not have:

- Air units move out, air combat, air casualties, then air units return.
- Ranged combat, then ranged casualties.
- Movement.
- Melee combat, then melee casualties.

The engine's resolution order is in the [combat rules](../combat-rules-v3.md). This list is the on-screen order.

A map toast can summarize losses the player can see. Combat outside vision is announced as an unknown battle, with continent names when those names are known. See [notifications-and-feedback.md](notifications-and-feedback.md).

## Inputs and Responses

### Mouse

- The animation does not have its own controls.
- While playback runs, map gestures that change orders or the selection are ignored. That covers unit clicks and Shift-clicks, opening the stack callout, Ranged and Strike target clicks, double-click march and ferry, and build marker clicks and build queue edits. Hover order previews are not drawn.
- While playback runs, the player can still drag to pan, zoom with the wheel, read hex tooltips, and right-click to clear selection chrome. A tactical entry marker still starts a battle, which cancels a strategic playback.
- The right panel is not blocked by playback. Its own rules apply.

### Keyboard

- Pan keys still follow [input-map.md](input-map.md). There is no skip key.
- Escape still closes popups.

### Other

- When playback was scheduled together with a deferred opponent consultation, Ready stays disabled until that consultation is released, including after the animation ends.
- When there is nothing to animate, a waiting consultation is released immediately.

## States

- Idle: no animation.
- Playing: one or more stages are on screen. The game-state readout can already show the next planning turn.
- Finished: the animation is cleared and Strategic planning or Tactical planning continues.

## Invariants

- Playback never starts when the resolution has no movement and no combat to show.
- Starting a tactical battle never leaves a strategic playback running.
- A map gesture during playback never queues, changes, or cancels an order, and never changes the unit selection except by right-click.
- Unknown battles are never described as if the player could see the units.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| What plays | The strategic turn, on the world map | The battle beat, on the battle map |
| Afterward | Strategic planning, or a battle if Fight started one | Tactical planning, or Tactical annihilation if a side is gone |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [map-overlays.md](map-overlays.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

- **Map orders are accepted during playback.** Required: while playback runs, map gestures that change orders or the selection are ignored, and pan, zoom, hex tooltips, and right-click stay available. Current: only some hover previews are suppressed, so the player can select units, target, double-click orders, and edit build queues while the previous turn is still animating. Entry point: `src/renderer/map/mainMapInteractions.ts`.

## Open Questions

None.

## Code Entry Points

- `src/renderer/rendering/resolutionPlayback.ts`
- `src/renderer/rendering/resolutionCombatOverlays.ts`
- `src/renderer/openRouter/resolutionPlaybackDeferral.ts`
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/turnUpdateSummary.ts`
