### Unit costs and thresholds

- **Costs:** one scale per map, so prices keep the global 1:2:5:3 ratio. For each unit type, I compared the typical urban count (geometric mean) of the hexes allowed to build it, regional vs. global, then averaged the four ratios.
- **Rounding:** infantry is rounded to the nearest 5 at 20 and above, and to whole numbers below 20. The scale column has the exact value.
- **Build minimums and the Advanced threshold** are set so the same share of producing hexes qualifies as in the global game.

| Map (pair) | Producing hexes / median urban cells | Scale | Infantry | Armor | Naval | Air | Min urban cells (armor / air / naval) | Advanced from |
|---|---|---|---|---|---|---|---|---|
| *Global game (1/4)* | *283 / 8* | *×1.00* | *20* | *40* | *100* | *60* | *2 / 5 / 10* | *21* |
| Western Europe (3/6) | 94 / 32 | ×3.25 | 65 | 130 | 325 | 195 | 9 / 20 / 38 | 60 |
| Southern Europe (3/6) | 98 / 18 | ×2.20 | 45 | 90 | 225 | 135 | 5 / 12 / 21 | 47 |
| Northern Europe, S of 66°N (3/6) | 53 / 20 | ×1.89 | 40 | 80 | 200 | 120 | 2 / 13 / 24 | 34 |
| Eastern Europe (2/5) | 107 / 9 | ×0.93 | 19 | 38 | 95 | 57 | 3 / 6 / 11 | 17 |
| Northern America, clipped (2/5) | 107 / 10 | ×1.12 | 20 | 40 | 100 | 60 | 3 / 7 / 13 | 22 |
| Central America (3/6) | 58 / 7 | ×0.67 | 13 | 26 | 65 | 39 | 2 / 6 / 8 | 12 |
| Caribbean (3/6) | 15 / 5 | ×0.56 | 11 | 22 | 55 | 33 | 3 / 5 / 6 | 8 |
| South America (2/5) | 115 / 4 | ×0.45 | 9 | 18 | 45 | 27 | 2 / 4 / 5 | 8 |
| Maghreb (3/6) | 33 / 11 | ×1.12 | 20 | 40 | 100 | 60 | 5 / 9 / 14 | 18 |
| Libya, Egypt, Sudan (3/6) | 31 / 8 | ×0.97 | 19 | 38 | 95 | 57 | 3 / 6 / 10 | 23 |
| West Africa coast (3/6) | 56 / 10 | ×1.08 | 20 | 40 | 100 | 60 | 3 / 7 / 12 | 20 |
| Middle Africa north (3/6) | 13 / 5 | ×0.50 | 10 | 20 | 50 | 30 | 2 / 4 / 6 | 10 |
| Middle Africa south (3/6) | 20 / 6 | ×0.55 | 11 | 22 | 55 | 33 | 2 / 6 / 7 | 9 |
| Horn & Great Lakes (3/6) | 23 / 6 | ×0.56 | 11 | 22 | 55 | 33 | 3 / 6 / 8 | 9 |
| Southern East Africa (3/6) | 33 / 7 | ×0.56 | 11 | 22 | 55 | 33 | 3 / 6 / 8 | 9 |
| Southern Africa (3/6) | 43 / 8 | ×0.89 | 18 | 36 | 90 | 54 | 4 / 6 / 9 | 16 |
| Western Asia north (3/6) | 76 / 11 | ×1.27 | 25 | 50 | 125 | 75 | 3 / 10 / 13 | 20 |
| Central Asia (3/6) | 54 / 9 | ×1.05 | 20 | 40 | 100 | 60 | 3 / 8 / 11 | 19 |
| Southern Asia west (3/6) | 102 / 14 | ×1.64 | 35 | 70 | 175 | 105 | 5 / 11 / 17 | 32 |
| Southern Asia east (3/6) | 131 / 10 | ×1.07 | 20 | 40 | 100 | 60 | 4 / 9 / 12 | 18 |
| Eastern Asia (2/5) | 120 / 11 | ×1.43 | 30 | 60 | 150 | 90 | 3 / 7 / 14 | 27 |
| South-Eastern Asia (2/5) | 38 / 4 | ×0.43 | 9 | 18 | 45 | 27 | 2 / 3 / 5 | 8 |
| Australia & NZ (2/5) | 33 / 3 | ×0.41 | 8 | 16 | 40 | 24 | 2 / 3 / 4 | 9 |

### Strategic terrain and combat rules

The rules themselves didn't change:
- **Cells destroyed per hit:** 3 × the map's scale, rounded, minimum 1. Hits on infrastructure in battles stay at one cell.
- **Armor that enters a rugged, arctic or city hex ends its move there.**
  - **Rugged:** at least half the land cells pass your mountain test, whatever their tree cover.
  - **City:** at least 86 of 343 cells urban, from the generated count.
  - **Arctic:** at least half the land cells arctic.
