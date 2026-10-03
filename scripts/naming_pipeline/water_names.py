"""Water-feature name cleanup for the hex-naming generator."""

from __future__ import annotations

WATER_NAME_LOWERCASE_WORDS = frozenset({"of", "and", "the"})


def normalize_water_name(name: str) -> str:
    """
    Why this exists:
        Newer Natural Earth marine polygons spell a few oceans in all caps (`INDIAN OCEAN`),
        while every other water name, and earlier releases, use title case.
    When to use:
        On each water feature name before inserting it.
    What to expect:
        All-uppercase names become title case with `of`/`and`/`the` lowercase after the first word;
        any other name is returned unchanged.
    """

    if not any(ch.isalpha() for ch in name) or name != name.upper():
        return name
    words = name.lower().split(" ")
    return " ".join(
        word if index > 0 and word in WATER_NAME_LOWERCASE_WORDS else word.capitalize()
        for index, word in enumerate(words)
    )
