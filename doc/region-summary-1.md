# Agent Wars regional mode: map, economy and terrain tables

*Planning input, 7 October 2026. Every number here is an estimate computed from the game's current generated res4 data and the Natural Earth source files. The regional ETL must recompute all of them from real res5/res6 data and write them into each map's manifest.*

## Context

- **Regional mode** restricts play to one UN subregion from the global game. Some subregions are split into two maps, and some are excluded. The human and the AI each pick a side group (a home region made of provinces). Everything else on the map is neutral territory, as in the global game.
- **Resolutions:** strategic hexes are H3 res2 or res3. Battles are always three levels down (res5 or res6). Each strategic hex has 343 tactical children (286 on an H3 pentagon). A battle also includes three rings of neighboring tactical cells. Counts in the tables below are children of a strategic hex, not the battle footprint.
- **Rules:** the same as the global game, except for the per-map economy numbers (Table 2) and the strategic terrain and combat rules below (Table 3).
- **Build priority:** Strong tier first. **Eastern Asia is the recommended pilot**: res2/res5 is the smaller step from today, it needs only a ×1.43 economy scale, it has the most terrain that slows armor, and naval, sealift and air all matter there.
- **Tiers** are a design judgment about how fun each map is likely to be. Strong maps have cities to fight over, terrain that channels movement, a land and sea mix, and sides small enough to win. Weak maps lack two or more of those.

## Table 1: Maps

Footprint counts are strategic hexes. Side-group entries are each group's share of the map's tactical urban cells, then its land hexes in parentheses. Size ratio is the largest group's land hexes divided by the smallest's. The urban column is total tactical urban cells / strategic hexes with at least one urban cell / median urban cells per producing hex.

