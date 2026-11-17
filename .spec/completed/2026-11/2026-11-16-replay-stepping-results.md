# Replay Recording Size Results

These numbers are reported, not gated. They were measured on 2026-11-16 with a temporary test case that was removed afterward. Each match was a fresh start on turn 1 with weather on, a human seat, and two AI seats (global) or a region-versus-region start (regional).

## Per-Snapshot Sizes

| Match | View | Compressed bytes | Decoded JSON characters |
| --- | --- | --- | --- |
| Global | `all` | 10,064 | 148,896 |
| Global | `player` | 9,960 | 148,724 |
| Regional | `all` | 6,231 | 114,593 |
| Regional | `player` | 6,167 | 114,367 |

A frame of the same fresh global match compresses to 28,385 bytes, so the two view snapshots add about 70 percent to what a turn already stores at the start of a match. Writing both snapshots took about 53 ms on the global match and about 38 ms on the regional match.

## Late Save With Battles

Not measured. A late save with battles needs a save file from the user, which an unattended run cannot ask for. Measure it by copying a late save to a temp folder, opening the copy, and running the same temporary test case against it.

## Estimates

| Match length | Added compressed size (two views) | Added decoded size |
| --- | --- | --- |
| 150 turns | about 3.0 MB | about 45 MB |
| 900 turns | about 18 MB | about 270 MB |

These use the turn-1 sizes, so a late match with more units and more control will be larger.

## String Limit

The 917-turn AI-only match recorded on v3.0.0 decodes to about 379 MB before this recording. Adding about 270 MB of view snapshots for 900 turns gives about 650 MB, past the roughly 537 MB longest string V8 allows. The recording file is therefore written and read one line at a time, with no single string for the whole file.
