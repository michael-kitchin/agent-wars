"""Compare two JSON documents and report the first differing paths."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)

# Stop after this many paths so a large mismatch stays readable.
_MAX_DIFFERENCES: int = 20


def compare_json_documents(left: Any, right: Any, ignore_keys: frozenset[str]) -> list[str]:
    """
    Why this exists:
        Show where two generated JSON documents diverge without dumping whole files.
    When to use:
        After regenerating a global artifact, to confirm it still matches the baseline.
    What to expect:
        Up to 20 JSON paths. Dict keys listed in ``ignore_keys`` are dropped at every depth.
        Dict key order is significant. Lists compare by index. Numbers compare with ``==``.
    """

    LOGGER.debug("Comparing JSON documents (ignore_keys=%s).", sorted(ignore_keys))
    differences: list[str] = []
    _walk(left, right, "", ignore_keys, differences)
    return differences


def main(argv: list[str] | None = None) -> int:
    """
    Why this exists:
        Compare two JSON files from the command line.
    When to use:
        Pass the baseline path and the regenerated path.
    What to expect:
        Prints ``equal`` and returns 0, or prints differing paths and returns 1.
        Raises ``OSError`` or ``json.JSONDecodeError`` when a file cannot be read.
    """

    parser = argparse.ArgumentParser(description="Compare two JSON documents.")
    parser.add_argument("left", type=Path)
    parser.add_argument("right", type=Path)
    parser.add_argument(
        "--ignore-key",
        action="append",
        dest="ignore_keys",
        default=None,
        help="Dict key to ignore at every depth. Repeatable. Defaults to generated_at_utc.",
    )
    args = parser.parse_args(argv)
    ignore_keys = frozenset(args.ignore_keys if args.ignore_keys is not None else ["generated_at_utc"])
    LOGGER.debug("Comparing %s with %s.", args.left, args.right)
    left = json.loads(args.left.read_text(encoding="utf-8"))
    right = json.loads(args.right.read_text(encoding="utf-8"))
    differences = compare_json_documents(left, right, ignore_keys)
    if not differences:
        print("equal")
        return 0
    for path in differences:
        print(path)
    return 1


def _walk(
    left: Any,
    right: Any,
    path: str,
    ignore_keys: frozenset[str],
    differences: list[str],
) -> None:
    """
    Why this exists:
        Recurse one JSON node while the difference list still has room.
    When to use:
        From ``compare_json_documents`` and from the dict and list walkers.
    What to expect:
        Appends at most one path for a scalar or type mismatch. Does not raise.
    """

    if len(differences) >= _MAX_DIFFERENCES:
        return
    if isinstance(left, dict) and isinstance(right, dict):
        _walk_dicts(left, right, path, ignore_keys, differences)
        return
    if isinstance(left, list) and isinstance(right, list):
        _walk_lists(left, right, path, ignore_keys, differences)
        return
    if _values_equal(left, right):
        return
    differences.append(path or "$")


def _walk_dicts(
    left: dict[str, Any],
    right: dict[str, Any],
    path: str,
    ignore_keys: frozenset[str],
    differences: list[str],
) -> None:
    """
    Why this exists:
        Dict key order is part of the generated-file contract.
    When to use:
        When both sides of a node are JSON objects.
    What to expect:
        A key-sequence mismatch records the object path and does not recurse.
        Ignored keys are omitted before the sequence is compared.
    """

    left_keys = [key for key in left if key not in ignore_keys]
    right_keys = [key for key in right if key not in ignore_keys]
    if left_keys != right_keys:
        differences.append(path or "$")
        return
    for key in left_keys:
        if len(differences) >= _MAX_DIFFERENCES:
            return
        child = f"{path}.{key}" if path else key
        _walk(left[key], right[key], child, ignore_keys, differences)


def _walk_lists(
    left: list[Any],
    right: list[Any],
    path: str,
    ignore_keys: frozenset[str],
    differences: list[str],
) -> None:
    """
    Why this exists:
        Generated records are ordered, so a shifted row must be visible.
    When to use:
        When both sides of a node are JSON arrays.
    What to expect:
        A length mismatch records the array path and does not walk items.
    """

    if len(left) != len(right):
        differences.append(path or "$")
        return
    for index, (left_item, right_item) in enumerate(zip(left, right, strict=True)):
        if len(differences) >= _MAX_DIFFERENCES:
            return
        _walk(left_item, right_item, f"{path}[{index}]", ignore_keys, differences)


def _values_equal(left: Any, right: Any) -> bool:
    """
    Why this exists:
        JSON booleans must not compare equal to 0 and 1.
    When to use:
        For nodes that are not objects or arrays.
    What to expect:
        Numbers compare with ``==``. Other scalars compare with ``==`` as well.
    """

    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    return left == right


if __name__ == "__main__":
    sys.exit(main())
