import { createNoise2D } from 'simplex-noise';
import type { MapState, Tile, TileType, ResourceType } from './types';
import { MAP_COLS, MAP_ROWS } from './constants';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function classifyTile(elevation: number): TileType {
  if (elevation < 0.20) return 'WATER';
  if (elevation < 0.28) return 'SAND';
  if (elevation < 0.55) return 'GRASS';
  if (elevation < 0.70) return 'FOREST';
  if (elevation < 0.85) return 'STONE';
  return 'MOUNTAIN';
}

function seedResource(type: TileType, rng: () => number): Pick<Tile, 'hasResource' | 'resourceType' | 'resourceAmount'> {
  if (type === 'FOREST' && rng() > 0.3) {
    return { hasResource: true, resourceType: 'WOOD' as ResourceType, resourceAmount: Math.floor(rng() * 6) + 3 };
  }
  if (type === 'STONE' && rng() > 0.4) {
    return { hasResource: true, resourceType: 'STONE' as ResourceType, resourceAmount: Math.floor(rng() * 4) + 2 };
  }
  return { hasResource: false, resourceType: 'NONE' as ResourceType, resourceAmount: 0 };
}

const MOVE_COSTS: Record<TileType, number> = {
  WATER: Infinity,
  SAND: 1.5,
  GRASS: 1,
  FOREST: 1.5,
  STONE: 1.2,
  MOUNTAIN: Infinity,
};

export function generateMap(seed?: number): MapState {
  const s = seed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = mulberry32(s);
  const noise2D = createNoise2D(rng);

  const tiles: Record<string, Tile> = {};

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const nx = col / MAP_COLS;
      const ny = row / MAP_ROWS;

      // Multiple octaves for more natural terrain
      const e1 = noise2D(nx * 3, ny * 3);
      const e2 = noise2D(nx * 6, ny * 6) * 0.5;
      const e3 = noise2D(nx * 12, ny * 12) * 0.25;
      const elevation = ((e1 + e2 + e3) / 1.75 + 1) / 2;

      const type = classifyTile(elevation);
      const resource = seedResource(type, rng);

      const key = `${col},${row}`;
      tiles[key] = {
        col, row, type, elevation,
        moveCost: MOVE_COSTS[type],
        ...resource,
      };
    }
  }

  return { tiles, width: MAP_COLS, height: MAP_ROWS, seed: s, version: 1 };
}
