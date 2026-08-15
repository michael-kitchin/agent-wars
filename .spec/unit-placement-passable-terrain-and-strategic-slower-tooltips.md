# Unit placement on passable terrain, and strategic slower tooltips

## Goal

1. Tactical sub-units spawn only on res4 cells they can occupy under the same movement rules used for marching (combat rules §12.4), including urban/rubble and road/rail exceptions.
2. “Slower:” / “Using: Road/Rail” order-preview tooltips appear only for **tactical march** planning. They do not appear on the strategic map, and they do not appear during ranged-attack or air-strike planning on either map. “Blocked:” tooltips remain in both games for invalid marches, ranged shots, and strikes.

## Locked behavior

### Tactical spawn

- Infantry and armor occupancy matches `planTacticalRes4March` enter rules without requiring a destination: finite §12.4 enter cost, or urban/rubble, or an existing road/rail spawn-via-transport exception.
- Armor does **not** spawn on wetlands, mountains, arctic, or water unless urban/rubble or a legal transport link applies.
- Infantry may spawn on wetlands, forests, mountains, arctic, coastal, plains, and desert (not water, unless urban/rubble or transport).
- Naval and air spawn rules are unchanged (navigable water/coastal/seaport with a movable neighbor; airports).
- Strategic res1 seeding is unchanged: land units still use land-mass passability (wetlands/mountains are legal strategic occupancy because strategic movement has no §12.4 blocks).

### Slower order-preview tooltips

- Valid strategic march previews omit `slowerTerrainDisplayTitle` and `orderPreviewTerrainImpact`.
- The renderer shows “Slower:” / “Using: Road/Rail” only for valid **tactical march** hovers (tactical battle snapshot active, not ranged/air support targeting).
- Ranged-attack and air-strike planning never show those slower hints (either map). Invalid ranged/air hovers still show “Blocked:”.
- Entering ranged or air-strike mode hides any leftover march slower/block hint immediately and refreshes hover preview for the current hex.
- Invalid marches still show “Blocked:” hints on both maps.

## Out of scope

- Relocating sub-units already placed in an in-progress tactical battle (next battle start uses the new spawn filter).
- Changing strategic pathfinding costs or blocking armor at res1.
- Changing lower-right terrain-effects tooltips.
