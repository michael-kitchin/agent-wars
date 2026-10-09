# Security

Agent Wars is a personal research and development project with one maintainer. There is no bug bounty and no response-time commitment, but security reports are welcome and will be read.

## Reporting a vulnerability

Report privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**. Include the version, your operating system, and the steps that show the problem. Please don't post details anywhere public before a fix is released.

Only the latest release is supported. Fixes ship in a new release rather than as patches to older ones.

## What the app does with your OpenRouter key

- You enter the key in the renderer. It is handed to the Electron main process over the preload bridge, and only the main process uses it.
- The key is saved in the app's user-data directory, not in the repository or the install folder. It is encrypted with Electron's `safeStorage` when the operating system provides encryption, and saved as plain text when it doesn't. To delete the saved key, clear the key field and click outside it.
- The key is sent only to OpenRouter (`openrouter.ai`), in the `Authorization` header of chat and model-list requests.

## Hardening in the current build

- The renderer runs with context isolation on and Node integration off. It reaches the main process only through the `gameApi` bridge in `src/main/preload.ts`.
- `static/index.html` sets a Content-Security-Policy. Scripts load only from the app itself, and images only from the app and the two map tile hosts (Esri and OpenStreetMap). The renderer makes no other network requests.
- The builds are unsigned side-load builds. Compare a download against `SHA256SUMS.txt` on the release page before you run it.
