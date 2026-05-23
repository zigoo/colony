import { createNoise2D } from 'simplex-noise';
import { TileType, ResourceType } from './types';
import type { MapState, Tile } from './types';
import {
  MAP_COLS, MAP_ROWS,
  ELEVATION_THRESHOLDS, RESOURCE_SPAWN_CHANCE, RESOURCE_AMOUNT,
  TILE_MOVE_COSTS,
} from './constants';

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

const classifyTile = (elevation: number): TileType => {
  if (elevation < ELEVATION_THRESHOLDS.water)  return TileType.Water;
  if (elevation < ELEVATION_THRESHOLDS.sand)   return TileType.Sand;
  if (elevation < ELEVATION_THRESHOLDS.grass)  return TileType.Grass;
  if (elevation < ELEVATION_THRESHOLDS.forest) return TileType.Forest;
  if (elevation < ELEVATION_THRESHOLDS.stone)  return TileType.Stone;

  return TileType.Mountain;
};

const seedResource = (
  type: TileType,
  rng: () => number,
): Pick<Tile, 'hasResource' | 'resourceType' | 'resourceAmount'> => {
  if (type === TileType.Forest) {
    const roll = rng();
    if (roll < RESOURCE_SPAWN_CHANCE.forest) {
      const resourceAmount = Math.floor(rng() * (RESOURCE_AMOUNT.woodMax - RESOURCE_AMOUNT.woodMin)) + RESOURCE_AMOUNT.woodMin;
      return { hasResource: true, resourceType: ResourceType.Wood, resourceAmount };
    }
    if (roll < RESOURCE_SPAWN_CHANCE.forest + RESOURCE_SPAWN_CHANCE.food) {
      const resourceAmount = Math.floor(rng() * (RESOURCE_AMOUNT.foodMax - RESOURCE_AMOUNT.foodMin)) + RESOURCE_AMOUNT.foodMin;
      return { hasResource: true, resourceType: ResourceType.Food, resourceAmount };
    }
    rng(); // consume amount roll to keep rng sequence length consistent
    return { hasResource: false, resourceType: ResourceType.None, resourceAmount: 0 };
  }

  if (type === TileType.Stone) {
    const roll = rng();
    if (roll < RESOURCE_SPAWN_CHANCE.stone) {
      const resourceAmount = Math.floor(rng() * (RESOURCE_AMOUNT.stoneMax - RESOURCE_AMOUNT.stoneMin)) + RESOURCE_AMOUNT.stoneMin;
      return { hasResource: true, resourceType: ResourceType.Stone, resourceAmount };
    }
    if (roll < RESOURCE_SPAWN_CHANCE.stone + RESOURCE_SPAWN_CHANCE.ore) {
      const resourceAmount = Math.floor(rng() * (RESOURCE_AMOUNT.oreMax - RESOURCE_AMOUNT.oreMin)) + RESOURCE_AMOUNT.oreMin;
      return { hasResource: true, resourceType: ResourceType.Ore, resourceAmount };
    }
    rng();
    return { hasResource: false, resourceType: ResourceType.None, resourceAmount: 0 };
  }

  return { hasResource: false, resourceType: ResourceType.None, resourceAmount: 0 };
};

export const generateMap = (initialSeed?: number): MapState => {
  const seed = initialSeed ?? Math.floor(Math.random() * 0xffffffff);
  const rng = mulberry32(seed);
  const noise2D = createNoise2D(rng);

  const tiles: Record<string, Tile> = {};

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const nx = col / MAP_COLS;
      const ny = row / MAP_ROWS;

      const octave1 = noise2D(nx * 3, ny * 3);
      const octave2 = noise2D(nx * 6, ny * 6) * 0.5;
      const octave3 = noise2D(nx * 12, ny * 12) * 0.25;
      const elevation = ((octave1 + octave2 + octave3) / 1.75 + 1) / 2;

      const type = classifyTile(elevation);
      const resource = seedResource(type, rng);

      tiles[`${col},${row}`] = { col, row, type, elevation, moveCost: TILE_MOVE_COSTS[type], ...resource };
    }
  }

  return { tiles, seed, width: MAP_COLS, height: MAP_ROWS, version: 1 };
};
