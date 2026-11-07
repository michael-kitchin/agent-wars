"""Contracts for deduplicated WebP tiles."""

from __future__ import annotations

import sqlite3
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

from scripts.basemap_pipeline.tile_store import MbtilesMetadata, MbtilesWriter, decode_tile, read_tile
from scripts.basemap_pipeline.web_mercator import LonLatBox


class TileStoreTests(unittest.TestCase):
    def test_duplicate_tiles_share_one_image_and_decode_flat_gray(self) -> None:
        flat = np.full((256, 256, 4), 210, dtype=np.uint8)
        flat[..., 3] = 255
        varied = np.zeros((256, 256, 4), dtype=np.uint8)
        varied[..., 0] = np.arange(256, dtype=np.uint8)[None, :]
        varied[..., 1] = 40
        varied[..., 2] = 80
        varied[..., 3] = 255
        clear = np.zeros((256, 256, 4), dtype=np.uint8)
        with TemporaryDirectory() as folder:
            path = Path(folder) / "tiles.mbtiles"
            metadata = MbtilesMetadata("example", "example", "example", LonLatBox(0, 0, 1, 1), 9, 9)
            with MbtilesWriter(path, metadata, 80, 4, 210) as writer:
                writer.add_tile(9, 1, 2, flat)
                writer.add_tile(9, 1, 3, flat)
                writer.add_tile(9, 2, 2, varied)
                writer.add_tile(9, 2, 3, clear)
                stats = writer.stats()
            connection = sqlite3.connect(path)
            try:
                self.assertEqual(4, connection.execute("SELECT COUNT(*) FROM map").fetchone()[0])
                self.assertEqual(3, connection.execute("SELECT COUNT(*) FROM images").fetchone()[0])
                self.assertEqual(4, connection.execute("SELECT COUNT(*) FROM tiles").fetchone()[0])
                metadata_rows = dict(connection.execute("SELECT name, value FROM metadata"))
            finally:
                connection.close()
            self.assertEqual("webp", metadata_rows["format"])
            self.assertEqual("9", metadata_rows["minzoom"])
            self.assertEqual("9", metadata_rows["maxzoom"])
            for x, y in ((1, 2), (1, 3), (2, 2), (2, 3)):
                self.assertIsNotNone(read_tile(path, 9, x, y))
            decoded_flat = decode_tile(read_tile(path, 9, 1, 2))
            self.assertTrue(np.all(decoded_flat[..., :3] == 210))
            self.assertTrue(np.all(decoded_flat[..., 3] == 255))
            decoded_clear = decode_tile(read_tile(path, 9, 2, 3))
            self.assertTrue(np.all(decoded_clear[..., 3] == 0))
            self.assertEqual(2, sum(stats.uniform_flat_land.values()))
            self.assertEqual(1, sum(stats.uniform_water.values()))


if __name__ == "__main__":
    unittest.main()
