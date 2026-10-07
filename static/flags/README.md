# Country Flag SVGs

These SVGs are a vendored copy of [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags), pinned at commit `c09927e63705529bbf59ca6684cd9b23225dddad`.

## What Was Copied

Only the two-letter files from the upstream `svg/` folder (`^[a-z]{2}\.svg$`, 251 files) are here. The four `gb-*.svg` subdivision flags (`gb-eng`, `gb-nir`, `gb-sct`, `gb-wls`) were left out because the game resolves countries by ISO 3166-1 alpha-2 code only. Kosovo uses the user-assigned code `XK`, as upstream does.

The file names are the lowercase codes. `src/shared/countryFlags.ts` lists the same codes in `AVAILABLE_COUNTRY_FLAG_CODES`, and `src/shared/countryFlags.test.ts` fails if the list and this folder disagree. Any code without a file falls back to `static/flag-unknown.svg`, which is authored in this repository.

Subdivision flags live in `subdivisions/`. A regional unit uses the subdivision SVG when the origin area's `iso_3166_2` code is in that folder (the allow-list is `SUBDIVISION_FLAG_CODES`), and otherwise the national SVG for the area's country code. Attribution for those files is in `subdivisions/ATTRIBUTION.md`.

## License

The upstream repository has no LICENSE file. Its README states that the flags were taken from Wikimedia Commons and are not under copyright protection, because flags are in the public domain. It also notes that other restrictions on how a flag is used may still apply.

## Refreshing

1. Clone the upstream repository outside this repo and check out the commit you want.
2. Replace the contents of this folder with that commit's `svg/[a-z][a-z].svg` files, keeping this README.
3. Update the commit hash above and the code list in `src/shared/countryFlags.ts`.
4. Run `npm test`.
