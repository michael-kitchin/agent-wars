# Regional Footprint Tuning Results

Counts are strategic hexes. Deviation is `(actual - target) / target`. A zero target with a zero actual is shown as 0%. Reaches are kilometres. Land within 10% is unmarked. Larger land gaps are listed after the table.

| Region | Land | Sea | Neutral | Sea reach | Neutral reach | Desert trim |
| --- | --- | --- | --- | --- | --- | --- |
| western_europe | 117/136 (-14.0%) | 25/38 (-34.2%) | 90/91 (-1.1%) | 425 | 425 | |
| southern_europe | 164/189 (-13.2%) | 74/99 (-25.3%) | 0/0 (0%) | 450 | 0 | |
| northern_europe | 234/243 (-3.7%) | 75/68 (+10.3%) | 0/0 (0%) | 125 | 0 | |
| eastern_europe | 263/308 (-14.6%) | 39/42 (-7.1%) | 0/0 (0%) | 550 | 0 | |
| northern_america | 185/208 (-11.1%) | 52/79 (-34.2%) | 0/0 (0%) | 800 | 0 | |
| central_america | 260/276 (-5.8%) | 0/0 (0%) | 0/0 (0%) | 0 | 0 | |
| caribbean | 122/120 (+1.7%) | 159/165 (-3.6%) | 0/0 (0%) | 250 | 0 | |
| south_america | 255/265 (-3.8%) | 80/78 (+2.6%) | 0/0 (0%) | 575 | 0 | |
| maghreb | 257/296 (-13.2%) | 29/30 (-3.3%) | 0/0 (0%) | 225 | 0 | |
| libya_egypt_sudan | 260/262 (-0.8%) | 26/26 (0%) | 0/0 (0%) | 275 | 0 | 225 |
| west_africa_coast | 269/307 (-12.4%) | 44/43 (+2.3%) | 0/0 (0%) | 225 | 0 | |
| middle_africa_north | 215/270 (-20.4%) | 8/17 (-52.9%) | 0/0 (0%) | 225 | 0 | |
| middle_africa_south | 293/340 (-13.8%) | 0/0 (0%) | 0/0 (0%) | 0 | 0 | |
| horn_and_great_lakes | 310/345 (-10.1%) | 0/0 (0%) | 0/0 (0%) | 0 | 0 | |
| southern_east_africa | 226/256 (-11.7%) | 27/26 (+3.8%) | 0/0 (0%) | 275 | 0 | |
| southern_africa | 219/237 (-7.6%) | 70/81 (-13.6%) | 0/0 (0%) | 625 | 0 | |
| western_asia_north | 150/188 (-20.2%) | 25/39 (-35.9%) | 48/50 (-4.0%) | 475 | 200 | |
| central_asia | 286/335 (-14.6%) | 9/9 (0%) | 0/0 (0%) | 125 | 0 | |
| southern_asia_west | 260/297 (-12.5%) | 20/20 (0%) | 0/0 (0%) | 225 | 0 | |
| southern_asia_east | 314/352 (-10.8%) | 0/0 (0%) | 0/0 (0%) | 0 | 0 | |
| eastern_asia | 191/216 (-11.6%) | 35/57 (-38.6%) | 0/0 (0%) | 650 | 0 | |
| south_eastern_asia | 130/143 (-9.1%) | 52/83 (-37.3%) | 31/31 (0%) | 650 | 575 | |
| australia_new_zealand | 138/146 (-5.5%) | 98/148 (-33.8%) | 0/0 (0%) | 800 | 0 | |

Sea and neutral reaches are the 25 km step from 0 to 800 whose count is closest to the target. Ties go to the smaller reach. Regions with a sea or neutral target of 0 keep reach 0.

## Changes Applied

- `libya_egypt_sudan` desert trim is 225 km. That step has 260 land hexes, against a target of 262. The previous 300 km step had 295.
- `west_africa_coast` adds Burkina Faso (`BFA`). Land rose from 240 to 269, against a target of 307. It is still more than 10% low.
- `northern_america` stays at latitude 62. Land is low, and 62 is the top of the allowed 52 to 62 range, so a lower edge would remove land.
- `eastern_europe` stays at latitude 82. Land is low, so the reduction to 77, which applies only when land is high, was not used.
- `northern_europe` keeps Iceland and the Faroe Islands. Land is within 10%.

## Land Gaps Left in Place

These regions are more than 10% off on land, and no further membership or box change was allowed:

- western_europe, -14.0%
- southern_europe, -13.2%
- eastern_europe, -14.6%
- northern_america, -11.1%
- maghreb, -13.2%
- west_africa_coast, -12.4% after adding Burkina Faso
- middle_africa_north, -20.4%
- middle_africa_south, -13.8%
- horn_and_great_lakes, -10.1%
- southern_east_africa, -11.7%
- western_asia_north, -20.2%
- central_asia, -14.6%
- southern_asia_west, -12.5%
- southern_asia_east, -10.8%
- eastern_asia, -11.6%

Sea counts for several coastal regions stay well below the target even at the closest reach, because the first nearly dry hex is often one or two rings away from member land. The reach still uses the closest step.

## Membership Notes

- `west_africa_coast` includes Guinea, Guinea-Bissau, and The Gambia because the coast from Côte d'Ivoire to Senegal spans them, and the land count is too high for the eight origin-unit countries alone. Burkina Faso was added during tuning.
- Overseas parts of France, the Netherlands, Spain, Portugal, Norway, and the United States drop out through centroid boxes or admin-1 exclusions, except the French and Dutch Caribbean (in `caribbean`) and French Guiana (in `south_america`).
- `southern_asia_east` excludes the Andaman and Nicobar Islands and Lakshadweep.
- Madagascar, Western Sahara (`SAH`), the Falklands (`FLK`), and the Sahel belong to no region.
- Cyprus (`CYP`), Northern Cyprus (`CYN`), and the UN buffer (`CNM`) are not in any region.
