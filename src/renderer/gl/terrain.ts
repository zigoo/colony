import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { MAP_COLS, MAP_ROWS, TILE_COLORS } from '../../game/constants';
import { TileType } from '../../game/types';
import type { MapState } from '../../game/types';
import { defaultGLParams } from './glParams';
import type { GLParams } from './glParams';

// World-space height per tile type (1 world unit = 1 gameplay tile). Water is a
// shallow basin — a flat water plane (see GLScene) covers it, so it only needs
// to dip just below the sand shoreline rather than a deep pit.
const TILE_ELEVATION: Record<TileType, number> = {
  [TileType.Water]:    -0.10,
  [TileType.Sand]:     -0.02,
  [TileType.Grass]:     0.06,
  [TileType.Forest]:    0.12,
  [TileType.Stone]:     0.65,
  [TileType.Mountain]:  1.65,
};

// How much per-vertex noise to add on top of the tile base elevation. Water is
// flat (the plane reads as the surface); stone/mountain get rougher peaks.
const TILE_ROUGHNESS: Record<TileType, number> = {
  [TileType.Water]:    0.0,
  [TileType.Sand]:     0.05,
  [TileType.Grass]:    0.10,
  [TileType.Forest]:   0.14,
  [TileType.Stone]:    0.35,
  [TileType.Mountain]: 0.55,
};

const tileColorVec: Record<TileType, THREE.Color> = Object.fromEntries(
  Object.entries(TILE_COLORS).map(([k, hex]) => [k, new THREE.Color(hex)]),
) as Record<TileType, THREE.Color>;

const clampCol = (c: number) => Math.max(0, Math.min(MAP_COLS - 1, c));
const clampRow = (r: number) => Math.max(0, Math.min(MAP_ROWS - 1, r));

// Centers the map on the world origin so the camera can target (0,0,0).
export const COL_OFFSET = MAP_COLS / 2;
export const ROW_OFFSET = MAP_ROWS / 2;

// Base elevation above which a tile counts as "high ground" and gets the
// mountain-height boost.
const HILL_BOOST_THRESHOLD = 0.15;
// Per-vertex luminance jitter applied from noise so flat areas aren't dead flat.
const COLOR_JITTER = 0.08;
const TERRAIN_ROUGHNESS = 0.95;

interface TileSample {
  elevation: number;
  roughness: number;
  color: THREE.Color;
}

const sampleTile = (map: MapState, col: number, row: number): TileSample => {
  const tile = map.tiles[`${clampCol(col)},${clampRow(row)}`];
  const type = tile?.type ?? TileType.Grass;

  return {
    elevation: TILE_ELEVATION[type],
    roughness: TILE_ROUGHNESS[type],
    color: tileColorVec[type],
  };
};

// Deterministic noise shared by the mesh builder and the height sampler so
// picking/highlights land exactly on the rendered surface.
const noise2D = createNoise2D(() => 0.42);

const noiseHeight = (gx: number, gz: number): number => {
  const o1 = noise2D(gx * 0.18, gz * 0.18);
  const o2 = noise2D(gx * 0.42, gz * 0.42) * 0.5;
  const o3 = noise2D(gx * 0.9, gz * 0.9) * 0.25;

  return (o1 + o2 + o3) / 1.75;
};

// The single source of truth for vertex height, used by both the mesh and the
// picking sampler.
const heightFromElev = (baseElev: number, rough: number, n: number, p: GLParams): number => {
  const boosted = baseElev > HILL_BOOST_THRESHOLD ? baseElev * p.mountainScale : baseElev;

  return boosted * p.heightScale + n * rough * p.noiseAmp * p.heightScale;
};

