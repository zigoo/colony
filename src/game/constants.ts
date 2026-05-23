import { TileType, ResourceType, Direction } from './types';

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

export const UNIT_MOVE_TICKS = 3;
export const SPRITE_BASE_PATH = '/assets/sprites/units/character';

export const ANIMATION_FPS: Record<string, number> = {
  idle:   6,
  walk:   8,
  run:    12,
  attack: 10,
};

export const ANIMATION_FRAMES: Record<string, number> = {
  idle:   12,
  walk:   8,
  run:    8,
  attack: 7,
};

export const ANIMATION_FRAME_SIZE: Record<string, { width: number; height: number }> = {
  idle:   { width: 64, height: 64 },
  walk:   { width: 64, height: 64 },
  run:    { width: 64, height: 64 },
  attack: { width: 96, height: 96 },
};

export const DIRECTION_ROW: Record<Direction, number> = {
  [Direction.South]:     0,
  [Direction.SouthWest]: 1,
  [Direction.West]:      2,
  [Direction.NorthWest]: 3,
  [Direction.North]:     4,
  [Direction.NorthEast]: 5,
  [Direction.East]:      6,
  [Direction.SouthEast]: 7,
};

export const UNIT_SELECTION_COLOR      = 'rgba(80, 200, 255, 0.9)';
export const UNIT_SELECTION_FILL       = 'rgba(80, 200, 255, 0.25)';
export const UNIT_DESTINATION_COLOR    = 'rgba(255, 200, 50, 0.9)';
export const UNIT_DESTINATION_FILL     = 'rgba(255, 200, 50, 0.12)';
export const UNIT_DESTINATION_DASH     = 5;   // world-space dash length (scales with zoom)

// Shifts the sprite down so feet align with the tile's bottom diamond vertex (wy + TILE_H/2).
// Without this the sprite body floats above its tile in isometric view.
export const SPRITE_Y_OFFSET = TILE_H / 2;

export const RESOURCE_COLORS: Partial<Record<ResourceType, string>> = {
  [ResourceType.Wood]:  '#8B4513',
  [ResourceType.Stone]: '#808080',
  [ResourceType.Food]:  '#FFD700',
  [ResourceType.Ore]:   '#B8860B',
};