| ID | Tier | Map | Pair | Footprint (hexes) | Origin units (units present) | Side groups: urban share (land hexes) | Size ratio | Urban cells / producing hexes / median |
|---|---|---|---|---|---|---|---|---|
| *global* | | *Global game* | *res1/res4* | *842, whole globe* | *Countries* | *UN subregions as home regions* | | *4,643 / 283 / 8 (game data)* |
| eastern-asia | Strong | Eastern Asia | res2/res5 | 216 land + 57 sea = **273** | Admin-1: China (31), Mongolia (22); Whole country: Hong Kong, Japan, Macao, North Korea, South Korea, Taiwan | Japan 28% (30); East China & Taiwan 21% (21); North & northwest China, Mongolia 20% (88); Korea & Manchuria 17% (28); South & southwest China 14% (49) | 4.2 | 2,832 / 120 / 10.5 |
| western-europe | Strong | Western Europe | res3/res6 | 136 land + 38 sea + 91 neutral border = **265** | Admin-1: Austria (9), Germany (16); NE region: Belgium (3), France (13); Whole country: Liechtenstein, Luxembourg, Monaco, Netherlands, Switzerland | Southern & eastern Germany, Austria, Switzerland 28% (42); Netherlands & northern Germany 26% (24); Southern France 24% (35); Northern France & Belgium 23% (35) | 1.8 | 4,323 / 94 / 32 |
| southern-europe | Strong | Southern Europe | res3/res6 | 189 land + 99 sea = **288** | Admin-1: Greece (14); NE region: Bosnia and Herz. (2), Italy (20), Portugal (6), Spain (18, autonomous communities by override); Whole country: Albania, Andorra, Croatia, Gibraltar, Kosovo, Montenegro, North Macedonia, San Marino, Serbia, Slovenia, Vatican | Iberia 33% (73); Central & southern Italy 30% (36); Northern Italy 28% (16); Balkans & Greece 9% (64) | 4.6 | 3,203 / 98 / 17.5 |
| western-asia-north | Strong | Western Asia north | res3/res6 | 188 land + 39 sea + 50 neutral border = **277** | Admin-1: Georgia (12), Iraq (18), Syria (15), Turkey (81); NE region: Azerbaijan (10); Whole country: Armenia, Cyprus, Israel, Jordan, Kuwait, Lebanon, N. Cyprus, Palestine | Iraq & Kuwait 29% (49); Levant & Cyprus 26% (35); Western Turkey 25% (43); Eastern Turkey & Caucasus 20% (61) | 1.7 | 1,363 / 76 / 11 |
| southern-asia-west | Passable | Southern Asia west | res3/res6 | 297 land + 20 sea = **317** | Admin-1: Afghanistan (32), Iran (31), Pakistan (8) | Southern & eastern Iran 37% (117); Pakistan & Afghanistan 33% (139); Northern & western Iran 30% (41) | 3.4 | 2,301 / 102 / 14 |
| northern-america | Passable | Northern America, lower 48 + southern Canada | res2/res5 | 208 land + 79 sea = **287** | Admin-1: Canada (10), United States of America (49) | South Atlantic 21% (16); South Central 19% (25); Great Lakes & Ontario 17% (20); Northeast, Québec & Maritimes 16% (40); Mountain, Plains & Prairies 14% (74); Pacific & British Columbia 14% (33) | 4.6 | 1,698 / 107 / 10 |
| southern-asia-east | Passable | Southern Asia east | res3/res6 | 352 land = **352** | Admin-1: Bangladesh (7), India (34), Nepal (14); NE region: Bhutan (4), Sri Lanka (9) | West India 31% (52); Central India 29% (99); North & East India, Bangladesh, Nepal, Bhutan 23% (125); South India & Sri Lanka 17% (76) | 2.4 | 1,913 / 131 / 10 |
| central-asia | Passable | Central Asia | res3/res6 | 335 land + 9 sea = **344** | Admin-1: Kazakhstan (17), Kyrgyzstan (8), Tajikistan (5), Turkmenistan (5), Uzbekistan (13) | Western Uzbekistan & Turkmenistan 28% (71); Eastern Uzbekistan 27% (4); Kazakhstan 25% (227); Kyrgyzstan & Tajikistan 20% (33) | 56.8 | 817 / 54 / 9 |
| central-america | Passable | Central America | res3/res6 | 276 land = **276** | Admin-1: Costa Rica (7), Mexico (32); Whole country: Belize, El Salvador, Guatemala, Honduras, Nicaragua, Panama | Central Mexico & Bajío 33% (36); NW Mexico 26% (81); Southern Mexico & the isthmus 22% (127); NE Mexico 19% (32) | 4.0 | 604 / 58 / 7 |
| northern-europe | Passable | Northern Europe, south of 66°N | res3/res6 | 243 land + 68 sea = **311** | Admin-1: Denmark (5), Finland (18), Lithuania (10), Norway (17), Sweden (21); NE region: Ireland (8), Latvia (5), United Kingdom (16); Whole country: Estonia, Faeroe Is., Guernsey, Isle of Man, Åland | Nordic & Baltic 35% (178); Southern Britain 33% (23); Northern Britain & Ireland 32% (42) | 7.7 | 1,439 / 53 / 20 |
| southern-africa | Passable | Southern Africa | res3/res6 | 237 land + 81 sea = **318** | Admin-1: Namibia (13), South Africa (9); Whole country: Botswana, Lesotho, eSwatini | Highveld 26% (18); Cape & neighbours 25% (188); East 25% (30); Gauteng 25% (1) | 188.0 | 576 / 43 / 8 |
| libya-egypt-sudan | Passable | Libya, Egypt, Sudan (desert trimmed) | res3/res6 | 262 land + 26 sea = **288** | Admin-1: Libya (22), Sudan (17); Whole country: Egypt | Lower Egypt 39% (30); Upper Egypt & Sudan 35% (142); Libya 25% (90) | 4.7 | 413 / 31 / 8 |
| maghreb | Passable | Maghreb | res3/res6 | 296 land + 30 sea = **326** | Admin-1: Morocco (16); Whole country: Algeria, Tunisia, W. Sahara | Morocco 44% (72); Algeria 39% (207); Tunisia 17% (17) | 12.2 | 452 / 33 / 11 |
| west-africa-coast | Passable | West Africa coast | res3/res6 | 307 land + 43 sea = **350** | Admin-1: Côte d'Ivoire (19), Ghana (10), Nigeria (37), Senegal (14), Sierra Leone (4), Togo (5); NE region: Burkina Faso (13), Guinea (8), Guinea-Bissau (4); Whole country: Benin, Gambia, Liberia | Rest of Nigeria 31% (89); Southwest Nigeria 28% (12); Ghana, Togo & Benin 26% (46); Côte d'Ivoire to Senegal 16% (160) | 13.3 | 835 / 56 / 9.5 |
| eastern-europe | Weak | Eastern Europe (whole region) | res2/res5 | 308 land + 42 sea = **350** | Admin-1: Russia (85); Whole country: Belarus, Bulgaria, Czechia, Hungary, Moldova, Poland, Romania, Slovakia, Ukraine | Volga Russia 28% (27); Central Europe & the Danube 24% (16); Urals, Siberia & Far East 18% (209); Ukraine, Belarus & Moldova 17% (10); Central & northwestern Russia 13% (46) | 20.9 | 1,388 / 107 / 9 |
| south-america | Weak | South America | res2/res5 | 265 land + 78 sea = **343** | Admin-1: Argentina (24), Bolivia (9), Brazil (27); Whole country: Chile, Colombia, Ecuador, Falkland Is., Guyana, Paraguay, Peru, Suriname, Uruguay, Venezuela | River Plate 25% (63); Rest of Brazil 22% (94); Southeast Brazil 20% (13); Andes 19% (53); Venezuela, Colombia & Guianas 14% (42) | 7.2 | 720 / 115 / 4 |
| south-eastern-asia | Weak | South-Eastern Asia | res2/res5 | 143 land + 83 sea + 31 neutral border = **257** | NE region: Thailand (6); Whole country: Brunei, Cambodia, Indonesia, Laos, Malaysia, Myanmar, Philippines, Singapore, Timor-Leste, Vietnam | Thailand & Myanmar 43% (24); Indonesia & Timor-Leste 20% (80); Malaysia, Singapore & Brunei 16% (7); Philippines 11% (18); Indochina 10% (14) | 11.4 | 247 / 38 / 3.5 |
| caribbean | Weak | Caribbean | res3/res6 | 120 land + 165 sea = **285** | Admin-1: Cuba (16); Whole country: Anguilla, Antigua and Barb., Bahamas, Barbados, British Virgin Is., Cayman Is., Dominica, Dominican Rep., Grenada, Haiti, Jamaica, Montserrat, Puerto Rico, Saint Lucia, Sint Maarten, St-Barthélemy, St-Martin, St. Kitts and Nevis, St. Vin. and Gren., Trinidad and Tobago, Turks and Caicos Is., U.S. Virgin Is. | Puerto Rico & Virgin Is. 25% (9); Lesser Antilles & Trinidad 24% (19); Hispaniola 22% (21); Jamaica & Bahamas 17% (38); Cuba 12% (33) | 4.2 | 110 / 15 / 5 |
| australia-nz | Weak | Australia & New Zealand | res2/res5 | 146 land + 148 sea = **294** | Admin-1: Australia (9); NE region: New Zealand (4) | Tasman (Victoria, Tasmania, NZ) 30% (25); West & South (WA, SA, NT) 28% (84); New South Wales & ACT 24% (11); Queensland 19% (26) | 7.6 | 189 / 33 / 3 |
| middle-africa-north | Weak | Middle Africa north | res3/res6 | 270 land + 17 sea = **287** | Admin-1: Cameroon (10), Central African Rep. (17), Chad (22), Gabon (9); Whole country: Eq. Guinea, São Tomé and Principe | Southern Cameroon 35% (35); Northern Cameroon & Chad 31% (132); Gabon & Equatorial Guinea 23% (38); Central African Republic 11% (65) | 3.8 | 81 / 13 / 5 |
| middle-africa-south | Weak | Middle Africa south | res3/res6 | 340 land = **340** | Admin-1: Angola (18), Congo (12), Dem. Rep. Congo (11) | Northern & western DR Congo, Congo 38% (164); Katanga & Kasai 38% (68); Angola 24% (108) | 2.4 | 135 / 20 / 6 |
| southern-east-africa | Weak | Southern East Africa | res3/res6 | 256 land + 26 sea = **282** | Admin-1: Mozambique (10), Tanzania (30), Zambia (10), Zimbabwe (10); NE region: Malawi (5) | Zambia 28% (64); Tanzania 24% (78); Mozambique & Malawi 24% (84); Zimbabwe 24% (30) | 2.8 | 228 / 33 / 7 |
| horn-great-lakes | Weak | Horn & Great Lakes | res3/res6 | 345 land = **345** | Admin-1: Eritrea (6), Ethiopia (11), Kenya (8), S. Sudan (10), Somalia (13); NE region: Uganda (4); Whole country: Burundi, Djibouti, Rwanda, Somaliland | Ethiopia 30% (101); Kenya 26% (52); Great Lakes & South Sudan 25% (96); Red Sea & Somali coast 19% (96) | 1.9 | 162 / 23 / 6 |

