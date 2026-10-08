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

Dice chips show every die rolled in air combat, ranged combat, and melee combat. A phase's chips appear with its combat lightning and stay up for twice the time from that lightning through its casualties. They can still be up during later stages, and playback keeps running after the last stage until they fade. They are drawn above every other playback layer.

- Each chip hangs just below the stack it belongs to, and is pulled back inside the map near the edges. Ranged and return-fire rolls sit under the stack that fired. Air strike, anti-air, and infrastructure counter-fire rolls sit under the struck hex. Melee attack and defense rolls sit under the contested hex.
- Each row shows a tag, then who rolled, then the faces, then the hit number. The tag is ATK for attacks, DEF for melee defense, RET for return fire, and AA for anti-air and infrastructure counter-fire. Who rolled is a small token in the player's color with the unit glyph, or City, Airport, or Port for infrastructure. A face at or below the hit number is a hit and is drawn in green; a miss is drawn in gray-blue. The hit number is shown as `≤N`.
- Attack rows come first, then return fire, melee defense, and anti-air. Within a kind, the player's rows come before the AI's, then infantry, armor, naval, and air. Where chips overlap, the lower chip on screen is drawn on top.
- Rolls of the same kind, player, unit type, and hit number share a row. A row with more than three rolls shows a tally such as `2/5 ≤3` (hits, then rolls) instead of each face.
- A chip shows at most four lines. When it has more rows, it shows three of them and a final `+N more` line.

A map toast can summarize losses the player can see. Combat outside vision is announced as an unknown battle, with continent names when those names are known. See [notifications-and-feedback.md](notifications-and-feedback.md).

## Inputs and Responses

### Mouse

- The animation does not have its own controls.
- While playback runs, map gestures that change orders or the selection are ignored. That covers unit clicks and Shift-clicks, opening the stack callout, Ranged and Strike target double-clicks, double-click march and ferry, and build marker clicks and build queue edits. Hover order previews are not drawn.
- While playback runs, the player can still drag to pan, zoom with the wheel, read hex tooltips, and right-click to clear selection chrome. A tactical entry marker still starts a battle, which cancels a strategic playback. Build markers and tactical entry markers are hidden while dice chips are showing, so a tactical entry marker can't be clicked then. Both come back when the chips fade.
- The right panel is not blocked by playback. Its own rules apply.

### Keyboard

- Pan keys still follow [input-map.md](input-map.md). There is no skip key.
- Escape still closes popups.

### Other

- When playback was scheduled together with a deferred opponent consultation, Ready stays disabled until that consultation is released, including after the animation ends. The label stays "Ready" during the animation. When the animation ends and the consultation starts, the label switches to the AI wait label. It returns to "Ready" when the consultation's result arrives, unless a battle is already in planning. In that case the battle's opponent-plan request starts at the same moment, and the AI wait label continues until that plan is buffered. A discarded push whose turn no longer matches starts that battle request as well. A consultation that ends with standing orders and no model call shows the strategic wait only briefly. Log lines, including error lines, never stop that timer. A finished strategic consultation is the opponent plan for the next turn. It does not start another strategic planning request.
- When there is nothing to animate, a waiting consultation is released immediately.

## States

- Idle: no animation.
- Playing: one or more stages are on screen, or dice chips are still fading after the last stage. The game-state readout can already show the next planning turn.
- Finished: the animation is cleared and Strategic planning or Tactical planning continues.

## Invariants

- Playback never starts when the resolution has no movement and no combat to show.
- Starting a tactical battle never leaves a strategic playback running.
- A map gesture during playback never queues, changes, or cancels an order, and never changes the unit selection except by right-click.
- Unknown battles are never described as if the player could see the units.
- Dice chips never appear on a hex that was outside the player's vision both before and after the turn, or on an unknown battle hex. A stack that dies on a hex that then leaves vision still shows its dice.
- Dice chips never take input. They do not change when the other stages play, and playback continues after those stages until the chips fade.
- Build markers and tactical entry markers never cover dice chips.
- Dice chips are not drawn on the strategic map while it is zoomed in far enough to hide strategic units.
- A unit removed during the air-strike stage, including by anti-air or infrastructure counter-fire, stays on the map through that stage's destruction mark and is not drawn again, including on the flight home. A unit removed by ranged fire, including return fire, stays through the ranged destruction mark and is not drawn from movement onward. A failed ferry does not glide. A melee victim stays through the melee destruction mark and is drawn moving only when the removal hex is the march destination. A removed icon is not drawn on an unknown casualty hex. A survivor on that hex stays. Dice chips can continue after the icon is gone.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| What plays | The strategic turn, on the world map | The battle beat, on the battle map |
| Dice chips | Under hexes in the player's vision before or after the turn only, and not at the zoom that hides strategic units | Under every battle cell that rolled, because battles have no fog |
| Afterward | Strategic planning, or a battle if Fight started one | Tactical planning, or Tactical annihilation if a side is gone |

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [map-overlays.md](map-overlays.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `src/renderer/rendering/resolutionPlayback.ts`
- `src/shared/resolutionCasualtyDraw.ts`
- `src/renderer/map/drawInteraction.ts`
- `src/renderer/rendering/gameScene.ts` (`drawGameScene`, `tickResolutionMoveAnimation`)
- `src/renderer/rendering/resolutionCombatOverlays.ts`
- `src/renderer/rendering/combatDiceChipDrawing.ts`
- `src/shared/combatDiceChips.ts`
- `src/main/combatDiceRecording.ts`
- `src/renderer/openRouter/resolutionPlaybackDeferral.ts`
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyResolutionAnnouncements.ts`
- `src/renderer/gameplay/turnUpdateSummary.ts`
