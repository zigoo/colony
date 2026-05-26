import { createNoise2D } from 'simplex-noise';
import { TileType, ResourceType } from './types';
import type { MapState, Tile } from './types';
import {
  MAP_COLS, MAP_ROWS,
  ELEVATION_THRESHOLDS, RESOURCE_SPAWN_CHANCE, RESOURCE_AMOUNT,
  TILE_MOVE_COSTS, FOREST_NOISE_SCALE, FOREST_NOISE_THRESHOLD, MIN_WATER_REGION_TILES,
} from './constants';

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;

  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// forestValue is a separate noise field in [-1, 1]; forest is scattered across
// the whole land band where it exceeds the threshold (decoupled from mountains).
const classifyTile = (elevation: number, forestValue: number): TileType => {
  if (elevation < ELEVATION_THRESHOLDS.water)  return TileType.Water;
  if (elevation < ELEVATION_THRESHOLDS.sand)   return TileType.Sand;

  if (elevation < ELEVATION_THRESHOLDS.forest) {
    return forestValue > FOREST_NOISE_THRESHOLD ? TileType.Forest : TileType.Grass;
  }

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
  const forestNoise = createNoise2D(rng);

  const tiles: Record<string, Tile> = {};

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const nx = col / MAP_COLS;
      const ny = row / MAP_ROWS;

      const octave1 = noise2D(nx * 3, ny * 3);
      const octave2 = noise2D(nx * 6, ny * 6) * 0.5;
      const octave3 = noise2D(nx * 12, ny * 12) * 0.25;
      const elevation = ((octave1 + octave2 + octave3) / 1.75 + 1) / 2;

      const forestValue = forestNoise(nx * FOREST_NOISE_SCALE, ny * FOREST_NOISE_SCALE);
      const type = classifyTile(elevation, forestValue);
      const resource = seedResource(type, rng);

      tiles[`${col},${row}`] = { col, row, type, elevation, moveCost: TILE_MOVE_COSTS[type], ...resource };
    }
  }

  drainSmallPonds(tiles);

  return { tiles, seed, width: MAP_COLS, height: MAP_ROWS, version: 1 };
};

// Converts water bodies smaller than MIN_WATER_REGION_TILES to grass, so the
// map has coherent lakes instead of scattered little ponds.
const drainSmallPonds = (tiles: Record<string, Tile>): void => {
  const seen = new Uint8Array(MAP_COLS * MAP_ROWS);
  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const start = row * MAP_COLS + col;

      if (seen[start] || tiles[`${col},${row}`].type !== TileType.Water) continue;

      // Flood-fill this connected water region.
      const region: Tile[] = [];
      const stack = [[col, row]];
      seen[start] = 1;

      while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        region.push(tiles[`${c},${r}`]);

        for (const [dc, dr] of NEIGHBORS) {
          const nc = c + dc;
          const nr = r + dr;

          if (nc < 0 || nr < 0 || nc >= MAP_COLS || nr >= MAP_ROWS) continue;

          const ni = nr * MAP_COLS + nc;

          if (seen[ni] || tiles[`${nc},${nr}`].type !== TileType.Water) continue;

          seen[ni] = 1;
          stack.push([nc, nr]);
        }
      }

      if (region.length < MIN_WATER_REGION_TILES) {
        for (const tile of region) {
          tile.type = TileType.Grass;
          tile.moveCost = TILE_MOVE_COSTS[TileType.Grass];
          tile.hasResource = false;
          tile.resourceType = ResourceType.None;
          tile.resourceAmount = 0;
        }
      }
    }
  }
};
