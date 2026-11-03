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

## Tests

```
python -m unittest scripts.match_video.tests.test_keep_plan scripts.match_video.tests.test_condense_match_video
```
