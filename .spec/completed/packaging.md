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
| `npm run dist:linux` | Linux: unpacked app directory. `agent-wars` is the launcher; the Electron binary is `agent-wars.bin` |
| `npm run dist:mac` | macOS: unpacked .app directory (zip to ship; or build on a Mac for .dmg) |

`dist:win`, `dist:linux`, and `dist:mac` run **`clean:release`** first (removes the `release/` folder so no locked files from a previous run or a running app), then build, then electron-builder. If you see "Release folder in use", close the app and any tools using `release/`, then retry. `npm run dist` does not clean. Artifacts are written to the **`release/`** directory.

## Cross-platform from one machine

- **On Windows:** `npm run dist:win` and `npm run dist:linux` both work. Linux output is `release/linux-unpacked/`. Recipients run `./agent-wars`. That file is a launcher; the Electron binary beside it is `agent-wars.bin`. AppImage/.deb require building on Linux. Use a Mac or CI for macOS.
- **On Linux:** `npm run dist:linux` works. `npm run dist:win` may work. macOS builds run on a Mac.
- **On macOS:** You can build for all three; use `npm run dist` to build for the current platform only.

## Output layout (Windows example)

After `npm run dist:win`, `release/` typically contains:

- `Agent Wars v<version>-win-x64.zip` — ZIP archive with the unpacked app folder and executable

Linux produces `release/linux-unpacked/`. Run `./agent-wars`. Chromium aborts when `chrome-sandbox` is present but not owned by root with mode 4755. A CI artifact, or any archive a normal user extracts, cannot keep that ownership. The abort happens when the kernel also blocks unprivileged user namespaces, which Ubuntu 23.10 and later do through AppArmor. The launcher keeps the sandbox when user namespaces work, or when `chrome-sandbox` is root and mode 4755. It follows symlinks, so a deb package's `/usr/bin` link still finds the binary. Root starts with `--no-sandbox`, because Chromium refuses a sandboxed root process. When neither namespaces nor a correct helper are available, the launcher starts with `--no-sandbox` and says so on stderr. macOS builds use the seatbelt sandbox and ship no `chrome-sandbox`, so this launcher is not applied to the `.app`.

For AppImage or .deb, run `npm run dist:linux` on a Linux machine and change the Linux target in `electron-builder.config.cjs` to `["AppImage", "deb"]`. For a signed .dmg, run `npm run dist:mac` on a Mac and change the Mac target to `["dmg"]`.

## Configuration

Build configuration lives in `electron-builder.config.cjs`: app id, product name, output directory, `files`/`extraResources` to include, and per-platform targets. Adjust there if you need different artifact types.
