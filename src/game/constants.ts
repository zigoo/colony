import { TileType, ResourceType } from './types';

export const TILE_W = 64;
export const TILE_H = 32;
export const MAP_COLS = 120;
export const MAP_ROWS = 120;

export const CAMERA_MIN_ZOOM = 0.25;
export const CAMERA_MAX_ZOOM = 3;
export const CAMERA_ZOOM_STEP_IN = 1.1;
export const CAMERA_ZOOM_STEP_OUT = 0.9;

export const MIN_DRAG_DISTANCE = 2;
export const MIN_ZOOM_FOR_RESOURCES = 0.5;
export const RESOURCE_DOT_BASE_RADIUS = 4;
export const RESOURCE_DOT_MIN_RADIUS = 2;

export const ELEVATION_THRESHOLDS = {
  water:    0.20,
  sand:     0.28,
  grass:    0.55,
  forest:   0.70,
  stone:    0.85,
} as const;

export const RESOURCE_SPAWN_CHANCE = {
  forest: 0.3,
  stone:  0.4,
} as const;

export const RESOURCE_AMOUNT = {
  woodMin:  3,
  woodMax:  8,
  stoneMin: 2,
  stoneMax: 6,
} as const;

export const TILE_MOVE_COSTS: Record<TileType, number> = {
  [TileType.Water]:    Infinity,
  [TileType.Sand]:     1.5,
  [TileType.Grass]:    1,
  [TileType.Forest]:   1.5,
  [TileType.Stone]:    1.2,
  [TileType.Mountain]: Infinity,
};

export const TILE_COLORS: Record<TileType, string> = {
  [TileType.Water]:    '#2e6da4',
  [TileType.Sand]:     '#c2b280',
  [TileType.Grass]:    '#5a9e3a',
  [TileType.Forest]:   '#2d6e2d',
  [TileType.Stone]:    '#9e9e7a',
  [TileType.Mountain]: '#6e6e6e',
};

export const RESOURCE_COLORS: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:  '#8B4513',
  [ResourceType.Stone]: '#808080',
  [ResourceType.Food]:  '#FFD700',
  [ResourceType.Ore]:   '#B8860B',
};
