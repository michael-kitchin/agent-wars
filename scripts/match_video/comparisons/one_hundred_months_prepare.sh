#!/usr/bin/env bash
# Prepare two replays for scripts/match_video/comparisons/one_hundred_months.json.
# Usage: ./one_hundred_months_prepare.sh <folder with the replays>
#
# v3.0.0: the 120-second clip has one black frame (frame 392, at 17.4 seconds).
#   It is dropped, and the frame before it is held in its place.
# v3.6.0: the 120-second clip stops on the last planning turn. The results map, the
#   last frame of the condensed replay, is appended for 3 seconds so the win is on screen.
# Both outputs are 30 fps with no audio, which is what compose_match_comparison.py reads.
set -euo pipefail
cd "${1:?Give the folder that holds the replays.}"
ENCODE=(-an -c:v libx264 -crf 14 -preset veryfast -pix_fmt yuv420p -movflags +faststart)
WIN_SECONDS=3

ffmpeg -hide_banner -loglevel warning -y -i agentwars-v3.0.0-120sec-2026-11-15-1.mp4 \
  -vf "select='not(eq(n,392))',fps=30" "${ENCODE[@]}" agentwars-v3.0.0-120sec-2026-11-15-1.prepared.mp4

WIN_FRAME="$(mktemp --suffix=.png)"
trap 'rm -f "$WIN_FRAME"' EXIT
ffmpeg -hide_banner -loglevel warning -y -sseof -0.1 -i agentwars-v3.6.0-2026-11-24-1.condensed.mp4 \
  -frames:v 1 -update 1 "$WIN_FRAME"
ffmpeg -hide_banner -loglevel warning -y -i agentwars-v3.6.0-120sec-2026-11-24-1.mp4 \
  -loop 1 -framerate 30 -t "$WIN_SECONDS" -i "$WIN_FRAME" \
  -filter_complex "[0:v]fps=30,format=yuv420p[match];[1:v]format=yuv420p[win];[match][win]concat=n=2:v=1:a=0[v]" \
  -map "[v]" "${ENCODE[@]}" agentwars-v3.6.0-120sec-2026-11-24-1.prepared.mp4
