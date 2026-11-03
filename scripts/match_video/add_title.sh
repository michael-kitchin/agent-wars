#!/usr/bin/env bash
# Usage: ./add_title.sh input.mp4 title_overlay_1920x1080.png output.mp4 [seconds_visible=3] [fade_seconds=1]
set -euo pipefail
IN="$1"; OV="$2"; OUT="$3"; HOLD="${4:-3}"; FADE="${5:-1}"
IFS=x read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$IN")
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$IN")
DUR=$(python3 -c "print($HOLD+$FADE)")
ffmpeg -y -i "$IN" -loop 1 -t "$DUR" -framerate "$FPS" -i "$OV" \
  -filter_complex "[1:v]scale=${W}:${H},format=rgba,fade=t=out:st=${HOLD}:d=${FADE}:alpha=1[t];[0:v][t]overlay=0:0:eof_action=pass:format=auto[v]" \
  -map "[v]" -map "0:a?" -c:v libx264 -crf 18 -preset veryfast -pix_fmt yuv420p -c:a copy -movflags +faststart "$OUT"
