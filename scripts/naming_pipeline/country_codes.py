"""
Resolve ISO 3166-1 alpha-2 country codes for Natural Earth naming rows.

Natural Earth stores the codes on the countries layer (`ISO_A2_EH`, falling back to
`ISO_A2`), keyed by `ADM0_A3`. States and cities carry `ADM0_A3`, so their codes are
looked up through that key. This module is pure: it does no shapefile I/O, so the
generator can import it without an import cycle.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping

LOGGER = logging.getLogger(__name__)

NO_CODE_SENTINEL = "-99"


def normalize_iso_a2(value: object) -> str | None:
    """
    Why this exists:
        Natural Earth mixes real codes, `-99` sentinels, blanks, and lowercase values.
    When to use:
        Before storing any alpha-2 code read from a shapefile property.
    What to expect:
        Returns the uppercase two-letter code, or `None` for missing, `-99`, or malformed values.
    """

    if value is None:
        return None
    text = str(value).strip().upper()
    if text == NO_CODE_SENTINEL or len(text) != 2:
        return None
    if not (text.isascii() and text.isalpha()):
        return None
    return text


def build_country_code_by_adm0_a3(
    rows: Iterable[tuple[object, object, object]],
) -> dict[str, str | None]:
    """
    Why this exists:
        States and cities only carry `ADM0_A3`; this map turns that key into the country's code.
    When to use:
        Once per pipeline run, fed with `(adm0_a3, iso_a2_eh, iso_a2)` tuples from the countries layer.
    What to expect:
        Maps each non-empty `ADM0_A3` to `ISO_A2_EH`, else `ISO_A2`, else `None`.
        A repeated key keeps the first non-`None` code.
    """

    code_by_adm0_a3: dict[str, str | None] = {}
    row_count = 0
    for adm0_a3, iso_a2_eh, iso_a2 in rows:
        row_count += 1
        key = str(adm0_a3 or "").strip()
        if not key:
            continue
        code = normalize_iso_a2(iso_a2_eh) or normalize_iso_a2(iso_a2)
        if code_by_adm0_a3.get(key) is None:
            code_by_adm0_a3[key] = code
    missing_count = sum(1 for code in code_by_adm0_a3.values() if code is None)
    LOGGER.debug(
        "Built country code map from %d rows: %d keys, %d without a code.",
        row_count,
        len(code_by_adm0_a3),
        missing_count,
    )
    return code_by_adm0_a3


def resolve_country_code(
    adm0_a3: object,
    fallback_iso_a2: object,
    code_by_adm0_a3: Mapping[str, str | None],
) -> str | None:
    """
    Why this exists:
        Gives country, state, and city rows one consistent code rule.
    When to use:
        While inserting each naming row; pass the row's own `ISO_A2` (or `None`) as the fallback.
    What to expect:
        A known `ADM0_A3` returns its mapped code, which may be `None` for disputed areas.
        An unknown `ADM0_A3` falls back to the normalized `fallback_iso_a2`.
    """

    key = str(adm0_a3 or "").strip()
    if key in code_by_adm0_a3:
        return code_by_adm0_a3[key]
    return normalize_iso_a2(fallback_iso_a2)