## Table 2: Unit economy

Costs are in production points. A hex earns one point per turn for each intact urban cell it contains. Minimums and the Advanced threshold count urban cells in a single strategic hex. The build-speed column compares how fast the median city that can build each unit type produces infantry and naval units, relative to the global game.

| ID | Map | Scale | Infantry | Armor | Naval | Air | Min urban cells (armor / air / naval) | Advanced tech from (share of producing hexes) | Build speed vs global (infantry / naval) |
|---|---|---|---|---|---|---|---|---|---|
| *global* | *Global game* | *×1.00* | *20* | *40* | *100* | *60* | *2 / 5 / 10* | *21 (25%)* | *×1.00 / ×1.00* |
| eastern-asia | Eastern Asia | ×1.43 | 30 | 60 | 150 | 90 | 3 / 7 / 14 | 27 (24%) | ×0.99 / ×1.03 |
| western-europe | Western Europe | ×3.25 | 65 | 130 | 325 | 195 | 9 / 20 / 38 | 60 (24%) | ×1.06 / ×0.89 |
| southern-europe | Southern Europe | ×2.20 | 45 | 90 | 225 | 135 | 5 / 12 / 21 | 47 (23%) | ×1.04 / ×0.93 |
| western-asia-north | Western Asia north | ×1.27 | 25 | 50 | 125 | 75 | 3 / 10 / 13 | 20 (25%) | ×1.13 / ×0.80 |
| southern-asia-west | Southern Asia west | ×1.64 | 35 | 70 | 175 | 105 | 5 / 11 / 17 | 32 (23%) | ×1.13 / ×0.84 |
| northern-america | Northern America, lower 48 + southern Canada | ×1.12 | 20 | 40 | 100 | 60 | 3 / 7 / 13 | 22 (24%) | ×1.06 / ×0.90 |
| southern-asia-east | Southern Asia east | ×1.07 | 20 | 40 | 100 | 60 | 4 / 9 / 12 | 18 (23%) | ×1.18 / ×0.78 |
| central-asia | Central Asia | ×1.05 | 20 | 40 | 100 | 60 | 3 / 8 / 11 | 19 (22%) | ×1.14 / ×0.85 |
| central-america | Central America | ×0.67 | 13 | 26 | 65 | 39 | 2 / 6 / 8 | 12 (26%) | ×1.22 / ×0.77 |
| northern-europe | Northern Europe, south of 66°N | ×1.89 | 40 | 80 | 200 | 120 | 2 / 13 / 24 | 34 (25%) | ×1.04 / ×0.89 |
| southern-africa | Southern Africa | ×0.89 | 18 | 36 | 90 | 54 | 4 / 6 / 9 | 16 (23%) | ×1.15 / ×0.83 |
| libya-egypt-sudan | Libya, Egypt, Sudan (desert trimmed) | ×0.97 | 19 | 38 | 95 | 57 | 3 / 6 / 10 | 23 (23%) | ×1.07 / ×0.88 |
| maghreb | Maghreb | ×1.12 | 20 | 40 | 100 | 60 | 5 / 9 / 14 | 18 (24%) | ×1.26 / ×0.76 |
| west-africa-coast | West Africa coast | ×1.08 | 20 | 40 | 100 | 60 | 3 / 7 / 12 | 20 (21%) | ×1.13 / ×0.86 |
| eastern-europe | Eastern Europe (whole region) | ×0.93 | 19 | 38 | 95 | 57 | 3 / 6 / 11 | 17 (24%) | ×1.11 / ×0.87 |
| south-america | South America | ×0.45 | 9 | 18 | 45 | 27 | 2 / 4 / 5 | 8 (25%) | ×1.20 / ×0.77 |
| south-eastern-asia | South-Eastern Asia | ×0.43 | 9 | 18 | 45 | 27 | 2 / 3 / 5 | 8 (21%) | ×1.22 / ×0.89 |
| caribbean | Caribbean | ×0.56 | 11 | 22 | 55 | 33 | 3 / 5 / 6 | 8 (27%) | ×1.26 / ×0.74 |
| australia-nz | Australia & New Zealand | ×0.41 | 8 | 16 | 40 | 24 | 2 / 3 / 4 | 9 (21%) | ×1.19 / ×0.90 |
| middle-africa-north | Middle Africa north | ×0.50 | 10 | 20 | 50 | 30 | 2 / 4 / 6 | 10 (15%) | ×1.32 / ×0.75 |
| middle-africa-south | Middle Africa south | ×0.55 | 11 | 22 | 55 | 33 | 2 / 6 / 7 | 9 (30%) | ×1.23 / ×0.76 |
| southern-east-africa | Southern East Africa | ×0.56 | 11 | 22 | 55 | 33 | 3 / 6 / 8 | 9 (27%) | ×1.32 / ×0.70 |
| horn-great-lakes | Horn & Great Lakes | ×0.56 | 11 | 22 | 55 | 33 | 3 / 6 / 8 | 9 (22%) | ×1.36 / ×0.69 |

