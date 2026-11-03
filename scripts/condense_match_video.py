"""Launch match-video condensation.

The implementation lives in ``scripts/match_video``. This file is the command:

    python scripts/condense_match_video.py match.mp4
"""

from __future__ import annotations

import sys
from pathlib import Path


def _enable_direct_launch() -> None:
    """
    Why this exists:
        Running this file as a script puts ``scripts/`` on the path, not the repository root.
    When to use:
        Before importing the package, and only when this file is the program entry.
    What to expect:
        The repository root is inserted on ``sys.path``. Importing the module does not change the path.
    """

    if __name__ != "__main__":
        return
    root = str(Path(__file__).resolve().parents[1])
    if root not in sys.path:
        sys.path.insert(0, root)


_enable_direct_launch()

from scripts.match_video.condense_match_video import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
