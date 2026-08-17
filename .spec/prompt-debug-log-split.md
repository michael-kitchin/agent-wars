# Prompt debug log artifacts

Contract for writing the last OpenRouter consultation prompts to disk during support sessions.

## When files are written

Full prompt files are written only when `AGENT_WARS_LOG_FULL_PROMPTS` is set to a truthy value (`1`, `true`, `yes`, or `on`, case-insensitive). When the flag is off, the process logs a truncated debug preview and does not write these files.

Writes go to the process current working directory. Filenames are gitignored via `debug-last-*.txt`.

## Artifact filenames

Each consultation that reaches prompt assembly may overwrite at most these files:

| Prompt | File |
|--------|------|
| Initial user message | `debug-last-user-prompt.txt` |
| Strategic system prompt | `debug-last-strategic-prompt.txt` |
| Tactical system prompt | `debug-last-tactical-prompt.txt` |

Last write wins **per file**. A strategic consultation overwrites the strategic system file and the user file; it must not overwrite the tactical system file. A tactical consultation overwrites the tactical system file and the user file; it must not overwrite the strategic system file.

The system-prompt file is chosen from the same coordinate mode used to build that prompt (`strategic` or `tactical`). Do not infer the file from log-label text.

`debug-last-system-prompt.txt` is not a valid artifact name. Do not write it.

## Contents

The system-prompt file contains the text sent to the model as the `system` role. When a strategic consultation cannot embed an operational map in that text, a diagnostic-only map supplement may be appended after a separator; that supplement is not sent to the model.

The user-prompt file contains the initial `user` role text for the consultation. Repair or malformed-completion follow-up user messages are not these artifacts.

## Out of scope

Chat payload shape, always-on disk logging, and runtime deletion of leftover files are not part of this contract.