// Returns terrain height at continuous grid coords (gx,gz) — bilinear over the
// four surrounding tile centers plus the same noise the mesh uses.
export const createHeightSampler = (
  map: MapState,
  params: GLParams = defaultGLParams,
): ((gx: number, gz: number) => number) => (gx, gz) => {
  const fx = gx - 0.5;
  const fz = gz - 0.5;
  const c0 = Math.floor(fx);
  const r0 = Math.floor(fz);
  const tx = fx - c0;
  const tz = fz - r0;

  const s00 = sampleTile(map, c0, r0);
  const s10 = sampleTile(map, c0 + 1, r0);
  const s01 = sampleTile(map, c0, r0 + 1);
  const s11 = sampleTile(map, c0 + 1, r0 + 1);

  const w00 = (1 - tx) * (1 - tz);
  const w10 = tx * (1 - tz);
  const w01 = (1 - tx) * tz;
  const w11 = tx * tz;

  const baseElev = s00.elevation * w00 + s10.elevation * w10 + s01.elevation * w01 + s11.elevation * w11;
  const rough = s00.roughness * w00 + s10.roughness * w10 + s01.roughness * w01 + s11.roughness * w11;

  return heightFromElev(baseElev, rough, noiseHeight(gx, gz), params);
};

// Builds one continuous heightmapped mesh with smoothly interpolated vertex
// colors. Tile properties are bilinearly sampled across the four surrounding
// tile centers, then multi-octave noise breaks up the regular grid.
export const buildTerrainMesh = (map: MapState, params: GLParams = defaultGLParams): THREE.Mesh => {
  const { terrainSub: sub } = params;
  const vcols = MAP_COLS * sub;
  const vrows = MAP_ROWS * sub;
  const vertsX = vcols + 1;
  const vertsZ = vrows + 1;

  const positions = new Float32Array(vertsX * vertsZ * 3);
  const colors = new Float32Array(vertsX * vertsZ * 3);

  for (let j = 0; j < vertsZ; j++) {
    for (let i = 0; i < vertsX; i++) {
      const gx = i / sub; // continuous grid coords [0, MAP_COLS]
      const gz = j / sub;

      // Bilinear sample over the four surrounding tile centers (centers at c+0.5).
      const fx = gx - 0.5;
      const fz = gz - 0.5;
      const c0 = Math.floor(fx);
      const r0 = Math.floor(fz);
      const tx = fx - c0;
      const tz = fz - r0;

      const s00 = sampleTile(map, c0, r0);
      const s10 = sampleTile(map, c0 + 1, r0);
      const s01 = sampleTile(map, c0, r0 + 1);
      const s11 = sampleTile(map, c0 + 1, r0 + 1);

      const w00 = (1 - tx) * (1 - tz);
      const w10 = tx * (1 - tz);
      const w01 = (1 - tx) * tz;
      const w11 = tx * tz;

      const baseElev = s00.elevation * w00 + s10.elevation * w10 + s01.elevation * w01 + s11.elevation * w11;
      const rough = s00.roughness * w00 + s10.roughness * w10 + s01.roughness * w01 + s11.roughness * w11;

      const n = noiseHeight(gx, gz);
      const height = heightFromElev(baseElev, rough, n, params);

      const idx = (j * vertsX + i) * 3;
      positions[idx] = gx - COL_OFFSET;
      positions[idx + 1] = height;
      positions[idx + 2] = gz - ROW_OFFSET;

      const cr = s00.color.r * w00 + s10.color.r * w10 + s01.color.r * w01 + s11.color.r * w11;
      const cg = s00.color.g * w00 + s10.color.g * w10 + s01.color.g * w01 + s11.color.g * w11;
      const cb = s00.color.b * w00 + s10.color.b * w10 + s01.color.b * w01 + s11.color.b * w11;

      const lum = 1 + n * COLOR_JITTER;
      colors[idx] = cr * lum;
      colors[idx + 1] = cg * lum;
      colors[idx + 2] = cb * lum;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < vrows; j++) {
    for (let i = 0; i < vcols; i++) {
      const a = j * vertsX + i;
      const b = a + 1;
      const c = a + vertsX;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: TERRAIN_ROUGHNESS,
    metalness: 0.0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
};