## Table 3: Strategic terrain and combat

Hits are air-strike hits on urban cells. The average side is the map's land hexes and urban cells divided by its number of side groups. Land that slows armor is the share of land hexes that are rugged, arctic or city hexes (defined under Rules). The terrain-mix column gives the share of land hexes that are mostly forest, mostly desert, or have shoreline wetlands as their main kind.

| ID | Map | Urban cells destroyed per hit | Hits to level: median city / average side | Average side (land hexes) | Land that slows armor | Rugged land | City hexes | Forest / desert / wetland-main | What shapes it |
|---|---|---|---|---|---|---|---|---|---|
| *global* | *Global game* | *3* | *2.7 / 35 (median home region; range 0–283)* | *22 (median home region; range 11–69)* | | *8%* | *6* | | |
| eastern-asia | Eastern Asia | 4 | 2.6 / 142 | 43 | 39% | 37% | 10 | 21% / 16% / 8% | Western plateau and ranges, mountainous Japan and Korea, many big metros; naval straits |
| western-europe | Western Europe | 10 | 3.2 / 108 | 34 | 27% | 17% | 14 | 18% / 0% / 14% | Alps and uplands; most city hexes of any map |
| southern-europe | Southern Europe | 7 | 2.5 / 114 | 47 | 29% | 26% | 10 | 12% / 0% / 25% | Alps, Apennines, Pyrenees, Balkan ranges; the Mediterranean |
| western-asia-north | Western Asia north | 4 | 2.8 / 85 | 47 | 29% | 28% | 1 | 3% / 34% / 16% | Anatolian and Caucasus ranges around the Mesopotamian plain |
| southern-asia-west | Southern Asia west | 5 | 2.8 / 153 | 99 | 32% | 31% | 4 | 0% / 45% / 5% | Zagros, Elburz, Hindu Kush; almost no sea |
| northern-america | Northern America, lower 48 + southern Canada | 3 | 3.3 / 94 | 35 | 14% | 14% | 1 | 30% / 0% / 24% | Rockies, Appalachians; mostly open land war |
| southern-asia-east | Southern Asia east | 3 | 3.3 / 159 | 88 | 20% | 20% | 1 | 14% / 3% / 11% | Himalayan edge, highland interior; no open sea |
| central-asia | Central Asia | 3 | 3.0 / 68 | 84 | 16% | 15% | 1 | 1% / 52% / 7% | Tian Shan and Pamirs east, desert west; Caspian only |
| central-america | Central America | 2 | 3.5 / 76 | 69 | 26% | 26% | 0 | 28% / 0% / 25% | Mexican sierras, the isthmus spine; no open sea |
| northern-europe | Northern Europe, south of 66°N | 6 | 3.3 / 80 | 81 | 6% | 5% | 3 | 14% / 0% / 49% | The sea; flat land; shoreline wetlands on half its hexes |
| southern-africa | Southern Africa | 3 | 2.7 / 48 | 59 | 7% | 7% | 1 | 16% / 9% / 5% | Open highveld; Gauteng as the fortress objective |
| libya-egypt-sudan | Libya, Egypt, Sudan (desert trimmed) | 3 | 2.7 / 46 | 87 | 1% | 1% | 0 | 3% / 64% / 8% | Desert, the coast road and the Nile |
| maghreb | Maghreb | 3 | 3.7 / 50 | 99 | 4% | 4% | 0 | 0% / 81% / 5% | Desert; the Atlas barely registers |
| west-africa-coast | West Africa coast | 3 | 3.2 / 70 | 77 | 2% | 2% | 0 | 42% / 1% / 10% | Forest and coast |
| eastern-europe | Eastern Europe (whole region) | 3 | 3.0 / 93 | 62 | 13% | 13% | 0 | 37% / 4% / 16% | Mostly plain; Carpathians, Caucasus, Urals; Siberia is filler |
| south-america | South America | 1 | 4.0 / 144 | 53 | 13% | 13% | 0 | 47% / 2% / 12% | The Andes; the Amazon stays open to armor |
| south-eastern-asia | South-Eastern Asia | 1 | 3.5 / 49 | 29 | 15% | 15% | 0 | 21% / 0% / 28% | Mountainous mainland; islands and water |
| caribbean | Caribbean | 2 | 2.5 / 11 | 24 | 3% | 3% | 0 | 0% / 0% / 26% | The sea; tiny economy |
| australia-nz | Australia & New Zealand | 1 | 3.0 / 47 | 36 | 3% | 3% | 0 | 10% / 31% / 14% | Sea and desert; coasts far apart |
| middle-africa-north | Middle Africa north | 1 | 5.0 / 20 | 68 | 4% | 4% | 0 | 55% / 23% / 2% | Forest and Sahel; thin economy |
| middle-africa-south | Middle Africa south | 2 | 3.0 / 22 | 113 | 4% | 4% | 0 | 89% / 0% / 6% | Forest; no open sea; thin economy |
| southern-east-africa | Southern East Africa | 2 | 3.5 / 28 | 64 | 3% | 3% | 0 | 72% / 0% / 11% | Woodland; thin economy |
| horn-great-lakes | Horn & Great Lakes | 2 | 3.0 / 20 | 86 | 14% | 14% | 0 | 23% / 17% / 11% | Ethiopian Highlands and the Rift; no open sea; thin economy |

