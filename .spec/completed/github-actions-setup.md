# Adding the project to GitHub and enabling Actions

## 1. Add the repository to GitHub

1. **Create a new repository on GitHub**
   - Go to [github.com/new](https://github.com/new).
   - Choose a name (e.g. `agent-wars`), visibility (public or private), and **do not** add a README, .gitignore, or license if you already have local content.

2. **Add the remote and push**
   From your project root (with existing git and commits):

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/agent-wars.git
   git branch -M main
   git push -u origin main
   ```

   If you use SSH:

   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/agent-wars.git
   git branch -M main
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your GitHub username (and repo name if different).

3. **Optional: ignore build outputs**
   Your `.gitignore` already excludes `node_modules/`, `dist/`, and `release/`. The `release/` directory is produced by CI; you generally do not commit it.

## 2. GitHub Actions (already configured)

The workflow in **`.github/workflows/build.yml`** runs on every push and pull request to `main`. It:

- Runs **tests** (`npm run test`) on Windows, Linux, and macOS.
- Builds the app on each OS:
  - **Windows:** `npm run dist:win` → NSIS installer and portable exe in `release/`.
  - **Linux:** `npm run dist:linux` → `linux-unpacked/` and `agent-wars-<version>-linux-x64.tar.gz` in `release/`.
  - **macOS:** `npm run dist:mac` → unpacked `.app` in `release/`.

Artifacts are uploaded per run. To download them:

1. Open the run in the **Actions** tab.
2. Scroll to the **Artifacts** section.
3. Download `release-windows`, `release-linux`, or `release-mac`.

## 3. Optional: publishing releases

To attach built artifacts to a **GitHub Release** (e.g. when you tag a version):

- You can add a second workflow that triggers on `release published` or on tags like `v*`, run the same build matrix, then use `softprops/action-gh-release` to upload the `release/` contents as release assets. If you want this, the workflow can be extended or a separate `release.yml` can be added.
