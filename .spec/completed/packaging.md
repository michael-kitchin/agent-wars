# Building distributable versions

The project uses [electron-builder](https://www.electron.build/) to produce distributables for Windows, Linux, and macOS.

## Prerequisites

- `npm install` (includes `electron-builder` as a dev dependency)
- For **macOS** builds: you must run on a Mac (or use a Mac in CI). electron-builder does not support building for macOS from Windows or Linux; `npm run dist:mac` will exit with a clear message if run on a non-Mac.

## Commands

From the project root:

| Command | Output |
| ------- | ------ |
| `npm run dist` | Build for the **current platform** only |
| `npm run dist:win` | Windows: ZIP archive containing unpacked app (double-click `Agent Wars v<version>.exe`) |
| `npm run dist:linux` | Linux: unpacked app directory + TGZ archive (executable bit set, ready to ship) |
| `npm run dist:mac` | macOS: unpacked .app directory (zip to ship; or build on a Mac for .dmg) |

`dist:win`, `dist:linux`, and `dist:mac` run **`clean:release`** first (removes the `release/` folder so no locked files from a previous run or a running app), then build, then electron-builder. If you see "Release folder in use", close the app and any tools using `release/`, then retry. `npm run dist` does not clean. Artifacts are written to the **`release/`** directory.

## Cross-platform from one machine

- **On Windows:** `npm run dist:win` and `npm run dist:linux` both work. Linux output is `release/linux-unpacked/` (with the main binary executable bit set) and a **`release/agent-wars-<version>-linux-x64.tar.gz`** archive ready to distribute. Recipients extract the TGZ and run `./agent-wars`. AppImage/.deb require building on Linux. Use a Mac or CI for macOS.
- **On Linux:** `npm run dist:linux`, `npm run dist:win`, and (on some setups) `npm run dist:mac` may work.
- **On macOS:** You can build for all three; use `npm run dist` to build for the current platform only.

## Output layout (Windows example)

After `npm run dist:win`, `release/` typically contains:

- `Agent Wars v<version>-win-x64.zip` — ZIP archive with the unpacked app folder and executable

Linux produces `release/linux-unpacked/` (main executable has +x) and `release/agent-wars-<version>-linux-x64.tar.gz` for distribution. For AppImage or .deb, run `npm run dist:linux` on a Linux machine and change the Linux target in `package.json` to `["AppImage", "deb"]`. For a signed .dmg, run `npm run dist:mac` on a Mac and change the Mac target to `["dmg"]`.

## Configuration

Build configuration lives in `electron-builder.config.cjs`: app id, product name, output directory, `files`/`extraResources` to include, and per-platform targets. Adjust there if you need different artifact types.