- **No forest movement rule.**
- **Cover:** a city hex gives urban cover (2 and 1), and a rugged hex gives mountain cover (2 and 0). Where several apply, the larger value in each column wins.
- **Unchanged:** ranges, vision, radii and weather.

| Map (pair) | Cells per hit | Hits to level: median city / average side | Land that slows armor | City hexes | What shapes it |
|---|---|---|---|---|---|
| *Global game (1/4)* | *3* | *2.7 / 35 (range 0–283)* | *8% (rugged)* | *6* | |
| **Shaped by terrain** | | | | | |
| Eastern Asia (2/5) | 4 | 2.8 / 142 | 39% | 10 | Western plateau and ranges, mountainous Japan and Korea, big metros |
| Southern Asia west (3/6) | 5 | 2.8 / 153 | 32% | 4 | Zagros, Elburz, Hindu Kush |
| Western Asia north (3/6) | 4 | 2.8 / 85 | 29% | 1 | Anatolian and Caucasus ranges around the Mesopotamian plain |
| Southern Europe (3/6) | 7 | 2.6 / 114 | 29% | 10 | Alps, Apennines, Pyrenees, Balkan ranges, the Mediterranean |
| Western Europe (3/6) | 10 | 3.2 / 108 | 27% | 14 | Alps and uplands; most city hexes of any map |
| Central America (3/6) | 2 | 3.5 / 76 | 26% | 0 | Mexican sierras, the isthmus spine |
| Southern Asia east (3/6) | 3 | 3.3 / 159 | 20% | 1 | Himalayan edge, highland interior |
| Central Asia (3/6) | 3 | 3.0 / 68 | 16% | 1 | Tian Shan and Pamirs east, desert west |
| South-Eastern Asia (2/5) | 1 | 4.0 / 49 | 15% | 0 | Mountainous mainland; water does the rest |
| Northern America (2/5) | 3 | 3.3 / 94 | 14% | 1 | Rockies, Appalachians |
| Horn & Great Lakes (3/6) | 2 | 3.0 / 20 | 14% | 0 | Ethiopian Highlands, the Rift |
| Eastern Europe (2/5) | 3 | 3.0 / 93 | 13% | 0 | Mostly plain; Carpathians, Caucasus, Urals |
| South America (2/5) | 1 | 4.0 / 144 | 13% | 0 | The Andes; the Amazon stays open to armor |
| **Flat** | | | | | |
| Southern Africa (3/6) | 3 | 2.7 / 48 | 7% | 1 | Open highveld |
| Northern Europe (3/6) | 6 | 3.3 / 80 | 6% | 3 | The sea; half its hexes are shoreline "wetlands" |
| Maghreb (3/6) | 3 | 3.7 / 50 | 4% | 0 | Desert (81% of land) |
| Middle Africa north (3/6) | 1 | 5.0 / 20 | 4% | 0 | Forest (55%) |
| Middle Africa south (3/6) | 2 | 3.0 / 17 | 4% | 0 | Forest (89%) |
| Caribbean (3/6) | 2 | 2.5 / 11 | 3% | 0 | The sea |
| Southern East Africa (3/6) | 2 | 3.5 / 28 | 3% | 0 | Woodland (72% forest) |
| Australia & NZ (2/5) | 1 | 3.0 / 47 | 3% | 0 | Sea and desert |
| West Africa coast (3/6) | 3 | 3.3 / 70 | 2% | 0 | Forest (42%) |
| Libya, Egypt, Sudan (3/6) | 3 | 2.7 / 34 | 1% | 0 | Desert (64%) |

**Notes on both tables:**
- **Destroying a side's cities stays within the global game's range.** It takes 11–159 hits, against almost none to about 280 for the global game's home regions. The hex-control win is still slow on maps where a side averages 80–99 hexes, above the global maximum of 69: the Maghreb, both Southern Asia maps, the Horn, Middle Africa south, Central Asia and Northern Europe. A share-based control win would fix those.
- **Middle Africa north is the one 5-hit outlier.** Its per-hit value sits right on the 1-or-2 rounding boundary (1.5). Using 2 brings a median city down to 2.5 hits.
- **Small maps give rough tech thresholds.** The Advanced share lands at 15% on Middle Africa north and 30% on Middle Africa south, against about 25% elsewhere.
- **Naval and air minimums ignore ports and airports,** which I haven't counted at the regional resolutions yet.
- **Expect these numbers to shift.**
  - **Method:** my counting finds 93% of what the pipeline finds, so allow about ±10%.
  - **Terrain:** the shares are estimated from res4 cells, 7 per res3 hex and 49 per res2 hex.
  - **Thin maps:** these will move after the urban data fix.

  Have the ETL recompute all of this from the real res5/res6 data and write it into each map's manifest.