# Releasing

How a version of Agent Wars becomes a GitHub release. The builds are unsigned side-load builds for Windows (x64), macOS (Apple silicon), and Linux (x64), made by the Build workflow in [`.github/workflows/build.yml`](../.github/workflows/build.yml).

## Before the build

1. **Set the version.** `npm version <x.y.z> --no-git-tag-version` updates `package.json` and `package-lock.json`. The version names the archives, the Windows and macOS executables (`Agent Wars v<x.y.z>`), and the release tag (`v<x.y.z>`).
2. **Write the release notes** at `doc/release-notes/v<x.y.z>.md`. The draft-release job fails without them. Start from the previous version's notes: downloads, first-launch steps, what's new, and known limits.
3. **Update the version where the docs state it.** In the root README: the executable names under [Play it](../README.md#play-it), the version under Status, and the test count under What's inside. In [doc/README.md](README.md): the shipping version.
4. **Check the third-party notices.** New dependencies or data need entries in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md). `npm run test` ends with the notices check.
5. **Run `npm run test`**, then commit and push to `main`. The CI workflow runs the same check on the push.

## Build and draft the release

1. Start the Build workflow on `main` with **Create a draft release from this commit** checked: in GitHub under **Actions > Build > Run workflow**, or with `gh workflow run build.yml --ref main -f draft_release=true`.
2. Each OS job tests and packages its build. Windows uploads the unpacked app, so the Actions artifact is one zip. Linux and macOS archive on the runner first, then upload that tar.gz or zip as the artifact file. A directory upload drops Unix permissions and follows symlinks, and wrapping the archive would put a compressed file inside another zip. The macOS job keeps electron-builder's signature when it verifies and signs ad hoc when it doesn't, since Apple silicon won't launch an app without a valid signature.
3. The release job runs only when all three builds pass. It publishes the three stored archives, writes `SHA256SUMS.txt`, and creates a draft release `v<x.y.z>` on the built commit, with the notes file as its body.

If a build fails, nothing is drafted: fix the problem, push, and run the workflow again. Delete an older draft for the same version before drafting a new one (`gh release delete v<x.y.z>`).

## Smoke test, then publish

A draft is visible only to people with write access to the repository. Before publishing it, download each archive you can test from the draft and, for each one:

1. Check the archive against `SHA256SUMS.txt`.
2. Extract it and launch the game through the operating system's first-launch warning, as the notes describe.
3. Start a match, save an OpenRouter key, run one consultation, and resolve one turn.

On macOS, a message that the app "is damaged" means its signature didn't survive packaging. Don't publish that build; start with the signature step in `build.yml`.

Then review the notes and the asset list on the draft and choose **Publish release** (or run `gh release edit v<x.y.z> --draft=false`). Publishing creates the tag `v<x.y.z>` on the built commit, and the Release badge in the README picks up the new version.

## Builds without a release

Run the Build workflow with the box unchecked. Each run uploads one artifact per OS, kept until the repository's artifact retention period ends.

The Windows artifact is named `agent-wars-<version>-windows-<arch>`. Downloading it from the Actions page gives one zip of the unpacked app, with the executable at the root of the zip. The upload stores a zip, so the Windows job does not zip the app itself; a zip made on the runner would be wrapped in a second zip. `gh run download` extracts that artifact, so the zip to hand out is the Actions download or the draft-release asset, not the extracted folder.

Linux and macOS artifacts are named `agent-wars-<version>-linux-<arch>.tar.gz` and `agent-wars-<version>-macos-<arch>.zip`. Each artifact is that archive. The runner builds it so Unix permissions and symlinks survive, and the upload stores the file itself. The Actions page download is that tar.gz or zip. Hand out that download or the draft-release asset. `gh run download` extracts zip payloads, so the macOS artifact unpacks to the app and the Linux tar.gz fails extraction.

Hand out the Windows zip, the Linux tar.gz, and the macOS zip as they are. Don't re-zip the Linux or macOS archives on Windows: that drops the Unix permissions the Linux launcher needs, and a macOS app bundle needs its symlinks kept.