## Rules these tables assume

**Economy (Table 2)**
- One cost scale per map applies to all four units, which keeps the global price ratio of 1:2:5:3 (infantry : armor : naval : air).
- Build minimums (armor, air, naval) and the Advanced tech threshold are set per map so that the same share of producing hexes qualifies as in the global game. Naval still needs a seaport and air an airport, as now.
- Tech tier still comes from the generated urban count of a unit's birth hex.

**Air strikes on cities**
- Urban cells destroyed per strategic air-strike hit = max(1, round(9 × scale)), with half-up rounding. The global map destroys 9. This keeps a hit worth the same production, measured in units, as in the global game. Those integers are in `src/shared/regionalRulesCatalog.ts` (`strategicUrbanCellsDestroyedPerHit` once a map is active). Table 3 above still shows the earlier estimates, which used a global hit of 3.
- Hits on infrastructure in battles stay at one cell.

**Strategic movement**
- Armor that enters a rugged, arctic or city hex ends its move there. A longer route continues on the next turn, and the turn count includes that halt. Infantry and naval movement are unchanged.
- **Rugged:** at least half the hex's land cells pass the existing mountain test (TRI ≥ 24, or slope ≥ 5 with elevation_max ≥ 700), regardless of land cover.
- **Arctic:** at least half its land cells are arctic.
- **City:** at least 86 of 343 tactical cells are urban in the generated data, so bombing doesn't remove the status.
- Weather and terrain slowing don't stack.
- There is no forest movement rule: forest is the majority on 42–89% of hexes on several maps, so it would slow armor almost everywhere there.

