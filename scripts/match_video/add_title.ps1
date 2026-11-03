<#
.SYNOPSIS
    Burns a full-frame title overlay (transparent PNG) into the start of a video,
    holds it, then fades it out. Audio is copied unchanged.

.DESCRIPTION
    Reads the input video's size and frame rate with ffprobe, scales the overlay
    to match, and re-encodes the video with libx264 (CRF 18, preset veryfast).
    Requires ffmpeg and ffprobe on PATH. Works in Windows PowerShell 5.1 and PowerShell 7+.

.EXAMPLE
    .\add_title.ps1 match_3min.mp4 title_overlay_1920x1080.png match_3min_titled.mp4

.EXAMPLE
    .\add_title.ps1 -InputVideo match_3min.mp4 -Overlay title_overlay_1920x1080.png `
        -OutputVideo match_3min_titled.mp4 -HoldSeconds 4 -FadeSeconds 0.5
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$InputVideo,

    [Parameter(Mandatory = $true, Position = 1)]
    [string]$Overlay,

    [Parameter(Mandatory = $true, Position = 2)]
    [string]$OutputVideo,

    [Parameter(Position = 3)]
    [ValidateRange(0.1, 60)]
    [double]$HoldSeconds = 3,

    [Parameter(Position = 4)]
    [ValidateRange(0.1, 10)]
    [double]$FadeSeconds = 1
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($tool in 'ffmpeg', 'ffprobe') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool was not found on PATH."
    }
}

# Resolve paths against the current PowerShell location (not .NET's working directory).
function Resolve-FullPath([string]$Path) {
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

$inPath  = Resolve-FullPath $InputVideo
$ovPath  = Resolve-FullPath $Overlay
$outPath = Resolve-FullPath $OutputVideo

foreach ($p in $inPath, $ovPath) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
        throw "File not found: $p"
    }
}
if ([string]::Equals($inPath, $outPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputVideo must be different from InputVideo.'
}

# Video size, e.g. "1920x1080"
$sizeText = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x $inPath
if ($LASTEXITCODE -ne 0 -or -not ("$sizeText" -match '(\d+)x(\d+)')) {
    throw "Could not read the video size from $inPath"
}
$width  = [int]$Matches[1]
$height = [int]$Matches[2]

# Frame rate as a rational, e.g. "30/1" or "60000/1001"
$fpsText = & ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 $inPath
$fps = '30'
if ($LASTEXITCODE -eq 0 -and "$fpsText" -match '(\d+)/(\d+)' -and [int64]$Matches[1] -gt 0 -and [int64]$Matches[2] -gt 0) {
    $fps = "$($Matches[1])/$($Matches[2])"
}

# Format numbers with '.' as the decimal separator regardless of the system locale.
$inv   = [System.Globalization.CultureInfo]::InvariantCulture
$hold  = $HoldSeconds.ToString($inv)
$fade  = $FadeSeconds.ToString($inv)
$total = ($HoldSeconds + $FadeSeconds).ToString($inv)

$filter = "[1:v]scale=${width}:${height},format=rgba,fade=t=out:st=${hold}:d=${fade}:alpha=1[t];" +
          "[0:v][t]overlay=0:0:eof_action=pass:format=auto[v]"

$ffmpegArgs = @(
    '-hide_banner', '-y',
    '-i', $inPath,
    '-loop', '1', '-t', $total, '-framerate', $fps, '-i', $ovPath,
    '-filter_complex', $filter,
    '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    $outPath
)

Write-Host "Video: ${width}x${height} @ $fps fps; title holds ${hold}s, fades over ${fade}s"
# ffmpeg writes progress to stderr; some hosts (e.g. the ISE) turn that into errors,
# so relax the error preference while it runs and rely on the exit code instead.
$savedPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    & ffmpeg @ffmpegArgs
    $exitCode = $LASTEXITCODE
}
finally {
    $ErrorActionPreference = $savedPreference
}
if ($exitCode -ne 0) {
    throw "ffmpeg failed with exit code $exitCode"
}
Write-Host "Wrote $outPath"
