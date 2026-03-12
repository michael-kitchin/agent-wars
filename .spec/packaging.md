# Building distributable versions

The project uses [electron-builder](https://www.electron.build/) to produce installers and portable builds for Windows, Linux, and macOS.

## Prerequisites

- `npm install` (includes `electron-builder` as a dev dependency)
- For **macOS** builds: you must run on a Mac (or use a Mac in CI). electron-builder does not support building for macOS from Windows or Linux; `npm run dist:mac` will exit with a clear message if run on a non-Mac.

## Commands

From the project root:

| Command | Output |
|--------|--------|
| `npm run dist` | Build for the **current platform** only |
| `npm run dist:win` | Windows: NSIS installer + portable exe |
| `npm run dist:linux` | Linux: unpacked app directory (zip to ship) |
| `npm run dist:mac` | macOS: unpacked .app directory (zip to ship; or build on a Mac for .dmg) |

`dist:win`, `dist:linux`, and `dist:mac` run **`clean:release`** first (removes the `release/` folder so no locked files from a previous run or a running app), then build, then electron-builder. If you see "Release folder in use", close the app and any tools using `release/`, then retry. `npm run dist` does not clean. Artifacts are written to the **`release/`** directory.

## Cross-platform from one machine

- **On Windows:** `npm run dist:win` and `npm run dist:linux` both work. Linux output is an unpacked folder in `release/linux-unpacked/`; the runnable is **`agent-wars`** (no extension) inside that folder. Zip the whole folder for Linux users; they unzip and run `./agent-wars`. AppImage/.deb require building on Linux. Use a Mac or CI for macOS.
- **On Linux:** `npm run dist:linux`, `npm run dist:win`, and (on some setups) `npm run dist:mac` may work.
- **On macOS:** You can build for all three; use `npm run dist` to build for the current platform only.

## Output layout (Windows example)

After `npm run dist:win`, `release/` typically contains:

- `Agent Wars Setup x.x.x.exe` — NSIS installer
- `agent-wars x.x.x.exe` — portable (no install) executable

Linux (from Windows) produces `release/linux-unpacked/` — a directory you can zip and run on Linux. For AppImage or .deb, run `npm run dist:linux` on a Linux machine and change the Linux target in `package.json` to `["AppImage", "deb"]`. For a signed .dmg, run `npm run dist:mac` on a Mac and change the Mac target to `["dmg"]`.

## Configuration

Build configuration lives under the `"build"` key in `package.json`: app id, product name, output directory, `files` to include, and per-platform targets. Adjust there if you need different installers (e.g. only portable, or zip instead of NSIS).
