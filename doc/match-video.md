# Match recordings

`scripts/condense_match_video.py` shortens a recorded match. Motion stays at its original speed. Each frozen stretch keeps a short still, and the audio is removed. The game never loads the result. ffmpeg and ffprobe must be on PATH. When `--ffprobe` is omitted, `resolve_tools` uses the ffprobe beside the ffmpeg it found when that file exists.

From the repository root:

```
python scripts/condense_match_video.py match.mp4
```

The default output is `<stem>.condensed.mp4` beside the source. `--output` chooses another path. An output that is already there stays in place. `--force` replaces it. A failed write removes a file that appeared or changed during the attempt. An output ffmpeg did not open stays as it was.

`--dry-run` prints the keep plan and writes nothing. Exit code 0 means the run finished. Exit code 1 means the recording could not be condensed. argparse uses exit code 2. The flag list is `build_parser` in `scripts/match_video/command_line.py`.

## What the output contains

`condense_match_video` in `scripts/match_video/condense_match_video.py` drops the audio on every output.

`build_keep_intervals` in `scripts/match_video/keep_plan.py` keeps the motion and the start of each freeze. `--still-keep-seconds` is that head. The default is 1 (`_DEFAULT_STILL_KEEP_SECONDS`), and the allowed range is 0 through 86400. A freeze shorter than the buffer stays whole. `0` drops the body of each freeze. When that would leave an empty file, the first frame is kept.

A freeze that is still running when the recording ends is closed at the container duration (`finish_freezes`).

When the plan still covers the whole timeline, the video track is copied and the audio is removed. When a frozen tail is cut, the picture is re-encoded with libx264 and `yuv420p`. `build_keep_filter` in `scripts/match_video/keep_plan.py` gives each kept span its own `trim` and joins them with `concat`. A single `select` expression runs out of memory once a recording has hundreds of cuts. `--crf` defaults to 20 (0 through 51). `--preset` defaults to `medium` and must be one of `_X264_PRESETS`. `.mp4` and `.mov` are written with `+faststart`.

## Which pixels count as frozen

Detection uses ffmpeg `freezedetect`. `--detect-region` is `x1,y1,x2,y2` (`DetectRegion` in `scripts/match_video/detect_region.py`). The origin is the top-left of the frame. `x1,y1` is included and `x2,y2` is excluded. The default is the whole frame. The rectangle decides which frames are duplicates. The written frame stays the full source frame, at the source size.

A yuv420 crop needs even edges. `align_region_to_even_pixels` rounds `x1` and `y1` down to an even pixel and moves `x2` and `y2` onto an even pixel that still fits in the frame. A box that cannot survive that alignment is rejected, and so is a box that extends past the frame.

`--compare-width` scales the detection image. `0` leaves it at its own width: the detect region, or the whole frame when no region is set. Any other value is an even width from 64 to 7680. The output frame is unchanged.

`--freeze-noise` is the duplicate threshold (`freeze_noise_ratio`). The default is `0.001` (`_DEFAULT_FREEZE_NOISE`), the same as `-60` dB. A positive value is a ratio up to 1. A negative value is decibels, converted with `10 ** (dB / 20)`. A larger ratio treats smaller on-screen changes as frozen.

## Side-by-side comparisons

`scripts/compose_match_comparison.py` composes condensed replays into one 1920x1080 video. A comparison file names the replays and their labels. The comparison of v2.21.0, v2.22.0, and v3.0.0 is `scripts/match_video/comparisons/world_war_n.json`. The comparison of v3.0.0, v3.4.1, and v3.6.0 is `scripts/match_video/comparisons/one_hundred_months.json`. ffmpeg and ffprobe must be on PATH, and Pillow must be installed (`scripts/match_video/requirements.txt`).

From the repository root:

```
python scripts/compose_match_comparison.py scripts/match_video/comparisons/world_war_n.json --source-dir <folder with the replays>
```

The default output is `<comparison stem>-<layout>.mp4` in `--source-dir`. `--output` chooses another path. An output that is already there stays in place unless `--force` is given, and a failed write removes a file that appeared or changed during the attempt. `--still <seconds>` writes one PNG frame from that replay time instead, which is quick for checking labels and crops. Exit code 0 means the output was written, and exit code 1 means it could not be composed. The flag list is `build_parser` in `scripts/match_video/compose_match_comparison.py`.

### Layouts

`--layout quad`, the default, puts three replays on a two-by-two grid in the top-left, top-right, and bottom-right cells. The bottom-left cell is a legend card (`render_quad_card` in `scripts/match_video/comparison_panels.py`) with the title and one row per replay. `--layout duo` puts two replays side by side between a header band and a footer band (`render_duo_bands`).

Each replay pane is `MAP_CROP` from `scripts/match_video/comparison_geometry.py`, scaled to 960x540. A tag panel covers the minimap in the pane's top-left corner. It shows the version, the nickname, and the replay's own date and turn readout (`TURN_CROP`).

