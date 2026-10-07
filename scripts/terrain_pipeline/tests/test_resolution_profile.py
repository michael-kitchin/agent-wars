"""Contracts for resolution-dependent metadata inputs."""

from __future__ import annotations

import unittest

from scripts.terrain_pipeline.config import build_default_config
from scripts.terrain_pipeline.resolution_profile import (
    COARSE_TOPO_KEYS,
    FINE_TOPO_KEYS,
    strategic_profile,
    tactical_profile,
)


class ResolutionProfileTests(unittest.TestCase):
    def test_global_resolutions_match_current_inputs(self) -> None:
        config = build_default_config()
        strategic = strategic_profile(1, config)
        tactical = tactical_profile(4, config)
        self.assertEqual(25, strategic.sample_count)
        self.assertEqual(COARSE_TOPO_KEYS, strategic.topo_keys)
        self.assertFalse(strategic.include_lakes)
        self.assertFalse(strategic.include_urban)
        self.assertEqual(4, tactical.sample_count)
        self.assertEqual(FINE_TOPO_KEYS, tactical.topo_keys)
        self.assertTrue(tactical.include_lakes)
        self.assertTrue(tactical.include_urban)

    def test_finer_strategic_resolution_uses_fine_topography(self) -> None:
        config = build_default_config()
        self.assertEqual(COARSE_TOPO_KEYS, strategic_profile(2, config).topo_keys)
        self.assertEqual(FINE_TOPO_KEYS, strategic_profile(3, config).topo_keys)
        self.assertEqual(FINE_TOPO_KEYS, tactical_profile(5, config).topo_keys)
        self.assertEqual(FINE_TOPO_KEYS, tactical_profile(6, config).topo_keys)


if __name__ == "__main__":
    unittest.main()
