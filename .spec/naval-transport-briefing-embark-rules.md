# Naval Transport Status briefing vs embark engine

Strategic `# Naval Transport Status` must describe the same embark rule as `canEmbarkAtHex` / the human stack popup.

**Audience:** Maintainers of `buildSealiftBriefingBlock` and nearest-embark scoring.

## Rule (do not weaken)

Cargo may embark at:

- native coastal (`terrain` or `terrainKind` is `coastal`) — control is not required
- a land seaport — control is not required
- a water seaport the acting player controls

Water with no seaport is never an embark hex, even if land and naval can occupy it.

## Briefing copy

The one-line embark sentence in the strategic naval block must state that coastal and land seaports do not need control, and that water seaports do.

## Nearest Embark Hex

Score candidates with `canEmbarkAtHex` over the full snapshot, then pick the smallest unweighted H3 hop count (`gridHopDistancesFrom`). Do not require opponent control except where the engine does (water seaports). Open water must not win at distance 0.

## Aboard / capacity

Count `embarkedOnNavalUnitId` cargo only. Co-located land that is not assigned is not aboard.

## Tool-use line

Strategic HOW TO USE copy must say cargo already aboard and nearest embark hex. It must not tell the model to read co-located land from this table.