The faction legend for each replay is cropped live from the game's "Observing" list, so its colors and knockout strikethroughs come from the game. Faction colors follow seat order, which can differ between replays, so every replay keeps its own legend.

### Timing

Every replay starts at `--start` (default 0) and runs for `--duration`. Without `--duration`, the output stops `--end-trim` seconds before the shortest replay in the layout ends. The default trim is 1 second (`_DEFAULT_END_TRIM_SECONDS`). The last `FADE_OUT_SECONDS` (0.75) fade to black unless `--no-fade` is set.

A `--duration` longer than the replays holds each replay's last frame until the output ends. `one_hundred_months.json` is composed with `--duration 122.4`, which runs to the end of its longest replay and holds the last frame of the two shorter ones.

The output is H.264 at 30 fps (`OUTPUT_FPS`) with no audio. `--crf` defaults to 20 and `--preset` to `veryfast`.

The replays are aligned by elapsed time, not by turn. Condensed replays spend slightly different numbers of frames per turn, so their turn counters drift apart over the video.

### Comparison file

`load_comparison_spec` in `scripts/match_video/comparison_spec.py` reads and checks the file. The top level holds `title`, `subtitle`, an optional `footer`, an optional `capture`, `replays`, and `layouts`. `layouts` maps `quad`, `duo`, or both to replay keys in on-screen order. `LAYOUT_SIZES` gives how many keys each layout takes.

Each replay holds `key`, `file` (relative to `--source-dir`), `version`, `nickname`, `turns_shown`, and `legend_width`, plus an optional `note`, optional `legend_masks`, an optional `toolbar_hold_seconds`, and an optional `capture`.

`turns_shown` is the number of completed turns at the comparison's last frame, not the replay's total. To find it, render `--still` at the end of the output and read each turn readout. A readout of "Turn 516 · Planning" means 515 completed turns.

`legend_width` is the width of the legend crop in source pixels, starting at `LEGEND_X`. The crop should end just before the game's "View as" label. A knockout marker such as "(T216)" lengthens the legend and pushes "View as" to the right. A replay with knockouts therefore uses its final legend width and one `legend_masks` entry for each step. `x` is where "View as" starts in the strip before that knockout, and `until_seconds` is the replay time when the knockout appears. Check each time with `--still` just before and just after it.

`toolbar_hold_seconds` is a replay time after which the legend and the turn readout keep their last picture. A finished match swaps its toolbar for the start menu, so a replay that runs to a victory sets this just before that swap. `--still` ignores it.

### Capture assumptions

The crops in `scripts/match_video/comparison_geometry.py` assume a 1920x1080 capture of the maximized game window, with the toolbar along the top, the command rail on the right, and the Windows taskbar along the bottom. A capture with another size or layout needs new crops there.

A replay that was re-exported from a video editor can sit lower in the frame and lose its bottom rows. An optional `capture` object covers that case (`CaptureGeometry`). At the top level of the comparison file it applies to every replay that has no `capture` of its own. Inside a replay it applies to that replay only.

A replay's `capture` replaces the top-level one as a whole. A field it leaves out takes the plain-capture value from `DEFAULT_CAPTURE`, not the top-level value. `toolbar_shift_y` is how many pixels the toolbar sits below its usual place, and it moves the legend and turn readout crops. `map_crop` replaces `MAP_CROP` and holds `x`, `y`, `width`, and `height` in source pixels. Keep it close to 16:9, because it is scaled to the 960x540 pane.

### Prepared replays

`one_hundred_months.json` names two `.prepared.mp4` replays. This script writes them into the folder that holds the replays:

```
bash scripts/match_video/comparisons/one_hundred_months_prepare.sh <folder with the replays>
```

It drops one black frame from the v3.0.0 clip. The v3.6.0 clip stops on the last planning turn, so the script appends 3 seconds (`WIN_SECONDS`) of the results map, taken from the end of the v3.6.0 condensed replay. That folder therefore needs both 120-second clips and the v3.6.0 `.condensed.mp4`, under the names the script gives.

Both outputs are 30 fps with no audio. Unlike the Python tools, the script overwrites an output that is already there. It needs bash, ffmpeg on PATH, and a `mktemp` that accepts `--suffix`, as GNU `mktemp` does.

### Title overlays

`scripts/match_video/add_title.ps1` and `scripts/match_video/add_title.sh` burn a full-frame transparent PNG over the opening seconds of a video. They hold it for 3 seconds and fade it out over 1 second by default. Title overlays and the HTML they were rendered from are in `scripts/match_video/titles/`. The file name ends with the overlay's size, and some titles come in both 1920x1080 and 3840x2160. Both scripts scale the overlay to the video's size, so pick the file that matches the video.

## Tests

```
python -m unittest scripts.match_video.tests.test_keep_plan scripts.match_video.tests.test_condense_match_video scripts.match_video.tests.test_comparison_spec scripts.match_video.tests.test_compose_match_comparison
```

Tests that run ffmpeg are skipped when ffmpeg or ffprobe is not on PATH.
