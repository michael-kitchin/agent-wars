# Releasing

How a version of Agent Wars becomes a GitHub release. The builds are unsigned side-load builds for Windows (x64), macOS (Apple silicon), and Linux (x64), made by the Build workflow in [`.github/workflows/build.yml`](../.github/workflows/build.yml).

## Before the build

1. **Set the version.** `npm version <x.y.z> --no-git-tag-version` updates `package.json` and `package-lock.json`. The version names the archives, the Windows and macOS executables (`Agent Wars v<x.y.z>`), and the release tag (`v<x.y.z>`).
2. **Write the release notes** at `doc/release-notes/v<x.y.z>.md`. The draft-release job fails without them. Start from the previous version's notes: downloads, first-launch steps, what's new, and known limits. Then add the **Earlier N.x releases** section, where N is this release's major version, between What's in and Known limits: the What's in section of every earlier N.x release, newest first, each collapsed in its own `<details>` block, with their subheadings one level deeper than in the original notes. A block is `<details>`, then `<summary><strong><x.y.z></strong></summary>`, a blank line, that release's What's in text, a blank line, and `</details>`, and a blank line before the next block. The blank lines are required, or the markdown inside the block does not render. Leave the blocks closed (no `open` attribute), so the page shows this release's own changes first. Copy it from the previous N.x release's notes, which already carries every older one, and add that release's own What's in section as a new block on top, with its version in the summary. The section opens with "The changes in each earlier N.x release, newest first, so this page lists " and then either "everything since P, the last (N-1).x release" (P is that release's version, as in "everything since 2.26.0, the last 2.x release") or, when no earlier major has a release, "every change in N.x". It ends with ". Those releases are no longer published." Take care that the body stays under GitHub's limit of 125,000 characters.
3. **Update the version where the docs state it.** In the root README: the executable names under [Play it](../README.md#play-it), the version under Status, and the test count under What's inside. In [doc/README.md](README.md): the shipping version.
   Add a summary of the release above the previous one in both places: a `- **<x.y.z>** ...` bullet at the top of the root README's Releases After 2.5.0 list under Status, and a `Release **<x.y.z>** ...` paragraph in [doc/README.md](README.md). Keep every earlier summary. Release summaries and the files in `doc/release-notes/` are the permanent record, so they stay when a release is deleted.
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

## Remove superseded releases

Keep only the newest release of each major version. After publishing `v<x.y.z>`, delete every other published release with the same major version, and leave the newest release of every other major version alone. Publishing 3.4.1, for example, removes 3.4.0 and keeps 2.26.0.

1. List the releases: `gh release list --limit 200`.
2. For each older release with the same major version as the one you just published, run `gh release delete v<x.y.z> --yes`. Don't pass `--cleanup-tag`: the git tag stays, so the history still points at the commit.
3. Check that `gh release list` shows exactly one release for each major version, and that the newest version overall is marked Latest. A patch to an older major, such as 2.26.1 after 3.4.0, is not Latest.

The new release's notes already carry the deleted releases' changes (Before the build, step 2), so the page that stays lists every change in its major version since the last release of the major before it. The first release of a new major has no Earlier section. A deleted release's own notes file stays as it is. Only the GitHub release is removed. Its notes file in `doc/release-notes/`, its summary in the root README, and its summary in [doc/README.md](README.md) all stay. Do this only after the new release is published, never for a draft.

## Builds without a release

Run the Build workflow with the box unchecked. Each run uploads one artifact per OS, kept until the repository's artifact retention period ends.

The Windows artifact is named `agent-wars-<version>-windows-<arch>`. Downloading it from the Actions page gives one zip of the unpacked app, with the executable at the root of the zip. The upload stores a zip, so the Windows job does not zip the app itself; a zip made on the runner would be wrapped in a second zip. `gh run download` extracts that artifact, so the zip to hand out is the Actions download or the draft-release asset, not the extracted folder.

Linux and macOS artifacts are named `agent-wars-<version>-linux-<arch>.tar.gz` and `agent-wars-<version>-macos-<arch>.zip`. Each artifact is that archive. The runner builds it so Unix permissions and symlinks survive, and the upload stores the file itself. The Actions page download is that tar.gz or zip. Hand out that download or the draft-release asset. `gh run download` extracts zip payloads, so the macOS artifact unpacks to the app and the Linux tar.gz fails extraction.

Hand out the Windows zip, the Linux tar.gz, and the macOS zip as they are. Don't re-zip the Linux or macOS archives on Windows: that drops the Unix permissions the Linux launcher needs, and a macOS app bundle needs its symlinks kept.