**Strategic cover**
- Keep the current cover by terrain kind (forest 2/1, mountain 2/0, wetlands 1/0 against ground and naval fire / air).
- Add urban cover for city hexes (2/1) and mountain cover for rugged hexes (2/0). Where more than one applies, the larger value in each column wins, as for battle cells.

**Neutral border hexes** (Western Europe, Western Asia north, South-Eastern Asia only)
- They can be entered and held, but they produce nothing and can't host air or naval bases.

**Unchanged:** ranges, vision, strike and ferry radii (all in hex steps), weather, every battle rule, and sub-unit counts.

The movement and cover rules barely affect the global game (8% of res1 land hexes are rugged and 6 are city hexes), so they can apply to both modes and keep one rulebook.

## Method

- **Land footprint:** strategic hexes that contain a res4 land cell of a country in the region (or of the map's listed countries).
  - Islands within about 300 km of the main cluster are kept (a gap of 2 hexes at res2, 4 at res3). Other clusters are kept only if they hold at least 5% of the region's urban cells.
  - **Sea** is water within the map's kilometre reach, plus at least two rings of water around member land. That halo also covers a non-member island smaller than one strategic hex. It does not cover a larger landmass. The Caspian is included. A neutral-border hex keeps that role.
  - **Neutral border** is other land within 2 rings (Western Europe) or 1 ring (Western Asia north, South-Eastern Asia).
- **Clips:**
  - Northern America drops Greenland, Bermuda, Saint Pierre and Miquelon, Alaska, Hawaii, Yukon, the Northwest Territories and Nunavut.
  - Northern Europe keeps hexes whose center is at or below 66°N.
  - Libya–Egypt–Sudan keeps land within 1 hex of a hex containing a populated place or any urban area.
- **Split maps** (country lists):
  - Maghreb = Morocco, Western Sahara, Algeria, Tunisia.
  - Libya–Egypt–Sudan = those three.
  - West Africa coast = Senegal, Gambia, Guinea-Bissau, Guinea, Sierra Leone, Liberia, Côte d'Ivoire, Ghana, Togo, Benin, Nigeria, Burkina Faso.
  - Middle Africa north = Cameroon, Chad, Central African Republic, Gabon, Equatorial Guinea, São Tomé and Príncipe.
  - Middle Africa south = DR Congo, Congo, Angola.
  - Horn & Great Lakes = Ethiopia, Eritrea, Djibouti, Somalia, Somaliland, Kenya, Uganda, South Sudan, Rwanda, Burundi.
  - Southern East Africa = Tanzania, Mozambique, Malawi, Zambia, Zimbabwe (Madagascar left out).
  - Western Asia north = Turkey, Georgia, Armenia, Azerbaijan, Syria, Lebanon, Israel, Palestine, Jordan, Iraq, Kuwait, Cyprus.
  - Southern Asia west = Iran, Afghanistan, Pakistan.
  - Southern Asia east = India, Bangladesh, Nepal, Bhutan, Sri Lanka.
- **Origin units:** for each country, the finest of Natural Earth admin-1, the NE admin-1 `region` field, or the whole country whose median area is at least half a strategic hex (43,400 km² at res2, 6,200 km² at res3).
  - Spain is overridden to its autonomous communities, which have flags.
  - Counts are the units present in the map.
  - Origin units give new units their name and flag, and the existing origin bonus keys on them in regional mode.
  - Where no flag exists, use the country flag plus the NE `postal` code. The naming pipeline needs `iso_3166_2` added to its state rows.
- **Side groups:** the share is the group's fraction of the map's tactical urban cells. Land hexes are assigned to the group holding the majority of each hex's res4 land cells. Groups are drawn from province membership or the NE `region` / `region_sub` fields. The coordinate splits are:
  - Turkey west/east at 35°E (province centroid).
  - Uzbekistan east of 67.5°E is Eastern Uzbekistan.
  - Iran north and west = centroid at or above 33°N and at or below 54.5°E.
  - China's two provinces with no NE region go to East China & Taiwan if north of 23.5°N, else to South & southwest China.
  - Egypt's Upper Egypt = Fayyum, Beni Suef, Minya, Asyut, Sohag, Qena, Luxor, Aswan, Red Sea, New Valley.
  - DR Congo's Katanga & Kasai = Katanga, Kasaï-Occidental, Kasaï-Oriental.
  - Nigeria's Southwest = Lagos, Ogun, Oyo, Osun, Ondo, Ekiti, Kwara.
  - Northern Cameroon = Extrême-Nord, Nord, Adamaoua.
  - Southeast Brazil = São Paulo, Rio de Janeiro, Minas Gerais, Espírito Santo.
  - Mexican and South African groups are named state lists.
  - US groups use Census divisions (NE `region_sub`).
- **Urban cells:** Natural Earth 10m urban areas with scalerank ≤ 5 (the game's current rule), using H3 `overlap` containment at the map's tactical resolution, counted per strategic hex.
  - Run at res4, this method reproduces 93% of the game's res4 urban cells (4,304 of 4,643) with the same distribution (median 8 vs 8, 90th percentile 46 vs 44). Ratios therefore use the same method on both sides.
- **Global baseline (same method, res1/res4):** 264 producing hexes, median 8.
  - Share of producing hexes with at least 2 / 5 / 10 / 21 urban cells: 89% / 62% / 44% / 24%.
  - Geometric-mean urban cells of hexes able to build infantry / armor / air / naval: 7.75 / 9.88 / 17.16 / 25.43.
- **Scale:** the geometric mean of four ratios, each being the geometric-mean urban count of the regional hexes able to build a unit type (at the regional thresholds) over the global equivalent.
  - Infantry = 20 × scale, rounded to the nearest 5 when 20 or more, and to the nearest whole number below 20.
  - Armor, naval and air are 2×, 5× and 3× infantry.
  - Thresholds are the integers whose qualifying share is closest to the global shares above.
- **Terrain shares:** estimated from the res4 cells under each strategic hex (7 per res3 hex, 49 per res2 hex), using the game's classifier thresholds. Recompute them from res5/res6 cells.
- **Reference implementation:** `regional_tables_reference.py`, delivered with this file. Set `AW_GENERATED_DIR` to the folder holding `terrain_res4_naming.json` and `terrain_res4_metadata.json`, and `AW_NE_DIR` to the Natural Earth folder. It needs Python with h3 ≥ 4.1, pyshp, shapely, pyproj and dbfread.

## Open issues for planning (most important first)

1. **Side-group size imbalance.** Only Western Europe, Western Asia north and the Horn keep groups within a 2:1 size ratio. Equal production concentrates dense groups into very few hexes: Gauteng is 1 hex against 188 for the Cape group, and Eastern Uzbekistan is 4 hexes against 227 for Kazakhstan. **Decide** between two options:
   - (a) A production-weighted control win: hold the hexes that contain at least 75% of the enemy home's urban cells. This makes size matter much less. **Recommended.**
   - (b) A group generator that balances both production and size, accepting worse production balance.
2. **The hex-control win is slow** where the average side exceeds the global maximum of 69 home hexes: Middle Africa south (113), Maghreb (99), Southern Asia west (99), Southern Asia east (88), Libya–Egypt–Sudan (87), the Horn (86), Central Asia (84), Northern Europe (81) and West Africa coast (77). Option (a) above also fixes this.
3. **Shoreline "wetlands".** The classifier labels any land cell touching water on one or two edges as wetlands. It's the main kind on up to 49% of a map's hexes (Northern Europe), and armor can't enter wetland cells in battles. Fix the classification before regional battles.
4. **The classifier checks forest before mountain**, so forested ranges count as forest in battles. That covers 60% of rugged cells in the Rockies, 57% in the Alps and 100% in the Appalachians, and armor pays the forest cost there instead of being blocked. This applies to both modes.
5. **Urban data quality.** The scalerank ≤ 5 filter drops 68% of India's and 79% of Bangladesh's urban res4 cells, and Cuba has 3 urban cells at any scalerank. It also decides balance questions: the UK holds 52% of Northern Europe's urban cells with the filter and 27% without. Fix this before trusting any economy or side-group number, especially on the thin maps. EarthEnv consensus class 9 (urban/built-up, 1 km) is already on disk and worth comparing.
6. **Naval and air minimums** were matched across all producing hexes. Ports and airports haven't been counted at the regional resolutions.
7. **One price scale per map** means that on the thinner maps infantry builds 13–36% faster and fleets 10–31% slower than in the global game (Table 2, last column). Per-unit scales would fix build times but distort relative prices.
8. **Small samples.** The Advanced share lands at 15% (Middle Africa north) and 30% (Middle Africa south) instead of 21–27% on the other maps. Middle Africa north's scale of 0.50 is 4.5 cells under a global hit of 9, and the catalog stores 5.
9. **Engine work** (rough estimate 50–100 hours):
   - Resolution is read from the active map (`strategicH3Resolution`, `tacticalH3Resolution`). The active map is still the global one, resolutions 1 and 4. SQLite objects for the two grids are named `res_s_` and `res_t_`. Loading a chosen map's pack at match start, and moving the missing-data check off startup, is not in the engine yet.
   - Per-map data packs loaded at match start, with the missing-data check moved from startup.
   - The neutral-border rule.
   - EarthEnv 1 km topography for res6 maps (5 km grids give 2–3 pixels per res6 cell).
10. **Data volume:** 7,055 strategic hexes and about 2.4 million tactical cells across all 23 maps, roughly 8× today's res4 data. No single map exceeds about 121,000 tactical cells.

## Excluded regions

- Melanesia (almost no urban data), Micronesia and Polynesia (under 250 hexes even with three rings of sea), Antarctica, and the open-ocean group.
- The Sahel (Mauritania, Mali, Niger): it fits at 350 land hexes, but its urban economy is near zero.
- Optional second maps: Arabia (Saudi Arabia, Yemen, Oman, the Gulf states; 294 land hexes at res3).
- Madagascar is left out of Southern East Africa: adding it and the Mozambique Channel takes that map to 402 hexes.