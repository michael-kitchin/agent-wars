-- Terrain pipeline staging schema objects.
-- This file documents the canonical table contracts used by the pipeline.

CREATE SCHEMA IF NOT EXISTS terrain_gen;

CREATE TABLE IF NOT EXISTS terrain_gen.h3_res1_cells (
  h3_index text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS terrain_gen.h3_res4_cells (
  h3_index text PRIMARY KEY,
  parent_h3 text NOT NULL
);

CREATE TABLE IF NOT EXISTS terrain_gen.terrain_res1_base (
  h3_index text PRIMARY KEY,
  terrain text NOT NULL CHECK (terrain IN ('ocean', 'coastal', 'land', 'urban', 'forest', 'mountain', 'desert', 'arctic'))
);

CREATE TABLE IF NOT EXISTS terrain_gen.terrain_res4_exceptions (
  h3_index text PRIMARY KEY,
  parent_h3 text NOT NULL,
  terrain text NOT NULL CHECK (terrain IN ('ocean', 'coastal', 'land', 'urban', 'forest', 'mountain', 'desert', 'arctic')),
  parent_terrain text NOT NULL CHECK (parent_terrain IN ('ocean', 'coastal', 'land', 'urban', 'forest', 'mountain', 'desert', 'arctic'))
);

