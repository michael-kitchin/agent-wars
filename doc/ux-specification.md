# UX Specification

This suite states the functional UX requirements of the Agent Wars desktop UI for people and coding agents changing it.

## Authority

This suite is normative for the user-visible behavior of the Agent Wars desktop UI: what each element shows, which inputs it accepts, and how it responds. When renderer code disagrees with a requirement here, the disagreement is either a bug in the code or an intended behavior change. Either way, the change that alters behavior must also update the affected document. Each document's Known Deviations section lists disagreements that are already known and accepted as bugs; check it before "fixing" code to match the spec.

Game mechanics (numbers, legality rules, resolution order, caps) are not defined here. They are governed by the mechanics documents listed in [README.md](README.md), where the engine remains the first authority. UX documents link to those documents instead of restating them.

Visual styling and the arrangement of items inside an element are out of scope. See [ui-style-guide.md](ui-style-guide.md).

## How to Use This Suite

1. Find the element you're changing in the routing table below.
2. Read the cross-cutting documents it lists, then the element document.
3. Check Known Deviations before treating a spec and code mismatch as a bug.
4. If your change alters user-visible behavior, update the requirement text in the same change.
5. If the spec is silent or ambiguous, add an Open Question rather than inventing a requirement.

## Routing Table

| If you are changing | Read first | Then read |
| --- | --- | --- |
| Map pan, zoom, or clicks | [modes-and-transitions.md](ux/modes-and-transitions.md), [input-map.md](ux/input-map.md), [selection-model.md](ux/selection-model.md) | [map-surface.md](ux/map-surface.md) |
| Range, path, order, or combat drawings | [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [map-overlays.md](ux/map-overlays.md) |
| The minimap | [map-surface.md](ux/map-surface.md) | [minimap.md](ux/minimap.md) |
| The terrain legend or terrain style | [map-surface.md](ux/map-surface.md) | [terrain-legend.md](ux/terrain-legend.md) |
| Hex or order tooltips | [order-lifecycle.md](ux/order-lifecycle.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [hex-tooltips.md](ux/hex-tooltips.md) |
| A button, field, checkbox, or dropdown tip | [control-tooltips.md](ux/control-tooltips.md) | the element document for that control |
| The stack callout | [selection-model.md](ux/selection-model.md), [input-map.md](ux/input-map.md) | [stack-callout.md](ux/stack-callout.md) |
| Single-hex build | [input-map.md](ux/input-map.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [build-popup.md](ux/build-popup.md) |
| Multi-hex build | [build-popup.md](ux/build-popup.md) | [multi-hex-build-popup.md](ux/multi-hex-build-popup.md) |
| The right panel as a whole | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel.md](ux/right-panel.md) |
| Ready, Ranged, or Strike | [selection-model.md](ux/selection-model.md), [order-lifecycle.md](ux/order-lifecycle.md), [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-command-bar.md](ux/right-panel-command-bar.md) |
| Selected unit or order lists | [order-lifecycle.md](ux/order-lifecycle.md), [selection-model.md](ux/selection-model.md) | [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md) |
| The Tools tab | [modes-and-transitions.md](ux/modes-and-transitions.md) | [right-panel-tools-tab.md](ux/right-panel-tools-tab.md) |
| API key, model, reasoning effort, Run, New, or Tactical battles | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [right-panel-model-tab.md](ux/right-panel-model-tab.md) |
| The AI activity log | [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [ai-activity-log.md](ux/ai-activity-log.md) |
| New game or game over | [modes-and-transitions.md](ux/modes-and-transitions.md) | [new-game-dialog.md](ux/new-game-dialog.md) |
| Turn or beat animation | [modes-and-transitions.md](ux/modes-and-transitions.md), [notifications-and-feedback.md](ux/notifications-and-feedback.md) | [resolution-playback.md](ux/resolution-playback.md) |
| Tactical entry markers | [modes-and-transitions.md](ux/modes-and-transitions.md) | [tactical-entry-markers.md](ux/tactical-entry-markers.md) |
| Fight or Ignore | [modes-and-transitions.md](ux/modes-and-transitions.md), [input-map.md](ux/input-map.md) | [tactical-battles-list.md](ux/tactical-battles-list.md) |
| Exit Battle or annihilation | [modes-and-transitions.md](ux/modes-and-transitions.md) | [tactical-battle-controls.md](ux/tactical-battle-controls.md) |

## Document Structure

Element documents share a fixed heading set:

- Purpose
- Availability
- Information Displayed
- Inputs and Responses
- States
- Invariants
- Strategic and Tactical Differences
- Related Documents
- Known Deviations
- Open Questions
- Code Entry Points

## Cross-Cutting Documents

- [modes-and-transitions.md](ux/modes-and-transitions.md): application modes, what triggers each transition, and what state carries across.
- [selection-model.md](ux/selection-model.md): how units and hexes become selected, and what clears or keeps a selection.
- [input-map.md](ux/input-map.md): every global mouse and keyboard binding, and precedence between them.
- [order-lifecycle.md](ux/order-lifecycle.md): how orders go from draft to preview, commit, and resolution, and the feedback at each step.
- [notifications-and-feedback.md](ux/notifications-and-feedback.md): which surface reports which kind of message, plus the map toasts.

## Element Documents

- [map-surface.md](ux/map-surface.md): the world map as the workspace for pan, zoom, selection, and orders.
- [map-overlays.md](ux/map-overlays.md): range, path, order, hover, city, transport, infrastructure, and resolution drawings on the map.
- [minimap.md](ux/minimap.md): the world overview and how it relates to the main map view.
- [terrain-legend.md](ux/terrain-legend.md): the terrain legend and any inputs it accepts.
- [hex-tooltips.md](ux/hex-tooltips.md): the hover information tooltip, whose Effects line includes movement, range, and cover, and the blocked-order and effects tooltips that appear after the pointer rests. The effects tooltip then stays on that cell. The blocked notice hides a short time after the pointer stops.
- [control-tooltips.md](ux/control-tooltips.md): the one-second tip on buttons, fields, checkboxes, and dropdowns, and the controls that have none.
- [stack-callout.md](ux/stack-callout.md): the list of units in a hex, the Bonuses tooltip, and how the list changes the selection.
- [build-popup.md](ux/build-popup.md): the single-hex build queue popup and the markers that open it.
- [multi-hex-build-popup.md](ux/multi-hex-build-popup.md): the build queue popup used when several build hexes are selected together.
- [right-panel.md](ux/right-panel.md): the right panel as a whole, including tab switching.
- [right-panel-command-bar.md](ux/right-panel-command-bar.md): game state readout, Ready, Ranged, and air strike controls.
- [right-panel-selection-and-orders.md](ux/right-panel-selection-and-orders.md): the selected-unit readout and the movement, ranged, and air-strike lists.
- [right-panel-tools-tab.md](ux/right-panel-tools-tab.md): the Tools tab and its tool list.
- [right-panel-model-tab.md](ux/right-panel-model-tab.md): API key, model, reasoning effort, Run, New, the Tactical battles checkbox, and the model description tooltip.
- [ai-activity-log.md](ux/ai-activity-log.md): the log of AI interactions and errors.
- [new-game-dialog.md](ux/new-game-dialog.md): the overlay used to start a game and to show game over.
- [resolution-playback.md](ux/resolution-playback.md): the animated replay of turn resolution and the inputs it blocks.
- [tactical-entry-markers.md](ux/tactical-entry-markers.md): markers on contested hexes that lead into a tactical battle.
- [tactical-battles-list.md](ux/tactical-battles-list.md): the list of melee hexes where the player chooses to fight or ignore.
- [tactical-battle-controls.md](ux/tactical-battle-controls.md): Exit Battle and the annihilation dialog.

## Glossary

- Hex: one cell of the world or battle grid.
- Stack: two or more units in the same hex. The stack callout lists the units in one hex. A plain click on one stationary selectable human unit does not open it. A Shift-click on one selectable human unit does not open it. Hovering a one-unit token shows that unit's Bonuses tooltip.
- Selection: the human units the player has chosen. The selected hex is tracked separately.
- Targeting mode: Ranged or Strike, while the next map click chooses a target.
- Order: a march, ferry, ranged attack, air strike, or build queue entry. Sealift embark and debark apply immediately and are not orders in this sense.
- Draft order: an order that is queued and not yet resolved.
- Pending order: a draft order shown in a right-panel list.
- Theater: strategic play on the world map, or tactical play inside a battle.
- Contested hex: a strategic hex with units from both sides, eligible for a tactical battle.
- Fog of war: hidden information the player has not yet earned. The rules are in the combat rules.

## Element and Mode Matrix

Cells are `Shown`, `Hidden`, `Disabled` (visible, but pointer input is off), `Changed` (the document spells out which), or `n/a`. Resolution playback can be strategic or tactical. A `Changed` cell in that column means the document distinguishes those two.

| Element | New game | Strategic planning | Tactical battles list | Resolution playback | Tactical planning | Tactical annihilation | Game over |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Map surface | Disabled | Shown | Disabled | Changed | Changed | Disabled | Disabled |
| Map overlays | Disabled | Shown | Disabled | Shown | Changed | Disabled | Disabled |
| Minimap | Disabled | Shown | Disabled | Shown | Shown | Disabled | Disabled |
| Terrain legend | Disabled | Shown | Disabled | Shown | Shown | Disabled | Disabled |
| Hex tooltips | Hidden | Shown | Hidden | Shown | Shown | Hidden | Hidden |
| Stack callout | Hidden | Shown | Hidden | Hidden | Shown | Hidden | Hidden |
| Build popup | Hidden | Shown | Disabled | Disabled | Hidden | Hidden | Hidden |
| Multi-hex build popup | Hidden | Shown | Disabled | Disabled | Hidden | Hidden | Hidden |
| Right panel | Disabled | Shown | Disabled | Shown | Shown | Disabled | Disabled |
| Command bar | Disabled | Shown | Disabled | Shown | Changed | Disabled | Disabled |
| Selection and orders | Disabled | Shown | Disabled | Shown | Changed | Disabled | Disabled |
| Tools tab | Disabled | Shown | Disabled | Shown | Shown | Disabled | Disabled |
| Model tab | Disabled | Shown | Disabled | Shown | Changed | Disabled | Disabled |
| AI activity log | Disabled | Shown | Disabled | Shown | Shown | Disabled | Disabled |
| New game dialog | Shown | Hidden | Hidden | Hidden | Hidden | Hidden | Shown |
| Resolution playback | Hidden | Hidden | Hidden | Shown | Hidden | Hidden | Hidden |
| Tactical entry markers | Hidden | Shown | Disabled | Shown | Hidden | Hidden | Hidden |
| Tactical battles list | Hidden | Hidden | Shown | Hidden | Hidden | Hidden | Hidden |
| Tactical battle controls | Hidden | Hidden | Hidden | Changed | Shown | Shown | Hidden |

## Open Questions by Document

None.

## Known Deviations by Document

Each entry is a requirement that the renderer does not meet yet. Cross-cutting documents link to the element document that holds the entry.

None.
